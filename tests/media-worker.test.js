import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore, now } from '../server/store.js';
import { startWorker } from '../worker/index.js';

test('media worker honors durable cancellation before the polling timer aborts', async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mari-media-worker-test-'));
  const store = createStore(directory);
  const gate = Promise.withResolvers();
  let worker, workflowSignal, abortedBeforeReturn;
  t.after(async () => {
    gate.resolve();
    await worker?.stop({ stopServices: false });
    store.close();
    await rm(directory, { recursive: true, force: true });
  });

  store.put('jobs', { id: 'media-cancel-race', type: 'voice.synthesize', status: 'queued', payload: { agentProfile: { id: 'profile_fixture', name: 'Fixture reviewer', category: 'quality', portraitId: 'lass' } }, createdAt: now() });
  worker = await startWorker({
    store, dataDir: directory, pollMs: 10000,
    makeWorkflow: () => ({
      async run(job, signal) {
        workflowSignal = signal;
        await gate.promise;
        abortedBeforeReturn = signal.aborted;
      },
    }),
  });

  assert.equal(store.get('jobs', 'media-cancel-race').status, 'running');
  assert.equal(workflowSignal.aborted, false);
  store.update('jobs', 'media-cancel-race', { cancelRequested: true });
  gate.resolve();

  const deadline = Date.now() + 2000;
  while (store.get('jobs', 'media-cancel-race').status === 'running' && Date.now() < deadline) {
    await new Promise(setImmediate);
  }
  const job = store.get('jobs', 'media-cancel-race');
  assert.equal(abortedBeforeReturn, false, 'the workflow finishes before the cancellation polling timer');
  assert.equal(job.status, 'cancelled');
  assert.equal(job.cancelRequested, true);
  assert.equal(store.get('agents', job.agentId).status, 'cancelled');
  assert.equal(store.get('agents', job.agentId).portraitId, 'lass');
  assert.equal(store.get('agents', job.agentId).category, 'quality');
  assert.ok(store.events().some((event) => event.agentId === job.agentId && event.type === 'task.cancelled'));
});
