import express from 'express';
import { createHash } from 'node:crypto';
import { CodexClient } from '../worker/codex.js';
import { marketSettings, marketTrades, cachedMarketPrices } from './markets.js';
import { xSettings, xPosts } from './x-news.js';
import { portfolioReport, candleIndicators, ASSETS, INTERVALS } from '../shared/portfolio.js';
import { cleanKnowledgeText } from './knowledge.js';
import { now } from './store.js';

const fail = (message, status = 409, code = 'ANALYSIS_UNAVAILABLE') => Object.assign(new Error(message), { status, code });
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const types = { crypto: 'personal.crypto.analyze', x: 'personal.x.summarize' };
let modelsCache, loadingModels;
export async function personalAnalysisModels({ force = false } = {}) {
  if (!force && modelsCache && Date.now() - modelsCache.at < 300000) return modelsCache.value;
  if (loadingModels) return loadingModels;
  loadingModels = (async () => {
    const client = new CodexClient({ store: { event() {}, update() {} }, agentId: 'analysis_configuration' });
    try {
      await client.connect();
      const config = await client.request('config/read', { includeLayers: false });
      const result = await client.request('model/list', { limit: 50 });
      const models = (result.data || []).filter(m => typeof m.model === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(m.model) && !m.hidden).map(m => ({ id: m.model, name: m.displayName || m.model, efforts: (m.supportedReasoningEfforts || []).map(e => e.reasoningEffort), defaultEffort: m.defaultReasoningEffort }));
      if (!models.length) throw fail('Codex returned no available models.');
      const preferred = models.find(m => m.id === 'gpt-6-luna') || models.find(m => m.id === config.config?.model) || models[0];
      const value = { models, defaultModel: preferred.id, defaultEffort: preferred.efforts.includes('low') ? 'low' : preferred.defaultEffort, inheritedModel: config.config?.model || null, inheritedEffort: config.config?.model_reasoning_effort || null, inheritedServiceTier: config.config?.service_tier || 'default', checkedAt: now() };
      modelsCache = { at: Date.now(), value }; return value;
    } finally { await client.close(); }
  })();
  try { return await loadingModels; } finally { loadingModels = null; }
}

export function capturePersonalAnalysis(store, kind, selection) {
  if (kind === 'crypto') {
    const preferences = marketSettings(store);
    if (!preferences.riskProfile) throw fail('Save your goal, horizon, risk tolerance, budget and liquidity needs before personalized analysis.');
    const trades = marketTrades(store), prices = cachedMarketPrices(store);
    const assets = selection.mode === 'portfolio' ? [...new Set([...preferences.watchlist, ...trades.map(t => t.asset)])].sort() : [selection.asset];
    if (!assets.length || assets.some(a => !Object.hasOwn(ASSETS, a))) throw fail('Choose supported assets.');
    if (assets.some(a => !prices[a] || prices[a].stale)) throw fail('Refresh the market prices first; analysis requires fresh quotes.');
    const sourceUrl=provider=>provider==='CoinGecko'?'https://www.coingecko.com/':'https://www.kraken.com/prices';
    const sources = assets.map(a => ({ id: `quote:${a}`, title: `${prices[a].pair} · ${prices[a].provider}`, fetchedAt: prices[a].fetchedAt, url: sourceUrl(prices[a].provider) }));
    const markets = assets.map(asset => { const suffix=preferences.provider==='coingecko'?':coingecko':'';const r = store.get('settings', `market:candles:${asset}:${selection.interval}${suffix}`); const fresh = r?.data && Date.now() - Date.parse(r.fetchedAt) < 120000; if (fresh) sources.push({ id: `candles:${asset}`, title: `${asset}/USD candles · ${r.data.provider} · ${selection.interval}m`, fetchedAt: r.fetchedAt, url: sourceUrl(r.data.provider) }); return { asset, quote: prices[asset], candleEvidence: fresh ? { provider:r.data.provider,interval: selection.interval, latestClosed: r.data.candles.filter(c => c.closed).slice(-3), indicators: candleIndicators(r.data.candles) } : null }; });
    const latest = store.list('settings').filter(r => r.id.startsWith('newspaper:edition:') && r.edition).at(-1)?.edition;
    const news = (latest?.stories || []).filter(s => s.section === 'crypto').slice(0,4).map((s,i) => ({ id: `news:${i}`, title: s.title, summary: s.summary, url: s.url, publishedAt: s.publishedAt, capturedAt: latest.generatedAt, evidence: 'Cached newspaper summary, not independently re-verified for this analysis.' }));
    sources.push(...news.map(n => ({ id: n.id, title: n.title, url: n.url, fetchedAt: n.capturedAt })));
    const value = { kind, selection, profile: preferences.riskProfile, markets, portfolio: portfolioReport(trades, prices), ledgerRevision: hash(trades.map(t => [t.id,t.asset,t.type,t.quantity,t.price,t.fees,t.at])), news, sources };
    return { snapshot: value, fingerprint: hash(value) };
  }
  if (kind !== 'x' || !Array.isArray(selection.postIds) || !selection.postIds.length || selection.postIds.length > 20 || new Set(selection.postIds).size !== selection.postIds.length) throw fail('Choose 1–20 distinct cached posts.');
  const config = xSettings(store), all = xPosts(store);
  const posts = selection.postIds.map(postId => {
    const p = all.find(p => p.postId === postId);
    if (!p || p.unavailable || !config.accounts.some(a => a.enabled && a.handle === p.handle) || Date.now() - Date.parse(p.fetchedAt) > 86400000) throw fail('A selected post is unavailable, expired or outside the enabled accounts. Refresh or change the selection.');
    return { id: p.postId, handle: p.handle, text: p.text.slice(0,1800), url: p.url, publishedAt: p.publishedAt, fetchedAt: p.fetchedAt, evidence: 'An attributed X claim, not verified reporting.' };
  });
  const value = { kind, selection, posts, sources: posts.map(p => ({ id: p.id, title: `@${p.handle}`, url: p.url, fetchedAt: p.fetchedAt })) };
  return { snapshot: value, fingerprint: hash(value) };
}

export function analysisIsStale(store, record) {
  try { return capturePersonalAnalysis(store, record.kind, record.selection).fingerprint !== record.fingerprint; }
  catch { return true; }
}

export function createPersonalAnalysisRouter({ store, enqueue, getWorkers, getModels = personalAnalysisModels }) {
  const router = express.Router();
  router.get('/models', async (req, res) => res.json(await getModels()));
  router.get('/:kind', (req, res) => {
    const type = types[req.params.kind]; if (!type) throw fail('Unknown analysis type.', 404);
    const jobs = store.list('jobs').filter(j => j.type === type), active = jobs.findLast(j => ['queued','running'].includes(j.status));
    const results = store.list('settings').filter(r => r.id.startsWith('analysis:result:') && r.kind === req.params.kind).slice(-20).reverse().map(r => ({ ...r, stale: analysisIsStale(store, r) }));
    const last = active || jobs.at(-1);
    res.json({ job: last ? { id: last.id, type: last.type, status: last.status, cancelRequested: last.cancelRequested, agentId: last.agentId, error: last.error, startedAt: last.startedAt, finishedAt: last.finishedAt, model: last.payload.model, effort: last.payload.effort, serviceTier: last.payload.serviceTier } : null, results });
  });
  router.post('/:kind', async (req, res) => {
    const kind = req.params.kind, type = types[kind], input = req.body;
    if (!type || !input || Object.keys(input).some(k => !['selection','model','effort'].includes(k))) throw fail('Choose an analysis selection, available model and effort.', 400);
    const selection = input.selection;
    if (kind === 'crypto' && (!selection || !['asset','portfolio'].includes(selection.mode) || !Object.hasOwn(ASSETS, selection.asset) || !INTERVALS.includes(selection.interval) || Object.keys(selection).some(k => !['mode','asset','interval'].includes(k)))) throw fail('Choose an asset or portfolio review and supported interval.', 400);
    if (kind === 'x' && (!selection || Object.keys(selection).some(k => k !== 'postIds'))) throw fail('Choose cached posts.', 400);
    const online=()=>getWorkers().some(w => w.status === 'online' && w.capabilities?.jobTypes === null && Date.now() - Date.parse(w.lastHeartbeatAt || '') < 8000);
    if (!online()) throw fail('Start the normal Mari worker before requesting analysis.');
    const config = await getModels(), model = config.models.find(m => m.id === input.model);
    if (!model || !model.efforts.includes(input.effort)) throw fail('Choose a model and effort reported by your installed Codex.', 400);
    if(!online())throw fail('The normal worker disconnected while checking model availability.');
    if (store.list('jobs').some(j => j.type === type && ['queued','running'].includes(j.status))) throw fail('An analysis of this type is already queued or running.');
    const captured = capturePersonalAnalysis(store, kind, selection);
    const existing = store.list('settings').findLast(r => r.id.startsWith('analysis:result:') && r.fingerprint === captured.fingerprint && r.model === model.id && r.effort === input.effort);
    if (existing) return res.json({ reused: true, resultId: existing.id });
    const job = enqueue(type, { payload: { kind, selection, ...captured, model: model.id, effort: input.effort, serviceTier: config.inheritedServiceTier } });
    res.status(202).json({ jobId: job.id, reused: false });
  });
  router.post('/:kind/cancel', (req, res) => { const type = types[req.params.kind], job = req.body?.jobId && store.get('jobs', req.body.jobId); if (!type || job?.type !== type || !['queued','running'].includes(job.status)) throw fail('No active matching analysis was found.', 404); store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: now() } : {}) }); res.json({ cancelled: true }); });
  return router;
}
