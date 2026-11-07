import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publicArtifact } from './artifacts.js';
import { validateHttpUrl } from './security.js';
import { isFreshServiceObservation } from '../shared/health.js';

export const BRAG_JOB_TYPE = 'project.brag.generate';
export const BRAG_COMMIT = '669ab9286aa28b6c3ee30e75f181ee74319d012a';
export const bragSettingsId = (projectId) => `brag:${projectId}`;
const active = (job) => ['queued', 'running'].includes(job.status);
const fail = (message, status = 400, code = 'INVALID_BRAG_REQUEST') => Object.assign(new Error(message), { status, code });
export const publicBragJob = (job) => job ? Object.fromEntries(['id', 'projectId', 'type', 'status', 'cancelRequested', 'agentId', 'createdAt', 'startedAt', 'finishedAt', 'error'].map((key) => [key, job[key] ?? null])) : null;

export function validateBragSettings(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['brief', 'duration', 'format'].includes(key))) throw fail('Use only brief, duration, and format video settings.');
  const { brief = '', duration = 20, format = 'landscape' } = input;
  if (typeof brief !== 'string' || brief.length > 1200 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(brief)) throw fail('Keep the video brief within 1,200 characters.');
  if (!Number.isInteger(duration) || duration < 15 || duration > 25) throw fail('Choose a video duration from 15 to 25 seconds.');
  if (!['landscape', 'portrait'].includes(format)) throw fail('Choose landscape or portrait video.');
  return { brief: brief.trim(), duration, format };
}

export async function inspectBragInstallation() {
  const tools = path.join(os.homedir(), '.local/share/mari-ai/tools');
  const runtime = path.join(tools, 'hyperframes');
  const skillRoot = path.join(os.homedir(), '.codex/skills');
  const files = { cli: path.join(runtime, 'node_modules/hyperframes/bin/hyperframes.mjs'), ffmpeg: path.join(tools, 'ffmpeg-8.1/bin/ffmpeg'), ffprobe: path.join(tools, 'ffmpeg-8.1/bin/ffprobe'), sandbox: '/usr/bin/bwrap' };
  const missing = [];
  for (const [name, file] of Object.entries(files)) if (!(await fs.stat(file).catch(() => null))?.isFile()) missing.push(name);
  for (const name of ['brag', 'hyperframes', 'hyperframes-cli', 'hyperframes-registry', 'media-use']) if (!(await fs.stat(path.join(skillRoot, name, 'SKILL.md')).catch(() => null))?.isFile()) missing.push(`${name} skill`);
  try { const { firefox } = await import('playwright'); if (!(await fs.stat(firefox.executablePath()).catch(() => null))?.isFile()) missing.push('Firefox capture browser'); } catch { missing.push('Firefox capture browser'); }
  let manifest = {}; try { manifest = JSON.parse(await fs.readFile(path.join(runtime, 'node_modules/hyperframes/package.json'), 'utf8')); } catch { /* Report an incomplete installation. */ }
  if (manifest.version !== '0.9.19') missing.push('pinned Hyperframes 0.9.19');
  const browser = (await fs.readFile(path.join(runtime, 'browser-path.txt'), 'utf8').catch(() => '')).trim();
  if (!browser.startsWith(`${runtime}${path.sep}`) || !(await fs.stat(browser).catch(() => null))?.isFile()) missing.push('isolated render browser');
  const error = missing.length ? `Local video setup is incomplete: ${missing.join(', ')}.` : null;
  return { available: !missing.length, version: manifest.version || null, bragCommit: BRAG_COMMIT, browser: 'Isolated Chromium (required for rendering)', localOnly: true, missing, error, reason: error,
    // Internal paths are removed by publicBragInstallation before API delivery.
    paths: { ...files, browser, runtime, skillRoot } };
}
export const publicBragInstallation = ({ paths: _paths, ...value }) => value;

export function selectBragService(store, projectId) {
  const candidates = store.list('services').filter((service) => service.projectId === projectId && service.status === 'running' && service.url && isFreshServiceObservation(service));
  for (const service of candidates) {
    try { return { id: service.id, url: validateHttpUrl(service.url), configVersion: service.configVersion ?? 1 }; } catch { /* A malformed configuration cannot become video source context. */ }
  }
  return null;
}

export function createBragRouter({ store, dataDir: _dataDir, enqueue, getWorkers = () => store.list('workers'), inspectInstallation = inspectBragInstallation }) {
  const router = express.Router({ mergeParams: true });
  const jobs = (projectId) => store.list('jobs').filter((job) => job.projectId === projectId && job.type === BRAG_JOB_TYPE);
  const projectFor = (req) => { const project = store.get('projects', req.params.projectId); if (!project) throw fail('Project was not found.', 404, 'NOT_FOUND'); return project; };
  const settings = (projectId) => validateBragSettings(store.get('settings', bragSettingsId(projectId))?.video || {});
  const state = async (project) => ({ installation: publicBragInstallation(await inspectInstallation()), settings: settings(project.id), service: selectBragService(store, project.id), job: publicBragJob(jobs(project.id).findLast(active) || jobs(project.id).at(-1)),
    artifacts: store.list('artifacts').filter((artifact) => artifact.projectId === project.id && ['video', 'video_poster', 'video_copy'].includes(artifact.kind)).slice(-30).map(publicArtifact), error: store.get('settings', bragSettingsId(project.id))?.error || null });
  router.get('/', async (req, res) => res.json(await state(projectFor(req))));
  router.put('/settings', async (req, res) => {
    const project = projectFor(req), video = validateBragSettings(req.body);
    store.put('settings', { ...(store.get('settings', bragSettingsId(project.id)) || {}), id: bragSettingsId(project.id), video });
    res.json(await state(project));
  });
  router.post('/generate', async (req, res) => {
    const project = projectFor(req);
    const video = req.body && Object.keys(req.body).length ? validateBragSettings(req.body) : settings(project.id);
    const pending = () => jobs(project.id).find((job) => active(job) && !job.cancelRequested);
    if (pending()) return res.status(202).json({ job: publicBragJob(pending()) });
    if (!getWorkers().some((worker) => worker.status === 'online' && Date.now() - Date.parse(worker.lastHeartbeatAt || '') < 8000)) throw fail('Start the local worker before generating a video.', 409, 'WORKER_OFFLINE');
    const installation = await inspectInstallation();
    if (!installation.available) throw fail(installation.error, 409, 'BRAG_UNAVAILABLE');
    const service = selectBragService(store, project.id);
    if (!service) throw fail('Start or probe a configured project website before generating its video.', 409, 'PROJECT_NOT_READY');
    if (!store.get('projects', project.id) || store.get('projects', project.id).path !== project.path) throw fail('Project changed while preparing the video. Retry.', 409, 'PROJECT_CHANGED');
    // Recheck after filesystem awaits and synchronously enqueue: concurrent clicks share one job.
    let job = pending();
    if (!job) {
      store.put('settings', { ...(store.get('settings', bragSettingsId(project.id)) || {}), id: bragSettingsId(project.id), video, error: null });
      job = enqueue(BRAG_JOB_TYPE, { projectId: project.id, payload: { path: project.path, service, settings: video } });
    }
    res.status(202).json({ job: publicBragJob(job) });
  });
  router.post('/cancel', (req, res) => {
    const project = projectFor(req), job = req.body?.jobId ? store.get('jobs', req.body.jobId) : jobs(project.id).find(active);
    if (!job || job.projectId !== project.id || job.type !== BRAG_JOB_TYPE) throw fail('Video job was not found.', 404, 'NOT_FOUND');
    if (!active(job)) throw fail('This video job has already finished.', 409, 'JOB_FINISHED');
    res.json({ job: publicBragJob(store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: new Date().toISOString() } : {}) })) });
  });
  return router;
}
