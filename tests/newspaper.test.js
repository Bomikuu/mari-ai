import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { NEWSPAPER_JOB_TYPE, NEWSPAPER_EDITION_PREFIX, newspaperDate, newspaperEditions, queueNewspaper, createNewspaperRouter } from '../server/newspaper.js';
import { normalizeNewspaperCandidates, normalizeNewspaperSummary, normalizeNewspaperMarket, runNewspaper } from '../worker/newspaper.js';

const SUMMARY = 'The publisher describes the latest development and explains its immediate context. Readers can consult the original report for the full details and any subsequent official updates.';
const captureTime = () => Date.now();
function data(at = captureTime()) {
  const sections = ['philippines', 'world', 'valorant', 'dota', 'crypto'];
  const candidates = sections.map((section) => ({ id: `source_${section}`, section, title: 'A synthetic public update', excerpt: 'A synthetic source explains the public update without any confidential information.', sourceName: 'Synthetic Publisher', sourceId: `publisher-${section}`,
    url: `https://example.test/${section}`, publishedAt: new Date(at - 60000).toISOString(), latestKnown: false }));
  const sources = candidates.map((item) => ({ id: item.sourceId, name: item.sourceName, status: 'ready', fetchedAt: new Date(at).toISOString(), count: 1 }));
  const market = { status: 'ready', fetchedAt: new Date(at).toISOString(), items: [['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL']].map(([id, symbol]) => ({ id, symbol, usd: 100, php: 5500, change24h: 1.25, updatedAt: new Date(at - 1000).toISOString() })) };
  return { candidates, sources, market };
}
const articleUrl = (url, sourceId) => /^publisher-(?:philippines|world|valorant|dota|crypto)$/.test(sourceId) && /^https:\/\/example\.test\/(?:philippines|world|valorant|dota|crypto)$/.test(url);
const responseFor = (candidates) => ({ stories: candidates.map((item) => ({ id: item.id, title: 'A synthetic public update', summary: SUMMARY })) });
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-newspaper-test-')), store = createStore(directory), source = data();
  const job = { id: 'newspaper-job', type: NEWSPAPER_JOB_TYPE, agentId: 'newspaper-agent', status: 'running', payload: { date: newspaperDate(), force: false } };
  store.put('agents', { id: job.agentId }); store.put('jobs', job);
  const calls = [], client = { async connect() { calls.push('connect'); }, async close() { calls.push('close'); }, async runTurn(options) { calls.push(options); return { threadId: 'synthetic-thread', messages: [JSON.stringify(responseFor(source.candidates))] }; } };
  const renderPdf = async ({ filename }) => { await fs.writeFile(filename, `%PDF-1.7\n${'synthetic unit-test PDF '.repeat(60)}\n%%EOF`, { flag: 'wx', mode: 0o600 }); return { pages: 2, width: 595.28, height: 841.89 }; };
  const run = (overrides = {}) => runNewspaper({ store, dataDir: directory, job, makeCodex: (options) => { calls.push({ constructor: options }); return client; }, collectSources: async () => source,
    inspectCapability: async () => ({ authenticated: true, supported: true }), sourceModule: { isNewspaperArticleUrl: articleUrl }, renderPdf, ...overrides });
  t.after(async () => { store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  return { directory, store, source, job, client, calls, run, renderPdf };
}
async function serve(t, app) {
  const server = await new Promise((resolve) => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('newspaper date uses Manila and rejects historical/future generation', () => {
  const at = new Date('2026-11-06T18:00:00Z');
  assert.equal(newspaperDate(undefined, at), '2026-11-07');
  assert.throws(() => newspaperDate('2026-11-06', at)); assert.throws(() => newspaperDate('2026-11-08', at));
});
test('newspaper queue deduplicates across database connections and reuses saved editions offline', async (t) => {
  const f = await fixture(t); f.store.remove('jobs', f.job.id); f.store.put('workers', { id: 'worker', status: 'online', lastHeartbeatAt: new Date().toISOString() });
  let counter = 0;
  const enqueue = (type, fields) => f.store.put('jobs', { id: `job-${++counter}`, type, ...fields, status: 'queued' });
  const first = queueNewspaper({ store: f.store, enqueue });
  const other = createStore(f.directory); t.after(() => other.close());
  const second = queueNewspaper({ store: other, enqueue: () => { throw new Error('Must deduplicate.'); } });
  assert.equal(first.job.id, second.job.id); assert.equal(counter, 1);
  f.store.update('jobs', first.job.id, { status: 'completed' }); f.store.update('workers', 'worker', { status: 'offline' });
  const edition = { id: 'edition-synthetic', date: newspaperDate(), generatedAt: new Date().toISOString(), status: 'partial' };
  f.store.put('settings', { id: NEWSPAPER_EDITION_PREFIX + edition.id, edition });
  assert.equal(queueNewspaper({ store: f.store, enqueue }).edition.id, edition.id);
  assert.throws(() => queueNewspaper({ store: f.store, enqueue, force: true }), /Start the local Mari worker/);
  assert.throws(() => queueNewspaper({ store: f.store, enqueue, force: 'true' }), /explicit boolean/);
});
test('newspaper routes archive safely and cancellation cannot alter another workflow', async (t) => {
  const f = await fixture(t), app = express(); app.use(express.json());
  app.use('/newspaper', createNewspaperRouter({ store: f.store, enqueue: (type, fields) => f.store.put('jobs', { id: 'queued', type, ...fields, status: 'queued' }) }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message }));
  const base = await serve(t, app), post = (route, body) => fetch(base + route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  f.store.put('jobs', { id: 'service-job', type: 'service.stop', status: 'queued' });
  assert.equal((await post('/newspaper/cancel', { jobId: 'service-job' })).status, 404); assert.equal(f.store.get('jobs', 'service-job').status, 'queued');
  assert.equal((await post('/newspaper/cancel', { jobId: f.job.id })).status, 200); assert.equal(f.store.get('jobs', f.job.id).cancelRequested, true);
  assert.equal((await post('/newspaper/generate', { date: '2020-01-01' })).status, 400);
  const state = await (await fetch(base + '/newspaper')).json(); assert.equal(state.schedule.status, 'pending'); assert.equal(state.settings.pages, 2);
  f.store.put('settings', { id: 'newspaper:schedule', status: 'active', automationId: 'real-registered-id' });
  assert.equal((await (await fetch(base + '/newspaper')).json()).schedule.status, 'active');
  assert.equal((await fetch(base + '/newspaper?editionId=unknown')).status, 404);
});
test('source normalization rejects future dates and hostile URLs, and never relabels old updates as current', () => {
  const at = captureTime(), source = data(at);
  const normal = normalizeNewspaperCandidates(source.candidates, { isArticleUrl: articleUrl, at }); assert.equal(normal.length, 5);
  const future = structuredClone(source.candidates); future[0].publishedAt = new Date(at + 3600000).toISOString();
  assert.throws(() => normalizeNewspaperCandidates(future, { isArticleUrl: articleUrl, at }), /publication date/);
  const hostile = structuredClone(source.candidates); hostile[0].url = 'file:///etc/passwd'; assert.throws(() => normalizeNewspaperCandidates(hostile, { isArticleUrl: articleUrl, at }), /URL/);
  const old = structuredClone(source.candidates); old[0].publishedAt = new Date(at - 2 * 86400000).toISOString(); old[3].publishedAt = new Date(at - 40 * 86400000).toISOString();
  const filtered = normalizeNewspaperCandidates(old, { isArticleUrl: articleUrl, at }); assert.equal(filtered.some((item) => item.section === 'philippines'), false); assert.equal(filtered.find((item) => item.section === 'dota').latestKnown, true);
});
test('model normalization requires exact known IDs, coverage, lengths and sourced numeric tokens', () => {
  const candidates = normalizeNewspaperCandidates(data().candidates, { isArticleUrl: articleUrl });
  const valid = responseFor(candidates); assert.equal(normalizeNewspaperSummary(valid, candidates).length, 5);
  for (const change of [
    (x) => { x.stories[0].id = 'invented'; }, (x) => { x.stories[0].url = 'https://evil.test'; },
    (x) => { x.stories[0].summary += ' 999 people.'; }, (x) => { x.stories[0].summary = 'Too short.'; },
    (x) => { x.stories[0].title = '<script>bad</script>'; }, (x) => { x.stories.pop(); },
  ]) { const broken = structuredClone(valid); change(broken); assert.throws(() => normalizeNewspaperSummary(broken, candidates)); }
});
test('market normalization never fabricates missing, future or nonnumeric prices', () => {
  const source = data(); assert.equal(normalizeNewspaperMarket(source.market).items.length, 3);
  for (const update of [(x) => { x.items.pop(); }, (x) => { x.items[0].usd = NaN; }, (x) => { x.items[0].updatedAt = '2099-01-01T00:00:00Z'; }, (x) => { x.items[0].updatedAt = new Date(Date.now() - 3600000).toISOString(); }]) {
    const market = structuredClone(source.market); update(market); const normalized = normalizeNewspaperMarket(market); assert.equal(normalized.status, 'unavailable'); assert.deepEqual(normalized.items, []);
  }
});
test('unknown optional daily change preserves fresh direct prices without becoming zero', () => {
  const source = data(); source.market.items[0].change24h = null;
  const normalized = normalizeNewspaperMarket(source.market);
  assert.equal(normalized.status, 'ready'); assert.equal(normalized.items.length, 3);
  assert.equal(normalized.items[0].change24h, null); assert.equal(normalized.items[0].usd, source.market.items[0].usd);
  source.market.items[0].change24h = '0'; assert.equal(normalizeNewspaperMarket(source.market).status, 'unavailable');
});
test('the 07:00 Manila edition fetches against its actual instant instead of UTC edition midnight', async (t) => {
  const f = await fixture(t), instant = Date.parse('2026-11-06T23:00:00Z'), source = data(instant);
  f.job.payload.date = '2026-11-07';
  let suppliedDate;
  f.client.runTurn = async () => ({ threadId: 'synthetic-thread', messages: [JSON.stringify(responseFor(source.candidates))] });
  const result = await f.run({ at: () => instant, collectSources: async ({ date }) => { suppliedDate = date; return source; } });
  assert.equal(suppliedDate, '2026-11-06T23:00:00.000Z');
  assert.equal(result.edition.date, '2026-11-07'); assert.equal(result.edition.market.status, 'ready');
});
test('the sourced Dota 2 publisher name is allowed in a faithful generated story', () => {
  const source = data(); source.candidates[3].sourceName = 'Dota 2 / Valve';
  const candidates = normalizeNewspaperCandidates(source.candidates, { isArticleUrl: articleUrl });
  const response = responseFor(candidates); response.stories[3].title = 'Dota 2 shares an official update';
  assert.equal(normalizeNewspaperSummary(response, candidates)[3].title, 'Dota 2 shares an official update');
});
test('real worker contract uses restricted native turn, publishes a private edition/PDF and reuses it', async (t) => {
  const f = await fixture(t), result = await f.run();
  assert.equal(result.edition.status, 'ready'); assert.equal(result.edition.stories.length, 5); assert.equal(result.edition.jobId, f.job.id);
  assert.equal(result.edition.pdfArtifact.mime, 'application/pdf'); assert.equal(result.edition.pdfArtifact.path, undefined); assert.ok(result.edition.pdfArtifact.url.startsWith('/api/artifacts/'));
  assert.equal(f.store.get('jobs', f.job.id).editionId, result.edition.id); assert.equal(newspaperEditions(f.store).length, 1);
  const policy = f.calls.find((entry) => entry.constructor?.executionPolicy).constructor.executionPolicy; assert.deepEqual(policy.readRoots, []); assert.ok(policy.writableRoot.startsWith(path.join(f.directory, 'artifacts') + path.sep));
  const turn = f.calls.find((entry) => entry.input); assert.equal(turn.writableRoots[0], turn.cwd); assert.match(turn.developerInstructions, /untrusted reference data/); assert.ok(turn.outputSchema);
  const before = f.calls.length, reused = await f.run(); assert.equal(reused.reused, true); assert.equal(f.calls.length, before);
});
test('partial feeds and unavailable market preserve transparent edition status', async (t) => {
  const f = await fixture(t); f.source.sources[0].status = 'error'; f.source.market = { status: 'unavailable', fetchedAt: new Date().toISOString(), items: [] };
  const result = await f.run(); assert.equal(result.edition.status, 'partial'); assert.equal(result.edition.market.items.length, 0); assert.equal(result.edition.sources[0].status, 'error');
});
test('cancelled synthesis/PDF publication and invalid PDF keep previous editions unchanged', async (t) => {
  const f = await fixture(t); const previous = { id: 'previous-edition', date: '2026-01-01', generatedAt: '2026-01-01T00:00:00Z', status: 'ready' };
  f.store.put('settings', { id: NEWSPAPER_EDITION_PREFIX + previous.id, edition: previous });
  await assert.rejects(f.run({ renderPdf: async (args) => { const result = await f.renderPdf(args); f.store.update('jobs', f.job.id, { cancelRequested: true }); return result; } }), /cancelled/);
  assert.equal(newspaperEditions(f.store).length, 1); assert.equal(f.store.list('artifacts').length, 0);
  f.store.update('jobs', f.job.id, { cancelRequested: false });
  await assert.rejects(f.run({ renderPdf: async ({ filename }) => { await fs.writeFile(filename, 'not a PDF'); return { pages: 2, width: 595.28, height: 841.89 }; } }), /PDF/);
  assert.equal(newspaperEditions(f.store).length, 1); assert.equal(f.store.list('artifacts').length, 0);
});
test('an unavailable native subscription or empty news never erases a useful archive', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.run({ inspectCapability: async () => ({ authenticated: false, supported: true }) }), /ChatGPT-authenticated/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(f.run({ collectSources: async () => ({ ...f.source, candidates: [] }) }), /No usable news items/);
  assert.equal(f.store.list('artifacts').length, 0);
});
