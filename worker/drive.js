import { CodexClient } from './codex.js';
import { id, now } from '../server/store.js';
import { cleanKnowledgeText, driveFileUrl, knowledgeRevision } from '../server/knowledge.js';

const SAFE_ERROR = 'Drive could not complete this read. Check the connected Google Drive app in Codex, then retry.';
const readNames = new Set(['google_drive.search','google_drive.fetch']);
function structured(result) {
  if (result?.isError) throw new Error(SAFE_ERROR);
  if (result?.structuredContent && typeof result.structuredContent === 'object') return result.structuredContent;
  for (const part of result?.content || []) if (part.type === 'text' && part.text?.length < 4 * 1024 * 1024) { try { return JSON.parse(part.text); } catch {} }
  return null;
}
function list(value, depth = 0) {
  if (Array.isArray(value)) return { items: value, parent: {} };
  if (!value || depth > 4) return null;
  for (const key of ['files','results','items','documents']) if (Array.isArray(value[key])) return { items: value[key], parent: value };
  for (const key of ['data','result','response']) { const found = list(value[key], depth + 1); if (found) return found; }
  return null;
}
export function normalizeDriveSearch(result) {
  const value = structured(result), found = list(value); if (!found) throw new Error('Drive returned an unsupported metadata list.');
  const items = found.items.slice(0, 20).flatMap(item => {
    let sourceUrl; try { sourceUrl = driveFileUrl(item.webViewLink || item.url || item.display_url || (item.id ? `https://drive.google.com/file/d/${item.id}/view` : '')); } catch { return []; }
    if (item.mimeType === 'application/vnd.google-apps.folder') return [];
    return [{ title: cleanKnowledgeText(item.name || item.title || 'Google file').slice(0, 200), sourceUrl, mime: item.mimeType || item.mime_type || null, modifiedAt: item.modifiedTime || item.modified_at || null }];
  });
  const cursor = found.parent.next_page_token || found.parent.nextPageToken || value?.next_page_token || null;
  if (cursor && (typeof cursor !== 'string' || cursor.length > 8000)) throw new Error('Drive returned an unsupported page cursor.');
  return { results: items, nextCursor: cursor, truncated: Boolean(cursor || found.items.length > 20) };
}
export function normalizeDriveText(result) {
  if (result?.isError || JSON.stringify(result).length > 4 * 1024 * 1024) throw new Error('Drive did not return bounded readable text.');
  const value = structured(result);
  const findText = (v, depth = 0) => {
    if (!v || depth > 4 || typeof v !== 'object') return null;
    for (const key of ['text','body','plain_text','markdown','content']) if (typeof v[key] === 'string' && v[key].trim()) return v[key];
    for (const key of ['data','result','file','document','content']) { const t = findText(v[key], depth + 1); if (t) return t; }
    return null;
  };
  let raw = findText(value);
  if (!raw && !value) raw = (result?.content || []).filter(p => p.type === 'text').map(p => p.text || '').join('\n');
  if (!raw?.trim() || /-----BEGIN .*PRIVATE KEY-----/.test(raw)) throw new Error('This file did not return usable text. Export a readable document instead.');
  const text = cleanKnowledgeText(raw).slice(0, 20000);
  return { title: cleanKnowledgeText(value?.name || value?.title || value?.file?.name || raw.match(/^#\s+(.+)$/m)?.[1] || 'Imported Google document').slice(0, 120), text, truncated: raw.length > 20000, modifiedAt: value?.modifiedTime || value?.modified_at || null };
}
export async function runDriveRead({ store, dataDir, job, signal, makeCodex = o => new CodexClient(o) }) {
  const action = job.type.split('.').at(-1), prior = store.get('settings','drive-state') || {};
  const cancelled = () => { if (signal?.aborted || store.get('jobs',job.id)?.cancelRequested) throw Object.assign(new Error('Drive read cancelled.'),{cancelled:true}); };
  const activity = (message, command = null) => store.update('agents',job.agentId,{name:'Drive reader',role:'selected document context',phase:`drive-${action}`,status:'working',action:message,currentCommand:command,lastActivityAt:now()});
  const client = makeCodex({store:{...store,event(){},update(){},put(){}},agentId:job.agentId,onActivity(){}});
  if (typeof client.send === 'function') client.serverRequest = message => client.send({id:message.id,error:{code:-32601,message:'Only explicit read-only Drive calls are authorized.'}});
  const abort = () => Promise.resolve(client.close()).catch(()=>{}); signal?.addEventListener('abort',abort,{once:true});
  try {
    cancelled(); activity('Checking the connected Google Drive app.'); await client.connect(); cancelled();
    const apps = await client.request('app/installed',{forceRefresh:true},45000); cancelled();
    const app = apps.apps?.find(a => /^google drive$/i.test(a.runtimeName || a.name || ''));
    if (!app?.enabled || !app.callable) throw new Error('Connect Google Drive in Codex before reading documents.');
    const checkedAt = now();
    if (action === 'inspect') { await client.close(); cancelled(); store.put('settings',{...prior,id:'drive-state',connection:'connected',checkedAt,error:null}); return; }
    const status = await client.request('mcpServerStatus/list',{serverName:'codex_apps',detail:'toolsAndAuthOnly',limit:100},30000); cancelled();
    const tools = Object.values(status.data?.find(s => s.name === 'codex_apps')?.tools || {});
    const thread = await client.request('thread/start',{cwd:dataDir,sandbox:'read-only',approvalPolicy:'never',ephemeral:true},30000); cancelled();
    if (!thread.thread?.id) throw new Error('Drive read session was unavailable.');
    const call = async (name,args) => {
      const tool = tools.find(t => t.name === name);
      if (!readNames.has(name) || !tool || tool.annotations?.readOnlyHint !== true || tool.annotations?.destructiveHint === true || Object.keys(args).some(k=>!Object.hasOwn(tool.inputSchema?.properties || {},k))) throw new Error('The installed Drive read tool or schema is unavailable.');
      cancelled(); activity(action === 'search' ? 'Searching Drive file metadata.' : 'Reading the selected Google file.',name);
      store.event({source:'agent',agentId:job.agentId,type:'drive.tool.started',message:'Started a selected read-only Drive operation.',data:{tool:name}});
      const result = await client.request('mcpServer/tool/call',{server:'codex_apps',threadId:thread.thread.id,tool:name,arguments:args},45000); cancelled(); return result;
    };
    if (action === 'search') {
      const result = normalizeDriveSearch(await call('google_drive.search',{query:job.payload.query,topn:20,item_type:'document',best_effort_fetch:false,...(job.payload.cursor?{page_token:job.payload.cursor}:{})}));
      await client.close(); cancelled(); store.put('settings',{...prior,id:'drive-state',connection:'connected',checkedAt,...result,query:job.payload.query,searchedAt:now(),error:null});
    } else {
      const sourceUrl = driveFileUrl(job.payload.sourceUrl), result = normalizeDriveText(await call('google_drive.fetch',{url:sourceUrl,download_raw_file:false}));
      await client.close(); cancelled();
      const previous = job.payload.documentId ? store.get('knowledgeDocuments',job.payload.documentId) : store.list('knowledgeDocuments').find(d => d.sourceUrl === sourceUrl && d.scope === job.payload.scope && d.projectId === job.payload.projectId);
      if (job.payload.documentId && !previous) throw new Error('The selected document was removed during refresh.');
      // Refresh cannot silently move/re-enable a document whose scope the owner changed mid-read.
      const document = { ...previous, ...result, id:previous?.id || id('document'), sourceUrl, scope:previous?.scope || job.payload.scope, projectId:previous ? previous.projectId : job.payload.projectId, enabled:previous?.enabled ?? false, fetchedAt:now(), createdAt:previous?.createdAt || now(), stale:false,error:null };
      document.revision=knowledgeRevision(document); store.put('knowledgeDocuments',document);
      store.put('settings',{...prior,id:'drive-state',connection:'connected',checkedAt,error:null,lastImportedId:document.id});
    }
    activity('Drive read completed.');
    store.event({source:'agent',agentId:job.agentId,type:'drive.read.completed',message:'Saved the bounded Drive read. No account records were changed.'});
  } catch (error) {
    const isCancelled = signal?.aborted || error.cancelled;
    const message = isCancelled ? 'Drive read cancelled.' : SAFE_ERROR;
    if (job.payload?.documentId && store.get('knowledgeDocuments',job.payload.documentId)) store.update('knowledgeDocuments',job.payload.documentId,{stale:true,error:message});
    store.put('settings',{...(store.get('settings','drive-state') || prior),id:'drive-state',connection:isCancelled?prior.connection || 'unknown':'error',error:message});
    throw Object.assign(new Error(message),{cancelled:isCancelled});
  } finally { signal?.removeEventListener('abort',abort); await client.close(); }
}
