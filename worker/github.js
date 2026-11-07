import { CodexClient } from './codex.js';
import { now } from '../server/store.js';
import { githubSettingsId, githubJobScope, sameGithubScope, parseGithubRepository, GITHUB_JOB_TYPES } from '../server/github.js';

// These exact native MCP names and schemas were inspected on codex-cli 0.160.0.
// Never substitute a similarly named tool or ask a model to choose an action.
export const GITHUB_READ_TOOLS = new Set(['github.get_repo', 'github.search_prs', 'github.search_issues', 'github.get_commit_combined_status', 'github.fetch_commit_workflow_runs']);
const SAFE_ERROR = 'GitHub could not return this data. Check the connected app in Codex and retry.';
const COVERAGE = 'Legacy commit statuses and first-page PR-triggered GitHub Actions runs only. Check runs and other workflows are not included.';
const cancellation = () => Object.assign(new Error('GitHub refresh cancelled.'), { cancelled: true });
const scopeChanged = () => Object.assign(new Error('The project repository or commit changed. Refresh GitHub again.'), { scopeChanged: true });
const clean = (value, max = 300) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/[\x00-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const repositoryMatches = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();

export function parseGithubToolResult(result) {
  if (result?.isError) throw new Error(SAFE_ERROR);
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  for (const part of result?.content || []) {
    if (part.type !== 'text' || typeof part.text !== 'string') continue;
    if (part.text.length > 5 * 1024 * 1024) throw new Error(SAFE_ERROR);
    try {
      const parsed = JSON.parse(part.text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
      if (parsed && typeof parsed === 'object') return parsed;
    } catch { /* A subsequent content block may carry the JSON response. */ }
  }
  throw new Error(SAFE_ERROR);
}

function findList(value, keys, depth = 0) {
  if (Array.isArray(value)) return { items: value, parent: {} };
  if (!value || typeof value !== 'object' || depth > 4) return null;
  for (const key of keys) if (Array.isArray(value[key])) return { items: value[key], parent: value };
  for (const key of ['data', 'result', 'results', 'response']) {
    const found = findList(value[key], keys, depth + 1);
    if (found) return found;
  }
  return null;
}

function isoTime(value) {
  if (typeof value !== 'string' || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.search = ''; url.hash = '';
    return url.href;
  } catch { return null; }
}

function itemUrl(item, repository, number, kind) {
  let evidence = false;
  for (const value of [item.display_url, item.html_url, item.url, item.repository_url]) {
    if (!value) continue;
    let url;
    try { url = new URL(value); } catch { throw new Error(SAFE_ERROR); }
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error(SAFE_ERROR);
    const match = url.hostname === 'github.com' ? /^\/([^/]+\/[^/]+)(?:\/(?:pull|issues)\/(\d+))?\/?$/.exec(url.pathname)
      : url.hostname === 'api.github.com' ? /^\/repos\/([^/]+\/[^/]+)(?:\/(?:pulls|issues)\/(\d+))?\/?$/.exec(url.pathname) : null;
    if (!match || !repositoryMatches(match[1], repository.fullName) || match[2] && Number(match[2]) !== number) throw new Error(SAFE_ERROR);
    evidence = true;
  }
  const named = item.repository?.full_name || item.repository?.repository_full_name;
  if (named && !repositoryMatches(named, repository.fullName)) throw new Error(SAFE_ERROR);
  if (!evidence && !repositoryMatches(named, repository.fullName)) throw new Error(SAFE_ERROR);
  return `${repository.url}/${kind === 'prs' ? 'pull' : 'issues'}/${number}`;
}

export function normalizeGithubItems(data, repository, kind = 'prs', limit = 20) {
  const found = findList(data, ['issues', 'pull_requests', 'pullRequests', 'items', 'results']);
  if (!found) throw new Error(SAFE_ERROR);
  const items = found.items.slice(0, limit).map((item) => {
    const number = item.number ?? item.issue_number ?? item.pr_number;
    if (!Number.isSafeInteger(number) || number <= 0) throw new Error(SAFE_ERROR);
    return { number, title: clean(item.title || item.display_title || '(Untitled)', 300), url: itemUrl(item, repository, number, kind),
      author: clean(item.user?.login || item.author?.login || (typeof item.author === 'string' ? item.author : ''), 100) || null,
      state: ['open', 'closed', 'merged'].includes(item.state) ? item.state : 'open',
      draft: typeof item.draft === 'boolean' ? item.draft : null,
      updatedAt: isoTime(item.updated_at || item.updatedAt) };
  });
  const total = found.parent.total_count ?? found.parent.totalCount;
  return { status: 'ready', items, truncated: Boolean(found.parent.next_page || found.parent.nextPageToken || found.parent.incomplete_results || found.items.length >= limit || Number.isSafeInteger(total) && total > items.length) };
}

export function normalizeGithubChecks(data, workflows, local, repository = null) {
  const statuses = findList(data, ['statuses', 'items']);
  if (!statuses || data.sha && String(data.sha).toLowerCase() !== local.commit) throw new Error(SAFE_ERROR);
  const stateMap = { success: ['completed', 'success'], failure: ['completed', 'failure'], error: ['completed', 'failure'], pending: ['in_progress', null] };
  const items = statuses.items.slice(0, 40).map((item) => {
    const [status, conclusion] = stateMap[item.state] || ['unknown', null];
    return { name: clean(item.context || item.name || 'Commit status', 200), status, conclusion, url: sourceUrl(item.target_url || item.html_url || item.url) };
  });
  const runs = workflows == null ? null : findList(workflows, ['workflow_runs', 'runs', 'items']);
  if (workflows != null && !runs) throw new Error(SAFE_ERROR);
  for (const item of (runs?.items || []).slice(0, 40)) {
    if (item.head_sha && String(item.head_sha).toLowerCase() !== local.commit) throw new Error(SAFE_ERROR);
    const status = ['completed', 'queued', 'in_progress', 'waiting', 'pending', 'requested'].includes(item.status) ? item.status : 'unknown';
    const conclusion = ['success', 'failure', 'cancelled', 'skipped', 'timed_out', 'action_required', 'neutral', 'stale', 'startup_failure'].includes(item.conclusion) ? item.conclusion : null;
    const runUrl = repository && Number.isSafeInteger(item.id) && item.id > 0 ? `${repository.url}/actions/runs/${item.id}` : null;
    items.push({ name: clean(item.name || item.display_title || 'GitHub Actions workflow', 200), status, conclusion, url: sourceUrl(item.html_url || item.url) || runUrl });
  }
  const count = statuses.parent.total_count ?? statuses.parent.totalCount;
  const runCount = runs?.parent.total_count ?? runs?.parent.totalCount;
  return { status: 'ready', commit: local.commit, branch: local.branch || null, items,
    coverage: runs ? COVERAGE : 'Legacy commit statuses only. GitHub Actions runs are unavailable; check runs and other workflows are not included.',
    truncated: Boolean(statuses.items.length >= 40 || Number.isSafeInteger(count) && count > statuses.items.length
      || runs?.items.length >= 40 || Number.isSafeInteger(runCount) && runCount > runs.items.length) };
}

function cachedFailure(previous, key, empty) {
  const source = previous?.[key] || empty;
  const wasFresh = source.status === 'ready' && !source.stale;
  return { ...source, status: 'error', stale: true,
    cachedAt: Object.hasOwn(source, 'cachedAt') ? source.cachedAt : wasFresh ? previous?.generatedAt || null : null, error: SAFE_ERROR };
}

function schemaAccepts(schema, value) {
  if (!schema || typeof schema !== 'object') return false;
  if (schema.anyOf) return schema.anyOf.some((option) => schemaAccepts(option, value));
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'string' && typeof value !== 'string' || schema.type === 'integer' && !Number.isSafeInteger(value)
    || schema.type === 'number' && typeof value !== 'number' || schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'array' && (!Array.isArray(value) || schema.items && value.some((item) => !schemaAccepts(schema.items, item)))) return false;
  if (schema.type === 'null' && value !== null || schema.type === 'object' && (!value || typeof value !== 'object' || Array.isArray(value))) return false;
  if (typeof value === 'number' && (schema.minimum !== undefined && value < schema.minimum || schema.maximum !== undefined && value > schema.maximum
    || schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum || schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum)) return false;
  if (typeof value === 'string' && (schema.maxLength !== undefined && value.length > schema.maxLength || schema.minLength !== undefined && value.length < schema.minLength)) return false;
  return true;
}

export function validateGithubReadTool(tools, name, args) {
  const tool = tools.find((item) => item.name === name);
  const properties = tool?.inputSchema?.properties;
  if (!GITHUB_READ_TOOLS.has(name) || !tool || tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint === true
    || !properties || Object.keys(args).some((key) => !Object.hasOwn(properties, key) || !schemaAccepts(properties[key], args[key]))
    || (tool.inputSchema.required || []).some((key) => !Object.hasOwn(args, key))) throw new Error(SAFE_ERROR);
  return tool;
}

export async function runGithubRefresh({ store, dataDir, job, signal, makeCodex = (options) => new CodexClient(options) }) {
  if (signal?.aborted) throw cancellation();
  if (!GITHUB_JOB_TYPES.has(job.type) || !sameGithubScope(await githubJobScope(store, job.projectId), job.payload)) throw scopeChanged();
  const inspecting = job.type === 'project.github.inspect';
  const settingsId = githubSettingsId(job.projectId), cached = store.get('settings', settingsId);
  const repository = job.payload.repository, local = job.payload.local;
  if (!inspecting && (!repository || !parseGithubRepository(repository.fullName))) throw new Error(SAFE_ERROR);
  const activity = (action, tool = null) => {
    if (job.agentId) store.update('agents', job.agentId, { name: 'GitHub reader', role: 'repository summaries', status: 'working', phase: 'github', action, currentCommand: tool, lastActivityAt: now() });
  };
  const event = (type, message, data = {}) => store.event({ source: 'agent', projectId: job.projectId, agentId: job.agentId, type, message, data });
  // Raw protocol diagnostics and connector content must never reach agent logs.
  const privateStore = { ...store, event() {}, update() { return null; }, put() { return null; } };
  const client = makeCodex({ store: privateStore, projectId: job.projectId, agentId: job.agentId, onActivity() {} });
  if (typeof client.send === 'function') client.serverRequest = (message) => client.send({ id: message.id, error: { code: -32601, message: 'GitHub summaries authorize only explicit read tools; interactive actions are unavailable.' } });
  let timer, abort, stopped = false, connection;
  const ensureActive = () => { if (signal?.aborted || stopped || store.get('jobs', job.id)?.cancelRequested) throw cancellation(); };
  const persist = async (patch) => {
    ensureActive();
    if (!sameGithubScope(await githubJobScope(store, job.projectId), job.payload)) throw scopeChanged();
    ensureActive();
    return store.put('settings', { ...(store.get('settings', settingsId) || { id: settingsId }), ...patch, id: settingsId });
  };
  const interrupted = new Promise((_, reject) => {
    abort = () => { stopped = true; reject(cancellation()); Promise.resolve(client.close()).catch(() => {}); };
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => { stopped = true; reject(new Error(SAFE_ERROR)); Promise.resolve(client.close()).catch(() => {}); }, 180000);
    if (signal?.aborted) abort();
  });
  try {
    return await Promise.race([interrupted, (async () => {
      if (!inspecting) await persist({ stale: true, refreshing: true, lastAttemptAt: now() });
      activity('Checking the connected GitHub app through native Codex MCP.');
      await client.connect(); ensureActive();
      const installed = await client.request('app/installed', { forceRefresh: true }, 45000); ensureActive();
      if (!Array.isArray(installed.apps)) throw new Error(SAFE_ERROR);
      const app = installed.apps.find((item) => /^github$/i.test(item.runtimeName || item.name || ''));
      connection = { status: !app ? 'unavailable' : !app.enabled ? 'disabled' : app.callable ? 'connected' : 'unavailable', callable: Boolean(app?.enabled && app?.callable), lastCheckedAt: now() };
      let tools = [];
      if (connection.callable) {
        const listed = await client.request('mcpServerStatus/list', { serverName: 'codex_apps', detail: 'toolsAndAuthOnly', limit: 100 }, 30000); ensureActive();
        tools = Object.values(listed.data?.find((item) => item.name === 'codex_apps')?.tools || {});
        try {
          validateGithubReadTool(tools, 'github.get_repo', { repository_full_name: 'owner/repo' });
          for (const name of ['github.search_prs', 'github.search_issues']) validateGithubReadTool(tools, name, { query: 'repo:owner/repo is:open', topn: 20, sort: 'updated', order: 'desc' });
        } catch { connection = { ...connection, status: 'unavailable', callable: false, error: 'Required GitHub read tools are unavailable. Refresh the connected app in Codex.' }; }
      }
      await persist({ connection, error: null });
      event('github.inspected', 'Checked GitHub app connectivity.', { status: connection.status });
      if (inspecting) return { connection };
      if (!connection.callable) throw new Error(SAFE_ERROR);
      const thread = await client.request('thread/start', { cwd: dataDir, sandbox: 'read-only', approvalPolicy: 'never', ephemeral: true }, 30000); ensureActive();
      if (!thread.thread?.id) throw new Error(SAFE_ERROR);
      const call = async (name, args) => {
        ensureActive(); validateGithubReadTool(tools, name, args);
        activity('Reading bounded GitHub repository data through MCP.', name);
        event('github.tool.started', 'Reading GitHub data.', { tool: name });
        const response = await client.request('mcpServer/tool/call', { server: 'codex_apps', threadId: thread.thread.id, tool: name, arguments: args }, 30000); ensureActive();
        const value = parseGithubToolResult(response);
        event('github.tool.completed', 'GitHub read tool completed.', { tool: name });
        return value;
      };
      const repo = await call('github.get_repo', { repository_full_name: repository.fullName });
      const returnedName = repo.repository_full_name || repo.full_name || repo.data?.repository_full_name || repo.data?.full_name;
      if (!repositoryMatches(returnedName, repository.fullName)) throw new Error(SAFE_ERROR);
      const previous = cached?.snapshot && cached.snapshotScope?.path === job.payload.path
        && repositoryMatches(cached.snapshot.repository?.fullName, repository.fullName) ? cached.snapshot : null;
      const readList = async (key, tool, query, limit) => {
        try { return normalizeGithubItems(await call(tool, { query, topn: limit, sort: 'updated', order: 'desc' }), repository, key === 'issues' ? 'issues' : 'prs', limit); }
        catch { ensureActive(); return cachedFailure(previous, key, { items: [], truncated: false }); }
      };
      const prs = await readList('prs', 'github.search_prs', `repo:${repository.fullName} is:pr is:open`, 20);
      const issues = await readList('issues', 'github.search_issues', `repo:${repository.fullName} is:issue is:open`, 20);
      const reviewRequests = await readList('reviewRequests', 'github.search_prs', `repo:${repository.fullName} is:pr is:open review-requested:@me`, 10);
      let checks;
      if (local?.commit) {
        try {
          const args = { repo_full_name: repository.fullName, commit_sha: local.commit };
          const status = await call('github.get_commit_combined_status', args);
          let workflows = null;
          try { workflows = await call('github.fetch_commit_workflow_runs', args); } catch { ensureActive(); }
          checks = normalizeGithubChecks(status, workflows, local, repository);
        } catch {
          ensureActive();
          const previousChecks = previous?.checks?.commit === local.commit ? previous : null;
          checks = cachedFailure(previousChecks, 'checks', { commit: local.commit, branch: local.branch || null, items: [], coverage: COVERAGE, truncated: false });
        }
      } else checks = { status: 'unavailable', commit: null, branch: local?.branch || null, items: [], coverage: 'No local HEAD commit is available. Commit statuses and GitHub Actions were not queried.', truncated: false };
      if (![prs, issues, reviewRequests, checks].some((source) => source.status === 'ready')) throw new Error(SAFE_ERROR);
      const snapshot = { repository, generatedAt: now(), prs, issues, reviewRequests, checks, stale: [prs, issues, reviewRequests, checks].some((source) => source.status === 'error') };
      await persist({ connection, snapshot, snapshotScope: { path: job.payload.path, repository: repository.fullName, commit: local?.commit || null }, stale: snapshot.stale, refreshing: false, error: null, lastAttemptAt: now() });
      activity('GitHub repository summary is ready.');
      event('github.snapshot.ready', 'Refreshed the GitHub repository summary.', { prs: prs.status === 'ready' ? prs.items.length : null, issues: issues.status === 'ready' ? issues.items.length : null, reviewRequests: reviewRequests.status === 'ready' ? reviewRequests.items.length : null, checks: checks.status === 'ready' ? checks.items.length : null });
      return { connection, snapshot };
    })()]);
  } catch (error) {
    const cancelled = Boolean(signal?.aborted || error.cancelled || store.get('jobs', job.id)?.cancelRequested);
    const changed = error.scopeChanged || !sameGithubScope(await githubJobScope(store, job.projectId), job.payload);
    if (!changed) {
      const checked = now(), saved = store.get('settings', settingsId) || { id: settingsId };
      store.put('settings', { ...saved, ...(!connection ? { connection: { status: 'error', callable: false, lastCheckedAt: checked } } : {}),
        ...(!inspecting ? { stale: true, refreshing: false, lastAttemptAt: checked } : {}), error: cancelled ? 'GitHub refresh cancelled.' : SAFE_ERROR });
    }
    if (changed) throw scopeChanged();
    if (cancelled) throw cancellation();
    throw new Error(SAFE_ERROR);
  } finally {
    stopped = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); await client.close();
  }
}
