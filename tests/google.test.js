import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { googleDate } from '../server/google.js';
import { runGoogleBrief, parseGoogleToolResult, normalizeGoogleMail, normalizeGoogleCalendar } from '../worker/google.js';

const result = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const definitions = [
  ['gmail.search_emails', ['query', 'max_results']],
  ['gmail.list_labels', ['label_names']],
  ['google_calendar.search_events', ['time_min', 'time_max', 'timezone_str', 'max_results', 'calendar_id']],
].map(([name, properties]) => ({ name, annotations: { readOnlyHint: true }, inputSchema: { properties: Object.fromEntries(properties.map((key) => [key, {}])) } }));

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mari-google-test-'));
  const store = createStore(directory);
  store.put('agents', { id: 'google-agent' });
  const calls = [];
  const fake = {
    closed: 0,
    async connect() {},
    async close() { this.closed++; },
    async request(method, params) {
      calls.push({ method, params });
      if (overrides.request) { const replacement = await overrides.request(method, params); if (replacement !== undefined) return replacement; }
      if (method === 'app/installed') return { apps: [{ id: 'mail-app', runtimeName: 'Gmail', enabled: true, callable: true }, { id: 'calendar-app', runtimeName: 'Google Calendar', enabled: true, callable: true }] };
      if (method === 'mcpServerStatus/list') return { data: [{ name: 'codex_apps', tools: Object.fromEntries(definitions.map((tool) => [tool.name, tool])) }] };
      if (method === 'thread/start') return { thread: { id: 'ephemeral-google' } };
      if (method === 'mcpServer/tool/call') {
        if (params.tool === 'gmail.search_emails') return result({ emails: [{ id: 'mail-1', threadId: 'thread-1', subject: 'Synthetic private subject', from: 'Synthetic sender', snippet: 'Synthetic private preview', internalDate: '1794000000000' }] });
        if (params.tool === 'gmail.list_labels') return result({ labels: [{ id: 'INBOX', messagesUnread: 32 }] });
        if (params.tool === 'google_calendar.search_events') return result({ events: [{ id: 'event-1', summary: 'Synthetic event title', start: { date: '2026-11-07' }, end: { date: '2026-11-08' }, htmlLink: 'https://calendar.google.com/calendar/event?eid=example' }] });
      }
      throw new Error('Unexpected method/tool');
    },
  };
  const job = { id: 'google-job', agentId: 'google-agent', type: 'personal.google.refresh', payload: { date: '2026-11-07', timeZone: 'Asia/Manila' } };
  const run = (extra = {}) => runGoogleBrief({ store, dataDir: directory, job, makeCodex: () => fake, ...extra });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return { store, calls, fake, job, run };
}

test('Google refresh calls only bounded, discovered read tools and never starts inference or logs account content', async (t) => {
  const f = await fixture(t);
  const value = await f.run();
  assert.equal(value.connections.gmail.callable, true);
  assert.equal(value.brief.mail.unreadCount, 32);
  assert.equal(value.brief.mail.truncated, true);
  assert.equal(value.brief.calendar.events[0].allDay, true);
  assert.equal(f.calls.some((call) => call.method === 'turn/start'), false);
  const thread = f.calls.find((call) => call.method === 'thread/start');
  assert.equal(thread.params.ephemeral, true); assert.equal(thread.params.sandbox, 'read-only');
  const reads = f.calls.filter((call) => call.method === 'mcpServer/tool/call');
  assert.deepEqual(reads.map((call) => call.params.tool), ['gmail.search_emails', 'gmail.list_labels', 'google_calendar.search_events']);
  assert.equal(reads[0].params.arguments.max_results, 20);
  assert.deepEqual(reads[2].params.arguments, { time_min: '2026-11-07T00:00:00+08:00', time_max: '2026-11-08T00:00:00+08:00', timezone_str: 'Asia/Manila', max_results: 30, calendar_id: 'primary' });
  const log = JSON.stringify(f.store.events({}));
  assert.doesNotMatch(log, /Synthetic private|Synthetic sender|Synthetic event|mail-1|event-1/);
  assert.ok(f.fake.closed > 0);
});

test('connectivity inspection is metadata-only with no thread, inference, or Google reads', async (t) => {
  const f = await fixture(t);
  await f.run({ job: { ...f.job, type: 'personal.google.inspect' } });
  assert.deepEqual(f.calls.map((call) => call.method), ['app/installed']);
  assert.equal(f.store.get('settings', 'google-connections').connections.calendar.status, 'connected');
  assert.equal(f.store.get('settings', 'google-brief'), null);
});

test('a partial provider failure keeps the successful summary and identifies cached data as stale', async (t) => {
  const f = await fixture(t, { request: (method, params) => {
    if (method === 'mcpServer/tool/call' && params.tool === 'google_calendar.search_events') throw new Error('Synthetic provider secret body');
  } });
  f.store.put('settings', { id: 'google-brief', brief: { generatedAt: '2026-11-06T08:00:00Z', date: '2026-11-06', calendar: { events: [{ id: 'old-event' }], status: 'ready' } } });
  const { brief } = await f.run();
  assert.equal(brief.mail.status, 'ready'); assert.equal(brief.calendar.status, 'error');
  assert.equal(brief.calendar.sourceDate, '2026-11-06'); assert.equal(brief.calendar.stale, true);
  assert.equal(brief.stale, true);
  assert.doesNotMatch(JSON.stringify(f.store.get('settings', 'google-brief')), /Synthetic provider secret body/);
});

for (const provider of ['mail', 'calendar']) {
  test(`consecutive ${provider} failures preserve the original cached source across day rollover`, async (t) => {
    const failedTool = provider === 'mail' ? 'gmail.search_emails' : 'google_calendar.search_events';
    const f = await fixture(t, { request: (method, params) => {
      if (method === 'mcpServer/tool/call' && params.tool === failedTool) throw new Error('Provider unavailable');
    } });
    const originalTime = '2026-11-06T08:00:00Z', originalDate = '2026-11-06';
    const original = provider === 'mail' ? { status: 'ready', items: [{ id: 'old-mail' }], unreadCount: 1, truncated: false } : { status: 'ready', events: [{ id: 'old-event' }], truncated: false };
    f.store.put('settings', { id: 'google-brief', brief: { generatedAt: originalTime, date: originalDate, [provider]: original } });
    const first = (await f.run()).brief;
    assert.equal(first[provider].cachedAt, originalTime);
    assert.equal(first[provider].sourceDate, originalDate);
    const second = (await f.run({ job: { ...f.job, payload: { ...f.job.payload, date: '2026-11-08' } } })).brief;
    assert.equal(second.date, '2026-11-08');
    assert.equal(second[provider].status, 'error');
    assert.equal(second[provider].stale, true);
    assert.equal(second[provider].cachedAt, originalTime, 'a new partial refresh must not relabel old data as freshly retrieved');
    assert.equal(second[provider].sourceDate, originalDate, 'calendar and mail provenance must survive the requested-date change');
    assert.deepEqual(second[provider][provider === 'mail' ? 'items' : 'events'], original[provider === 'mail' ? 'items' : 'events']);
  });
}

test('failed refresh preserves cached generation time and marks it stale rather than inventing a fresh summary', async (t) => {
  const f = await fixture(t, { request: (method) => { if (method === 'mcpServer/tool/call') throw new Error('Sensitive provider diagnostics'); } });
  const previous = { generatedAt: '2026-11-06T08:00:00Z', date: '2026-11-06', summary: 'Previous facts', mail: { items: [] }, calendar: { events: [] } };
  f.store.put('settings', { id: 'google-brief', brief: previous });
  await assert.rejects(f.run(), /Google could not return this data/);
  const saved = f.store.get('settings', 'google-brief');
  assert.deepEqual(saved.brief, previous); assert.equal(saved.stale, true); assert.equal(saved.refreshing, false);
  assert.doesNotMatch(JSON.stringify(saved), /Sensitive provider diagnostics/);
});

test('cancellation closes only the dedicated Google client and never executes tools or changes services', async (t) => {
  const controller = new AbortController();
  const f = await fixture(t, { request: (method) => {
    if (method === 'app/installed') { queueMicrotask(() => controller.abort()); return new Promise(() => {}); }
  } });
  f.store.put('services', { id: 'user-service', status: 'running', pid: 12345 });
  await assert.rejects(f.run({ signal: controller.signal }), { cancelled: true });
  assert.ok(f.fake.closed > 0);
  assert.equal(f.store.get('services', 'user-service').status, 'running');
  assert.equal(f.calls.some((call) => call.method === 'mcpServer/tool/call'), false);
});

test('malformed content is not treated as an empty inbox; MIME preview, date and source links stay bounded', () => {
  assert.throws(() => parseGoogleToolResult({ content: [{ type: 'text', text: 'Unavailable' }] }), /unsupported response/);
  assert.throws(() => normalizeGoogleMail({ unexpected: [] }), /unsupported email list/);
  const mail = normalizeGoogleMail({ messages: [{ id: 'id/<bad>', payload: { headers: [{ name: 'Subject', value: '<b>Subject</b>' }, { name: 'From', value: 'Synthetic sender' }], parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('Private preview in MIME').toString('base64url') } }] } }] });
  assert.equal(mail.items[0].subject, 'Subject'); assert.equal(mail.items[0].snippet, 'Private preview in MIME');
  assert.equal(mail.items[0].receivedAt, null); assert.equal(mail.unreadCount, null);
  assert.ok(mail.items[0].url.startsWith('https://mail.google.com/'));
  const nativeMail = normalizeGoogleMail({ emails: [{ id: 'native', from_: 'Native sender shape', email_ts: '1794000000', subject: 'Native shape', snippet: 'Preview', display_url: 'https://mail.google.com/mail/u/1/#inbox/native' }] });
  assert.equal(nativeMail.items[0].from, 'Native sender shape');
  assert.equal(nativeMail.items[0].receivedAt, new Date(1794000000000).toISOString());
  assert.equal(nativeMail.items[0].url, 'https://mail.google.com/mail/u/1/#inbox/native', 'preserve the connected account source link');
  const calendar = normalizeGoogleCalendar({ events: [{ id: 'abc', title: 'Meeting', start: '2026-11-07T12:00:00+08:00', end: '2026-11-07T13:00:00+08:00', url: 'javascript:alert(1)' }] });
  assert.ok(calendar.events[0].url.startsWith('https://calendar.google.com/'));
  assert.throws(() => googleDate('2026-02-30'), /valid date/);
  assert.throws(() => googleDate('2026-11-07', 'Invalid/Zone'), /Asia\/Manila/);
});

test('a changed tool contract cannot make the reader invoke an unapproved tool', async (t) => {
  const f = await fixture(t, { request: (method) => {
    if (method === 'mcpServerStatus/list') return { data: [{ name: 'codex_apps', tools: { only: { name: 'gmail.send_email', inputSchema: { properties: {} } } } }] };
  } });
  await assert.rejects(f.run());
  assert.equal(f.calls.some((call) => call.method === 'mcpServer/tool/call'), false);
});

test('newspaper Google reads use a separate private cache and explicit provider/rule scope',async t=>{
  const f=await fixture(t);f.store.put('settings',{id:'google-brief',keep:'Existing Today cache'});
  await f.run({briefKey:'newspaper:google-brief',mailQuery:'in:inbox from:synthetic@example.test -filename:ics',includeCalendar:false});
  const reads=f.calls.filter(c=>c.method==='mcpServer/tool/call');assert.deepEqual(reads.map(c=>c.params.tool),['gmail.search_emails','gmail.list_labels']);assert.match(reads[0].params.arguments.query,/-filename:ics/);assert.equal(f.store.get('settings','google-brief').keep,'Existing Today cache');assert.equal(f.store.get('settings','newspaper:google-brief').brief.mail.truncated,false);assert.equal(f.calls.some(c=>c.method==='turn/start'),false);assert.doesNotMatch(JSON.stringify(f.store.events({})),/Synthetic private|Synthetic sender|synthetic@example/);
});
