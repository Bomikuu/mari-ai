import express from 'express';
import { id, now } from './store.js';
import { ASSETS, INTERVALS, portfolioReport, validateTrade, validateRiskProfile, candleIndicators } from '../shared/portfolio.js';
import { createMarketData, marketError } from './market-data.js';
import { cleanKnowledgeText } from './knowledge.js';
import { atomic } from './agent-teams.js';

export const marketSettings = store => store.get('settings', 'markets:preferences') || { watchlist: ['BTC', 'ETH', 'SOL'], riskProfile: null, newspaper: false, provider:'coingecko' };
export const marketTrades = store => store.list('settings').filter(r => r.id.startsWith('markets:trade:'));
const alerts = store => store.list('settings').filter(r => r.id.startsWith('markets:alert:'));
export function cachedMarketPrices(store) {
  const prices = {},provider=marketSettings(store).provider,selected=provider==='coingecko'?'CoinGecko':provider==='kraken'?'Kraken':null;
  for (const r of store.list('settings').filter(r => r.id.startsWith('market:tickers:') && r.data?.prices)) for (const [asset, value] of Object.entries(r.data.prices)) if ((!selected||value.provider===selected)&&(!prices[asset] || Date.parse(value.fetchedAt) > Date.parse(prices[asset].fetchedAt))) prices[asset] = { ...value, stale: !Number.isFinite(Date.parse(value.fetchedAt))||Date.now() - Date.parse(value.fetchedAt) > 120000||Boolean(value.sourceUpdatedAt&&Date.now()-Date.parse(value.sourceUpdatedAt)>300000) };
  return prices;
}

export function createMarketsRouter({ store, marketData = createMarketData({ store }) }) {
  const router = express.Router();
  router.get('/', (req, res) => { const settings = marketSettings(store), trades = marketTrades(store), prices = cachedMarketPrices(store); res.json({ settings, trades, alerts:alerts(store), prices, portfolio: portfolioReport(trades, prices), assets: ASSETS, intervals: INTERVALS }); });
  router.put('/preferences', (req, res) => {
    const input = req.body;
    if (!input || Object.keys(input).some(k => !['watchlist', 'riskProfile', 'newspaper','provider'].includes(k))) throw marketError('Choose watchlist, risk profile, provider or newspaper settings.', 400);
    const patch = {};
    if(input.provider!==undefined){if(!['kraken','coingecko'].includes(input.provider))throw marketError('Choose CoinGecko or Kraken.',400);patch.provider=input.provider;}
    if (input.watchlist !== undefined) { if (!Array.isArray(input.watchlist) || !input.watchlist.length || input.watchlist.length > 10 || input.watchlist.some(a => !Object.hasOwn(ASSETS, a))) throw marketError('Choose 1–10 supported assets.', 400); patch.watchlist = [...new Set(input.watchlist)]; }
    if (input.riskProfile !== undefined) { const profile = validateRiskProfile(input.riskProfile); patch.riskProfile = { ...profile, goal: cleanKnowledgeText(profile.goal), liquidityNeeds: cleanKnowledgeText(profile.liquidityNeeds) }; }
    if (input.newspaper !== undefined) { if (typeof input.newspaper !== 'boolean') throw marketError('Newspaper inclusion must be true or false.', 400); patch.newspaper = input.newspaper; }
    res.json(store.put('settings', { ...marketSettings(store), ...patch, id: 'markets:preferences' }));
  });
  router.post('/trades', (req, res) => {
    const {requestId,...input}=req.body||{};
    if(requestId!==undefined&&(typeof requestId!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(requestId)))throw marketError('Use a valid transaction request ID.',400);
    const fields = validateTrade(input), trades = marketTrades(store),receipt=requestId&&store.get('settings',`markets:receipt:${requestId}`);
    if(receipt){if(receipt.removed||JSON.stringify(receipt.fields)!==JSON.stringify(fields))throw marketError('This transaction request was already used or removed. Start a new entry.',409);const previous=store.get('settings',receipt.tradeId);if(!previous)throw marketError('The original transaction is unavailable.',409);return res.json({trade:previous,reused:true});}
    if (trades.length >= 2000) throw marketError('The manual ledger is limited to 2,000 entries.', 400);
    const trade = { ...fields, id: `markets:trade:${id('trade')}`, sequence: Math.max(0, ...trades.map(t => t.sequence || 0)) + 1, createdAt: now() };
    portfolioReport([...trades, trade]); atomic(store,()=>{store.put('settings', {...trade,...(requestId?{requestId}:{})});if(requestId)store.put('settings',{id:`markets:receipt:${requestId}`,fields,tradeId:trade.id,removed:false});});
    store.event({ source: 'system', type: 'portfolio.trade.recorded', message: `Recorded a manual ${fields.asset} ${fields.type}; no exchange order was placed.` }); res.status(201).json({ trade });
  });
  router.delete('/trades/:id', (req, res) => {
    const trades = marketTrades(store); if (!trades.some(t => t.id === req.params.id)) throw marketError('Trade not found.', 404);
    portfolioReport(trades.filter(t => t.id !== req.params.id));atomic(store,()=>{const current=trades.find(t=>t.id===req.params.id);store.remove('settings', req.params.id);if(current.requestId)store.update('settings',`markets:receipt:${current.requestId}`,{removed:true});}); res.json({ removed: true });
  });
  router.get('/candles', async (req, res) => { const market = await marketData.market(req.query.asset || 'BTC', Number(req.query.interval || 30),marketSettings(store).provider||'kraken'); res.json({ ...market, indicators: candleIndicators(market.candles) }); });
  router.post('/alerts',(req,res)=>{const v=req.body;if(!v||Object.keys(v).some(k=>!['asset','direction','threshold'].includes(k))||!Object.hasOwn(ASSETS,v.asset)||!['above','below'].includes(v.direction)||typeof v.threshold==='boolean'||!Number.isFinite(Number(v.threshold))||Number(v.threshold)<=0||Number(v.threshold)>1e12)throw marketError('Choose an asset, above/below condition and positive USD threshold.',400);if(alerts(store).length>=30)throw marketError('Keep at most 30 local alerts.',400);res.status(201).json(store.put('settings',{id:`markets:alert:${id('rule')}`,asset:v.asset,direction:v.direction,threshold:Number(v.threshold),enabled:true,firedAt:null,createdAt:now()}));});
  router.delete('/alerts/:id',(req,res)=>{if(!alerts(store).some(a=>a.id===req.params.id))throw marketError('Alert not found.',404);store.remove('settings',req.params.id);res.json({removed:true});});
  router.post('/refresh', async (req, res) => { const trades = marketTrades(store); const selected = [...new Set([...marketSettings(store).watchlist, ...trades.map(t => t.asset),...alerts(store).filter(a=>a.enabled).map(a=>a.asset)])]; const result = await marketData.ticker(selected,marketSettings(store).provider||'kraken');
    if(!result.stale)for(const a of alerts(store).filter(a=>a.enabled)){const price=result.prices[a.asset]?.price;if(Number.isFinite(price)&&(a.direction==='above'?price>=a.threshold:price<=a.threshold)){store.update('settings',a.id,{enabled:false,firedAt:now(),observedPrice:price});store.event({source:'system',type:'market.alert.triggered',message:`${a.asset}/USD reached the local ${a.direction} ${a.threshold} alert.`,data:{alertId:a.id,observedPrice:price,provider:result.provider}});}}
    res.json({ ...result, portfolio: portfolioReport(trades, result.prices) }); });
  return router;
}
