import test from 'node:test';
import assert from 'node:assert/strict';
import { collectNewspaperSources, NEWSPAPER_SOURCES, isNewspaperArticleUrl, newspaperPlainText } from '../server/newspaper-sources.js';

const DATE = new Date('2026-11-06T23:00:00.000Z');
const epoch = Math.floor(DATE.getTime() / 1000);
const dateAgo = (hours) => new Date(DATE.getTime() - hours * 3_600_000).toUTCString();
const gmaUrl = (id = 101) => `https://www.gmanetwork.com/news/topstories/nation/${id}/sample-story/story/`;
const escapeXml = (value) => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const item = ({ id = 101, title = 'Local story', url = gmaUrl(id), date = dateAgo(2), excerpt = 'A short sourced account.' } = {}) => `<item><title>${escapeXml(title)}</title><link>${escapeXml(url)}</link><guid isPermaLink="false">${id}</guid><pubDate>${date}</pubDate><description><![CDATA[${excerpt}]]></description></item>`;
const rss = (items = '') => `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>Publisher</title>${items}</channel></rss>`;
const riot = (items = []) => `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { page: { blades: [{ type: 'articleCardGrid', items }] } } } })}</script></html>`;
const riotItem = (overrides = {}) => ({ title: 'Official game update', publishedAt: new Date(DATE.getTime() - 4 * 3_600_000).toISOString(), action: { payload: { url: '/en-us/news/game-updates/official-update/' } }, ...overrides });
const steam = (items = []) => JSON.stringify({ appnews: { appid: 570, newsitems: items } });
const steamItem = (overrides = {}) => ({ appid: 570, title: 'Official Dota announcement', gid: '1846018067924633', url: 'https://steamstore-a.akamaihd.net/news/externalpost/steam_community_announcements/1846018067924633', feedname: 'steam_community_announcements', date: epoch - 48 * 3600, contents: '[b]Official[/b] brief.', ...overrides });
const market = (overrides = {}) => JSON.stringify(Object.fromEntries(['bitcoin', 'ethereum', 'solana'].map((id, i) => [id, { usd: 100 + i, php: 6000 + i, usd_24h_change: -1.25, last_updated_at: epoch - 30, ...overrides }])));

function responses(overrides = {}) {
  const bodies = {
    'gma-nation': rss(item({ date: 'Sat, 07 Nov 2026 05:00:00 +0800' })),
    'gma-regions': rss(item({ id: 102, title: 'Regional story' })),
    'gma-world': rss(item({ id: 103, title: 'World story', url: 'https://www.gmanetwork.com/news/topstories/world/103/world-story/story/' })),
    valorant: riot([riotItem()]),
    dota2: steam([steamItem()]),
    'ethereum-foundation': rss(item({ id: 201, title: 'Protocol update', url: 'https://blog.ethereum.org/en/2026/11/06/protocol-update/', date: dateAgo(24) })),
    'bitcoin-core': rss(item({ id: 202, title: 'Bitcoin Core 29.5 released', url: 'https://bitcoincore.org/en/2026/10/28/release-29.5/', date: 'Wed, 28 Oct 2026 00:00:00 -0400' })),
    coingecko: market(), ...overrides,
  };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const source = NEWSPAPER_SOURCES.find((entry) => entry.url === url);
    const id = source?.id ?? (url.startsWith('https://api.coingecko.com/api/v3/simple/price?') ? 'coingecko' : null);
    assert.ok(id, `Unexpected fetch URL: ${url}`);
    const value = bodies[id];
    if (typeof value === 'function') return value(url, options);
    if (value instanceof Error) throw value;
    const type = source?.kind === 'riot' ? 'text/html' : source?.kind === 'rss' ? 'application/rss+xml' : 'application/json';
    return new Response(value, { headers: { 'Content-Type': type } });
  };
  return { calls, fetchImpl };
}

test('fixed sources yield dated, attributed, bounded records and optional direct market data', async () => {
  const fake = responses();
  const result = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  assert.equal(fake.calls.length, 8);
  assert.equal(result.sources.length, 7);
  assert.ok(result.sources.every((source) => source.status === 'ready'));
  assert.equal(result.candidates.length, 7);
  assert.equal(result.candidates.find((row) => row.sourceId === 'gma-nation').publishedAt, '2026-11-06T21:00:00.000Z');
  assert.equal(result.candidates.find((row) => row.sourceId === 'bitcoin-core').latestKnown, true);
  assert.equal(result.candidates.find((row) => row.sourceId === 'valorant').excerpt, '');
  assert.ok(result.candidates.every((row) => /^[a-z0-9_-]{1,100}$/i.test(row.id) && isNewspaperArticleUrl(row.url, row.sourceId)));
  assert.equal(result.market.status, 'ready');
  assert.deepEqual(result.market.items.map((row) => row.symbol), ['BTC', 'ETH', 'SOL']);
  assert.equal(result.market.items[0].change24h, -1.25);
  assert.equal(result.market.items[0].updatedAt, '2026-11-06T22:59:30.000Z');
  for (const { options } of fake.calls) {
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.method, 'GET');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.headers.Authorization, undefined);
  }
});

test('rejects expired, undated, ambiguous and far-future stories while keeping explicitly dated latest updates', async () => {
  const fake = responses({
    'gma-nation': rss([
      item({ id: 1, date: dateAgo(37) }), item({ id: 2, date: '' }), item({ id: 3, date: 'not a date' }),
      item({ id: 4, date: new Date(DATE.getTime() + 6 * 60_000).toISOString() }), item({ id: 5, date: '2026-11-06 22:00:00' }),
      item({ id: 6, date: new Date(DATE.getTime() + 4 * 60_000).toISOString() }),
    ].join('')),
    dota2: steam([steamItem({ date: epoch - 91 * 86400 })]),
    'ethereum-foundation': rss(item({ url: 'https://blog.ethereum.org/en/2026/08/10/older-update/', date: dateAgo(89 * 24) })),
  });
  const result = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  assert.deepEqual(result.candidates.filter((row) => row.sourceId === 'gma-nation').map((row) => row.url), [gmaUrl(6)]);
  assert.equal(result.sources.find((row) => row.id === 'dota2').status, 'empty');
  assert.equal(result.candidates.find((row) => row.sourceId === 'ethereum-foundation').latestKnown, true);
});

test('article URLs are validated against source-specific HTTPS host and path rules', () => {
  for (const bad of ['http://www.gmanetwork.com/news/a/story/', 'https://www.gmanetwork.com.attacker.test/news/a/story/', 'https://attacker.test/news/a/story/', 'https://user@www.gmanetwork.com/news/a/story/', 'https://www.gmanetwork.com:444/news/a/story/', 'https://www.gmanetwork.com/news/%2fadmin/story/', 'https://127.0.0.1/news/a/story/']) assert.equal(isNewspaperArticleUrl(bad, 'gma-nation'), false, bad);
  assert.equal(isNewspaperArticleUrl(gmaUrl(), 'bitcoin-core'), false);
  assert.equal(isNewspaperArticleUrl('https://store.steampowered.com/news/app/730/view/123', 'dota2'), false);
  assert.equal(isNewspaperArticleUrl('https://steamstore-a.akamaihd.net/news/externalpost/other_feed/123', 'dota2'), false);
  assert.equal(isNewspaperArticleUrl('https://playvalorant.com/en-us/news/game-updates/update/', 'valorant'), true);
  assert.equal(isNewspaperArticleUrl('https://bitcoincore.org/en/2026/10/28/release-29.5/', 'bitcoin-core'), true);
});

test('plain text decoding strips active markup, entities, BBCode and direction/control characters', () => {
  assert.equal(newspaperPlainText('&lt;script&gt;ignore this&lt;/script&gt;<p>A &amp; B &#x2014; update</p>\u202e\u0000 [b]today[/b]'), 'A & B — update today');
  assert.equal(newspaperPlainText('x'.repeat(2000)).length, 1000);
});

test('partial failures and hostile XML are contained without full article requests or credential leaks', async () => {
  const fake = responses({
    'gma-nation': rss('<item>'),
    'gma-regions': '<!DOCTYPE rss [<!ENTITY attack SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&attack;</title></item></channel></rss>',
    valorant: '<html>Challenge</html>',
    dota2: new Error('sensitive local route 192.168.1.1 and secret'),
    coingecko: () => new Response('rate limited', { status: 429 }),
  });
  const result = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  assert.equal(result.sources.filter((source) => source.status === 'error').length, 4);
  assert.equal(result.sources.find((source) => source.id === 'gma-world').status, 'ready');
  assert.equal(result.market.status, 'unavailable');
  assert.deepEqual(result.market.items, []);
  assert.doesNotMatch(JSON.stringify(result), /sensitive|192\.168|secret|etc\/passwd/);
  assert.equal(fake.calls.length, 8);
});

test('rejects redirects, unexpected content types and oversized bodies including streamed bodies', async () => {
  const redirected = new Response(rss());
  Object.defineProperty(redirected, 'redirected', { value: true });
  const encoded = new TextEncoder();
  const fake = responses({
    'gma-nation': () => redirected,
    'gma-regions': () => new Response(rss(), { headers: { 'Content-Type': 'text/html' } }),
    'gma-world': () => new Response(rss(), { headers: { 'Content-Type': 'application/xml', 'Content-Length': String(2 ** 21) } }),
    'bitcoin-core': () => new Response(new ReadableStream({ start(controller) { controller.enqueue(encoded.encode('x'.repeat(600_000))); controller.enqueue(encoded.encode('x'.repeat(600_000))); controller.close(); } }), { headers: { 'Content-Type': 'application/rss+xml' } }),
  });
  const result = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  for (const id of ['gma-nation', 'gma-regions', 'gma-world', 'bitcoin-core']) assert.equal(result.sources.find((source) => source.id === id).status, 'error');
  assert.equal(result.sources.find((source) => source.id === 'dota2').status, 'ready');
});

test('only official Steam app570 announcements survive validation', async () => {
  const fake = responses({ dota2: steam([
    steamItem({ appid: 730 }), steamItem({ feedname: 'pcgamer' }), steamItem({ url: 'https://attacker.test/123' }), steamItem({ title: 'Valid official item' }),
  ]) });
  const result = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  assert.deepEqual(result.candidates.filter((row) => row.section === 'dota').map((row) => row.title), ['Valid official item']);
});

test('deduplicates canonical links, limits sections, and keeps one crypto item per protocol publisher', async () => {
  const fake = responses({
    'gma-nation': rss(Array.from({ length: 12 }, (_, i) => item({ id: i + 10, date: dateAgo(i + 1) })).join('')),
    'gma-regions': rss(item({ id: 10, title: 'Duplicate coverage', url: `${gmaUrl(10)}?utm_source=rss#part` })),
    'gma-world': rss(Array.from({ length: 12 }, (_, i) => item({ id: i + 40 })).join('')),
    'ethereum-foundation': rss(Array.from({ length: 10 }, (_, i) => item({ url: `https://blog.ethereum.org/en/2026/11/06/protocol-${i}/` })).join('')),
  });
  const first = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  const second = await collectNewspaperSources({ date: DATE, fetchImpl: fake.fetchImpl });
  assert.equal(first.candidates.length, 10);
  assert.equal(first.candidates.filter((row) => row.section === 'philippines').length, 3);
  assert.equal(first.candidates.filter((row) => row.section === 'world').length, 3);
  assert.equal(new Set(first.candidates.map((row) => row.url)).size, 10);
  assert.equal(first.candidates.filter((row) => row.sourceId === 'ethereum-foundation').length, 1);
  assert.deepEqual(first.candidates.map((row) => row.id), second.candidates.map((row) => row.id));
});

test('missing or stale market fields remain unavailable and null change never becomes zero', async () => {
  for (const fields of [{ last_updated_at: epoch - 31 * 60 }, { last_updated_at: epoch + 6 * 60 }, { usd: -1 }, { php: '6000' }, { last_updated_at: undefined }]) {
    const result = await collectNewspaperSources({ date: DATE, fetchImpl: responses({ coingecko: market(fields) }).fetchImpl });
    assert.equal(result.market.status, 'unavailable');
    assert.deepEqual(result.market.items, []);
  }
  const result = await collectNewspaperSources({ date: DATE, fetchImpl: responses({ coingecko: market({ usd_24h_change: null }) }).fetchImpl });
  assert.equal(result.market.items[0].change24h, null);
});

test('caller cancellation aborts collection even when a fetch implementation ignores signals', async () => {
  const controller = new AbortController();
  let calls = 0;
  const pending = collectNewspaperSources({ date: DATE, signal: controller.signal, fetchImpl: () => { calls += 1; return new Promise(() => {}); } });
  controller.abort(new DOMException('Cancelled by user', 'AbortError'));
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(calls, 4);
  await assert.rejects(collectNewspaperSources({ date: 'invalid', fetchImpl: responses().fetchImpl }), TypeError);
});
