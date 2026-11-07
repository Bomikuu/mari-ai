import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore, now } from '../server/store.js';
import { createApp } from '../server/index.js';
import { startWorker } from '../worker/index.js';

async function fixture(t) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-personal-api-'));
  const store = createStore(dataDir);
  const app = createApp({ store, dataDir, accessKey: 'personal-api-test-key' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    store.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  const paired = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: 'personal-api-test-key' }) });
  const cookie = paired.headers.get('set-cookie').split(';')[0];
  const { csrfToken } = await paired.json();
  const request = async (route, { method = 'GET', body, auth = true, csrf = true } = {}) => {
    const response = await fetch(base + route, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}), ...(csrf ? { 'x-mari-csrf': csrfToken } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  return { store, dataDir, request };
}

test('personal integrations inherit the owner session and CSRF gate', async (t) => {
  const f = await fixture(t);
  for (const route of ['/api/personal/google', '/api/personal/pixelpop/connection']) {
    assert.equal((await f.request(route, { auth: false })).status, 401);
    assert.equal((await f.request(route)).status, 200);
  }
  assert.equal((await f.request('/api/personal/google/inspect', { method: 'POST', body: {}, csrf: false })).status, 403);
  assert.equal((await f.request('/api/personal/pixelpop/connect', { method: 'POST', body: { baseUrl: 'http://localhost:8000', username: 'test', password: 'do-not-forward' }, csrf: false })).status, 403);
  assert.equal(f.store.list('jobs').length, 0);
});

test('a personal job executes without a project task and remains inspectable', async (t) => {
  const f = await fixture(t);
  f.store.put('jobs', { id: 'personal-inspect', type: 'personal.google.inspect', status: 'queued', payload: {}, createdAt: now() });
  let called = false;
  const worker = await startWorker({ store: f.store, dataDir: f.dataDir, pollMs: 10000, makeWorkflow: () => ({ async run(job) { assert.equal(job.taskId, undefined); called = true; } }) });
  try {
    for (let attempt = 0; attempt < 20 && f.store.get('jobs', 'personal-inspect').status !== 'completed'; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(called, true);
    const job = f.store.get('jobs', 'personal-inspect');
    assert.equal(job.status, 'completed');
    assert.equal(f.store.get('agents', job.agentId).name, 'Google reader');
    assert.equal(f.store.get('agents', job.agentId).status, 'completed');
    assert.match(f.store.get('agents', job.agentId).instruction, /Do not send messages/);
  } finally { await worker.stop({ stopServices: false }); }
});

test('Google refresh is a worker job and cancellation leaves project service jobs alone', async (t) => {
  const f = await fixture(t);
  f.store.put('workers', { id: 'personal-worker', status: 'online', lastHeartbeatAt: now() });
  f.store.put('jobs', { id: 'service-job', type: 'service.start', status: 'running', serviceId: 'service-1', createdAt: now() });
  const queued = await f.request('/api/personal/google/refresh', { method: 'POST', body: {} });
  assert.equal(queued.status, 202);
  const jobs = f.store.list('jobs').filter((job) => job.type.startsWith('personal.google.'));
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].status, 'queued');
  await f.request('/api/personal/google/refresh', { method: 'POST', body: {} });
  assert.equal(f.store.list('jobs').filter((job) => job.type.startsWith('personal.google.')).length, 1);
  assert.equal((await f.request('/api/personal/google/cancel', { method: 'POST', body: {} })).status, 200);
  assert.equal(f.store.get('jobs', jobs[0].id).cancelRequested, true);
  assert.equal(f.store.get('jobs', 'service-job').cancelRequested, undefined);
  assert.equal(f.store.get('jobs', 'service-job').status, 'running');
});
