import express from 'express';
import { now } from './store.js';
import { newspaperPreferences, validateNewspaperPreferences, NEWSPAPER_PREFERENCES } from './newspaper-briefing.js';
import { xSettings } from './x-news.js';

export const NEWSPAPER_JOB_TYPE = 'personal.newspaper.generate';
export const NEWSPAPER_EDITION_PREFIX = 'newspaper:edition:';
export const NEWSPAPER_SETTINGS = Object.freeze({ preferredPages: 1, maxPages: 2, timeZone: 'Asia/Manila', coins: ['bitcoin', 'ethereum', 'solana'] });
export const NEWSPAPER_SECTIONS = Object.freeze(['philippines', 'world', 'valorant', 'dota', 'crypto']);
const active = (job) => ['queued', 'running'].includes(job.status);
const fail = (message, status = 400, code = 'INVALID_NEWSPAPER_REQUEST') => Object.assign(new Error(message), { status, code });

export function newspaperDate(value, at = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: NEWSPAPER_SETTINGS.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  if (value !== undefined && value !== today) throw fail('New editions can only be generated for today in Manila.', 400, 'INVALID_EDITION_DATE');
  return today;
}

export function newspaperEditions(store) {
  return store.list('settings').filter((record) => record.id.startsWith(NEWSPAPER_EDITION_PREFIX) && record.edition?.id && record.edition?.generatedAt)
    .map((record) => record.edition).sort((a, b) => b.date.localeCompare(a.date) || b.generatedAt.localeCompare(a.generatedAt) || b.id.localeCompare(a.id));
}

export const publicNewspaperJob = (job) => job ? Object.fromEntries(['id', 'type', 'status', 'agentId', 'cancelRequested', 'createdAt', 'startedAt', 'finishedAt', 'error', 'editionId'].map((key) => [key, job[key] ?? null])) : null;

export function queueNewspaper({ store, enqueue, getWorkers = () => store.list('workers'), force = false, date, at = new Date() }) {
  if (typeof force !== 'boolean') throw fail('Regenerate must be an explicit boolean.');
  const selectedDate = newspaperDate(date, at);
  // This operation is synchronous inside a write transaction so HTTP requests
  // and the scheduled local CLI cannot both create the same day's queued work.
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const pending = store.list('jobs').find((job) => job.type === NEWSPAPER_JOB_TYPE && job.payload?.date === selectedDate && active(job));
    if (pending) { store.db.exec('COMMIT'); return { job: pending, edition: null, reused: true }; }
    const edition = newspaperEditions(store).find((item) => item.date === selectedDate);
    if (edition && !force) { store.db.exec('COMMIT'); return { job: null, edition, reused: true }; }
    if (!getWorkers().some((worker) => worker.status === 'online' && at.getTime() - Date.parse(worker.lastHeartbeatAt || '') >= -5000 && at.getTime() - Date.parse(worker.lastHeartbeatAt || '') < 8000)) throw fail('Start the local Mari worker before generating an edition.', 409, 'WORKER_OFFLINE');
    const job = enqueue(NEWSPAPER_JOB_TYPE, { payload: { date: selectedDate, force } });
    store.db.exec('COMMIT');
    return { job, edition: null, reused: false };
  } catch (error) { store.db.exec('ROLLBACK'); throw error; }
}

export function createNewspaperRouter({ store, dataDir: _dataDir, enqueue, getWorkers = () => store.list('workers') }) {
  const router = express.Router();
  const jobs = () => store.list('jobs').filter((job) => job.type === NEWSPAPER_JOB_TYPE);
  router.get('/', (req, res) => {
    const editions = newspaperEditions(store);
    if (req.query.editionId !== undefined && (typeof req.query.editionId !== 'string' || req.query.editionId.length > 100)) throw fail('Choose a saved edition.');
    const edition = req.query.editionId ? editions.find((item) => item.id === req.query.editionId) : editions[0] || null;
    if (req.query.editionId && !edition) throw fail('Saved edition was not found.', 404, 'NOT_FOUND');
    const schedule = store.get('settings', 'newspaper:schedule');
    const registered = schedule?.status === 'active' && typeof schedule.automationId === 'string' && !!schedule.automationId;
    res.json({ edition, editions: editions.slice(0, 30).map(({ id, date, generatedAt, status }) => ({ id, date, generatedAt, status })),
      job: publicNewspaperJob(jobs().findLast(active) || jobs().at(-1)), settings: NEWSPAPER_SETTINGS, preferences:newspaperPreferences(store), xAccounts:xSettings(store).accounts.map(({handle,enabled})=>({handle,enabled})),
      schedule: { time: '07:00', timeZone: NEWSPAPER_SETTINGS.timeZone, status: registered ? 'active' : 'pending',
        ...(registered ? { automationId: schedule.automationId } : {}), note: registered ? 'Prepared by the registered Codex automation while the desktop and computer are available.' : 'The daily automation has not been registered yet.' } });
  });
  router.put('/preferences',(req,res)=>{
    let patch;try{patch=validateNewspaperPreferences(req.body);}catch(error){throw fail(error.message);}
    const previous=newspaperPreferences(store);
    const preferences=store.put('settings',{...previous,...patch,id:NEWSPAPER_PREFERENCES});
    res.json({preferences});
  });
  router.post('/generate', (req, res) => {
    if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body) || Object.keys(req.body).some((key) => key !== 'force')) throw fail('Use only the optional Regenerate flag.');
    const result = queueNewspaper({ store, enqueue, getWorkers, force: req.body.force ?? false });
    res.status(result.job ? 202 : 200).json({ ...result, job: publicNewspaperJob(result.job) });
  });
  router.post('/cancel', (req, res) => {
    const job = req.body?.jobId ? store.get('jobs', req.body.jobId) : jobs().findLast(active);
    if (!job || job.type !== NEWSPAPER_JOB_TYPE) throw fail('Newspaper job was not found.', 404, 'NOT_FOUND');
    if (!active(job)) throw fail('This newspaper job has finished.', 409, 'JOB_FINISHED');
    res.json({ job: publicNewspaperJob(store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: now() } : {}) })) });
  });
  return router;
}
