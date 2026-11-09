import { xSettings, xPosts, refreshXFeed } from './x-news.js';
import { runGoogleBrief } from '../worker/google.js';
import { newspaperPlainText } from './newspaper-sources.js';

export const NEWSPAPER_PREFERENCES = 'newspaper:preferences';
export const NEWSPAPER_GOOGLE_BRIEF = 'newspaper:google-brief';
const DEFAULTS = Object.freeze({ includeX: false, includeMail: false, includeCalendar: false, refreshX: false, mailRule: 'custom', mailQuery: '', mailSenders:[], mailDomains:[], excludeInvites:true, xHandles: null });
const clean = (value, max) => newspaperPlainText(value, max);
const validTime = (value, at, age) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= at + 300000 && at - Date.parse(value) <= age;
export const newspaperPreferences = (store) => ({ ...DEFAULTS, ...store.get('settings', NEWSPAPER_PREFERENCES), id: NEWSPAPER_PREFERENCES });

export function validateNewspaperPreferences(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !Object.hasOwn(DEFAULTS,k))) throw new Error('Choose supported newspaper personalization settings.');
  const result = {};
  for (const key of ['includeX','includeMail','includeCalendar','refreshX','excludeInvites']) if (input[key] !== undefined) { if (typeof input[key] !== 'boolean') throw new Error('Newspaper source choices must be true or false.'); result[key] = input[key]; }
  for(const key of ['mailSenders','mailDomains']) if(input[key]!==undefined){ if(!Array.isArray(input[key])||input[key].length>20||input[key].some(v=>typeof v!=='string'||v.length>200||!(key==='mailSenders'?/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i:/^[a-z0-9.-]+\.[a-z]{2,}$/i).test(v)))throw new Error('Use up to 20 valid sender addresses or domains.');result[key]=[...new Set(input[key].map(v=>v.toLowerCase()))]; }
  if (input.mailRule !== undefined) { if (!['priority','unread','custom'].includes(input.mailRule)) throw new Error('Choose a supported email rule.'); result.mailRule = input.mailRule; }
  if (input.mailQuery !== undefined) { if (typeof input.mailQuery !== 'string' || input.mailQuery.length > 500 || /[\x00-\x1f\x7f]/.test(input.mailQuery)) throw new Error('Use an email search rule up to 500 characters without control characters.'); result.mailQuery = input.mailQuery.trim(); }
  if (input.xHandles !== undefined) { if (input.xHandles !== null && (!Array.isArray(input.xHandles) || input.xHandles.length > 20 || input.xHandles.some(h=>typeof h!=='string'||!/^[a-z0-9_]{1,15}$/.test(h)) || new Set(input.xHandles).size !== input.xHandles.length)) throw new Error('Choose unique saved X handles.'); result.xHandles = input.xHandles; }
  return result;
}

export function newspaperMailQuery(preferences) {
  const base = 'in:inbox -in:spam -in:trash';
  const exclude = preferences.excludeInvites?' -filename:ics -filename:ical -filename:vcs -subject:"Invitation:" -subject:"Updated invitation:" -subject:"Canceled event:" -subject:"Cancelled event:"':'';
  if (preferences.mailRule === 'custom') { const senders=[...preferences.mailSenders.map(v=>`from:${v}`),...preferences.mailDomains.map(v=>`from:(@${v})`)];const rule=[senders.length?`{${senders.join(' ')}}`:'',preferences.mailQuery.trim()].filter(Boolean).join(' '); return rule ? `${base} (${rule})${exclude}` : null; }
  return (preferences.mailRule === 'priority' ? `${base} is:unread {is:important is:starred} -category:promotions -category:social` : `${base} is:unread -category:promotions -category:social`)+exclude;
}

function sourceLink(value, kind, handle) {
  try { const u = new URL(value); if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
    if (kind === 'mail' && u.hostname === 'mail.google.com' && u.pathname.startsWith('/mail/')) return u.href;
    if (kind === 'calendar' && (u.hostname === 'calendar.google.com' || u.hostname === 'www.google.com' && u.pathname.startsWith('/calendar'))) return u.href;
    if (kind === 'x' && u.hostname === 'x.com' && new RegExp(`^/${handle}/status/\\d{1,25}/?$`,'i').test(u.pathname)) return u.href;
  } catch { /* Ignore unsupported source links. */ } return null;
}
const empty = (status, note) => ({ status, note, checkedAt: null, items: [], total: 0, truncated: false });
function printableMail(message){
  const secret=/\b(?:otp|passcode|one[- ]time (?:password|code)|verification code|security code|login code|access code|sign[- ]in code)\b/i.test(`${message.subject} ${message.snippet}`);
  return {subject:clean(secret?String(message.subject).replace(/\b\d{4,8}\b/g,'[hidden code]'):message.subject,100),text:secret?'Security-code preview hidden. Open the original email in Gmail.':clean(message.snippet,160)};
}

export function newspaperBriefingSnapshot({ store, date, googleBrief, at = Date.now() }) {
  const preferences = newspaperPreferences(store);
  if (!preferences.includeX && !preferences.includeMail && !preferences.includeCalendar) return null;
  const snapshot = { date, generatedAt: new Date(at).toISOString(), timeZone: 'Asia/Manila', private: true };
  const config = xSettings(store), accounts = config.accounts.filter(a=>a.enabled && (preferences.xHandles === null || preferences.xHandles.includes(a.handle)));
  if (!preferences.includeX) snapshot.x = empty('disabled','X is excluded from this edition.');
  else {
    const posts = xPosts(store).filter(p=>!p.unavailable && accounts.some(a=>a.handle===p.handle) && validTime(p.fetchedAt,at,86400000) && validTime(p.publishedAt,at,172800000) && sourceLink(p.url,'x',p.handle)).sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
    // One recent post per selected account first; remaining slots stay bounded.
    const seen = new Set(), first = posts.filter(p=>{if(seen.has(p.handle))return false;seen.add(p.handle);return true;});
    const selected = [...first,...posts.filter(p=>!first.includes(p))].slice(0,3);
    const connection = store.get('settings','x:connection'), checkedAt = connection?.checkedAt || null;
    const quiet=connection?.status==='connected'&&validTime(checkedAt,at,900000);
    snapshot.x = selected.length ? { status: selected.some(p=>!validTime(p.fetchedAt,at,900000))?'stale':['error','partial'].includes(connection?.status)?'partial':'ready', note:'Attributed X posts; not independently verified. Text excerpts link to the original posts.'+(['error','partial'].includes(connection?.status)?' Some selected accounts could not refresh.':''), checkedAt: selected.map(p=>p.fetchedAt).sort()[0], total: posts.length, truncated: posts.length>selected.length,
      accounts: accounts.map(a=>a.handle), items: selected.map(p=>({id:p.postId,handle:p.handle,text:clean(p.text,240),excerpt:p.text.length>240,url:sourceLink(p.url,'x',p.handle),publishedAt:p.publishedAt})) }
      : {...empty(accounts.length?(quiet?'empty':'unavailable'):'setup', accounts.length?(quiet?'No recent posts were returned for the selected accounts.':'No recent cached posts. Configure X access and refresh the selected feed; paid reads require the existing consent and budget controls.'):'Choose enabled accounts in X news.'),checkedAt,accounts:accounts.map(a=>a.handle)};
  }
  const cached = store.get('settings', NEWSPAPER_GOOGLE_BRIEF);
  const brief = googleBrief || cached?.brief;
  for (const [kind,enabled] of [['mail',preferences.includeMail],['calendar',preferences.includeCalendar]]) {
    if (!enabled) { snapshot[kind]=empty('disabled',`${kind==='mail'?'Email':'Calendar'} is excluded from this edition.`); continue; }
    if (kind==='mail' && !newspaperMailQuery(preferences)) { snapshot.mail=empty('setup','Add your custom email sender or search rules to include important mail.'); continue; }
    const source = brief?.[kind];
    if (!googleBrief&&cached?.error || brief?.date !== date || source?.status !== 'ready' || !validTime(brief?.generatedAt,at,900000)) { snapshot[kind]=empty(source?.status==='ready'?'stale':'unavailable',`${kind==='mail'?'Email':'Calendar'} could not be refreshed for this edition. No older items are presented as today’s data.`); continue; }
    let items;
    if (kind==='mail') items=(source.items||[]).filter(m=>{
      if(!sourceLink(m.url,'mail') || preferences.excludeInvites&&m.calendarInvite)return false;
      if(preferences.mailRule!=='custom'||!preferences.mailSenders.length&&!preferences.mailDomains.length)return true;
      const bracket=String(m.from||'').match(/<([^<>]+)>/g)?.at(-1);
      const sender=(m.senderAddress||bracket?.slice(1,-1)||String(m.from||'').match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)?.at(-1))?.toLowerCase();
      return !!sender&&(preferences.mailSenders.includes(sender)||preferences.mailDomains.includes(sender.split('@')[1]));
    }).sort((a,b)=>(Date.parse(b.receivedAt)||0)-(Date.parse(a.receivedAt)||0)).slice(0,20).map(m=>({id:clean(m.id,256),...printableMail(m),from:clean(m.from,100),receivedAt:m.receivedAt,url:sourceLink(m.url,'mail')}));
    else {
      const start=Date.parse(`${date}T00:00:00+08:00`),end=start+86400000;
      const stamp=v=>Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v)?`${v}T00:00:00+08:00`:v);
      items=(source.events||[]).filter(e=>Number.isFinite(stamp(e.start))&&Number.isFinite(stamp(e.end))&&stamp(e.end)>stamp(e.start)&&stamp(e.start)<end&&stamp(e.end)>start&&sourceLink(e.url,'calendar')).sort((a,b)=>Number(b.allDay)-Number(a.allDay)||stamp(a.start)-stamp(b.start)).slice(0,30).map(e=>({id:clean(e.id,256),title:clean(e.title,100),start:e.start,end:e.end,allDay:!!e.allDay,url:sourceLink(e.url,'calendar')}));
    }
    snapshot[kind]={status:items.length?'ready':'empty',note:kind==='mail'?'Selected by your saved email rule. Previews are source text, not AI judgments.':'Today’s primary Google Calendar, Asia/Manila.',checkedAt:brief.generatedAt,items,total:items.length,truncated:!!source.truncated};
  }
  snapshot.status = ['x','mail','calendar'].some(k=>!['ready','empty','disabled'].includes(snapshot[k].status))?'partial':'ready';
  return snapshot;
}

export async function collectNewspaperBriefing({store,dataDir,date,job,signal,onActivity,readGoogle=runGoogleBrief,readX=refreshXFeed}) {
  const preferences=newspaperPreferences(store), query=newspaperMailQuery(preferences);
  if (!preferences.includeX&&!preferences.includeMail&&!preferences.includeCalendar) return null;
  const fingerprint=JSON.stringify(preferences);
  let xFailed=false;
  if (preferences.includeX&&preferences.refreshX) {
    onActivity?.('Refreshing selected X accounts within the saved API consent and budget.');
    try { await readX({store,dataDir,signal,handles:preferences.xHandles}); } catch(error) { if(signal?.aborted||error.cancelled)throw error;xFailed=true; }
  }
  let googleFailed=false;
  if (preferences.includeCalendar || preferences.includeMail&&query) {
    try { await readGoogle({store,dataDir,job:{...job,type:'personal.google.refresh',payload:{date,timeZone:'Asia/Manila'}},signal,briefKey:NEWSPAPER_GOOGLE_BRIEF,mailQuery:query,includeMail:!!(preferences.includeMail&&query),includeCalendar:preferences.includeCalendar,onActivity}); }
    catch(error) { if(signal?.aborted||error.cancelled)throw error;googleFailed=true; }
  }
  if (JSON.stringify(newspaperPreferences(store))!==fingerprint) throw new Error('Newspaper personal-source settings changed during refresh. Retry with the updated choices.');
  const result=newspaperBriefingSnapshot({store,date});
  if(xFailed){result.x.status=result.x.items.length?'partial':'unavailable';result.x.note+=' Automatic X refresh did not complete; any displayed items are cached.';result.status='partial';}
  if(googleFailed){for(const kind of ['mail','calendar'])if(!['disabled','setup'].includes(result[kind].status))result[kind]=empty('unavailable',`${kind==='mail'?'Email':'Calendar'} refresh failed. Previous data is not shown as current.`);result.status='partial';}
  return result;
}
