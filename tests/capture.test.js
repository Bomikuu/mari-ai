import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { firefox } from 'playwright';
import { createStore } from '../server/store.js';
import { capturePages, openBrowserLogin } from '../worker/capture.js';
import { VIEWPORTS } from '../shared/constants.js';

test('cancelling during login browser launch closes the owned context before navigation', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-login-cancel-'));
  const controller = new AbortController();
  let provideContext;
  let started;
  const launched = new Promise((resolve) => { started = resolve; });
  let closed = false;
  let launchOptions, launchProfile;
  const context = new EventEmitter();
  context.close = async () => { closed = true; context.emit('close'); };
  context.pages = () => { throw new Error('A cancelled login must not navigate.'); };
  const operation = openBrowserLogin({
    store: { event() {} }, dataDir, project: { id: 'demo' }, url: 'http://127.0.0.1:4173', signal: controller.signal,
    launchContext: (profile, options) => { launchProfile = profile; launchOptions = options; started(); return new Promise((resolve) => { provideContext = resolve; }); },
  });
  const rejected = assert.rejects(operation, /login cancelled/);
  await launched;
  controller.abort(); provideContext(context);
  await rejected;
  assert.equal(closed, true);
  assert.equal(launchProfile, path.join(dataDir, 'browser', 'firefox', 'demo'));
  assert.deepEqual(launchOptions, { headless: false, viewport: VIEWPORTS.desktop, acceptDownloads: false });
  await fs.rm(dataDir, { recursive: true, force: true });
});

test('capture uses its separate Firefox profile and closes a cancelled launch', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-capture-options-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  const controller = new AbortController();
  let closed = false;
  await assert.rejects(capturePages({
    store: { event() {} }, dataDir, project: { id: 'demo' }, task: { id: 'capture' },
    baseUrl: 'http://127.0.0.1:4173', signal: controller.signal,
    launchContext: async (profile, options) => {
      assert.equal(profile, path.join(dataDir, 'browser', 'firefox', 'demo'));
      assert.deepEqual(options, { headless: true, viewport: VIEWPORTS.desktop, acceptDownloads: false });
      controller.abort();
      return { close: async () => { closed = true; } };
    },
  }), /Capture cancelled/);
  assert.equal(closed, true);
});

test('a missing Firefox runtime gives an actionable error', async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-firefox-missing-'));
  t.after(() => fs.rm(dataDir, { recursive: true, force: true }));
  await assert.rejects(openBrowserLogin({
    store: { event() {} }, dataDir, project: { id: 'demo' }, url: 'http://127.0.0.1:4173',
    launchContext: async () => { throw new Error("browserType.launchPersistentContext: Executable doesn't exist at /missing/firefox"); },
  }), /pnpm exec playwright install firefox/);
});

test('Firefox captures a local page and closes a headless login on cancellation', { timeout: 30000 }, async (t) => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-firefox-live-'));
  const store = createStore(dataDir);
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<!doctype html><title>Browser check</title><h1>Local browser check</h1><script>document.title = navigator.userAgent.includes("Firefox/") ? "Firefox capture verified" : "Unexpected browser";</script>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); });
    store.close();
    await fs.rm(dataDir, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const project = { id: 'firefox-demo' };
  const result = await capturePages({ store, dataDir, project, task: { id: 'capture' }, baseUrl, viewports: ['desktop'] });
  assert.equal(result.completed, 1);
  assert.equal(result.failed, 0);
  assert.equal(result.captures[0].title, 'Firefox capture verified');
  assert.ok(result.artifacts.some((artifact) => artifact.kind === 'original' && artifact.width === VIEWPORTS.desktop.width));

  const controller = new AbortController();
  let loginClosed = false;
  await openBrowserLogin({
    store: { event(event) { if (event.type === 'browser.login.waiting') setImmediate(() => controller.abort()); } },
    dataDir, project, url: baseUrl, signal: controller.signal,
    launchContext: async (profile, options) => {
      assert.equal(profile, path.join(dataDir, 'browser', 'firefox', project.id));
      assert.equal(options.headless, false);
      assert.equal(Object.hasOwn(options, 'channel'), false);
      const context = await firefox.launchPersistentContext(profile, { ...options, headless: true });
      context.once('close', () => { loginClosed = true; });
      return context;
    },
  });
  assert.equal(controller.signal.aborted, true);
  assert.equal(loginClosed, true);
});
