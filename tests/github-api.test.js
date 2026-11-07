import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStore, now } from '../server/store.js';
import { createApp } from '../server/index.js';
import { startWorker } from '../worker/index.js';

const exec = promisify(execFile);

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-github-api-'));
  const dataDir = path.join(directory, 'data'), projectDir = path.join(directory, 'project');
  await fs.mkdir(projectDir);
  await exec('git', ['init', '--quiet', '--initial-branch=main'], { cwd: projectDir });
  await exec('git', ['config', 'remote.origin.url', 'https://fixture-token@github.com/fixture-owner/sample.git'], { cwd: projectDir });
  const store = createStore(dataDir);
  store.put('projects', { id: 'github-project', path: projectDir, name: 'Synthetic repository fixture' });
  const app = createApp({ store, dataDir, accessKey: 'github-api-test-key' });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const paired = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accessKey: 'github-api-test-key' }) });
  const cookie = paired.headers.get('set-cookie').split(';')[0], { csrfToken } = await paired.json();
  const request = async (route = '', { method = 'GET', body, auth = true, csrf = true } = {}) => {
    const response = await fetch(`${base}/api/projects/github-project/github${route}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie } : {}), ...(csrf ? { 'x-mari-csrf': csrfToken } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, data: await response.json() };
  };
  return { store, dataDir, projectDir, request };
}

test('GitHub routes enforce owner/CSRF and strip credentials from detected remotes', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('', { auth: false })).status, 401);
  assert.equal((await f.request('/repository', { method: 'PUT', body: { repository: 'github/github-mcp-server' }, csrf: false })).status, 403);
  const state = await f.request();
  assert.equal(state.status, 200);
  assert.equal(state.data.repository.fullName, 'fixture-owner/sample');
  assert.doesNotMatch(JSON.stringify(state.data), /fixture-token/);
  assert.equal((await f.request('/repository', { method: 'PUT', body: { repository: 'https://fixture-token@github.com/other/example' } })).status, 400);
  const linked = await f.request('/repository', { method: 'PUT', body: { repository: 'other/example' } });
  assert.equal(linked.status, 200);
  assert.equal(linked.data.repository.fullName, 'other/example');
  assert.equal(linked.data.repository.source, 'manual');
  const restored = await f.request('/repository', { method: 'DELETE' });
  assert.equal(restored.data.repository.fullName, 'fixture-owner/sample');
  const remote = (await exec('git', ['config', '--get', 'remote.origin.url'], { cwd: f.projectDir })).stdout.trim();
  assert.equal(remote, 'https://fixture-token@github.com/fixture-owner/sample.git');
  assert.doesNotMatch(JSON.stringify(f.store.events({})), /fixture-token/);
});

test('GitHub jobs are project scoped and cancellation leaves other jobs and services alone', async (t) => {
  const f = await fixture(t);
  f.store.put('workers', { id: 'github-worker', status: 'online', lastHeartbeatAt: now() });
  f.store.put('jobs', { id: 'other-github', projectId: 'another-project', type: 'project.github.refresh', status: 'running' });
  f.store.put('jobs', { id: 'service-job', projectId: 'github-project', type: 'service.start', status: 'running' });
  const response = await f.request('/refresh', { method: 'POST', body: {} });
  assert.equal(response.status, 202);
  const job = f.store.list('jobs').find((item) => item.projectId === 'github-project' && item.type === 'project.github.refresh');
  assert.ok(job);
  assert.equal(job.taskId, undefined);
  assert.equal(job.payload.repository.fullName, 'fixture-owner/sample');
  await f.request('/refresh', { method: 'POST', body: {} });
  assert.equal(f.store.list('jobs').filter((item) => item.projectId === 'github-project' && item.type === 'project.github.refresh').length, 1);
  const wrongProject = await f.request('/cancel', { method: 'POST', body: { jobId: 'other-github' } });
  assert.equal(wrongProject.status, 404);
  assert.equal((await f.request('/cancel', { method: 'POST', body: {} })).status, 200);
  assert.equal(f.store.get('jobs', job.id).cancelRequested, true);
  assert.equal(f.store.get('jobs', 'other-github').cancelRequested, undefined);
  assert.equal(f.store.get('jobs', 'service-job').cancelRequested, undefined);
});

test('a GitHub worker job needs no screenshot task and records its real project scope', async (t) => {
  const f = await fixture(t);
  f.store.put('jobs', { id: 'github-inspect', projectId: 'github-project', type: 'project.github.inspect', status: 'queued', payload: {}, createdAt: now() });
  const worker = await startWorker({ store: f.store, dataDir: f.dataDir, pollMs: 10000, makeWorkflow: () => ({ async run(job) { assert.equal(job.projectId, 'github-project'); assert.equal(job.taskId, undefined); } }) });
  try {
    for (let attempt = 0; attempt < 20 && f.store.get('jobs', 'github-inspect').status !== 'completed'; attempt++) await new Promise((resolve) => setTimeout(resolve, 10));
    const job = f.store.get('jobs', 'github-inspect');
    assert.equal(job.status, 'completed');
    const agent = f.store.get('agents', job.agentId);
    assert.equal(agent.name, 'GitHub reader');
    assert.equal(agent.scope.projectId, 'github-project');
    assert.match(agent.instruction, /Do not change GitHub/);
  } finally { await worker.stop({ stopServices: false }); }
});
