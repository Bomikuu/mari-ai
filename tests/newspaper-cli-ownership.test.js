import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { newspaperDate } from '../server/newspaper.js';
import { runDailyNewspaper } from '../scripts/newspaper.js';
import { startWorker } from '../worker/index.js';

async function publishSyntheticEdition(store, directory, job) {
  // The PDF bytes are immaterial to these queue-ownership regressions.
  const artifactRoot = path.join(directory, 'artifacts');
  await fs.mkdir(artifactRoot, { recursive: true });
  const filename = path.join(artifactRoot, 'synthetic-ownership.pdf');
  await fs.writeFile(filename, 'Synthetic queue ownership fixture', { flag: 'wx', mode: 0o600 });
  store.put('artifacts', { id: 'ownership-artifact', path: filename });
  store.put('settings', { id: 'newspaper:edition:ownership-edition', edition: {
    id: 'ownership-edition', date: newspaperDate(), generatedAt: new Date().toISOString(),
    jobId: job.id, status: 'ready', stories: [], pdfArtifact: { id: 'ownership-artifact' },
  } });
  store.update('jobs', job.id, { editionId: 'ownership-edition' });
}

test('the CLI temporary worker leaves unrelated workflows and service jobs untouched', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-paper-cli-ownership-'));
  const store = createStore(directory);
  t.after(async () => { store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  store.put('jobs', { id: 'unrelated-before', type: 'synthetic.unrelated', status: 'queued', payload: {} });
  store.put('jobs', { id: 'cancelled-elsewhere', type: 'synthetic.unrelated', status: 'queued', cancelRequested: true, payload: {} });
  store.put('jobs', { id: 'service-before', type: 'service.start', serviceId: 'nonexistent-synthetic-service', status: 'queued', payload: {} });
  const unrelatedRuns = [], stopOptions = [];
  let workerOptions;

  const result = await runDailyNewspaper({
    dataDir: directory, store, pollMs: 100, waitMs: 3000,
    makeWorker: async (options) => {
      workerOptions = options;
      const worker = await startWorker({ ...options, pollMs: 5, makeWorkflow: () => ({
        async run(job, signal) {
          if (job.type !== 'personal.newspaper.generate') {
            unrelatedRuns.push(job.id);
            await new Promise((resolve) => {
              if (signal.aborted) resolve();
              else signal.addEventListener('abort', resolve, { once: true });
            });
            return;
          }
          await publishSyntheticEdition(store, directory, job);
          // This used to be claimed during the CLI's next polling delay and
          // then cancelled when the CLI stopped its temporary worker.
          store.put('jobs', { id: 'unrelated-after', type: 'synthetic.unrelated', status: 'queued', payload: {} });
        },
      }) });
      return { ...worker, async stop(options) { stopOptions.push(options); await worker.stop(options); } };
    },
  });

  assert.equal(result.editionId, 'ownership-edition');
  assert.deepEqual(workerOptions.jobTypes, ['personal.newspaper.generate']);
  assert.deepEqual(unrelatedRuns, []);
  for (const id of ['unrelated-before', 'cancelled-elsewhere', 'service-before', 'unrelated-after']) {
    const job = store.get('jobs', id);
    assert.equal(job.status, 'queued', `${id} was modified by the temporary newspaper worker`);
    assert.equal(job.workerId, undefined);
    assert.equal(job.agentId, undefined);
  }
  assert.deepEqual(stopOptions, [{ stopServices: false }]);
  assert.equal(store.get('settings', 'worker-lease'), null);
  assert.ok(store.list('workers').every((worker) => worker.status === 'offline'));
});

test('a deduplicated queued newspaper gets a temporary worker when none is online', async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-paper-cli-resume-'));
  const store = createStore(directory);
  t.after(async () => { store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  store.put('jobs', { id: 'already-queued', type: 'personal.newspaper.generate', status: 'queued',
    cancelRequested: false, payload: { date: newspaperDate(), force: false } });
  let starts = 0;
  const runs = [], stopOptions = [];
  const result = await runDailyNewspaper({
    dataDir: directory, store, pollMs: 10, waitMs: 3000,
    makeWorker: async (options) => {
      starts++;
      const worker = await startWorker({ ...options, pollMs: 5, makeWorkflow: () => ({
        async run(job) { runs.push(job.id); await publishSyntheticEdition(store, directory, job); },
      }) });
      return { ...worker, async stop(options) { stopOptions.push(options); await worker.stop(options); } };
    },
  });
  assert.equal(starts, 1);
  assert.deepEqual(runs, ['already-queued']);
  assert.equal(store.list('jobs').length, 1);
  assert.equal(store.get('jobs', 'already-queued').status, 'completed');
  assert.equal(result.reused, true);
  assert.equal(result.editionId, 'ownership-edition');
  assert.deepEqual(stopOptions, [{ stopServices: false }]);
});
