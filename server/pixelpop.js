import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

const API_PATH = '/api/v1/finance/';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const COOKIE_NAMES = new Set(['sessionid', 'csrftoken']);
const TASK_FIELDS = ['title', 'priority', 'important', 'due_date', 'due_time', 'notes'];
const PROFILE_FIELDS = ['height_cm', 'daily_target_kcal', 'daily_target_protein_g', 'daily_target_carbs_g', 'daily_target_fat_g', 'target_weight_kg'];
const publicTaskFields = ['id', 'title', 'kind', 'priority', 'important', 'due_date', 'due_time', 'notes', 'status', 'completed_at', 'urgency', 'overdue_duration', 'schedule', 'system_key'];
const failure = (message, status = 400, code = 'PIXELPOP_INVALID_INPUT', fields) => Object.assign(new Error(message), { status, code, fields });
const timestamp = () => new Date().toISOString();
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const select = (value, fields) => Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));

function baseUrl(value) {
  if (typeof value !== 'string' || value.length > 2000 || /[\s\\]/.test(value)) throw failure('Enter a Pixelpop HTTPS URL or a loopback HTTP URL.');
  let url;
  try { url = new URL(value); } catch { throw failure('Enter a valid Pixelpop URL.'); }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!(url.protocol === 'https:' || url.protocol === 'http:' && loopback) || url.username || url.password || url.search || url.hash || !['/', API_PATH, API_PATH.slice(0, -1)].includes(url.pathname)) {
    throw failure('Use the Pixelpop origin, with HTTPS or loopback HTTP, without credentials, query, or fragment.');
  }
  if (['0.0.0.0', '[::]', '169.254.169.254', 'metadata.google.internal'].includes(url.hostname) || url.hostname.startsWith('169.254.')) throw failure('That address cannot be used for Pixelpop.');
  return url.origin;
}

function object(value, allowed, { empty = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw failure('Send a JSON object.');
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.includes(key))) throw failure('The request contains an unsupported field.');
  if (!empty && !keys.length) throw failure('Enter a value to save.');
  return value;
}

function text(value, name, max, { blank = false } = {}) {
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) || !blank && !value.trim()) throw failure(`Enter a valid ${name} (at most ${max} characters).`);
  return value.trim();
}

function day(value, { nullable = false, past = false } = {}) {
  if (value === null && nullable) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`)) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value || past && value > manilaToday()) throw failure('Use a valid date in YYYY-MM-DD format' + (past ? ', today or earlier.' : '.'));
  return value;
}

function identifier(value) {
  if (!/^[1-9]\d{0,15}$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw failure('Choose a valid Pixelpop record.');
  return String(value);
}

function decimal(value, name, digits, scale, { nullable = false, minimum = 0 } = {}) {
  if (value === null && nullable) return null;
  if (!['string', 'number'].includes(typeof value) || !Number.isFinite(Number(value))) throw failure(`Enter a valid ${name}.`);
  const raw = String(value);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match || (match[2]?.length || 0) > scale || match[1].replace(/^0+/, '').length > digits - scale || Number(raw) < minimum) throw failure(`Enter a valid ${name}.`);
  return raw;
}

function taskInput(body, create = false) {
  object(body, TASK_FIELDS);
  const result = {};
  if (create || Object.hasOwn(body, 'title')) result.title = text(body.title, 'task title', 160);
  if (Object.hasOwn(body, 'priority')) {
    if (!['high', 'medium', 'low'].includes(body.priority)) throw failure('Choose a high, medium, or low priority.');
    result.priority = body.priority;
  }
  if (Object.hasOwn(body, 'important')) {
    if (typeof body.important !== 'boolean') throw failure('Important must be true or false.');
    result.important = body.important;
  }
  if (Object.hasOwn(body, 'due_date')) result.due_date = day(body.due_date, { nullable: true });
  if (Object.hasOwn(body, 'due_time')) {
    if (body.due_time !== null && (typeof body.due_time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(body.due_time))) throw failure('Use HH:mm or HH:mm:ss for the due time.');
    result.due_time = body.due_time;
  }
  if (Object.hasOwn(body, 'notes')) result.notes = text(body.notes, 'task notes', 4000, { blank: true });
  if (create) result.kind = 'task';
  return result;
}

function profileInput(body) {
  object(body, PROFILE_FIELDS);
  return Object.fromEntries(Object.entries(body).map(([key, value]) => [key, decimal(value, key.replaceAll('_', ' '), key === 'height_cm' ? 5 : key === 'target_weight_kg' ? 6 : 8, key === 'height_cm' ? 1 : 2, { nullable: true, minimum: 0.01 })]));
}

function mealInput(body, create = false) {
  object(body, ['date', 'datetime', 'meal_name', 'items', ...(create ? ['request_id'] : [])]);
  const result = {};
  if (create || Object.hasOwn(body, 'date')) result.date = day(Object.hasOwn(body, 'date') ? body.date : manilaToday(), { past: true });
  if (Object.hasOwn(body, 'datetime')) {
    const value = body.datetime;
    if (value !== null && (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\+08:00$/.test(value) || !Number.isFinite(Date.parse(value)) || Date.parse(value) > Date.now())) throw failure('Use a past or current Manila time: YYYY-MM-DDTHH:mm:ss+08:00.');
    if (value !== null) {
      day(value.slice(0, 10), { past: true });
      if (Object.hasOwn(body, 'date') && result.date !== value.slice(0, 10)) throw failure('The meal date must match its Manila time.');
      if (create && !Object.hasOwn(body, 'date')) result.date = value.slice(0, 10);
    }
    result.datetime = value;
  }
  if (create || Object.hasOwn(body, 'meal_name')) result.meal_name = text(body.meal_name, 'meal name', 160);
  if (create || Object.hasOwn(body, 'items')) {
    if (!Array.isArray(body.items) || !body.items.length || body.items.length > 100) throw failure('Add between 1 and 100 food items.');
    // Pixelpop replaces the entire item list when items is included in a PATCH.
    result.items = body.items.map((item) => {
      object(item, ['name', 'amount', 'unit', 'calories', 'protein', 'carbs', 'fat']);
      return {
        name: text(item.name, 'food name', 160), amount: decimal(item.amount, 'food amount', 12, 3, { minimum: 0.001 }), unit: text(item.unit, 'food unit', 24),
        ...Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map((key) => [key, decimal(item[key], key, 10, 2)])),
      };
    });
  }
  if (create && Object.hasOwn(body, 'request_id')) {
    if (typeof body.request_id !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(body.request_id)) throw failure('Use a UUID for the meal request identifier.');
    result.request_id = body.request_id;
  }
  if (Buffer.byteLength(JSON.stringify(result)) > 65536) throw failure('A meal must be 64 KiB or smaller.');
  return result;
}

function publicUser(user) {
  if (!user || typeof user !== 'object') return null;
  return { name: typeof user.name === 'string' ? user.name.slice(0, 200) : '', email: typeof user.email === 'string' ? user.email.slice(0, 254) : '' };
}

function cookieLines(headers) {
  if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  return (headers.get('set-cookie') || '').split(/,(?=\s*[\w-]+=)/).filter(Boolean);
}

function updateCookies(state, headers) {
  for (const line of cookieLines(headers)) {
    const [pair, ...attributes] = line.split(';').map((part) => part.trim());
    const equals = pair.indexOf('=');
    const name = pair.slice(0, equals), value = pair.slice(equals + 1);
    if (!COOKIE_NAMES.has(name) || /[\s;,\\\u0000-\u001f\u007f]/.test(value) || value.length > 4096) continue;
    const attrs = Object.fromEntries(attributes.map((attribute) => { const index = attribute.indexOf('='); return index < 0 ? [attribute.toLowerCase(), true] : [attribute.slice(0, index).toLowerCase(), attribute.slice(index + 1)]; }));
    const hostname = new URL(state.baseUrl).hostname.replace(/^\[|\]$/g, '');
    const domain = String(attrs.domain || '').replace(/^\./, '').toLowerCase();
    if (domain && hostname !== domain && !hostname.endsWith(`.${domain}`)) continue;
    const expiresAt = attrs['max-age'] !== undefined ? Date.now() + Number(attrs['max-age']) * 1000 : attrs.expires ? Date.parse(attrs.expires) : null;
    if (!value || expiresAt !== null && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) delete state.cookies[name];
    else state.cookies[name] = { value, expiresAt };
  }
}

function cookieHeader(state) {
  return Object.entries(state.cookies).filter(([, cookie]) => !cookie.expiresAt || cookie.expiresAt > Date.now()).map(([name, cookie]) => `${name}=${cookie.value}`).join('; ');
}

async function readJson(response) {
  if (response.status === 204) { await response.body?.cancel(); return null; }
  const declared = Number(response.headers.get('content-length'));
  if (declared > MAX_RESPONSE_BYTES) { await response.body?.cancel(); throw failure('Pixelpop returned too much data.', 502, 'PIXELPOP_INVALID_RESPONSE'); }
  const reader = response.body?.getReader();
  const chunks = []; let size = 0;
  if (reader) {
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_RESPONSE_BYTES) { await reader.cancel(); throw failure('Pixelpop returned too much data.', 502, 'PIXELPOP_INVALID_RESPONSE'); }
        chunks.push(Buffer.from(value));
      }
    } finally { reader.releaseLock(); }
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return null; }
}

/** Mounted behind Mari's owner session and X-Mari-CSRF middleware. */
export function createPixelpopRouter({ store, dataDir, fetchImpl = fetch }) {
  const router = express.Router();
  const directory = path.resolve(dataDir || store?.dataDir || '.mari');
  const sessionFile = path.join(directory, 'pixelpop-session.json');
  const blank = () => ({ baseUrl: null, cookies: {}, csrfToken: null, user: null, lastCheckedAt: null, status: 'disconnected', error: null });
  let state = blank(), queue = Promise.resolve();
  const privateValues = new Set();
  const registerSecrets = (current) => {
    const values = [current.csrfToken, ...Object.values(current.cookies).map((cookie) => cookie.value)].filter(Boolean);
    for (const value of values) if (value.length >= 8) privateValues.add(value);
    store?.addSecrets?.(values);
  };
  router.use((req, res, next) => {
    const json = res.json.bind(res);
    // Upstream cookies, CSRF values, and authentication-shaped fields stay private
    // even if a misconfigured upstream includes them in an otherwise valid JSON body.
    res.json = (value) => json(JSON.parse(JSON.stringify(value, (key, item) => {
      if (['password', 'csrftoken', 'sessionid', 'cookies', 'cookie', 'set-cookie', 'authorization'].includes(key.toLowerCase())) return undefined;
      if (typeof item === 'string') for (const secret of privateValues) item = item.replaceAll(secret, '[REDACTED]');
      return item;
    })));
    next();
  });
  const ready = (async () => {
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
    try {
      const stat = await fs.lstat(sessionFile);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768) throw new Error('Invalid session file');
      await fs.chmod(sessionFile, 0o600);
      const saved = JSON.parse(await fs.readFile(sessionFile, 'utf8'));
      if (saved.version !== 1) throw new Error('Invalid session version');
      const origin = baseUrl(saved.baseUrl);
      const cookies = {};
      for (const [name, cookie] of Object.entries(saved.cookies || {})) {
        if (COOKIE_NAMES.has(name) && typeof cookie?.value === 'string' && cookie.value.length <= 4096 && !/[\s;,\\\u0000-\u001f\u007f]/.test(cookie.value) && (cookie.expiresAt === null || typeof cookie.expiresAt === 'number' && cookie.expiresAt > Date.now())) cookies[name] = cookie;
      }
      const expired = Boolean(saved.cookies?.sessionid && !cookies.sessionid);
      state = { ...blank(), baseUrl: origin, cookies, csrfToken: typeof saved.csrfToken === 'string' && /^[a-z\d_-]{1,256}$/i.test(saved.csrfToken) ? saved.csrfToken : null, user: publicUser(saved.user), lastCheckedAt: typeof saved.lastCheckedAt === 'string' ? saved.lastCheckedAt.slice(0, 40) : null, status: expired ? 'expired' : 'configured', ...(expired ? { error: 'Your Pixelpop session expired. Connect again.' } : {}) };
      registerSecrets(state);
    } catch (error) {
      if (error.code !== 'ENOENT') state.error = 'The saved Pixelpop session could not be read. Connect again.';
    }
  })();
  // Keep startup failures handled until the first request can return a safe error.
  ready.catch(() => {});

  async function persist() {
    registerSecrets(state);
    const temporary = path.join(directory, `pixelpop-session-${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify({ version: 1, baseUrl: state.baseUrl, cookies: state.cookies, csrfToken: state.csrfToken, user: state.user, lastCheckedAt: state.lastCheckedAt }), { flag: 'wx', mode: 0o600 });
      await fs.rename(temporary, sessionFile);
      await fs.chmod(sessionFile, 0o600);
    } catch { throw failure('Mari could not save the private Pixelpop session.', 500, 'PIXELPOP_STORAGE_ERROR'); }
    finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
  }

  const connection = () => ({ connected: state.status === 'connected', status: state.status, baseUrl: state.baseUrl, user: state.user, lastCheckedAt: state.lastCheckedAt, workspaceScope: 'shared', ...(state.error ? { error: state.error } : {}) });
  function requireSession() {
    if (!state.baseUrl || !state.cookies.sessionid || state.cookies.sessionid.expiresAt && state.cookies.sessionid.expiresAt <= Date.now()) throw failure('Connect your Pixelpop account to continue.', 401, state.status === 'expired' ? 'PIXELPOP_SESSION_EXPIRED' : 'PIXELPOP_NOT_CONNECTED');
  }

  async function upstream(current, resource, { method = 'GET', body, login = false } = {}) {
    // Every caller uses a literal resource prefix and validated identifiers.
    if (!/^(?:session\/(?:login\/|logout\/)?|deadlines\/(?:[1-9]\d*\/(?:settle\/)?)?|reminders\/items\/[1-9]\d*\/toggle\/|nutrition\/(?:profile\/|summary\/|meals\/(?:[1-9]\d*\/)?|weights\/(?:\d{4}-\d{2}-\d{2}\/)?))(?:\?[^#]*)?$/.test(resource)) throw failure('Unsupported Pixelpop operation.', 400, 'PIXELPOP_INVALID_INPUT');
    const cookies = cookieHeader(current);
    const headers = { Accept: 'application/json', ...(cookies ? { Cookie: cookies } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) };
    if (!['GET', 'HEAD'].includes(method)) {
      const csrfToken = current.csrfToken || current.cookies.csrftoken?.value;
      if (!csrfToken) throw failure('The Pixelpop session needs to be connected again.', 401, 'PIXELPOP_SESSION_EXPIRED');
      Object.assign(headers, { 'X-CSRFToken': csrfToken, Origin: current.baseUrl, Referer: `${current.baseUrl}/` });
    }
    let response, data;
    try {
      response = await fetchImpl(`${current.baseUrl}${API_PATH}${resource}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), redirect: 'manual', signal: AbortSignal.timeout(12000) });
      if (response.status >= 300 && response.status < 400) { await response.body?.cancel(); throw failure('Pixelpop redirected the API request. Check its base URL.', 502, 'PIXELPOP_REDIRECT_REJECTED'); }
      updateCookies(current, response.headers);
      data = await readJson(response);
    } catch (error) {
      if (error.code?.startsWith('PIXELPOP_')) throw error;
      if (current === state) { state.status = 'offline'; state.error = 'Pixelpop is unreachable. Check its address and try again.'; state.lastCheckedAt = timestamp(); }
      throw failure('Pixelpop is unreachable. Check its address and try again.', 503, 'PIXELPOP_OFFLINE');
    }
    registerSecrets(current);
    if (response.status === 401 || response.status === 403) {
      if (current === state) {
        state.status = 'expired'; state.error = 'Your Pixelpop session expired. Connect again.'; state.lastCheckedAt = timestamp();
        delete state.cookies.sessionid;
        await persist();
      }
      throw failure(login ? 'Pixelpop could not sign you in. Check your username and password.' : 'Your Pixelpop session expired. Connect again.', 401, login ? 'PIXELPOP_LOGIN_FAILED' : 'PIXELPOP_SESSION_EXPIRED');
    }
    if (!response.ok) {
      if (login && response.status === 400) throw failure('Pixelpop could not sign you in. Check your username and password.', 401, 'PIXELPOP_LOGIN_FAILED');
      const fields = data && typeof data === 'object' ? Object.fromEntries([...TASK_FIELDS, ...PROFILE_FIELDS, 'date', 'datetime', 'meal_name', 'items', 'weight_kg', 'note'].filter((key) => Object.hasOwn(data, key)).map((key) => [key, 'Pixelpop rejected this value.'])) : undefined;
      const status = response.status === 404 ? 404 : response.status === 429 ? 429 : response.status >= 500 ? 502 : response.status === 409 ? 409 : 400;
      throw failure(status === 404 ? 'The Pixelpop record was not found.' : status === 429 ? 'Pixelpop is busy. Wait a moment and try again.' : status === 502 ? 'Pixelpop could not complete the request. Try again.' : 'Pixelpop rejected the request. Check the entered values.', status, status === 404 ? 'PIXELPOP_NOT_FOUND' : status === 429 ? 'PIXELPOP_RATE_LIMITED' : status === 502 ? 'PIXELPOP_UPSTREAM_ERROR' : 'PIXELPOP_REJECTED', fields && Object.keys(fields).length ? fields : undefined);
    }
    if (response.status !== 204 && (data === null || typeof data !== 'object')) throw failure('Pixelpop returned an unexpected API response.', 502, 'PIXELPOP_INVALID_RESPONSE');
    if (resource.startsWith('session/') && typeof data?.csrfToken === 'string') {
      if (!/^[a-z\d_-]{1,256}$/i.test(data.csrfToken)) throw failure('Pixelpop returned an invalid session response.', 502, 'PIXELPOP_INVALID_RESPONSE');
      current.csrfToken = data.csrfToken;
    }
    if (current === state) { state.status = 'connected'; state.error = null; state.lastCheckedAt = timestamp(); await persist(); }
    return data;
  }

  const route = (handler) => (req, res, next) => {
    const operation = queue.then(async () => { await ready; res.setHeader('Cache-Control', 'private, no-store'); await handler(req, res); });
    queue = operation.catch(() => {});
    operation.catch(next);
  };
  async function getTask(id) {
    const task = await upstream(state, `deadlines/${identifier(id)}/`);
    if (!task || task.kind !== 'task') throw failure('Only Pixelpop tasks can be managed in Mari.', 403, 'PIXELPOP_TASK_REQUIRED');
    return task;
  }
  const taskView = (task) => select(task, publicTaskFields);
  function editableTask(task, patch) {
    if (task.status !== 'pending') throw failure('Completed Pixelpop tasks are read-only.', 409, 'PIXELPOP_TASK_READ_ONLY');
    if (task.schedule && Object.hasOwn(patch, 'due_date') && patch.due_date !== task.due_date) throw failure('Change recurring dates in Pixelpop through their schedule.', 409, 'PIXELPOP_RECURRING_TASK');
    if ((Object.hasOwn(patch, 'due_date') ? patch.due_date : task.due_date) == null && (Object.hasOwn(patch, 'due_time') ? patch.due_time : task.due_time) != null) throw failure('Set a due date before adding a time.');
  }

  router.get('/connection', route(async (req, res) => {
    if (state.baseUrl && state.cookies.sessionid) {
      try {
        const data = await upstream(state, 'session/');
        if (!data.user || !data.csrfToken) throw failure('Pixelpop did not confirm the signed-in account.', 502, 'PIXELPOP_INVALID_RESPONSE');
        state.user = publicUser(data.user); await persist();
      }
      catch (error) { if (!['PIXELPOP_OFFLINE', 'PIXELPOP_SESSION_EXPIRED', 'PIXELPOP_REDIRECT_REJECTED', 'PIXELPOP_UPSTREAM_ERROR', 'PIXELPOP_INVALID_RESPONSE'].includes(error.code)) throw error; if (!['offline', 'expired'].includes(state.status)) { state.status = 'offline'; state.error = error.message; state.lastCheckedAt = timestamp(); } }
    }
    res.json(connection());
  }));

  router.post('/connect', route(async (req, res) => {
    object(req.body, ['baseUrl', 'username', 'password']);
    const origin = baseUrl(req.body.baseUrl);
    const username = text(req.body.username, 'username', 150);
    let password = req.body.password;
    delete req.body.password;
    if (typeof password !== 'string' || !password.length || password.length > 1024) throw failure('Enter your Pixelpop password.');
    const candidate = { ...blank(), baseUrl: origin };
    try {
      await upstream(candidate, 'session/login/', { login: true });
      await upstream(candidate, 'session/login/', { method: 'POST', body: { username, password }, login: true });
    } finally { password = undefined; }
    if (!candidate.cookies.sessionid) throw failure('Pixelpop did not create a session. Check its base URL.', 502, 'PIXELPOP_INVALID_RESPONSE');
    const session = await upstream(candidate, 'session/', { login: true });
    if (!session.user || !session.csrfToken) throw failure('Pixelpop did not confirm the signed-in account.', 502, 'PIXELPOP_INVALID_RESPONSE');
    candidate.user = publicUser(session.user); candidate.status = 'connected'; candidate.lastCheckedAt = timestamp();
    state = candidate;
    await persist();
    res.json(connection());
  }));

  router.delete('/connection', route(async (req, res) => {
    if (state.baseUrl && state.cookies.sessionid) { try { await upstream(state, 'session/logout/', { method: 'POST', body: {} }); } catch { /* Disconnect locally even when Pixelpop is offline. */ } }
    state = blank();
    await fs.rm(sessionFile, { force: true });
    res.json(connection());
  }));

  router.get('/tasks', route(async (req, res) => {
    requireSession();
    if (Object.keys(req.query).some((key) => !['status', 'q', 'page'].includes(key))) throw failure('Use task status, search, and page filters only.');
    if (req.query.status && !['pending', 'completed'].includes(req.query.status)) throw failure('Choose pending or completed tasks.');
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || req.query.page !== undefined && !/^\d+$/.test(req.query.page)) throw failure('Choose a valid task page.');
    const query = new URLSearchParams({ kind: 'task', compact: '1', page_size: '20', page: String(page) });
    if (req.query.status) query.set('status', req.query.status);
    if (req.query.q !== undefined) query.set('q', text(req.query.q, 'task search', 160, { blank: true }));
    const data = await upstream(state, `deadlines/?${query}`);
    if (!Array.isArray(data.results) || !Number.isSafeInteger(data.count) || data.count < 0) throw failure('Pixelpop returned an unexpected task list.', 502, 'PIXELPOP_INVALID_RESPONSE');
    const hasNext = Boolean(data.next);
    res.json({ results: data.results.filter((task) => task?.kind === 'task').map(taskView), count: data.count, page, hasNext, next: hasNext, nextPage: hasNext ? page + 1 : null, workspaceScope: 'shared' });
  }));
  router.post('/tasks', route(async (req, res) => {
    requireSession(); const body = taskInput(req.body, true); editableTask({ status: 'pending' }, body);
    const task = await upstream(state, 'deadlines/', { method: 'POST', body });
    if (task.kind !== 'task') throw failure('Pixelpop returned an unexpected task.', 502, 'PIXELPOP_INVALID_RESPONSE');
    res.status(201).json(taskView(task));
  }));
  router.patch('/tasks/:id', route(async (req, res) => {
    requireSession(); const body = taskInput(req.body); const task = await getTask(req.params.id); editableTask(task, body);
    const saved = await upstream(state, `deadlines/${identifier(req.params.id)}/`, { method: 'PATCH', body });
    if (saved.kind !== 'task') throw failure('Pixelpop returned an unexpected task.', 502, 'PIXELPOP_INVALID_RESPONSE');
    res.json(taskView(saved));
  }));
  router.post('/tasks/:id/complete', route(async (req, res) => {
    requireSession(); object(req.body || {}, [], { empty: true }); const task = await getTask(req.params.id);
    if (task.system_key) throw failure('Complete this automatic reminder by logging its matching activity in Pixelpop.', 409, 'PIXELPOP_AUTOMATIC_TASK');
    const saved = await upstream(state, `deadlines/${identifier(req.params.id)}/settle/`, { method: 'POST', body: {} });
    if (saved.kind !== 'task') throw failure('Pixelpop returned an unexpected task.', 502, 'PIXELPOP_INVALID_RESPONSE');
    res.json(taskView(saved));
  }));
  router.post('/tasks/:id/reopen', route(async (req, res) => {
    requireSession(); object(req.body || {}, [], { empty: true }); const task = await getTask(req.params.id);
    if (!task.important || task.system_key || task.status !== 'completed') throw failure('Only completed important tasks can be reopened through Pixelpop.', 409, 'PIXELPOP_REOPEN_UNAVAILABLE');
    await upstream(state, `reminders/items/${identifier(req.params.id)}/toggle/`, { method: 'POST', body: {} });
    res.json(taskView(await getTask(req.params.id)));
  }));
  router.delete('/tasks/:id', route(async (req, res) => {
    requireSession(); const task = await getTask(req.params.id);
    if (task.status !== 'pending' || task.schedule) throw failure('Only pending tasks without a recurring schedule can be deleted.', 409, 'PIXELPOP_TASK_READ_ONLY');
    await upstream(state, `deadlines/${identifier(req.params.id)}/`, { method: 'DELETE' });
    res.status(204).end();
  }));

  router.get('/nutrition', route(async (req, res) => {
    requireSession();
    if (Object.keys(req.query).some((key) => key !== 'date')) throw failure('Choose a nutrition date only.');
    const date = day(req.query.date || manilaToday(), { past: true });
    const profile = await upstream(state, 'nutrition/profile/');
    const summary = await upstream(state, `nutrition/summary/?date=${date}`);
    const meals = await upstream(state, `nutrition/meals/?date=${date}`);
    const weights = await upstream(state, `nutrition/weights/?end=${date}`);
    if (!Array.isArray(meals) || !Array.isArray(weights)) throw failure('Pixelpop returned an unexpected nutrition response.', 502, 'PIXELPOP_INVALID_RESPONSE');
    res.json({ date, profile, summary, meals, weights });
  }));
  router.patch('/nutrition/profile', route(async (req, res) => {
    requireSession(); res.json(await upstream(state, 'nutrition/profile/', { method: 'PATCH', body: profileInput(req.body) }));
  }));
  router.post('/nutrition/meals', route(async (req, res) => {
    requireSession(); res.status(201).json(await upstream(state, 'nutrition/meals/', { method: 'POST', body: mealInput(req.body, true) }));
  }));
  router.patch('/nutrition/meals/:id', route(async (req, res) => {
    requireSession(); const id = identifier(req.params.id); res.json(await upstream(state, `nutrition/meals/${id}/`, { method: 'PATCH', body: mealInput(req.body) }));
  }));
  router.delete('/nutrition/meals/:id', route(async (req, res) => {
    requireSession(); await upstream(state, `nutrition/meals/${identifier(req.params.id)}/`, { method: 'DELETE' }); res.status(204).end();
  }));
  router.put('/nutrition/weights/:date', route(async (req, res) => {
    requireSession(); const date = day(req.params.date, { past: true }); object(req.body, ['weight_kg', 'note']);
    const body = { weight_kg: decimal(req.body.weight_kg, 'weight', 6, 2, { minimum: 0.01 }), ...(Object.hasOwn(req.body, 'note') ? { note: text(req.body.note, 'weight note', 500, { blank: true }) } : {}) };
    res.json(await upstream(state, `nutrition/weights/${date}/`, { method: 'PUT', body }));
  }));
  router.delete('/nutrition/weights/:date', route(async (req, res) => {
    requireSession(); await upstream(state, `nutrition/weights/${day(req.params.date, { past: true })}/`, { method: 'DELETE' }); res.status(204).end();
  }));

  router.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const known = typeof error.code === 'string' && error.code.startsWith('PIXELPOP_');
    res.status(known ? error.status || 500 : 500).json({ error: known ? error.message : 'Mari could not complete the Pixelpop request.', code: known ? error.code : 'PIXELPOP_INTERNAL_ERROR', ...(known && error.fields ? { fields: error.fields } : {}) });
  });
  return router;
}
