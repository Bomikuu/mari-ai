import { spawn } from 'node:child_process';
import { readFile, readdir, readlink, realpath } from 'node:fs/promises';
import net from 'node:net';
import { createRedactor, safeChildEnv } from '../server/security.js';
import { now } from '../server/store.js';

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function processIdentity(pid) {
  if (!Number.isInteger(Number(pid)) || Number(pid) < 2) return null;
  try {
    const stat = await readFile(`/proc/${pid}/stat`, 'utf8');
    const fields = stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/);
    if (fields[0] === 'Z') return null;
    return { pid: Number(pid), ppid: Number(fields[1]), pgid: Number(fields[2]), startTicks: fields[19], bootId: (await readFile('/proc/sys/kernel/random/boot_id', 'utf8')).trim() };
  } catch { return null; }
}

export function sameIdentity(saved, actual) {
  return Boolean(actual && saved && Number(saved.pid) === actual.pid && String(saved.startTicks) === String(actual.startTicks) && saved.bootId === actual.bootId && Number(saved.pgid) === actual.pgid);
}

async function treeMembers(root, previous = []) {
  const entries = await readdir('/proc');
  const identities = await Promise.all(entries.filter((entry) => /^\d+$/.test(entry)).map((entry) => processIdentity(Number(entry))));
  const actual = identities.filter(Boolean);
  const leader = actual.find((identity) => sameIdentity(root, identity));
  const members = actual.filter((identity) => (leader && identity.pgid === root.pgid) || previous.some((saved) => sameIdentity(saved, identity)));
  const ownedPids = new Set(members.map((identity) => identity.pid));
  let changed = true;
  while (changed) {
    changed = false;
    for (const identity of actual) if (!ownedPids.has(identity.pid) && ownedPids.has(identity.ppid)) { members.push(identity); ownedPids.add(identity.pid); changed = true; }
  }
  return members;
}

export async function isPortOpen(url, timeout = 600) {
  if (!url) return false;
  const target = new URL(url);
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: target.hostname.replace(/^\[|\]$/g, ''), port: Number(target.port || (target.protocol === 'https:' ? 443 : 80)) });
    const finish = (open) => { socket.destroy(); resolve(open); };
    socket.setTimeout(timeout, () => finish(false));
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
  });
}

async function httpReady(url) {
  if (!url) return false;
  try { const response = await fetch(url, { signal: AbortSignal.timeout(1800), redirect: 'manual' }); await response.body?.cancel(); return response.status >= 200 && response.status < 400; } catch { return false; }
}

async function ownsListener(members, port) {
  if (!port) return true;
  const inodes = new Set();
  for (const filename of ['/proc/net/tcp', '/proc/net/tcp6']) {
    try {
      const lines = (await readFile(filename, 'utf8')).trim().split('\n').slice(1);
      for (const line of lines) { const fields = line.trim().split(/\s+/); if (fields[3] === '0A' && parseInt(fields[1].split(':').at(-1), 16) === Number(port)) inodes.add(fields[9]); }
    } catch { /* IPv6 may be unavailable. */ }
  }
  for (const member of members) {
    try {
      const fds = await readdir(`/proc/${member.pid}/fd`);
      for (const fd of fds) { try { const target = await readlink(`/proc/${member.pid}/fd/${fd}`); if (inodes.has(target.match(/^socket:\[(\d+)\]$/)?.[1])) return true; } catch { /* Closed during inspection. */ } }
    } catch { /* Process exited during inspection. */ }
  }
  return false;
}

async function readEnvironment(filename) {
  if (!filename) return {};
  const source = await readFile(filename, 'utf8');
  const result = {};
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, '');
    result[match[1]] = value;
  }
  return result;
}

export function createServiceSupervisor({ store, startupTimeoutMs = 45000, stopTimeoutMs = 5000, probeIntervalMs = 1000 }) {
  const owned = new Map();
  const locks = new Set();
  let probing = false;
  let closed = false;
  const log = (service, type, message, data = {}, level = 'info', redactor = createRedactor()) => store.event(redactor.redact({ source: 'service', projectId: service.projectId, serviceId: service.id, type, message, data, level }));

  function attachOutput(child, service, redactor) {
    for (const channel of ['stdout', 'stderr']) {
      child[channel].setEncoding('utf8');
      let buffer = '';
      let oversized = false;
      const write = (line) => { if (line) log(service, 'service.output', line, { channel }, channel === 'stderr' ? 'warning' : 'info', redactor); };
      child[channel].on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let end;
        while ((end = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, end).replace(/\r$/, '');
          buffer = buffer.slice(end + 1);
          if (!oversized && line.length <= 65536) write(line);
          else write('[Output line omitted: exceeds the safe log buffer.]');
          oversized = false;
        }
        if (buffer.length > 65536) { buffer = ''; oversized = true; }
      });
      child[channel].on('end', () => { if (oversized) write('[Output line omitted: exceeds the safe log buffer.]'); else write(buffer); });
    }
  }

  const pendingStarts = new Set();

  function start(serviceId, options = {}) {
    const operation = startService(serviceId, options);
    pendingStarts.add(operation);
    operation.finally(() => pendingStarts.delete(operation)).catch(() => {});
    return operation;
  }

  async function startService(serviceId, options = {}) {
    if (closed) throw new Error('Service worker is shutting down.');
    let service = store.get('services', serviceId);
    if (!service) throw new Error('Service not found.');
    if (locks.has(serviceId) || ['starting', 'running', 'stopping'].includes(service.status) || owned.has(serviceId)) throw new Error('This service already has a managed process or a pending action.');
    const version = service.configVersion ?? 1;
    if ((options.confirmedVersion ?? service.confirmedVersion) !== version) throw new Error('Review and confirm the resolved startup command before running this configuration.');
    if (!service.command?.trim()) throw new Error('Configure a startup command first.');
    const project = store.get('projects', service.projectId);
    if (!project) throw new Error('Project not found.');
    locks.add(serviceId);
    try {
      const cwd = await realpath(service.cwd || project.path);
      const environment = await readEnvironment(service.envFile || null);
      const redactor = createRedactor(Object.values(environment).filter((value) => value.length >= 3));
      store.addSecrets?.(Object.values(environment));
      service = store.update('services', serviceId, { status: 'starting', ownership: 'none', lastError: null, exitCode: null, confirmedVersion: version, cwd });
      if (service.url && await isPortOpen(service.url)) {
        const message = 'The configured port is already occupied outside Mari. Use the existing website for capture or choose another port; Mari will not stop it.';
        store.update('services', serviceId, { status: 'failed', ownership: 'external', lastError: message, lastProbeAt: now(), pid: null, pgid: null });
        log(service, 'service.external', message, { url: service.url }, 'warning', redactor);
        throw new Error(message);
      }
      if (closed) throw new Error('Service worker is shutting down.');
      log(service, 'command.started', 'Starting development service.', { command: service.command, cwd, startedAt: now() }, 'info', redactor);
      const child = spawn('/bin/bash', ['-lc', service.command], { cwd, env: { ...safeChildEnv(), ...environment }, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
      const record = { child, identity: null, members: [], redactor, stopping: false };
      owned.set(serviceId, record);
      attachOutput(child, service, redactor);
      child.once('error', (error) => {
        const message = redactor.redact(error.message);
        store.update('services', serviceId, { status: 'failed', lastError: message, exitCode: null });
        log(service, 'command.failed', message, {}, 'error', redactor);
        owned.delete(serviceId);
      });
      child.once('exit', (code, signal) => {
        record.exited = true;
        const current = store.get('services', serviceId);
        if (!current) return;
        log(service, 'command.completed', 'Development command exited.', { command: service.command, cwd, exitCode: code, signal, finishedAt: now() }, code && !record.stopping ? 'error' : 'info', redactor);
        if (!record.stopping) {
          const message = `Development process exited${code !== null ? ` with code ${code}` : ` (${signal})`}.`;
          store.update('services', serviceId, { status: 'failed', exitCode: code, lastError: message, pid: null });
          // Retain known descendants so a later explicit Stop can clean them up safely.
          if (!record.members.length) owned.delete(serviceId);
        }
      });
      for (let attempt = 0; attempt < 20 && !record.identity && !record.exited; attempt++) { record.identity = await processIdentity(child.pid); if (!record.identity) await delay(10); }
      if (!record.identity) { owned.delete(serviceId); throw new Error('The startup process exited before its ownership could be recorded.'); }
      record.members = await treeMembers(record.identity);
      store.update('services', serviceId, { ...record.identity, ownership: 'managed', status: 'starting', startedAt: now() });
      const deadline = Date.now() + startupTimeoutMs;
      while (Date.now() < deadline && !record.stopping && !record.exited && !closed) {
        if (options.cancelled?.()) { await stop(serviceId); throw new Error('Service startup cancelled.'); }
        record.members = await treeMembers(record.identity, record.members);
        const alive = sameIdentity(record.identity, await processIdentity(record.identity.pid));
        const ready = alive && service.url && await httpReady(service.url);
        const port = service.url ? Number(new URL(service.url).port || (new URL(service.url).protocol === 'https:' ? 443 : 80)) : null;
        if (ready && await ownsListener(record.members, port)) {
          store.update('services', serviceId, { status: 'running', lastProbeAt: now(), lastError: null, port });
          log(service, 'service.ready', 'Managed service is responding at its configured URL.', { url: service.url, port }, 'info', redactor);
          return store.get('services', serviceId);
        }
        if (!service.url) { store.update('services', serviceId, { status: 'unknown', lastError: 'Process started; configure its expected URL to confirm readiness.' }); return store.get('services', serviceId); }
        await delay(probeIntervalMs);
      }
      if (record.stopping || closed) return store.get('services', serviceId);
      const message = record.exited ? 'The startup command exited before the configured website became ready.' : `Readiness timed out after ${Math.round(startupTimeoutMs / 1000)} seconds. Inspect output and startup configuration.`;
      store.update('services', serviceId, { status: 'failed', lastError: message, lastProbeAt: now() });
      log(service, 'service.failed', message, {}, 'error', redactor);
      throw new Error(message);
    } catch (error) {
      const current = store.get('services', serviceId);
      if (current?.status === 'starting' && current.ownership !== 'managed') store.update('services', serviceId, { status: 'failed', lastError: error.message });
      throw error;
    } finally { locks.delete(serviceId); }
  }

  async function stop(serviceId) {
    const service = store.get('services', serviceId);
    if (!service) throw new Error('Service not found.');
    let record = owned.get(serviceId);
    if (record && !record.identity) { for (let attempt = 0; attempt < 20 && !record.identity; attempt++) await delay(15); }
    if (record && !record.identity) throw new Error('Startup ownership is still being established. Retry Stop in a moment.');
    if (!record && service.ownership === 'managed') {
      const actual = await processIdentity(service.pid);
      if (sameIdentity(service, actual)) { record = { identity: actual, members: await treeMembers(actual), redactor: createRedactor(), stopping: false }; owned.set(serviceId, record); }
    }
    if (!record) {
      if (service.ownership === 'external') throw new Error('This service is external; Mari cannot stop it.');
      if (service.pid) { store.update('services', serviceId, { status: 'unknown', ownership: 'unknown', lastError: 'Process ownership cannot be verified. No signal was sent.' }); throw new Error('Process ownership cannot be verified. No signal was sent.'); }
      store.update('services', serviceId, { status: 'stopped', ownership: 'none', pid: null, pgid: null });
      return store.get('services', serviceId);
    }
    record.stopping = true;
    const leader = await processIdentity(record.identity.pid);
    const verifiedLeader = sameIdentity(record.identity, leader);
    if (verifiedLeader) record.members = await treeMembers(record.identity, record.members);
    const verified = [];
    for (const member of record.members) if (sameIdentity(member, await processIdentity(member.pid))) verified.push(member);
    if (!verified.length && leader) { store.update('services', serviceId, { status: 'unknown', ownership: 'unknown', lastError: 'Process identity changed. No signal was sent.' }); throw new Error('Process identity changed. No signal was sent.'); }
    store.update('services', serviceId, { status: 'stopping' });
    log(service, 'service.stopping', 'Stopping the verified managed process tree.', { pids: verified.map((member) => member.pid) });
    if (verifiedLeader) {
      try { process.kill(-record.identity.pgid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      for (const member of verified.filter((identity) => identity.pgid !== record.identity.pgid)) if (sameIdentity(member, await processIdentity(member.pid))) { try { process.kill(member.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    }
    else for (const member of verified) { try { process.kill(member.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    const deadline = Date.now() + stopTimeoutMs;
    let survivors = verified;
    while (Date.now() < deadline && survivors.length) { await delay(100); const next = []; for (const member of survivors) if (sameIdentity(member, await processIdentity(member.pid))) next.push(member); survivors = next; }
    for (const member of survivors) if (sameIdentity(member, await processIdentity(member.pid))) { try { process.kill(member.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
    owned.delete(serviceId);
    store.update('services', serviceId, { status: 'stopped', ownership: 'none', pid: null, pgid: null, startTicks: null, bootId: null, lastProbeAt: now() });
    log(service, 'service.stopped', 'Managed service stopped.');
    return store.get('services', serviceId);
  }

  async function reconcile() {
    for (const service of store.list('services')) {
      if (service.ownership !== 'managed' || !service.pid || owned.has(service.id)) continue;
      const identity = await processIdentity(service.pid);
      if (sameIdentity(service, identity)) owned.set(service.id, { identity, members: await treeMembers(identity), redactor: createRedactor(), stopping: false });
      else store.update('services', service.id, { status: 'unknown', ownership: 'unknown', lastError: 'The previous managed process identity could not be verified after worker recovery.' });
    }
  }

  async function probe() {
    if (probing || closed) return;
    probing = true;
    try {
      for (const [serviceId, record] of owned) {
        const service = store.get('services', serviceId);
        if (!service || record.stopping || service.status === 'starting') continue;
        const leader = await processIdentity(record.identity.pid);
        if (!sameIdentity(record.identity, leader)) {
          store.update('services', serviceId, { status: record.exited ? 'failed' : 'unknown', lastProbeAt: now(), lastError: 'The managed process is no longer alive with its recorded identity.' });
          continue;
        }
        record.members = await treeMembers(record.identity, record.members);
        const ready = service.url && await httpReady(service.url) && await ownsListener(record.members, service.port || new URL(service.url).port || (new URL(service.url).protocol === 'https:' ? 443 : 80));
        store.update('services', serviceId, { status: ready ? 'running' : 'unknown', lastProbeAt: now(), ...(ready ? {} : { lastError: 'Process is alive but HTTP readiness is not confirmed.' }) });
      }
    } finally { probing = false; }
  }

  const timer = setInterval(() => probe().catch(() => {}), probeIntervalMs);
  timer.unref();
  return { start, stop, async restart(serviceId, options) { await stop(serviceId); return start(serviceId, options); }, reconcile, probe, owned,
    async close({ stopServices = true } = {}) { closed = true; clearInterval(timer); await Promise.allSettled([...pendingStarts]); if (stopServices) for (const serviceId of [...owned.keys()]) { try { await stop(serviceId); } catch (error) { const service = store.get('services', serviceId); if (service) log(service, 'service.stop_failed', error.message, {}, 'error'); } } }
  };
}
