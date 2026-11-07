import express from 'express';

export const GOOGLE_TIME_ZONE = 'Asia/Manila';
export const GOOGLE_JOB_TYPES = new Set(['personal.google.inspect', 'personal.google.refresh']);
const active = (job) => ['queued', 'running'].includes(job.status);
const fail = (message, status = 400, code = 'INVALID_REQUEST') => Object.assign(new Error(message), { status, code });

export function googleDate(value, timeZone = GOOGLE_TIME_ZONE) {
  if (timeZone !== GOOGLE_TIME_ZONE) throw fail('Google summaries currently use Asia/Manila.', 400, 'INVALID_TIME_ZONE');
  const date = value || new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
    || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) {
    throw fail('Choose a valid date in YYYY-MM-DD format.', 400, 'INVALID_DATE');
  }
  return date;
}

export function createGoogleRouter({ store, enqueue, getWorkers = () => store.list('workers') }) {
  const router = express.Router();
  const jobs = () => store.list('jobs').filter((job) => GOOGLE_JOB_TYPES.has(job.type));
  const publicJob = (job) => job ? Object.fromEntries(['id', 'type', 'status', 'cancelRequested', 'agentId', 'createdAt', 'startedAt', 'finishedAt', 'error'].map((key) => [key, job[key] ?? null])) : null;
  const online = () => getWorkers().some((worker) => worker.status === 'online' && Date.now() - Date.parse(worker.lastHeartbeatAt || '') < 8000);

  router.get('/', (req, res) => {
    const state = store.get('settings', 'google-connections');
    const saved = store.get('settings', 'google-brief');
    const brief = saved?.brief ? { ...saved.brief, stale: Boolean(saved.stale) || saved.brief.date !== googleDate() || Date.now() - Date.parse(saved.brief.generatedAt || '') > 15 * 60 * 1000 } : null;
    const unknown = { status: 'unknown', callable: false, lastCheckedAt: null };
    const latest = jobs().findLast(active) || jobs().at(-1);
    res.json({ connections: state?.connections || { gmail: { ...unknown }, calendar: { ...unknown } }, brief, job: publicJob(latest), error: saved?.error || state?.error || null });
  });

  const queue = (type, payload) => {
    const pending = jobs().find(active);
    if (pending) return pending;
    if (!online()) throw fail('Start the local worker before refreshing Google.', 409, 'WORKER_OFFLINE');
    return enqueue(type, { payload });
  };
  router.post('/inspect', (req, res) => res.status(202).json({ job: publicJob(queue('personal.google.inspect', {})) }));
  router.post('/refresh', (req, res) => {
    const timeZone = req.body?.timeZone || GOOGLE_TIME_ZONE;
    const date = googleDate(req.body?.date, timeZone);
    res.status(202).json({ job: publicJob(queue('personal.google.refresh', { date, timeZone })) });
  });
  router.post('/cancel', (req, res) => {
    const job = req.body?.jobId ? store.get('jobs', req.body.jobId) : jobs().find(active);
    if (!job || !GOOGLE_JOB_TYPES.has(job.type)) throw fail('Google refresh job was not found.', 404, 'NOT_FOUND');
    if (!active(job)) throw fail('This Google refresh has already finished.', 409, 'JOB_FINISHED');
    const cancelled = store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: new Date().toISOString() } : {}) });
    res.json({ job: publicJob(cancelled) });
  });
  return router;
}
