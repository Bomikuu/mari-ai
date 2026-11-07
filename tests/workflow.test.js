import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createStore } from '../server/store.js';
import { assertApprovedArtifact, createWorkflow } from '../worker/workflow.js';
import { normalizeRoutes } from '../worker/capture.js';
import { startWorker } from '../worker/index.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mari-workflow-'));
  const store = createStore(directory);
  await mkdir(path.join(directory, 'artifacts', 'task'), { recursive: true });
  const imagePath = path.join(directory, 'artifacts', 'task', 'approved.png');
  // This fixture tests approval immutability, not image decoding or live user approval.
  const bytes = Buffer.from('explicit-test-image-fixture');
  await writeFile(imagePath, bytes);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const task = store.put('tasks', { id: 'task', projectId: 'project', instruction: 'Test-only approval fixture', approvedArtifactId: 'proposal', status: 'awaiting_approval', steps: [] });
  const artifact = store.put('artifacts', { id: 'proposal', taskId: 'task', projectId: 'project', kind: 'proposal', page: '/', viewport: 'desktop', revision: 1, sha256, path: imagePath, createdAt: '2026-11-06T01:00:00Z' });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, store, task, artifact };
}

function approve(store, artifact, patch = {}) {
  return store.put('approvals', { id: 'approval', taskId: artifact.taskId, artifactId: artifact.id, actor: 'user', decision: 'approved', sha256: artifact.sha256, page: artifact.page, viewport: artifact.viewport, revision: artifact.revision, createdAt: '2026-11-06T01:01:00Z', ...patch });
}

test('approval requires a real user record matching the exact page, viewport, revision and hash', async (t) => {
  const { store, directory, task, artifact } = await fixture(t);
  await assert.rejects(assertApprovedArtifact(store, directory, task), /approval/);
  approve(store, artifact, { actor: 'agent' });
  await assert.rejects(assertApprovedArtifact(store, directory, task), /approval/);
  approve(store, artifact, { viewport: 'mobile' });
  await assert.rejects(assertApprovedArtifact(store, directory, task), /approval/);
  approve(store, artifact);
  assert.equal((await assertApprovedArtifact(store, directory, task)).id, artifact.id);
});

test('new proposal revisions and changed files cannot inherit an older approval', async (t) => {
  const { store, directory, task, artifact } = await fixture(t);
  approve(store, artifact);
  store.put('artifacts', { ...artifact, id: 'new-revision', revision: 2, createdAt: '2026-11-06T01:02:00Z' });
  await assert.rejects(assertApprovedArtifact(store, directory, task), /newer image revision/);
  store.remove('artifacts', 'new-revision');
  await writeFile(artifact.path, 'changed-test-image');
  await assert.rejects(assertApprovedArtifact(store, directory, task), /changed on disk/);
});

test('same-timestamp rejection supersedes earlier approval', async (t) => {
  const { store, directory, task, artifact } = await fixture(t);
  approve(store, artifact);
  approve(store, artifact, { id: 'rejection', decision: 'rejected' });
  await assert.rejects(assertApprovedArtifact(store, directory, task), /approval/);
});

test('route inventory is bounded, deduplicated and same-origin', () => {
  assert.deepEqual(normalizeRoutes('http://127.0.0.1:4173', ['/', '/?a=1', '/tasks#open', '/tasks?page=2']), ['/', '/tasks']);
  assert.throws(() => normalizeRoutes('http://127.0.0.1:4173', ['http://evil.example/']), /origin/);
  assert.throws(() => normalizeRoutes('http://127.0.0.1:4173', Array.from({ length: 21 }, (_, index) => `/${index}`)), /20/);
});

test('manual handoff waits for an actual imported image without inventing an agent result', async (t) => {
  const { store, directory, task } = await fixture(t);
  store.put('projects', { id: 'project', path: directory, name: 'Test project', designBrief: 'Preserve content.' });
  store.put('artifacts', { id: 'original', taskId: task.id, projectId: 'project', kind: 'original', page: '/', viewport: 'desktop', path: '/test-only-original.png' });
  const workflow = createWorkflow({ store, dataDir: directory, workerId: 'fixture' });
  await workflow.run({ id: 'job', taskId: task.id, projectId: 'project', type: 'design', payload: { mode: 'handoff' } }, new AbortController().signal);
  const current = store.get('tasks', task.id);
  assert.equal(current.status, 'awaiting_input');
  assert.equal(current.handoffReady, true);
  assert.equal(store.list('agents').length, 0);
  assert.equal(store.list('artifacts').filter((artifact) => artifact.kind === 'proposal').length, 1, 'Only the explicit test fixture proposal exists; no image was synthesized by handoff.');
});

test('single worker lease prevents duplicate job execution; queued task cancellation leaves service records alone', async (t) => {
  const { store, directory, task } = await fixture(t);
  store.put('services', { id: 'unrelated', projectId: 'project', status: 'running', ownership: 'external', url: 'http://127.0.0.1:49999' });
  store.put('jobs', { id: 'cancel-job', taskId: task.id, projectId: 'project', type: 'capture', payload: {}, status: 'queued', cancelRequested: true });
  const worker = await startWorker({ dataDir: directory, store, pollMs: 10000 });
  try {
    assert.equal(store.get('jobs', 'cancel-job').status, 'cancelled');
    assert.equal(store.get('services', 'unrelated').status, 'running');
    await assert.rejects(startWorker({ dataDir: directory, store, pollMs: 10000 }), /already owns/);
  } finally { await worker.stop({ stopServices: false }); }
});
