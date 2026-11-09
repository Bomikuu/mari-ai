import { createHash } from 'node:crypto';
import { XMLParser, XMLValidator } from 'fast-xml-parser';

const HOUR = 60 * 60 * 1000;
const NEWS_AGE = 36 * HOUR;
const UPDATE_AGE = 90 * 24 * HOUR;
const FUTURE_TOLERANCE = 5 * 60 * 1000;
const PRICE_AGE = 30 * 60 * 1000;
const SOURCE_TIMEOUT = 10_000;
const TOTAL_TIMEOUT = 25_000;
const RSS_LIMIT = 1024 * 1024;

export const NEWSPAPER_SOURCES = Object.freeze([
  { id: 'gma-nation', name: 'GMA News Online (Nation)', section: 'philippines', kind: 'rss', url: 'https://data.gmanetwork.com/gno/rss/news/nation/feed.xml' },
  { id: 'gma-regions', name: 'GMA News Online (Regions)', section: 'philippines', kind: 'rss', url: 'https://data.gmanetwork.com/gno/rss/news/regions/feed.xml' },
  { id: 'gma-world', name: 'GMA News Online (World)', section: 'world', kind: 'rss', url: 'https://data.gmanetwork.com/gno/rss/news/world/feed.xml' },
  { id: 'valorant', name: 'VALORANT', section: 'valorant', kind: 'riot', url: 'https://playvalorant.com/en-us/news/' },
  { id: 'dota2', name: 'Dota 2 / Valve', section: 'dota', kind: 'steam', url: 'https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=12&maxlength=1000&feeds=steam_community_announcements' },
  { id: 'ethereum-foundation', name: 'Ethereum Foundation', section: 'crypto', kind: 'rss', url: 'https://blog.ethereum.org/en/feed.xml' },
  { id: 'bitcoin-core', name: 'Bitcoin Core', section: 'crypto', kind: 'rss', url: 'https://bitcoincore.org/en/rss.xml' },
].map((source) => Object.freeze(source)));

const MARKET_SOURCE = Object.freeze({
  id: 'coingecko', name: 'CoinGecko', kind: 'market',
  url: 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd,php&include_24hr_change=true&include_last_updated_at=true',
});

const ENTITIES = Object.freeze({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', copy: '©' });
function scalar(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (value && typeof value === 'object' && typeof value['#text'] === 'string') return value['#text'];
  return '';
}

export function newspaperPlainText(value, limit = 1000) {
  let text = scalar(value).slice(0, 50_000);
  // Decode twice so encoded markup cannot survive as visible HTML in downstream views.
  for (let pass = 0; pass < 2; pass += 1) {
    text = text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z\d]+);/gi, (entity, code) => {
      if (code.startsWith('#')) {
        const number = code[1]?.toLowerCase() === 'x' ? Number.parseInt(code.slice(2), 16) : Number.parseInt(code.slice(1), 10);
        return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff) ? String.fromCodePoint(number) : ' ';
      }
      return ENTITIES[code.toLowerCase()] ?? entity;
    });
    text = text.replace(/<(script|style|iframe|object)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, ' ')
      .replace(/<!--[^]*?-->/g, ' ').replace(/<[^>]*>/g, ' ');
  }
  return text.replace(/\[(?:\/?(?:url|img|h\d|b|i|u|list|olist|\*|quote|code))(?:=[^\]]*)?\]/gi, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit).trim();
}

function canonicalArticleUrl(value, sourceId) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (/%(?:2f|5c|2e)/i.test(url.pathname) || url.pathname.includes('\\')) return null;
  const host = url.hostname;
  const path = url.pathname;
  let allowed = false;
  if (sourceId?.startsWith('gma-')) allowed = ['gma-nation', 'gma-regions', 'gma-world'].includes(sourceId) && host === 'www.gmanetwork.com' && /^\/news\/[a-z0-9/_-]+\/story\/?$/i.test(path);
  if (sourceId === 'valorant') allowed = host === 'playvalorant.com' && /^\/en-us\/news\/[a-z0-9/_-]+\/?$/i.test(path);
  if (sourceId === 'dota2') allowed = (host === 'store.steampowered.com' && /^\/news\/app\/570\/view\/\d+\/?$/.test(path))
    || (host === 'steamstore-a.akamaihd.net' && /^\/news\/externalpost\/steam_community_announcements\/\d+\/?$/.test(path))
    || (host === 'www.dota2.com' && /^\/(?:newsentry\/\d+|news\/[a-z0-9/_-]+)\/?$/i.test(path));
  if (sourceId === 'ethereum-foundation') allowed = host === 'blog.ethereum.org' && /^\/(?:en\/)?\d{4}\/\d{2}\/\d{2}\/[a-z0-9/_-]+\/?$/i.test(path);
  if (sourceId === 'bitcoin-core') allowed = host === 'bitcoincore.org' && /^\/en\/\d{4}\/\d{2}\/\d{2}\/[a-z0-9/._-]+\/?$/i.test(path);
  if (sourceId === 'x-cached') allowed = host === 'x.com' && /^\/[a-z0-9_]{1,15}\/status\/\d{1,25}$/.test(path);
  if (!allowed) return null;
  url.hash = '';
  url.search = '';
  return url.href;
}

export function isNewspaperArticleUrl(value, sourceId) {
  return canonicalArticleUrl(value, sourceId) !== null;
}

function publicationDate(value, now, epochSeconds = false) {
  if (epochSeconds && (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)) return null;
  if (!epochSeconds && (typeof value !== 'string' || !value.trim() || !/(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)\s*$/i.test(value))) return null;
  const timestamp = epochSeconds ? value * 1000 : Date.parse(value);
  if (!Number.isFinite(timestamp) || timestamp > now + FUTURE_TOLERANCE) return null;
  return timestamp;
}

function candidate(source, data, now) {
  const title = newspaperPlainText(data.title, 220);
  const url = canonicalArticleUrl(data.url, source.id);
  const timestamp = publicationDate(data.date, now, data.epochSeconds);
  const news = ['philippines', 'world'].includes(source.section);
  if (!title || !url || timestamp === null || timestamp < now - (news ? NEWS_AGE : UPDATE_AGE)) return null;
  return {
    id: `${source.id}_${createHash('sha256').update(`${source.id}\0${url}`).digest('hex').slice(0, 24)}`,
    section: source.section, title, excerpt: newspaperPlainText(data.excerpt),
    sourceName: source.name, sourceId: source.id, url,
    publishedAt: new Date(timestamp).toISOString(), latestKnown: !news && timestamp < now - NEWS_AGE,
  };
}

function parseRss(source, body, now) {
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(body)) throw new Error('Feed declarations are not supported.');
  if (XMLValidator.validate(body) !== true) throw new Error('Invalid RSS XML.');
  const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false, parseAttributeValue: false, processEntities: false, trimValues: true, ignoreDeclaration: true, ignorePiTags: true });
  const parsed = parser.parse(body);
  if (!parsed.rss?.channel || typeof parsed.rss.channel !== 'object') throw new Error('Expected an RSS news feed.');
  const entries = parsed.rss.channel.item;
  const items = entries === undefined ? [] : Array.isArray(entries) ? entries : [entries];
  return items.slice(0, 1000).map((item) => candidate(source, {
    title: item.title, url: scalar(item.link), date: scalar(item.pubDate), excerpt: item.description,
  }, now)).filter(Boolean);
}

function parseRiot(source, body, now) {
  const match = body.match(/<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i);
  if (!match) throw new Error('Official news metadata was not found.');
  const parsed = JSON.parse(match[1]);
  const blades = parsed.props?.pageProps?.page?.blades;
  const grid = Array.isArray(blades) ? blades.find((blade) => blade?.type === 'articleCardGrid') : null;
  if (!Array.isArray(grid?.items)) throw new Error('Official news metadata changed format.');
  return grid.items.slice(0, 300).filter((item) => item && typeof item === 'object')
    .map((item) => {
      let url;
      try { url = new URL(scalar(item.action?.payload?.url), 'https://playvalorant.com').href; } catch { return null; }
      return candidate(source, { title: item.title, url, date: item.publishedAt ?? item.analytics?.publishDate, excerpt: '' }, now);
    }).filter(Boolean);
}

function parseSteam(source, body, now) {
  const parsed = JSON.parse(body);
  if (parsed.appnews?.appid !== 570 || !Array.isArray(parsed.appnews.newsitems)) throw new Error('Unexpected Steam news response.');
  return parsed.appnews.newsitems.slice(0, 20)
    .filter((item) => item?.appid === 570 && item.feedname === 'steam_community_announcements')
    .map((item) => candidate(source, { title: item.title, url: item.url, date: item.date, epochSeconds: true, excerpt: item.contents }, now)).filter(Boolean);
}

function parseMarket(body, now, fetchedAt) {
  const parsed = JSON.parse(body);
  const coins = [['bitcoin', 'BTC'], ['ethereum', 'ETH'], ['solana', 'SOL']];
  const items = coins.flatMap(([id, symbol]) => {
    const row = parsed?.[id];
    const updated = publicationDate(row?.last_updated_at, now, true);
    if (!row || typeof row.usd !== 'number' || !Number.isFinite(row.usd) || row.usd <= 0 || typeof row.php !== 'number' || !Number.isFinite(row.php) || row.php <= 0 || updated === null || updated < now - PRICE_AGE) return [];
    return [{ id, symbol, usd: row.usd, php: row.php, change24h: typeof row.usd_24h_change === 'number' && Number.isFinite(row.usd_24h_change) ? row.usd_24h_change : null, updatedAt: new Date(updated).toISOString() }];
  });
  return items.length ? { status: 'ready', fetchedAt, items, ...(items.length < 3 ? { error: 'Some market prices are unavailable or stale.' } : {}) }
    : { status: 'unavailable', fetchedAt, items: [], error: 'Market prices are unavailable or stale.' };
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const aborted = () => reject(signal.reason);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
  });
}

async function readBounded(response, limit, signal) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > limit) { void response.body?.cancel().catch(() => {}); throw new Error('Source response exceeded its size limit.'); }
  if (!response.body?.getReader) throw new Error('Source returned no readable body.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await abortable(reader.read(), signal);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Source response exceeded its size limit.');
      chunks.push(value);
    }
  } catch (error) {
    void reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
}

async function fetchBody(source, fetchImpl, parentSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Source timed out.', 'TimeoutError')), SOURCE_TIMEOUT);
  const signal = parentSignal ? AbortSignal.any([parentSignal, controller.signal]) : controller.signal;
  try {
    signal.throwIfAborted();
    const response = await abortable(fetchImpl(source.url, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal,
      headers: { Accept: source.kind === 'riot' ? 'text/html' : source.kind === 'rss' ? 'application/rss+xml, application/xml, text/xml' : 'application/json', 'User-Agent': 'MariDaily/1.0 (private personal feed reader)' },
    }), signal);
    if (response.redirected || (response.url && response.url !== source.url)) throw new Error('Source redirect was rejected.');
    if (response.status !== 200) { void response.body?.cancel().catch(() => {}); throw new Error(`Source returned HTTP ${response.status}.`); }
    const type = (response.headers.get('content-type') ?? '').split(';')[0].toLowerCase().trim();
    const allowedTypes = source.kind === 'riot' ? ['text/html'] : source.kind === 'rss' ? ['application/rss+xml', 'application/xml', 'text/xml'] : ['application/json'];
    if (!allowedTypes.includes(type)) { void response.body?.cancel().catch(() => {}); throw new Error('Source returned an unexpected content type.'); }
    return await readBounded(response, source.kind === 'riot' ? 2 * RSS_LIMIT : RSS_LIMIT, signal);
  } finally { clearTimeout(timeout); }
}

function safeSourceError(error) {
  if (error?.name === 'TimeoutError') return 'Source timed out.';
  if (error?.name === 'AbortError') return 'Source request was cancelled.';
  if (error instanceof SyntaxError) return 'Source data could not be parsed.';
  // Only fixed adapter errors are exposed; fetch failures may contain local/network details.
  const message = String(error?.message ?? '');
  return /^(?:Source (?:returned|response|redirect)|Expected an RSS|Invalid RSS|Feed declarations|Official news metadata|Unexpected Steam)/.test(message) ? message : 'Source could not be reached.';
}

function selectCandidates(rows) {
  const sorted = rows.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const seen = new Set();
  const limits = { philippines: 3, world: 3, valorant: 1, dota: 1, crypto: 2 };
  const counts = {};
  const cryptoSources = new Set();
  return sorted.filter((row) => {
    if (seen.has(row.url) || (counts[row.section] ?? 0) >= limits[row.section]) return false;
    if (row.section === 'crypto' && cryptoSources.has(row.sourceId)) return false;
    seen.add(row.url);
    if (row.section === 'crypto') cryptoSources.add(row.sourceId);
    counts[row.section] = (counts[row.section] ?? 0) + 1;
    return true;
  });
}

export async function collectNewspaperSources({ date, signal, fetchImpl = globalThis.fetch } = {}) {
  const now = date === undefined ? Date.now() : new Date(date).getTime();
  if (!Number.isFinite(now)) throw new TypeError('A valid newspaper generation date is required.');
  if (typeof fetchImpl !== 'function') throw new TypeError('A fetch implementation is required.');
  signal?.throwIfAborted();
  const fetchedAt = new Date(now).toISOString();
  const deadline = new AbortController();
  const timer = setTimeout(() => deadline.abort(new DOMException('Source collection timed out.', 'TimeoutError')), TOTAL_TIMEOUT);
  const collectionSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
  const tasks = [...NEWSPAPER_SOURCES, MARKET_SOURCE];
  const results = new Array(tasks.length);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: 4 }, async () => {
      while (next < tasks.length) {
        const index = next++;
        const source = tasks[index];
        try {
          const body = await fetchBody(source, fetchImpl, collectionSignal);
          if (source.kind === 'market') results[index] = { market: parseMarket(body, now, fetchedAt) };
          else {
            const candidates = source.kind === 'rss' ? parseRss(source, body, now) : source.kind === 'riot' ? parseRiot(source, body, now) : parseSteam(source, body, now);
            results[index] = { candidates, source: { id: source.id, name: source.name, status: candidates.length ? 'ready' : 'empty', fetchedAt, count: candidates.length } };
          }
        } catch (error) {
          const message = safeSourceError(error);
          results[index] = source.kind === 'market' ? { market: { status: 'unavailable', fetchedAt, items: [], error: message } }
            : { candidates: [], source: { id: source.id, name: source.name, status: 'error', fetchedAt, count: 0, error: message } };
        }
      }
    }));
    signal?.throwIfAborted();
    return { candidates: selectCandidates(results.flatMap((result) => result.candidates ?? [])), sources: results.flatMap((result) => result.source ? [result.source] : []), market: results.find((result) => result.market)?.market };
  } finally { clearTimeout(timer); }
}
