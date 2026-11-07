import express from 'express';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { safeChildEnv } from './security.js';

const exec = promisify(execFile);
export const GITHUB_JOB_TYPES = new Set(['project.github.inspect', 'project.github.refresh']);
export const githubSettingsId = (projectId) => `github:${projectId}`;
const active = (job) => ['queued', 'running'].includes(job.status);
const fail = (message, status = 400, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { status, code });
const sameRepo = (a, b) => Boolean(a && b && a.fullName.toLowerCase() === b.fullName.toLowerCase());

// Remote credentials are discarded here, before the value can reach a response,
// a setting, a job or an event. Manual URLs must never contain credentials.
export function parseGithubRepository(input, { remote = false } = {}) {
  if (typeof input !== 'string' || input.length > 2048 || !input || /[\s\x00-\x1f\x7f?#%\\]/.test(input)) return null;
  let fullName = input;
  const scp = remote && /^git@github\.com:([^/]+\/[^/]+)$/i.exec(input);
  if (scp) fullName = scp[1];
  else if (input.includes('://')) {
    let url;
    try { url = new URL(input); } catch { return null; }
    const authorityHost = input.slice(input.indexOf('://') + 3).split('/')[0].split('@').at(-1).toLowerCase();
    if (url.hostname.toLowerCase() !== 'github.com' || authorityHost !== 'github.com' || url.port || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(remote && url.protocol === 'ssh:')) return null;
    if (!remote && (url.username || url.password || input.slice(input.indexOf('://') + 3).split('/')[0].includes('@'))) return null;
    if (url.protocol === 'ssh:' && (url.username !== 'git' || url.password)) return null;
    // Validate the original path as well: URL normalization must not erase ../.
    const originalPath = input.slice(input.indexOf('://') + 3).replace(/^[^/]+/, '');
    if (!/^\/[^/]+\/[^/]+\/?$/.test(originalPath)) return null;
    fullName = url.pathname.replace(/^\//, '').replace(/\/$/, '');
  } else if (input.includes(':') || input.startsWith('/')) return null;
  fullName = fullName.replace(/\.git$/i, '');
  const parts = fullName.split('/');
  if (parts.length !== 2) return null;
  const [owner, name] = parts;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || owner.includes('--')
    || !/^[A-Za-z0-9_.-]{1,100}$/.test(name) || ['.', '..'].includes(name)) return null;
  return { fullName: `${owner}/${name}`, owner, name, url: `https://github.com/${owner}/${name}` };
}

export function selectGithubRemote(remotes) {
  const candidates = remotes.flatMap(({ name, url }) => {
    const parsed = parseGithubRepository(url, { remote: true });
    return parsed ? [{ ...parsed, source: 'remote', ...(/^[A-Za-z0-9_.-]{1,100}$/.test(name) ? { remoteName: name } : {}) }] : [];
  });
  const origin = candidates.find((repo) => repo.remoteName === 'origin');
  const distinct = [...new Map(candidates.map((repo) => [repo.fullName.toLowerCase(), repo])).values()];
  return { repository: origin || (distinct.length === 1 ? distinct[0] : null), detectedRepositories: candidates,
    error: !origin && distinct.length > 1 ? 'Choose a GitHub repository because multiple remotes were detected.' : null };
}

export async function inspectGithubProject(project, saved = null) {
  const git = async (args) => {
    try {
      return (await exec('git', ['-c', 'core.fsmonitor=false', ...args], { cwd: project.path, timeout: 3000, maxBuffer: 128 * 1024,
        env: { ...safeChildEnv(), GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1', GIT_NO_REPLACE_OBJECTS: '1' } })).stdout;
    } catch { return null; }
  };
  const [config, branch, sha] = await Promise.all([
    git(['config', '--local', '--no-includes', '--null', '--get-regexp', '^remote\\..*\\.url$']),
    git(['symbolic-ref', '--quiet', '--short', 'HEAD']), git(['rev-parse', '--verify', 'HEAD^{commit}']),
  ]);
  const remotes = (config || '').split('\0').flatMap((entry) => {
    const match = /^remote\.(.+)\.url\n([\s\S]*)$/.exec(entry);
    return match ? [{ name: match[1], url: match[2] }] : [];
  });
  const detected = selectGithubRemote(remotes);
  const manual = saved?.repositoryBinding && parseGithubRepository(saved.repositoryBinding.fullName);
  const commit = typeof sha === 'string' && /^[a-f0-9]{40,64}$/i.test(sha.trim()) ? sha.trim().toLowerCase() : null;
  const local = branch !== null || commit ? { branch: branch?.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 200) || null, commit } : null;
  return { ...detected, repository: manual ? { ...manual, source: 'manual' } : detected.repository,
    error: manual ? null : detected.error, local };
}

export async function githubJobScope(store, projectId) {
  const project = store.get('projects', projectId);
  if (!project) return null;
  const saved = store.get('settings', githubSettingsId(projectId));
  const context = await inspectGithubProject(project, saved);
  return { ...context, path: project.path, bindingVersion: saved?.bindingVersion || 0 };
}

export function sameGithubScope(scope, payload) {
  return Boolean(scope && scope.path === payload?.path && scope.bindingVersion === payload?.bindingVersion
    && ((!scope.repository && !payload.repository) || sameRepo(scope.repository, payload.repository))
    && (scope.local?.commit || null) === (payload.local?.commit || null));
}

export function createGithubRouter({ store, enqueue, getWorkers = () => store.list('workers') }) {
  const router = express.Router({ mergeParams: true });
  const jobs = (projectId) => store.list('jobs').filter((job) => job.projectId === projectId && GITHUB_JOB_TYPES.has(job.type));
  const publicJob = (job) => job ? Object.fromEntries(['id', 'projectId', 'type', 'status', 'cancelRequested', 'agentId', 'createdAt', 'startedAt', 'finishedAt', 'error'].map((key) => [key, job[key] ?? null])) : null;
  const projectFor = (req) => {
    const project = store.get('projects', req.params.projectId);
    if (!project) throw fail('Project was not found.', 404, 'NOT_FOUND');
    return project;
  };
  const state = async (project) => {
    const saved = store.get('settings', githubSettingsId(project.id));
    const context = await inspectGithubProject(project, saved);
    let snapshot = saved?.snapshot && saved.snapshotScope?.path === project.path && sameRepo(saved.snapshot.repository, context.repository) ? saved.snapshot : null;
    if (snapshot) {
      const commitChanged = (snapshot.checks?.commit || null) !== (context.local?.commit || null);
      const expired = Date.now() - Date.parse(snapshot.generatedAt || '') > 15 * 60 * 1000;
      snapshot = { ...snapshot, stale: Boolean(saved.stale || snapshot.stale || expired || commitChanged),
        ...(commitChanged ? { checks: { ...snapshot.checks, stale: true } } : {}) };
    }
    return { connection: saved?.connection || { status: 'unknown', callable: false, lastCheckedAt: null },
      repository: context.repository, detectedRepositories: context.detectedRepositories, snapshot,
      job: publicJob(jobs(project.id).findLast(active) || jobs(project.id).at(-1)),
      error: context.error || saved?.error || null, local: context.local };
  };
  router.get('/', async (req, res) => res.json(await state(projectFor(req))));
  const changeBinding = async (req, res, repositoryBinding) => {
    const project = projectFor(req), previous = store.get('settings', githubSettingsId(project.id));
    const updated = { ...(previous || {}), id: githubSettingsId(project.id), repositoryBinding, bindingVersion: (previous?.bindingVersion || 0) + 1, error: null };
    const context = await inspectGithubProject(project, updated);
    if (!sameRepo(previous?.snapshot?.repository, context.repository)) updated.snapshot = null;
    store.put('settings', updated);
    // Relinking cancels only this project's GitHub reads. A running result also
    // checks its captured binding before saving, including a change away/back.
    for (const job of jobs(project.id).filter(active)) store.update('jobs', job.id, { cancelRequested: true,
      ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: new Date().toISOString() } : {}) });
    res.json(await state(project));
  };
  router.put('/repository', async (req, res) => {
    projectFor(req);
    const parsed = parseGithubRepository(req.body?.repository);
    if (!parsed) throw fail('Use owner/repository or an HTTPS github.com repository URL without credentials, query, or fragment.', 400, 'INVALID_REPOSITORY');
    await changeBinding(req, res, parsed);
  });
  router.delete('/repository', async (req, res) => changeBinding(req, res, null));
  const queue = async (req, type) => {
    const project = projectFor(req);
    const pending = jobs(project.id).find((job) => active(job) && !job.cancelRequested);
    if (pending) return pending;
    if (!getWorkers().some((worker) => worker.status === 'online' && Date.now() - Date.parse(worker.lastHeartbeatAt || '') < 8000)) throw fail('Start the local worker before refreshing GitHub.', 409, 'WORKER_OFFLINE');
    const scope = await githubJobScope(store, project.id);
    if (type === 'project.github.refresh' && !scope.repository) throw fail(scope.error || 'Choose a github.com repository for this project.', 409, 'REPOSITORY_REQUIRED');
    // Local Git inspection yields. Recheck immediately before the synchronous
    // enqueue so simultaneous refresh requests share the same actual job.
    const concurrent = jobs(project.id).find((job) => active(job) && !job.cancelRequested);
    if (concurrent) return concurrent;
    return enqueue(type, { projectId: project.id, payload: { path: scope.path, bindingVersion: scope.bindingVersion, repository: scope.repository, local: scope.local } });
  };
  router.post('/inspect', async (req, res) => res.status(202).json({ job: publicJob(await queue(req, 'project.github.inspect')) }));
  router.post('/refresh', async (req, res) => res.status(202).json({ job: publicJob(await queue(req, 'project.github.refresh')) }));
  router.post('/cancel', (req, res) => {
    const project = projectFor(req);
    const job = req.body?.jobId ? store.get('jobs', req.body.jobId) : jobs(project.id).find(active);
    if (!job || job.projectId !== project.id || !GITHUB_JOB_TYPES.has(job.type)) throw fail('GitHub refresh job was not found.', 404, 'NOT_FOUND');
    if (!active(job)) throw fail('This GitHub refresh has already finished.', 409, 'JOB_FINISHED');
    res.json({ job: publicJob(store.update('jobs', job.id, { cancelRequested: true,
      ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: new Date().toISOString() } : {}) })) });
  });
  return router;
}
