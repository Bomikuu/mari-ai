import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPixelpopRouter } from '../server/pixelpop.js';

const origin = 'http://127.0.0.1:8000';
const api = '/api/v1/finance/';
const sessionSecret = 'upstream-session-private-123';
const initialCsrf = 'upstream-initial-csrf';
const rotatedCsrf = 'upstream-rotated-csrf';
const password = 'password-never-persist-this';
const task = { id: 1, kind: 'task', title: 'Plan the day', status: 'pending', important: true, priority: 'medium', due_date: null, due_time: null, notes: '', schedule: null, system_key: null };
const food = { name: 'Rice', amount: '1.000', unit: 'cup', calories: '200.00', protein: '4.00', carbs: '45.00', fat: '1.00' };

function response(data, status = 200, cookies = []) {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(status === 204 ? null : JSON.stringify(data), { status, headers });
}

async function fixture(t, handler = () => response({})) {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-pixelpop-'));
  const calls = [], events = [], settings = [], registeredSecrets = [];
  const store = { dataDir, addSecrets(values) { registeredSecrets.push(...values); }, event(value) { events.push(value); }, put(...values) { settings.push(values); } };
  const fetchImpl = async (url, options) => {
    const request = { url: new URL(url), method: options.method, headers: options.headers, body: options.body === undefined ? undefined : JSON.parse(options.body), options };
    calls.push(request);
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    if (request.url.pathname === `${api}session/login/` && options.method === 'GET') return response({ csrfToken: initialCsrf }, 200, [`csrftoken=${initialCsrf}; Path=/; SameSite=Lax`]);
    if (request.url.pathname === `${api}session/login/` && options.method === 'POST') {
      assert.equal(options.headers.Cookie, `csrftoken=${initialCsrf}`);
      assert.equal(options.headers['X-CSRFToken'], initialCsrf);
      assert.equal(options.headers.Origin, origin);
      assert.equal(options.headers.Referer, `${origin}/`);
      assert.deepEqual(request.body, { username: 'mico', password });
      return response({ csrfToken: rotatedCsrf, detail: 'Signed in.' }, 200, [`csrftoken=${rotatedCsrf}; Path=/`, `sessionid=${sessionSecret}; HttpOnly; Path=/; Max-Age=3600`]);
    }
    if (request.url.pathname === `${api}session/`) {
      assert.equal(options.headers.Cookie, `csrftoken=${rotatedCsrf}; sessionid=${sessionSecret}`);
      return response({ user: { id: 1, name: 'Mico', email: 'mico@example.com', can_backup: true }, csrfToken: rotatedCsrf });
    }
    return handler(request);
  };
  const app = express();
  app.use(express.json());
  app.use('/api/personal/pixelpop', (req, res, next) => {
    if (req.headers['x-owner'] !== 'owner') return res.status(401).json({ code: 'PAIRING_REQUIRED' });
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-mari-csrf'] !== 'mari-csrf') return res.status(403).json({ code: 'CSRF_REQUIRED' });
    next();
  }, createPixelpopRouter({ store, dataDir, fetchImpl }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => { await new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }); await fs.rm(dataDir, { recursive: true, force: true }); });
  const request = async (resource, { method = 'GET', body, headers = {}, auth = true } = {}) => {
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/personal/pixelpop${resource}`, { method, headers: { ...(auth ? { 'X-Owner': 'owner', 'X-Mari-CSRF': 'mari-csrf' } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const json = result.status === 204 ? null : await result.json();
    return { status: result.status, json, headers: result.headers };
  };
  const connect = () => request('/connect', { method: 'POST', body: { baseUrl: origin, username: 'mico', password }, headers: { Cookie: 'mari_owner=should-not-go-upstream', 'X-CSRFToken': 'foreign-browser-csrf' } });
  return { dataDir, calls, events, settings, registeredSecrets, request, connect };
}

test('connect keeps owner auth separate, rotates upstream CSRF, and saves only a private session', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.request('/connection', { auth: false })).status, 401);
  assert.equal((await f.request('/connect', { method: 'POST', body: {}, headers: { 'X-Mari-CSRF': 'bad' } })).status, 403);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.request('/connection')).json.status, 'disconnected');
  const connected = await f.connect();
  assert.equal(connected.status, 200);
  assert.deepEqual(connected.json.user, { name: 'Mico', email: 'mico@example.com' });
  assert.equal(connected.json.connected, true);
  assert.equal(connected.json.workspaceScope, 'shared');
  assert.equal(connected.headers.get('set-cookie'), null);
  assert.equal(connected.headers.get('cache-control'), 'private, no-store');
  const publicText = JSON.stringify(connected.json);
  for (const secret of [sessionSecret, rotatedCsrf, initialCsrf, password, 'can_backup']) assert.ok(!publicText.includes(secret));
  assert.equal(f.calls[0].headers.Cookie, undefined);
  const filename = path.join(f.dataDir, 'pixelpop-session.json');
  const privateText = await fs.readFile(filename, 'utf8');
  assert.ok(privateText.includes(sessionSecret));
  assert.ok(!privateText.includes(password));
  assert.equal((await fs.stat(filename)).mode & 0o777, 0o600);
  assert.equal((await fs.stat(f.dataDir)).mode & 0o777, 0o700);
  assert.deepEqual(f.settings, []);
  assert.deepEqual(f.events, []);
  assert.equal((await f.request('/connection')).json.status, 'connected');
});

test('unsafe Pixelpop origins and unexpected credential fields never reach fetch', async (t) => {
  const f = await fixture(t);
  for (const baseUrl of ['http://example.com', 'file:///tmp/db', 'https://user:password@example.com', 'https://example.com/?secret=1', 'https://example.com/#fragment', 'https://example.com/other-api', 'http://localhost.evil.test', 'https://169.254.169.254', 'https://example.com\\@evil.test']) {
    const result = await f.request('/connect', { method: 'POST', body: { baseUrl, username: 'mico', password } });
    assert.equal(result.status, 400, baseUrl);
  }
  assert.equal((await f.request('/connect', { method: 'POST', body: { baseUrl: origin, username: 'mico', password, token: 'arbitrary' } })).status, 400);
  assert.equal(f.calls.length, 0);
});

test('task CRUD is bounded to actual tasks and returns normalized pagination without URLs', async (t) => {
  let current = { ...task };
  const f = await fixture(t, ({ url, method, body, headers }) => {
    if (method !== 'GET') {
      assert.equal(headers['X-CSRFToken'], rotatedCsrf);
      assert.equal(headers.Origin, origin);
      assert.ok(!headers.Cookie.includes('mari_owner'));
    }
    if (url.pathname === `${api}deadlines/` && method === 'GET') {
      assert.equal(url.searchParams.get('kind'), 'task');
      assert.equal(url.searchParams.get('compact'), '1');
      return response({ count: 21, next: 'https://upstream.example/private?page=2', previous: null, results: [current, { id: 2, kind: 'bill', amount: '999.00', title: 'Private bill' }] });
    }
    if (url.pathname === `${api}deadlines/2/`) return response({ id: 2, kind: 'bill', status: 'pending', title: 'Private bill' });
    if (url.pathname === `${api}deadlines/` && method === 'POST') { assert.equal(body.kind, 'task'); current = { ...task, ...body }; return response(current, 201); }
    if (url.pathname === `${api}deadlines/1/settle/`) { assert.deepEqual(body, {}); current.status = 'completed'; return response(current); }
    if (url.pathname === `${api}deadlines/1/` && method === 'PATCH') { current = { ...current, ...body }; return response(current); }
    if (url.pathname === `${api}deadlines/1/` && method === 'DELETE') return response(null, 204);
    if (url.pathname === `${api}deadlines/1/`) return response(current);
    throw new Error(`Unexpected ${method} ${url.pathname}`);
  });
  await f.connect();
  const listed = await f.request('/tasks?status=pending&q=Plan&page=1');
  assert.deepEqual(listed.json.results, [task]);
  assert.equal(listed.json.hasNext, true);
  assert.equal(listed.json.nextPage, 2);
  assert.ok(!JSON.stringify(listed.json).includes('upstream.example'));
  assert.equal((await f.request('/tasks?kind=bill')).status, 400);
  assert.equal((await f.request('/tasks', { method: 'POST', body: { title: 'Task', kind: 'bill' } })).status, 400);
  assert.equal((await f.request('/tasks/1', { method: 'PATCH', body: { status: 'completed' } })).status, 400);
  const before = f.calls.length;
  for (const [suffix, method, body] of [['', 'PATCH', { title: 'Changed bill' }], ['/complete', 'POST', {}], ['', 'DELETE', undefined]]) {
    assert.equal((await f.request(`/tasks/2${suffix}`, { method, body })).json.code, 'PIXELPOP_TASK_REQUIRED');
  }
  assert.equal(f.calls.slice(before).filter((call) => call.method !== 'GET').length, 0);
  assert.equal((await f.request('/tasks', { method: 'POST', body: { title: 'New task', due_date: null } })).status, 201);
  assert.equal((await f.request('/tasks/1', { method: 'PATCH', body: { notes: 'From Mari' } })).json.notes, 'From Mari');
  assert.equal((await f.request('/tasks/1/complete', { method: 'POST', body: {} })).json.status, 'completed');
  assert.equal((await f.request('/tasks/1', { method: 'DELETE' })).status, 409);
  current.status = 'pending';
  assert.equal((await f.request('/tasks/1', { method: 'DELETE' })).status, 204);
});

test('nutrition uses native date, goal, meal replacement, and weight contracts', async (t) => {
  const date = '2024-01-02';
  const writes = [];
  const f = await fixture(t, ({ url, method, body }) => {
    if (method !== 'GET') writes.push({ path: url.pathname, method, body });
    if (url.pathname === `${api}nutrition/profile/`) return response({ daily_target_kcal: body?.daily_target_kcal || '2000.00' });
    if (url.pathname === `${api}nutrition/summary/`) { assert.equal(url.searchParams.get('date'), date); return response({ date, day_totals: null, days: [] }); }
    if (url.pathname === `${api}nutrition/meals/` && method === 'GET') { assert.equal(url.searchParams.get('date'), date); return response([]); }
    if (url.pathname === `${api}nutrition/weights/`) { assert.equal(url.searchParams.get('end'), date); return response([]); }
    if (method === 'DELETE') return response(null, 204);
    return response({ id: 3, ...body }, method === 'POST' ? 201 : 200);
  });
  await f.connect();
  const nutrition = await f.request(`/nutrition?date=${date}`);
  assert.equal(nutrition.status, 200);
  assert.deepEqual(Object.keys(nutrition.json).sort(), ['date', 'meals', 'profile', 'summary', 'weights']);
  assert.equal(nutrition.json.summary.day_totals, null);
  assert.equal((await f.request('/nutrition/profile', { method: 'PATCH', body: { daily_target_kcal: '1800.00' } })).status, 200);
  const meal = { date, datetime: `${date}T08:30:00+08:00`, meal_name: 'Breakfast', items: [food], request_id: '96bb0213-c66d-4286-b4a5-07cfedc6b747' };
  assert.equal((await f.request('/nutrition/meals', { method: 'POST', body: meal })).status, 201);
  assert.equal((await f.request('/nutrition/meals/3', { method: 'PATCH', body: { items: [{ ...food, name: 'Replacement rice' }] } })).status, 200);
  assert.equal((await f.request('/nutrition/meals/3', { method: 'DELETE' })).status, 204);
  assert.equal((await f.request(`/nutrition/weights/${date}`, { method: 'PUT', body: { weight_kg: '70.00', note: 'Morning' } })).status, 200);
  assert.equal((await f.request(`/nutrition/weights/${date}`, { method: 'DELETE' })).status, 204);
  assert.deepEqual(writes, [
    { path: `${api}nutrition/profile/`, method: 'PATCH', body: { daily_target_kcal: '1800.00' } },
    { path: `${api}nutrition/meals/`, method: 'POST', body: meal },
    { path: `${api}nutrition/meals/3/`, method: 'PATCH', body: { items: [{ ...food, name: 'Replacement rice' }] } },
    { path: `${api}nutrition/meals/3/`, method: 'DELETE', body: undefined },
    { path: `${api}nutrition/weights/${date}/`, method: 'PUT', body: { weight_kg: '70.00', note: 'Morning' } },
    { path: `${api}nutrition/weights/${date}/`, method: 'DELETE', body: undefined },
  ]);
  const before = f.calls.length;
  for (const body of [{ daily_target_kcal: '-1' }, { daily_target_kcal: 'Infinity' }, { daily_target_kcal: '2000000.00' }, { water_ml: 2000 }]) assert.equal((await f.request('/nutrition/profile', { method: 'PATCH', body })).status, 400);
  assert.equal((await f.request('/nutrition/meals', { method: 'POST', body: { ...meal, items: [{ ...food, amount: '0' }] } })).status, 400);
  assert.equal((await f.request('/nutrition/meals', { method: 'POST', body: { ...meal, date: '2024-02-30' } })).status, 400);
  assert.equal((await f.request('/nutrition/meals/3', { method: 'PATCH', body: { date: null } })).status, 400);
  assert.equal((await f.request('/nutrition/meals', { method: 'POST', body: { ...meal, datetime: `${date}T08:30:00Z` } })).status, 400);
  assert.equal((await f.request('/nutrition/weights/2024-01-02', { method: 'PUT', body: { weight_kg: 0 } })).status, 400);
  assert.equal(f.calls.length, before);
});

test('expired authentication, offline errors, redirects and upstream HTML never leak secrets', async (t) => {
  let mode = 'expired';
  const f = await fixture(t, () => {
    if (mode === 'expired') return new Response(`<html>${sessionSecret} ${password}</html>`, { status: 403 });
    if (mode === 'offline') throw new Error(`Network error ${sessionSecret}`);
    if (mode === 'redirect') return new Response(null, { status: 302, headers: { Location: 'http://169.254.169.254/secret' } });
    return response({ detail: password, title: [sessionSecret] }, 400);
  });
  await f.connect();
  const expired = await f.request('/tasks');
  assert.equal(expired.status, 401);
  assert.equal(expired.json.code, 'PIXELPOP_SESSION_EXPIRED');
  assert.equal((await f.request('/connection')).json.status, 'expired');
  assert.ok(!JSON.stringify(expired.json).includes(sessionSecret));
  mode = 'offline'; await f.connect();
  const offline = await f.request('/tasks');
  assert.equal(offline.status, 503);
  assert.equal(offline.json.code, 'PIXELPOP_OFFLINE');
  assert.ok(!JSON.stringify(offline.json).includes(sessionSecret));
  mode = 'redirect';
  const redirected = await f.request('/tasks');
  assert.equal(redirected.json.code, 'PIXELPOP_REDIRECT_REJECTED');
  mode = 'rejected';
  const rejected = await f.request('/tasks');
  assert.equal(rejected.status, 400);
  assert.deepEqual(rejected.json.fields, { title: 'Pixelpop rejected this value.' });
  for (const value of [expired.json, offline.json, redirected.json, rejected.json]) assert.ok(!JSON.stringify(value).includes(password));
  mode = 'offline';
  assert.equal((await f.request('/connection', { method: 'DELETE' })).json.connected, false);
  await assert.rejects(fs.stat(path.join(f.dataDir, 'pixelpop-session.json')), { code: 'ENOENT' });
});

test('separate Mari installations never share upstream sessions', async (t) => {
  const first = await fixture(t, () => response({ count: 0, next: null, results: [] }));
  const second = await fixture(t);
  await first.connect();
  assert.equal((await second.request('/connection')).json.connected, false);
  assert.equal((await second.request('/tasks')).json.code, 'PIXELPOP_NOT_CONNECTED');
  assert.equal(second.calls.length, 0);
  await assert.rejects(fs.stat(path.join(second.dataDir, 'pixelpop-session.json')), { code: 'ENOENT' });
  assert.equal((await first.request('/tasks')).status, 200);
});

test('unexpected upstream JSON cannot expose session or CSRF values, and response size is bounded', async (t) => {
  let oversized = false;
  const f = await fixture(t, () => oversized
    ? response({ notes: 'x'.repeat(2 * 1024 * 1024 + 1) })
    : response({ daily_target_kcal: '2000.00', csrfToken: rotatedCsrf, cookies: { sessionid: sessionSecret }, debug: `private ${sessionSecret}` }));
  await f.connect();
  const saved = await f.request('/nutrition/profile', { method: 'PATCH', body: { daily_target_kcal: '2000.00' } });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.csrfToken, undefined);
  assert.equal(saved.json.cookies, undefined);
  assert.equal(saved.json.debug, 'private [REDACTED]');
  oversized = true;
  const large = await f.request('/nutrition/profile', { method: 'PATCH', body: { daily_target_kcal: '2000.00' } });
  assert.equal(large.status, 502);
  assert.equal(large.json.code, 'PIXELPOP_INVALID_RESPONSE');
});

test('reopen respects Pixelpop important-task restrictions and uses its native toggle', async (t) => {
  let current = { ...task, status: 'completed', important: false };
  const f = await fixture(t, ({ url, method }) => {
    if (url.pathname === `${api}deadlines/1/`) return response(current);
    if (url.pathname === `${api}reminders/items/1/toggle/` && method === 'POST') { current = { ...current, status: 'pending' }; return response({ items: [] }); }
    throw new Error('Unexpected route');
  });
  await f.connect();
  assert.equal((await f.request('/tasks/1/reopen', { method: 'POST', body: {} })).json.code, 'PIXELPOP_REOPEN_UNAVAILABLE');
  current.important = true;
  assert.equal((await f.request('/tasks/1/reopen', { method: 'POST', body: {} })).json.status, 'pending');
  assert.equal(f.calls.filter((call) => call.url.pathname.includes('/toggle/')).length, 1);
});
