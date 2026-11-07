import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { open, realpath } from 'node:fs/promises';
import { canonicalDirectory } from './projects.js';
import { createRedactor, safeChildEnv, secretEnvironmentValues } from './security.js';

const MAX_SKILL_BYTES = 256 * 1024;
const failure = (message, status = 409, code = 'SKILL_UNAVAILABLE') => Object.assign(new Error(message), { status, code });
const hash = (value) => createHash('sha256').update(value).digest('hex');

// This connection only issues metadata requests. It never creates a thread or turn.
export async function readNativeSkills(cwd, { refresh = false, timeoutMs = 12000, spawnProcess = spawn } = {}) {
  const child = spawnProcess('codex', ['app-server', '--listen', 'stdio://', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"'], { cwd, env: safeChildEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map();
  let sequence = 0, buffer = '', exited = false, deadline;
  const fail = (error) => { for (const request of pending.values()) request.reject(error); pending.clear(); };
  const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    try { send({ id, method, params }); } catch { pending.delete(id); reject(failure('Codex skill discovery disconnected.', 503, 'CODEX_UNAVAILABLE')); }
  });
  const exitedPromise = new Promise((resolve) => child.once('exit', () => { exited = true; fail(failure('Codex skill discovery disconnected.', 503, 'CODEX_UNAVAILABLE')); resolve(); }));
  child.on('error', () => fail(failure('Codex CLI is unavailable for installed skill discovery.', 503, 'CODEX_UNAVAILABLE')));
  child.stdin.on('error', () => fail(failure('Codex skill discovery disconnected.', 503, 'CODEX_UNAVAILABLE')));
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) { fail(failure('Codex skill inventory exceeded the safe size limit.', 503, 'CODEX_PROTOCOL')); child.kill('SIGTERM'); return; }
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (!line.trim()) continue;
      let message;
      try { message = JSON.parse(line); } catch { fail(failure('Codex returned an unreadable skill inventory.', 503, 'CODEX_PROTOCOL')); continue; }
      if (message.method && message.id !== undefined) {
        // Metadata discovery cannot authorize tools, filesystem changes, or execution.
        try { send({ id: message.id, error: { code: -32601, message: 'Read-only skill discovery does not authorize tool requests.' } }); } catch { fail(failure('Codex skill discovery disconnected.', 503, 'CODEX_UNAVAILABLE')); }
      } else if (message.id !== undefined) {
        const current = pending.get(message.id);
        if (!current) continue;
        pending.delete(message.id);
        if (message.error) current.reject(failure('Codex could not return its installed skill inventory.', 503, 'CODEX_UNAVAILABLE'));
        else current.resolve(message.result);
      }
    }
  });
  // Consume diagnostics without persisting account or configuration information.
  child.stderr.resume();
  try {
    return await Promise.race([(async () => {
      await request('initialize', { clientInfo: { name: 'mari_skill_inventory', title: 'Mari installed skills', version: '0.1.0' } });
      send({ method: 'initialized', params: {} });
      const account = await request('account/read', {});
      if (account?.account?.type !== 'chatgpt') throw failure('Sign in to Codex with ChatGPT to inspect installed skills.', 503, 'CODEX_AUTH_REQUIRED');
      return request('skills/list', { cwds: [cwd], forceReload: refresh });
    })(), new Promise((_, reject) => { deadline = setTimeout(() => reject(failure('Codex installed skill discovery timed out.', 503, 'CODEX_TIMEOUT')), timeoutMs); })]);
  } finally {
    clearTimeout(deadline);
    fail(failure('Skill discovery connection closed.', 503, 'CODEX_UNAVAILABLE'));
    child.stdin.end();
    if (!exited) child.kill('SIGTERM');
    let killTimer;
    await Promise.race([exitedPromise, new Promise((resolve) => { killTimer = setTimeout(() => { if (!exited) child.kill('SIGKILL'); resolve(); }, 500); })]);
    clearTimeout(killTimer);
  }
}

async function skillBytes(skill) {
  let handle;
  try {
    if (!path.isAbsolute(skill.path) || path.basename(skill.path) !== 'SKILL.md') throw new Error();
    const canonical = await realpath(skill.path);
    if (skill.canonicalPath && canonical !== skill.canonicalPath) throw new Error();
    handle = await open(canonical, 'r');
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_SKILL_BYTES) throw new Error();
    const bytes = Buffer.alloc(MAX_SKILL_BYTES + 1);
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0);
    if (bytesRead > MAX_SKILL_BYTES) throw new Error();
    return { canonical, bytes: bytes.subarray(0, bytesRead) };
  } catch { throw failure(`Installed skill “${skill.name}” is unavailable or exceeds 256 KiB. Refresh skills and update this profile.`); }
  finally { await handle?.close(); }
}

export async function assertSnapshotSkills(skills = []) {
  for (const skill of skills) {
    const { bytes } = await skillBytes(skill);
    if (skill.sha256 && hash(bytes) !== skill.sha256) throw failure(`Installed skill “${skill.name}” changed after this job was queued. Review it and retry with the current profile.`);
  }
}

export function createSkillsInventory({ requestSkills = readNativeSkills, cacheMs = 30000 } = {}) {
  const cache = new Map(), inFlight = new Map();
  const redactor = createRedactor(secretEnvironmentValues());
  async function context(store, { projectId, global = false } = {}) {
    if (global) return { projectId: null, cwd: await canonicalDirectory(process.cwd()), contextScope: 'mari' };
    const selected = projectId || store.get('settings', 'app')?.selectedProjectId;
    const project = selected ? store.get('projects', selected) : null;
    if (selected && !project) throw failure('Selected project was not found.', 404, 'NOT_FOUND');
    return { projectId: project?.id || null, cwd: await canonicalDirectory(project?.path || process.cwd()), contextScope: project ? 'project' : 'mari' };
  }
  const withContext = (value, current) => ({ ...value, public: { ...value.public, ...current } });
  async function inventory(store, options = {}) {
    const current = await context(store, options), key = current.cwd;
    if (!options.refresh && cache.has(key) && Date.now() - cache.get(key).at < cacheMs) return withContext(cache.get(key).value, current);
    if (inFlight.has(key)) return withContext(await inFlight.get(key), current);
    const loading = (async () => {
      const errors = [], skills = [], records = new Map();
      let response;
      try { response = await requestSkills(key, { refresh: Boolean(options.refresh) }); }
      catch (error) { errors.push({ code: error.code || 'CODEX_UNAVAILABLE', message: redactor.redact(error.message || 'Codex skill discovery is unavailable.') }); }
      if (response) {
        const entry = response.data?.find((item) => path.resolve(item.cwd || '') === key);
        if (!entry || !Array.isArray(entry.skills)) errors.push({ code: 'CODEX_PROTOCOL', message: 'Codex returned no skill inventory for the selected project.' });
        else {
          for (const error of entry.errors || []) errors.push({ code: 'SKILL_LOAD_ERROR', message: redactor.redact(String(error.message || 'A Codex skill could not be loaded.')), ...(typeof error.path === 'string' ? { path: error.path } : {}) });
          for (const item of entry.skills.slice(0, 10000)) {
            if (!item || typeof item.name !== 'string' || typeof item.description !== 'string' || !path.isAbsolute(item.path || '') || path.basename(item.path) !== 'SKILL.md' || !['user', 'repo', 'system', 'admin'].includes(item.scope) || typeof item.enabled !== 'boolean') { errors.push({ code: 'SKILL_LOAD_ERROR', message: 'An invalid installed skill entry was omitted.' }); continue; }
            const skill = { id: `skill_${hash(item.path).slice(0, 32)}`, name: item.name, description: item.description, path: item.path, scope: item.scope, enabled: item.enabled, source: item.pluginId ? `plugin:${item.pluginId}` : 'local' };
            try {
              const { canonical } = await skillBytes(skill);
              if (records.has(skill.id)) continue;
              records.set(skill.id, { ...skill, canonicalPath: canonical }); skills.push(skill);
            } catch (error) { errors.push({ code: error.code, message: error.message }); }
          }
        }
      }
      skills.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
      const value = { public: { skills, errors, scannedAt: new Date().toISOString(), provider: 'codex' }, records };
      cache.set(key, { at: Date.now(), value });
      return value;
    })();
    inFlight.set(key, loading);
    try { return withContext(await loading, current); } finally { inFlight.delete(key); }
  }
  return {
    async list(store, options) { return structuredClone((await inventory(store, options)).public); },
    async read(store, skillId, options) {
      const value = await inventory(store, options), skill = value.records.get(skillId);
      if (!skill) throw failure('Installed skill was not found in this project’s Codex inventory.', 404, 'NOT_FOUND');
      const { bytes } = await skillBytes(skill);
      return { skill: value.public.skills.find((item) => item.id === skillId), content: bytes.toString('utf8') };
    },
    async resolve(store, skillIds, options) {
      if (!skillIds.length) return [];
      // Profile bindings always use their selected project, even if a UI is browsing Mari's inventory.
      const value = await inventory(store, { projectId: options?.projectId, global: Boolean(options?.personal), refresh: options?.refresh });
      const result = [];
      for (const skillId of skillIds) {
        const skill = value.records.get(skillId);
        if (!skill || !skill.enabled || (options?.personal && skill.scope === 'repo')) throw failure(`Selected skill ${skillId} is unavailable or disabled in this context. Refresh skills and update the profile.`);
        const { bytes } = await skillBytes(skill);
        result.push({ ...skill, sha256: hash(bytes) });
      }
      return result;
    },
  };
}

export const codexSkillsInventory = createSkillsInventory();
