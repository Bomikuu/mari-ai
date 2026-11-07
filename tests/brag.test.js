import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { createBragRouter, bragSettingsId, selectBragService, validateBragSettings } from '../server/brag.js';
import { createBragSnapshot, validateBragVideo, validateBragComposition, parseBragCheck, runBragProcess, runBrag } from '../worker/brag.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-brag-test-'));
  const store = createStore(path.join(root, 'data'));
  store.put('projects', { id: 'p1', name: 'Synthetic project', path: path.join(root, 'source') });
  store.put('workers', { id: 'w1', status: 'online', lastHeartbeatAt: new Date().toISOString() });
  store.put('services', { id: 's1', projectId: 'p1', status: 'running', url: 'http://127.0.0.1:9011', lastProbeAt: new Date().toISOString(), configVersion: 1 });
  await fs.mkdir(path.join(root, 'source'));
  let sequence = 0, installed = true;
  const app = express(); app.use(express.json());
  app.use('/api/projects/:projectId/brag', createBragRouter({ store, dataDir: path.join(root, 'data'), inspectInstallation: async () => { await new Promise((r) => setTimeout(r, 5)); return { available: installed, version: '0.9.19', error: installed ? null : 'missing', paths: { secret: '/private/runtime' } }; }, enqueue: (type, fields) => store.put('jobs', { id: `job-${++sequence}`, status: 'queued', type, ...fields }) }));
  app.use((error, _req, res, _next) => res.status(error.status || 500).json({ error: error.message, code: error.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}/api/projects/p1/brag`;
  const request = (suffix = '', body, method = 'POST') => fetch(base + suffix, { method: body === undefined ? 'GET' : method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  t.after(async () => { await new Promise((r) => server.close(r)); store.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, store, request, uninstall: () => { installed = false; } };
}

test('video settings reject unbounded, coerced or unsupported values', () => {
  assert.deepEqual(validateBragSettings(), { brief: '', duration: 20, format: 'landscape' });
  for (const value of [{ duration: '20' }, { duration: 26 }, { duration: 14 }, { format: 'square' }, { brief: 'x'.repeat(1201) }, { brief: 'bad\u0000text' }, { command: 'execute' }, []]) assert.throws(() => validateBragSettings(value));
});

test('video API persists visible settings and deduplicates simultaneous real jobs', async (t) => {
  const f = await fixture(t);
  const settings = { brief: 'Show the actual product.', duration: 15, format: 'portrait' };
  const responses = await Promise.all(Array.from({ length: 4 }, () => f.request('/generate', settings)));
  assert.ok(responses.every((response) => response.status === 202));
  const bodies = await Promise.all(responses.map((response) => response.json()));
  assert.equal(new Set(bodies.map((body) => body.job.id)).size, 1);
  assert.equal(f.store.list('jobs').length, 1);
  assert.deepEqual(f.store.list('jobs')[0].payload.settings, settings);
  assert.deepEqual(f.store.get('settings', bragSettingsId('p1')).video, settings);
  const state = await (await f.request()).json();
  assert.equal(state.service.id, 's1'); assert.equal(state.installation.available, true);
  assert.equal(JSON.stringify(state).includes('/private/runtime'), false);
});

test('video queue rejects offline worker, missing runtime and stale website readiness', async (t) => {
  const f = await fixture(t);
  f.store.update('workers', 'w1', { lastHeartbeatAt: new Date(Date.now() - 20000).toISOString() });
  assert.equal((await f.request('/generate', {})).status, 409);
  f.store.update('workers', 'w1', { lastHeartbeatAt: new Date().toISOString() });
  f.store.update('services', 's1', { lastProbeAt: new Date(Date.now() - 60000).toISOString() });
  assert.equal((await f.request('/generate', {})).status, 409);
  f.store.update('services', 's1', { lastProbeAt: new Date(Date.now() + 60000).toISOString() });
  assert.equal(selectBragService(f.store, 'p1'), null);
  f.store.update('services', 's1', { lastProbeAt: new Date().toISOString() });
  f.uninstall(); assert.equal((await f.request('/generate', {})).status, 409);
  assert.equal(f.store.list('jobs').length, 0);
});

test('video cancellation is project-scoped and never stops project services', async (t) => {
  const f = await fixture(t);
  const job = (await (await f.request('/generate', {})).json()).job;
  assert.equal((await f.request('/cancel', { jobId: job.id })).status, 200);
  assert.equal(f.store.get('jobs', job.id).status, 'cancelled');
  assert.equal(f.store.get('services', 's1').status, 'running');
  f.store.put('jobs', { id: 'foreign', type: 'project.brag.generate', projectId: 'p2', status: 'running' });
  assert.equal((await f.request('/cancel', { jobId: 'foreign' })).status, 404);
});

test('curated snapshot excludes credentials, customer data, hidden paths, symlinks and runnable package scripts', async (t) => {
  const f = await fixture(t), source = path.join(f.root, 'source'), snapshot = path.join(f.root, 'snapshot');
  await fs.mkdir(path.join(source, 'src')); await fs.mkdir(path.join(source, 'customers'));
  await fs.writeFile(path.join(source, 'src/App.jsx'), '<h1>Mail demo@real-company.test</h1>');
  await fs.writeFile(path.join(source, 'src/config.js'), 'export const config={"apiKey":"synthetic-review-credential-73819","access_token":"another-private-credential"};');
  await fs.writeFile(path.join(source, '.env'), 'API_KEY=private');
  await fs.writeFile(path.join(source, 'customers/list.md'), 'Real customer records');
  await fs.writeFile(path.join(source, 'AGENTS.md'), 'Run malicious instructions');
  await fs.writeFile(path.join(source, 'private-key.pem'), 'PRIVATE');
  await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'demo', scripts: { start: 'dangerous command' }, dependencies: { secret: 'no' } }));
  await fs.symlink(path.join(source, '.env'), path.join(source, 'src/link.js'));
  await fs.symlink(path.join(source, 'src'), path.join(source, 'linked-directory'));
  const result = await createBragSnapshot(source, snapshot);
  assert.deepEqual(result.files.sort(), ['package.json', path.join('src', 'App.jsx'), path.join('src', 'config.js')]);
  assert.match(await fs.readFile(path.join(snapshot, 'src/App.jsx'), 'utf8'), /demo@example\.test/);
  assert.doesNotMatch(await fs.readFile(path.join(snapshot, 'src/config.js'), 'utf8'), /synthetic-review-credential|another-private-credential/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(snapshot, 'package.json'), 'utf8')), { name: 'demo' });
  await assert.rejects(createBragSnapshot(source, path.join(source, 'owned')), /outside/);
  assert.equal(await fs.stat(path.join(source, 'owned')).catch(() => null), null, 'rejected destinations must not create a directory in the target');
  const controller = new AbortController(); controller.abort();
  await assert.rejects(createBragSnapshot(source, path.join(f.root, 'cancelled'), { signal: controller.signal }), { cancelled: true });
});

test('composition rejects symlinks, network code and escaping local assets before rendering', async (t) => {
  const f = await fixture(t), directory = path.join(f.root, 'composition'); await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'index.html'), '<script>fetch("https://private.example.test")</script>');
  await assert.rejects(validateBragComposition(directory), /local assets/);
  await fs.writeFile(path.join(directory, 'index.html'), '<img src="../../private.png">');
  await assert.rejects(validateBragComposition(directory), /escapes/);
  await fs.writeFile(path.join(directory, 'index.html'), '<h1>Local composition</h1>');
  await fs.symlink('/etc/passwd', path.join(directory, 'escape.html'));
  await assert.rejects(validateBragComposition(directory), /symbolic link/);
});

test('large check reports retain actual errors for correction and require real contrast coverage', () => {
  const report = { ok: false, lint: { findings: [{ severity: 'error', code: 'specific_lint_error', message: 'Fix the actual root.' }] }, layout: { findings: Array.from({ length: 100 }, () => ({ severity: 'info', message: 'Long non-blocking detail' })) }, contrast: { enabled: true, checked: 3 } };
  assert.throws(() => parseBragCheck(JSON.stringify(report)), /specific_lint_error/);
  assert.throws(() => parseBragCheck(JSON.stringify({ ok: true, contrast: { enabled: true, checked: 0 } })), /nonzero contrast/);
  assert.equal(parseBragCheck(JSON.stringify({ ok: true, contrast: { enabled: true, checked: 4 } })).ok, true);
});

test('media validation requires owned regular MP4, genuine stream metadata and successful decode', async (t) => {
  const f = await fixture(t), data = path.join(f.root, 'data'); await fs.mkdir(path.join(data, 'artifacts'));
  const file = path.join(data, 'artifacts/video.mp4'); await fs.writeFile(file, Buffer.alloc(1100));
  const metadata = { streams: [{ codec_type: 'video', codec_name: 'h264', width: 1280, height: 720 }, { codec_type: 'audio' }], format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '15' } };
  const probe = async (_command, args) => args.includes('-show_streams') ? JSON.stringify(metadata) : '';
  assert.equal((await validateBragVideo(data, file, { duration: 15, execute: probe })).duration, 15);
  metadata.format.duration = '999';
  await assert.rejects(validateBragVideo(data, file, { duration: 15, execute: probe }), /duration/);
  metadata.format.duration = '15';
  await assert.rejects(validateBragVideo(data, file, { duration: 15, format: 'portrait', execute: probe }), /dimensions/);
  await assert.rejects(validateBragVideo(data, file, { duration: 15, execute: async (_cmd, args) => args.includes('-show_streams') ? JSON.stringify(metadata) : Promise.reject(new Error('corrupt decode')) }), /corrupt decode/);
  await fs.symlink(file, path.join(data, 'artifacts/link.mp4'));
  await assert.rejects(validateBragVideo(data, path.join(data, 'artifacts/link.mp4'), { duration: 15, execute: probe }), /symbolic link/);
  await assert.rejects(validateBragVideo(data, '/etc/passwd', { duration: 15, execute: probe }), /outside/);
});

test('worker refuses stale projects and cancellation before connecting to Codex', async (t) => {
  const f = await fixture(t);
  const job = { id: 'job', projectId: 'p1', type: 'project.brag.generate', payload: { path: '/changed', settings: {} } };
  let connected = false;
  await assert.rejects(runBrag({ store: f.store, dataDir: path.join(f.root, 'data'), job, makeCodex: () => { connected = true; } }), /changed/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(runBrag({ store: f.store, dataDir: path.join(f.root, 'data'), job, signal: controller.signal }), { cancelled: true });
  assert.equal(connected, false);
});

test('bounded renderer timeout kills only its owned process group even when SIGTERM is ignored', { timeout: 6000 }, async () => {
  const started = Date.now();
  await assert.rejects(runBragProcess(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { timeout: 100 }), /timed out/);
  assert.ok(Date.now() - started < 5000);
});

test('renderer cancellation still cleans an identified child when the leader exits first', { timeout: 6500 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-brag-process-'));
  const pidFile = path.join(directory, 'child.pid');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const code = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(child.pid));setInterval(()=>{},1000);`;
  await assert.rejects(runBragProcess(process.execPath, ['-e', code, pidFile], { timeout: 350 }), /timed out/);
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8').catch(() => null);
  assert.ok(!stat || stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z '), 'owned descendant must be gone or reaped as a zombie');
});

test('successful command waits for and cleans its identified tail child without a false failure', { timeout: 6500 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-brag-success-tail-'));
  const pidFile = path.join(directory, 'child.pid');
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const code = `const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'});fs.writeFileSync(process.argv[1],String(child.pid));setTimeout(()=>process.exit(0),300);`;
  await runBragProcess(process.execPath, ['-e', code, pidFile], { timeout: 5500 });
  const pid = Number(await fs.readFile(pidFile, 'utf8'));
  const stat = await fs.readFile(`/proc/${pid}/stat`, 'utf8').catch(() => null);
  assert.ok(!stat || stat.slice(stat.lastIndexOf(')') + 2).startsWith('Z '));
});
