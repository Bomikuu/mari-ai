import { ASSETS, INTERVALS } from '../shared/portfolio.js';
import { cleanKnowledgeText } from './knowledge.js';
import tls from 'node:tls';

// Honor certificates already trusted by this computer, including its managed
// network root. Certificate verification remains enabled for every request.
tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);

export const marketError = (message, status = 502, code = 'MARKET_UNAVAILABLE') => Object.assign(new Error(message), { status, code });
const coinIds = { BTC:'bitcoin', ETH:'ethereum', SOL:'solana', XRP:'ripple', ADA:'cardano', DOGE:'dogecoin', AVAX:'avalanche-2', DOT:'polkadot', LINK:'chainlink', LTC:'litecoin' };
export async function boundedJson(url, { fetchImpl = fetch, headers = {}, maxBytes = 600000, timeout = 15000 } = {}) {
  const response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(timeout) });
  if (!response.ok) { await response.body?.cancel(); const error = marketError(response.status === 429 ? 'The provider rate limit was reached. Wait before refreshing.' : `The provider returned HTTP ${response.status}.`, response.status === 429 ? 429 : 502); error.retryAfter = Math.min(3600, Math.max(60, Number(response.headers.get('retry-after')) || 60)); throw error; }
  let bytes = 0; const chunks = [];
  for await (const chunk of response.body) { bytes += chunk.byteLength; if (bytes > maxBytes) throw marketError('The provider response exceeded the bounded size limit.'); chunks.push(chunk); }
  let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw marketError('The provider returned unreadable data.'); }
  return value;
}

export function normalizeCandles(rows, interval, at = Date.now()) {
  if (!Array.isArray(rows) || rows.length > 721) throw marketError('The provider returned invalid candle history.');
  const found = new Map();
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 8) throw marketError('A candle is incomplete.');
    const [time, open, high, low, close, , volume] = row.map(Number);
    if (![time, open, high, low, close, volume].every(Number.isFinite) || !Number.isInteger(time) || time < 0 || time * 1000 > at + 60000 || Math.min(open, high, low, close) <= 0 || volume < 0 || high < Math.max(open, close, low) || low > Math.min(open, close, high)) throw marketError('A candle contains invalid prices or volume.');
    const candle = { time, open, high, low, close, volume, closed: time * 1000 + interval * 60000 <= at };
    if (found.has(time) && JSON.stringify(found.get(time)) !== JSON.stringify(candle)) throw marketError('The provider returned conflicting candles for one timestamp.');
    found.set(time, candle);
  }
  return [...found.values()].sort((a, b) => a.time - b.time).slice(-720);
}

export function createMarketData({ store, fetchImpl = fetch, clock = Date.now } = {}) {
  const inflight = new Map();
  async function cached(key, ttl, load) {
    const saved = store.get('settings', key), age = clock() - Date.parse(saved?.fetchedAt || '');
    if (age >= 0 && age < ttl && saved?.data) return { ...saved.data, fetchedAt: saved.fetchedAt, cached: true, stale: false, error: null };
    const blocked = Date.parse(saved?.retryAt || '') > clock();
    if (blocked) { if (saved.data) return { ...saved.data, fetchedAt: saved.fetchedAt, cached: true, stale: true, error: saved.error, retryAt: saved.retryAt }; throw marketError(saved.error || 'Wait before refreshing this market.', 429); }
    if (inflight.has(key)) return inflight.get(key);
    const work = (async () => {
      try { const data = await load(), fetchedAt = new Date(clock()).toISOString(); store.put('settings', { id: key, data, fetchedAt }); return { ...data, fetchedAt, stale: false, cached: false, error: null }; }
      catch (error) { const message = cleanKnowledgeText(error.code === 'ABORT_ERR' ? 'The market request timed out.' : error.message === 'fetch failed' ? 'Cannot reach the market-data provider. Check the network and certificate trust.' : error.message); const retryAt = new Date(clock() + Math.max(60000, (error.retryAfter || 60) * 1000)).toISOString(); store.put('settings', { ...(saved || {}), id: key, error: message, retryAt }); if (saved?.data) return { ...saved.data, fetchedAt: saved.fetchedAt, cached: true, stale: true, error: message, retryAt }; throw marketError(message, error.status || 502); }
      finally { inflight.delete(key); }
    })(); inflight.set(key, work); return work;
  }
  const pair = asset => { if (!Object.hasOwn(ASSETS, asset)) throw marketError('Choose a supported asset.', 400, 'INVALID_ASSET'); return `${asset === 'BTC' ? 'XBT' : asset === 'DOGE' ? 'XDG' : asset}USD`; };
  const upstream = async (method, query) => { const data = await boundedJson(`https://api.kraken.com/0/public/${method}?${query}`, { fetchImpl }); if (!Array.isArray(data.error) || data.error.length || !data.result) throw marketError('Kraken could not provide this market or interval.'); return data.result; };
  return {
    async market(asset, interval = 60, provider = 'kraken') {
      const symbol = pair(asset); if (!INTERVALS.includes(interval)) throw marketError('Choose a supported candle interval.', 400, 'INVALID_INTERVAL');
      if (provider === 'coingecko') {
        const days = {30:1,240:7,5760:90}[interval]; if (!days) throw marketError('CoinGecko public candles support 30m, 4h and 4-day bars. Choose Kraken for other intervals.',400,'INVALID_INTERVAL');
        return cached(`market:candles:${asset}:${interval}:coingecko`, 60000, async()=>{
          const rows=await boundedJson(`https://api.coingecko.com/api/v3/coins/${coinIds[asset]}/ohlc?vs_currency=usd&days=${days}`,{fetchImpl});
          if(!Array.isArray(rows)||rows.length<2||rows.length>1000)throw marketError('CoinGecko returned no valid OHLC history.');
          const actual=rows.slice(1).map((r,i)=>(Number(r[0])-Number(rows[i][0]))/60000).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b)[0];
          if(actual!==interval)throw marketError(`CoinGecko returned ${actual}m candles instead of the selected interval.`);
          const normalized=normalizeCandles(rows.map(r=>[Number(r[0])/1000-interval*60,...r.slice(1),0,0,0]),interval,clock()).map(c=>({...c,volume:null}));
          return{asset,pair:`${asset}/USD aggregate`,provider:'CoinGecko',quote:'USD',interval,candles:normalized,sourceUrl:`https://www.coingecko.com/en/coins/${coinIds[asset]}`,historyLimit:normalized.length,volumeAvailable:false,historyNote:`${days}-day public lookback. Candle timestamps converted from close time to open time; volume is unavailable.`};
        });
      }
      if(provider!=='kraken'||interval===5760)throw marketError('Choose a supported provider and interval.',400);
      return cached(`market:candles:${asset}:${interval}`, 60000, async () => { const result = await upstream('OHLC', new URLSearchParams({ pair: symbol, interval })); const rows = Object.entries(result).find(([k]) => k !== 'last')?.[1]; const candles = normalizeCandles(rows, interval, clock()); if (!candles.length) throw marketError('No candles are available.'); return { asset, pair: `${asset}/USD`, provider: 'Kraken', quote: 'USD', interval, candles, sourceUrl: 'https://www.kraken.com/prices', historyLimit: 720 }; });
    },
    async ticker(assets, provider = 'kraken') {
      const selected = [...new Set(assets)].sort(); if (!selected.length) return { prices: {}, fetchedAt: null, stale: false }; if (selected.length > 10) throw marketError('Choose at most ten assets.', 400);
      const pairs = selected.map(pair);
      if(provider==='coingecko')return cached(`market:tickers:${selected.join(',')}:coingecko`,60000,async()=>{
        const data=await boundedJson(`https://api.coingecko.com/api/v3/simple/price?${new URLSearchParams({ids:selected.map(a=>coinIds[a]).join(','),vs_currencies:'usd',include_last_updated_at:'true'})}`,{fetchImpl}),prices={};
        for(const asset of selected){const row=data[coinIds[asset]],price=Number(row?.usd);if(!Number.isFinite(price)||price<=0||!Number.isFinite(row.last_updated_at)||row.last_updated_at*1000>clock()+60000||clock()-row.last_updated_at*1000>300000)throw marketError(`No fresh valid aggregate USD quote was returned for ${asset}.`);prices[asset]={price,provider:'CoinGecko',pair:`${asset}/USD aggregate`,fetchedAt:new Date(clock()).toISOString(),sourceUpdatedAt:new Date(row.last_updated_at*1000).toISOString()};}
        return{prices,provider:'CoinGecko',quote:'USD'};
      });
      if(provider!=='kraken')throw marketError('Choose a supported market provider.',400);
      return cached(`market:tickers:${selected.join(',')}`, 60000, async () => { const result = await upstream('Ticker', new URLSearchParams({ pair: pairs.join(',') })); const prices = {};
        for (let i = 0; i < selected.length; i++) { const key = pairs[i], entry = Object.entries(result).find(([k]) => k === key || k === `X${key.slice(0, -3)}ZUSD`)?.[1]; const price = Number(entry?.c?.[0]); if (!Number.isFinite(price) || price <= 0) throw marketError(`No valid ${selected[i]}/USD ticker was returned.`); prices[selected[i]] = { price, provider: 'Kraken', pair: `${selected[i]}/USD`, fetchedAt: new Date(clock()).toISOString() }; }
        return { prices, provider: 'Kraken', quote: 'USD' }; });
    },
  };
}
