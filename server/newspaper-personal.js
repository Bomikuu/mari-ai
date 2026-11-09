import { marketSettings, cachedMarketPrices } from './markets.js';
import { xSettings, xPosts } from './x-news.js';
import { newspaperPlainText } from './newspaper-sources.js';

// This opt-in bridge reads cached records only. It never calls a provider,
// queues an extra model turn, changes the schedule or increases story limits.
export function newspaperPersonalInputs(store, collected) {
  const result={...collected,candidates:[...collected.candidates],sources:[...collected.sources]};
  const preferences=xSettings(store);
  if(preferences.newspaper && !store.get('settings','newspaper:preferences')?.includeX){
    const selected=xPosts(store).filter(p=>p.newspaper&&!p.unavailable&&Date.now()-Date.parse(p.fetchedAt)<86400000&&Date.now()-Date.parse(p.publishedAt)<86400000*2&&preferences.accounts.some(a=>a.enabled&&a.handle===p.handle)).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt)).slice(0,2);
    const included=[];
    for(const p of selected){const section=/\b(BTC|ETH|SOL|bitcoin|ethereum|solana|crypto)\b/i.test(p.text)?'crypto':'world';const entry={id:`x-cached_${p.postId}`,section,title:`@${p.handle}: ${newspaperPlainText(p.text,100)}`,excerpt:`Unverified attributed X claim by @${p.handle}, published ${p.publishedAt}, cached ${p.fetchedAt}: ${newspaperPlainText(p.text,700)}`,sourceName:`X · @${p.handle} · attributed claim`,sourceId:'x-cached',url:p.url,publishedAt:p.publishedAt,latestKnown:false};
      const same=result.candidates.filter(c=>c.section===section);if(same.some(c=>c.sourceId==='x-cached'))continue;if(same.length>=2){const victim=same.at(-1);result.candidates=result.candidates.filter(c=>c.id!==victim.id);}result.candidates.push(entry);included.push(p);
    }
    if(included.length)result.sources.push({id:'x-cached',name:'Selected cached X claims',status:'ready',fetchedAt:included.map(p=>p.fetchedAt).sort()[0],count:included.length});
  }
  if(marketSettings(store).newspaper){const prices=cachedMarketPrices(store);const items=[['BTC','bitcoin'],['ETH','ethereum'],['SOL','solana']].flatMap(([symbol,id])=>{const p=prices[symbol];return p&&!p.stale&&p.provider==='CoinGecko'?[{id,symbol,usd:p.price,php:null,change24h:null,updatedAt:p.sourceUpdatedAt||p.fetchedAt}]:[];});if(items.length===3)result.market={status:'ready',fetchedAt:items.map(p=>p.updatedAt).sort()[0],items,usdOnlyCached:true,error:'Cached USD quotes only; PHP conversion and 24-hour change are unavailable.'};}
  return result;
}
