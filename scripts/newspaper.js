import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { createStore, id, now } from '../server/store.js';
import { ownedArtifactPath } from '../server/artifacts.js';
import { queueNewspaper, newspaperEditions, newspaperDate } from '../server/newspaper.js';
import { startWorker } from '../worker/index.js';
import { processIdentity, sameIdentity } from '../worker/services.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const defaultNewspaperDataDir = () => path.resolve(process.env.MARI_DATA_DIR || path.join(repoRoot, '.mari'));

export function newspaperArguments(args) {
  const result = { force: false, scheduled: false };
  for (let n = 0; n < args.length; n++) {
    if (args[n] === '--force') result.force = true;
    else if (args[n] === '--scheduled') result.scheduled = true;
    else if (args[n] === '--data-dir' && args[n + 1] && path.isAbsolute(args[n + 1])) result.dataDir = args[++n];
    else throw new Error('Usage: node scripts/newspaper.js [--force|--scheduled] [--data-dir /absolute/private/runtime]');
  }
  if (result.force && result.scheduled) throw new Error('Choose either --force or --scheduled.');
  return result;
}

export function scheduledNewspaperForce(store, at = new Date()) {
  const date = newspaperDate(undefined, at), cutoff = Date.parse(`${date}T07:00:00+08:00`);
  if (at.getTime() < cutoff) throw new Error('The scheduled edition is due at 07:00 Asia/Manila. Use Generate in Mari for an earlier manual edition.');
  return !newspaperEditions(store).some((edition) => edition.date === date && Date.parse(edition.generatedAt) >= cutoff);
}

export async function runDailyNewspaper({ dataDir = defaultNewspaperDataDir(), force = false, scheduled = false, signal,
  waitMs = 12 * 60 * 1000, pollMs = 500, store: providedStore, makeWorker = startWorker, queue = queueNewspaper } = {}) {
  const store = providedStore || createStore(dataDir);
  dataDir = path.resolve(dataDir);
  let temporaryWorker, selected, ownJob = false;
  const enqueue = (type, fields = {}) => {
    ownJob = true;
    const job = store.put('jobs', { id: id('job'), type, ...fields, payload: fields.payload || {}, status: 'queued', cancelRequested: false, createdAt: now() });
    store.event({ source: 'system', type: 'job.queued', message: 'Queued the daily newspaper.', data: { jobId: job.id } });
    return job;
  };
  const getWorkers = () => store.list('workers').map((worker) => { const age = Date.now() - Date.parse(worker.lastHeartbeatAt || ''); return { ...worker, status: worker.status === 'online' && age >= -5000 && age < 8000 ? 'online' : 'offline' }; });
  const liveLease = async () => { const lease = store.get('settings', 'worker-lease'); return Boolean(lease && sameIdentity(lease, await processIdentity(lease.pid))); };
  try {
    if (signal?.aborted) throw new Error('Newspaper command cancelled.');
    if (scheduled) force = scheduledNewspaperForce(store);
    // The router can return today's saved edition even with no active worker.
    try { selected = queue({ store, enqueue, getWorkers, force }); }
    catch (error) { if (error.code !== 'WORKER_OFFLINE') throw error; }
    if (!selected || (selected.job && !getWorkers().some((worker) => worker.status === 'online'))) {
      if (!await liveLease()) {
        try { temporaryWorker = await makeWorker({ store, dataDir, jobTypes: ['personal.newspaper.generate'] }); }
        catch (error) { if (!await liveLease()) throw error; }
      }
      if (!getWorkers().some((worker) => worker.status === 'online')) throw new Error('The existing Mari worker is not responding. Restart it before generating the daily edition.');
      if (!selected) selected = queue({ store, enqueue, getWorkers, force });
    }
    let edition = selected.edition;
    const deadline = Date.now() + waitMs;
    while (!edition) {
      if (signal?.aborted) throw new Error('Newspaper command cancelled.');
      const job = store.get('jobs', selected.job?.id);
      if (!job) throw new Error('The newspaper job is unavailable.');
      if (job.status === 'completed') {
        const editions = store.list('settings').filter((record) => record.id.startsWith('newspaper:edition:')).map((record) => record.edition).filter(Boolean);
        edition = editions.find((item) => item.id === job.result?.editionId || item.id === job.editionId)
          || editions.filter((item) => item.jobId === job.id).at(-1);
        if (!edition) throw new Error('The completed newspaper job has no saved edition.');
        break;
      }
      if (!['queued', 'running'].includes(job.status)) throw new Error(job.error || `Newspaper generation ${job.status}.`);
      if (Date.now() > deadline) throw new Error('Daily newspaper exceeded its bounded wait. Inspect the saved job and retry explicitly.');
      await delay(pollMs, undefined, signal ? { signal } : undefined);
    }
    const artifactId = edition.pdfArtifact?.id || edition.pdfArtifactId;
    const artifact = artifactId && store.get('artifacts', artifactId);
    const pdfPath = await ownedArtifactPath(dataDir, artifact);
    return { date: edition.date, editionId: edition.id, status: edition.status, stories: edition.stories.length, pdfPath, reused: Boolean(selected.reused) };
  } catch (error) {
    if (ownJob && selected?.job && ['queued', 'running'].includes(store.get('jobs', selected.job.id)?.status)) store.update('jobs', selected.job.id, { cancelRequested: true });
    throw error;
  } finally {
    // A temporary queue owner did not start the user's project/voice services.
    if (temporaryWorker) await temporaryWorker.stop({ stopServices: false });
    if (!providedStore) store.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const controller = new AbortController();
  process.once('SIGINT', () => controller.abort()); process.once('SIGTERM', () => controller.abort());
  Promise.resolve().then(() => runDailyNewspaper({ ...newspaperArguments(process.argv.slice(2)), signal: controller.signal }))
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
