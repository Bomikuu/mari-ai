import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { validateTrade, portfolioReport, candleIndicators } from '../shared/portfolio.js';
import { createMarketData, normalizeCandles } from '../server/market-data.js';
import { createStore, now } from '../server/store.js';
import { createApp } from '../server/index.js';

const trade = (id,type,quantity,price,fees=0) => ({ id,asset:'BTC',type,quantity,price,fees,at:`2026-01-0${id}T00:00:00Z` });
test('weighted-average basis includes fees and realized/unrealized returns correctly',()=>{
  const result=portfolioReport([trade('1','buy',2,100,2),trade('2','buy',1,200,1),trade('3','sell',1,250,3)],{BTC:{price:200}}),p=result.positions[0];
  assert.equal(p.quantity,2);assert(Math.abs(p.costBasis-403*2/3)<1e-9);assert(Math.abs(p.realized-(247-403/3))<1e-9);assert(Math.abs(p.unrealized-(400-403*2/3))<1e-9);assert.equal(p.allocation,1);
});
test('unknown opening basis stays unknown, cannot be made zero-cost profit, and resets only after closing',()=>{
  let trades=[trade('1','opening',2,null),trade('2','buy',1,20),trade('3','sell',1,30)];
  let p=portfolioReport(trades,{BTC:{price:25}}).positions[0];assert.equal(p.costBasis,null);assert.equal(p.realized,null);assert.equal(p.unrealized,null);
  trades.push(trade('4','sell',2,30),trade('5','buy',1,10));p=portfolioReport(trades,{BTC:{price:20}}).positions[0];assert.equal(p.costBasis,10);assert.equal(p.unrealized,10);assert.equal(p.realized,null);
});
test('missing prices, tiny holdings, oversells, nonfinite/negative fields and ambiguous times are handled',()=>{
  assert.equal(portfolioReport([trade('1','buy',1,10)]).totalValue,null);
  assert.throws(()=>portfolioReport([trade('1','buy',1,10),trade('2','sell',2,12)]));
  assert.equal(portfolioReport([trade('1','buy',1e-12,10)]).positions[0].quantity,1e-12);
  assert.throws(()=>portfolioReport([trade('1','buy',1e-12,10),trade('2','sell',2e-12,12)]));
  for(const patch of [{quantity:0},{price:NaN},{fees:-1},{at:'2026-01-01T00:00:00'},{quantity:true}])assert.throws(()=>validateTrade({...trade('1','buy',1,10),...patch}));
});
test('candles sort/deduplicate, preserve gaps and validate prices, volume and conflicting duplicates',()=>{
  const a=[1000,'10','12','9','11','10','5',1],b=[4600,'11','13','10','12','11','6',1];
  const result=normalizeCandles([b,a,a],60,8200000);assert.deepEqual(result.map(c=>c.time),[1000,4600]);assert.equal(result[0].closed,true);assert.equal(result[1].closed,true);
  assert.throws(()=>normalizeCandles([a,[...a.slice(0,4),'99',...a.slice(5)]],60,8200000));assert.throws(()=>normalizeCandles([[1000,10,8,9,11,10,5,1]],60,8200000));
  assert.equal(candleIndicators([]).rsi14,null);assert.equal(candleIndicators(Array.from({length:20},()=>({close:10,closed:true}))).rsi14,50);
});
test('market calls coalesce, persist cache, back off and preserve stale results',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mari-market-cache-')),s=createStore(dir);t.after(async()=>{s.close();await fs.rm(dir,{recursive:true,force:true});});let calls=0,clock=100000000,fail=false;
  const adapter=createMarketData({store:s,clock:()=>clock,fetchImpl:async()=>{calls++;await new Promise(r=>setTimeout(r,10));return fail?new Response('',{status:429}):Response.json({error:[],result:{XXBTZUSD:[[90000,10,12,9,11,10,5,1]],last:1}});}});
  await Promise.all([adapter.market('BTC',60),adapter.market('BTC',60)]);assert.equal(calls,1);assert.equal((await adapter.market('BTC',60)).cached,true);
  clock+=61000;fail=true;const stale=await adapter.market('BTC',60);assert.equal(stale.stale,true);assert.equal(stale.candles.length,1);await adapter.market('BTC',60);assert.equal(calls,2);
  await assert.rejects(adapter.market('FOREIGN',60));await assert.rejects(adapter.market('BTC',13));
});

export async function marketsFixture(t,options={}){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mari-markets-api-')),store=createStore(dir),app=createApp({store,accessKey:'test-private-key',...options}),server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});store.close();await fs.rm(dir,{recursive:true,force:true});});const base=`http://127.0.0.1:${server.address().port}`;
  const paired=await fetch(base+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accessKey:'test-private-key'})});const cookie=paired.headers.get('set-cookie').split(';')[0],{csrfToken}=await paired.json();
  const request=async(route,{method='GET',body,auth=true,csrf=true}={})=>{const r=await fetch(base+'/api/personal/'+route,{method,headers:{'content-type':'application/json',...(auth?{cookie}:{}),...(csrf?{'x-mari-csrf':csrfToken}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});return{status:r.status,body:await r.json()};};return{store,dir,request};
}
test('market API enforces owner/CSRF, persists ledger, and rejects deleting a buy needed by a later sale',async t=>{
  const f=await marketsFixture(t);assert.equal((await f.request('markets',{auth:false})).status,401);assert.equal((await f.request('markets/trades',{method:'POST',csrf:false,body:trade('1','buy',1,10)})).status,403);
  const buy=await f.request('markets/trades',{method:'POST',body:Object.fromEntries(Object.entries(trade('1','buy',1,10)).filter(([k])=>k!=='id'))});assert.equal(buy.status,201);
  const sell=await f.request('markets/trades',{method:'POST',body:Object.fromEntries(Object.entries(trade('2','sell',1,12)).filter(([k])=>k!=='id'))});assert.equal(sell.status,201);
  assert.equal((await f.request('markets/trades/'+encodeURIComponent(buy.body.trade.id),{method:'DELETE'})).status,400);assert.equal((await f.request('markets')).body.trades.length,2);
  const second=createStore(f.dir);assert.equal(second.list('settings').filter(r=>r.id.startsWith('markets:trade:')).length,2);second.close();
});
test('analysis API validates native model choices, prevents duplicate jobs and cancels only its own job',async t=>{
  const getModels=async()=>({models:[{id:'fixture-model',efforts:['low']}],inheritedServiceTier:'standard'}),f=await marketsFixture(t,{analysisOptions:{getModels}});
  f.store.put('workers',{id:'normal',status:'online',lastHeartbeatAt:now(),capabilities:{jobTypes:null}});
  f.store.put('settings',{id:'markets:preferences',watchlist:['BTC'],riskProfile:{goal:'Preserve capital',horizon:'3-plus-years',riskTolerance:'low',budget:100,liquidityNeeds:'Not needed soon'}});
  f.store.put('settings',{id:'market:tickers:BTC',data:{prices:{BTC:{price:100,provider:'Kraken',fetchedAt:now()}}}});
  const payload={selection:{mode:'asset',asset:'BTC',interval:60},model:'fixture-model',effort:'low'};
  assert.equal((await f.request('analysis/crypto',{method:'POST',body:{...payload,model:'invented'}})).status,400);
  const queued=await f.request('analysis/crypto',{method:'POST',body:payload});assert.equal(queued.status,202);assert.equal(f.store.get('jobs',queued.body.jobId).payload.effort,'low');
  assert.equal((await f.request('analysis/crypto',{method:'POST',body:payload})).status,409);
  const unrelated=f.store.put('jobs',{id:'unrelated-service',type:'service.start',status:'queued'});
  assert.equal((await f.request('analysis/crypto/cancel',{method:'POST',body:{jobId:unrelated.id}})).status,404);
  assert.equal((await f.request('analysis/crypto/cancel',{method:'POST',body:{jobId:queued.body.jobId}})).status,200);assert.equal(f.store.get('jobs',unrelated.id).status,'queued');
  f.store.update('workers','normal',{capabilities:{jobTypes:['personal.newspaper.generate']}});
  assert.equal((await f.request('analysis/crypto',{method:'POST',body:payload})).status,409);
});
test('CoinGecko candles use close-to-open timestamps and never invent volume',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'mari-gecko-test-')),s=createStore(dir);t.after(async()=>{s.close();await fs.rm(dir,{recursive:true,force:true});});
  const adapter=createMarketData({store:s,clock:()=>7200000,fetchImpl:async()=>Response.json([[1800000,10,12,9,11],[3600000,11,13,10,12]])});
  const result=await adapter.market('BTC',30,'coingecko');assert.equal(result.candles[0].time,0);assert.equal(result.candles[0].volume,null);assert.equal(result.volumeAvailable,false);await assert.rejects(adapter.market('BTC',1,'coingecko'));
});
test('transaction retries deduplicate, changed requests reject, and deleted entries cannot be resurrected by replay',async t=>{
  const f=await marketsFixture(t),payload={asset:'BTC',type:'buy',quantity:1,price:100,fees:1,at:'2026-01-01T00:00:00Z',requestId:'11111111-1111-4111-8111-111111111111'};
  const first=await f.request('markets/trades',{method:'POST',body:payload});assert.equal(first.status,201);const second=await f.request('markets/trades',{method:'POST',body:payload});assert.equal(second.body.reused,true);assert.equal(second.body.trade.id,first.body.trade.id);assert.equal((await f.request('markets')).body.trades.length,1);
  assert.equal((await f.request('markets/trades',{method:'POST',body:{...payload,quantity:2}})).status,409);await f.request('markets/trades/'+encodeURIComponent(first.body.trade.id),{method:'DELETE'});assert.equal((await f.request('markets/trades',{method:'POST',body:payload})).status,409);
});
test('local price alerts trigger once from fresh quote refreshes without queuing model jobs',async t=>{
  const f=await marketsFixture(t,{marketOptions:{fetchImpl:async()=>Response.json(Object.fromEntries(['bitcoin','ethereum','solana'].map(id=>[id,{usd:100,last_updated_at:Math.floor(Date.now()/1000)}])))}});
  assert.equal((await f.request('markets/alerts',{method:'POST',body:{asset:'BTC',direction:'above',threshold:true}})).status,400);
  assert.equal((await f.request('markets/alerts',{method:'POST',body:{asset:'BTC',direction:'above',threshold:50}})).status,201);
  await f.request('markets/refresh',{method:'POST',body:{}});await f.request('markets/refresh',{method:'POST',body:{}});const state=(await f.request('markets')).body;assert.equal(state.alerts[0].enabled,false);assert.equal(state.alerts[0].observedPrice,100);assert.equal(f.store.events({query:'market.alert.triggered'}).length,1);assert.equal(f.store.list('jobs').length,0);
});
