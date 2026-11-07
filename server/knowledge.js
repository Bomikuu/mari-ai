import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { id, now } from './store.js';
const atomic = (store, run) => { store.db.exec('BEGIN IMMEDIATE'); try { const result = run(); store.db.exec('COMMIT'); return result; } catch (error) { store.db.exec('ROLLBACK'); throw error; } };
import { createRedactor, secretEnvironmentValues } from './security.js';

export const knowledgeError = (message, status = 400, code = 'INVALID_KNOWLEDGE') => Object.assign(new Error(message), { status, code });
const fail = knowledgeError;
export const cleanKnowledgeText = value => createRedactor(secretEnvironmentValues()).redact(String(value)).replace(/\b\d{6,}:[A-Za-z0-9_-]{30,}\b/g, '[REDACTED]');
export function knowledgeScope(store, input) {
  const scope = input.scope || 'personal', projectId = input.projectId || null;
  if (!['personal','project','shared'].includes(scope) || scope === 'project' && (typeof projectId !== 'string' || !store.get('projects', projectId)) || scope !== 'project' && projectId) throw fail('Choose Personal, Shared, or a registered project.');
  return { scope, projectId };
}
export function validateNote(store, input, previous = null) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['title','text','kind','scope','projectId','enabled'].includes(k))) throw fail('Choose a title, note text and context scope.');
  const v = { ...previous, ...input };
  if (typeof v.title !== 'string' || !v.title.trim() || v.title.length > 120 || typeof v.text !== 'string' || !v.text.trim() || v.text.length > 16000) throw fail('Use a title of 1–120 characters and note text of 1–16,000 characters.');
  if (!['note','preference','decision'].includes(v.kind || 'note') || typeof (v.enabled ?? true) !== 'boolean') throw fail('Choose a supported note kind and context setting.');
  if (/-----BEGIN .*PRIVATE KEY-----/.test(v.text)) throw fail('Keep private keys in credential storage, outside notes.');
  return { title: cleanKnowledgeText(v.title.trim()), text: cleanKnowledgeText(v.text.trim()), kind: v.kind || 'note', enabled: v.enabled ?? true, ...knowledgeScope(store, v) };
}
export const knowledgeRevision = value => createHash('sha256').update(JSON.stringify([value.title, value.text, value.scope, value.projectId])).digest('hex');
export function notesDirectory(dataDir) {
  const directory = path.join(path.resolve(dataDir), 'memory', 'notes'); fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (fs.realpathSync(directory) !== directory || fs.realpathSync(path.dirname(directory)) !== path.dirname(directory)) throw fail('The notes folder must remain inside Mari’s private runtime.', 409);
  return directory;
}
export function noteMarkdown(note) { return `# ${note.title}\n\nKind: ${note.kind}\nScope: ${note.scope}${note.projectId ? ` (${note.projectId})` : ''}\nUpdated: ${note.updatedAt || note.createdAt}\nRevision: ${note.revision}\n\n${note.text}\n`; }
export function saveNote(store, dataDir, input, previous = null) {
  const fields = validateNote(store, input, previous), note = { ...fields, id: previous?.id || id('note'), createdAt: previous?.createdAt || now(), updatedAt: now(), revision: knowledgeRevision(fields) };
  const directory = notesDirectory(dataDir), file = path.join(directory, `${note.id}.md`), temp = path.join(directory, `.${randomUUID()}.tmp`);
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw fail('The note file changed unexpectedly.', 409);
  try { fs.writeFileSync(temp, noteMarkdown(note), { flag: 'wx', mode: 0o600 }); atomic(store, () => { store.put('memories', note); fs.renameSync(temp, file); }); }
  finally { fs.rmSync(temp, { force: true }); }
  return store.get('memories', note.id);
}
const eligible = (item, projectId) => item.enabled && (item.scope === 'shared' || (projectId ? item.scope === 'project' && item.projectId === projectId : item.scope === 'personal'));
export function captureKnowledgeContext(store, { projectId = null, instruction = '' } = {}) {
  const terms = new Set(String(instruction).toLowerCase().match(/[a-z0-9]{3,}/g) || []);
  const candidates = [...store.list('memories').map(v => ({ ...v, sourceType: 'note' })), ...store.list('knowledgeDocuments').map(v => ({ ...v, sourceType: 'drive' }))].filter(v => eligible(v, projectId) && v.text);
  const score = value => [...terms].reduce((n, term) => n + (`${value.title} ${value.text}`.toLowerCase().includes(term) ? 1 : 0), ['preference','decision'].includes(value.kind) ? 2 : 0);
  candidates.sort((a, b) => score(b) - score(a) || String(b.updatedAt || '').localeCompare(a.updatedAt || ''));
  const sources = []; let remaining = 12000;
  for (const item of candidates.slice(0, 8)) {
    if (remaining <= 0) break;
    const excerpt = cleanKnowledgeText(item.text).slice(0, Math.min(4000, remaining)); remaining -= excerpt.length;
    sources.push({ id: item.id, sourceType: item.sourceType, title: item.title, scope: item.scope, projectId: item.projectId, revision: item.revision, sourceUrl: item.sourceUrl || null, updatedAt: item.updatedAt, fetchedAt: item.fetchedAt || null, modifiedAt: item.modifiedAt || null, stale: Boolean(item.stale), excerpt, truncated: item.truncated || item.text.length > excerpt.length });
  }
  return { capturedAt: now(), projectId, sources, characters: 12000 - remaining, truncated: candidates.length > sources.length || sources.some(s => s.truncated) };
}
export function driveFileUrl(input) {
  let url; try { url = new URL(input); } catch { throw fail('Choose a Google Drive, Docs or Sheets file URL.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['drive.google.com','docs.google.com'].includes(url.hostname)) throw fail('Use an HTTPS Google file URL without credentials.');
  let match = url.pathname.match(/^\/(?:file|document|spreadsheets|presentation)\/d\/([\w-]{5,200})(?:\/|$)/);
  if (!match && url.hostname === 'drive.google.com' && url.pathname === '/open' && /^[\w-]{5,200}$/.test(url.searchParams.get('id') || '')) match = [null, url.searchParams.get('id')];
  if (!match) throw fail('Choose a file, not a folder or a Google home page.');
  return `https://drive.google.com/file/d/${match[1]}/view`;
}

export function createKnowledgeRouter({ store, dataDir, enqueue, getWorkers }) {
  const router = express.Router();
  const record = (collection, key) => { const value = store.get(collection, key); if (!value) throw fail('This knowledge item was not found.', 404); return value; };
  router.get('/', (req, res) => res.json({ notes: store.list('memories'), documents: store.list('knowledgeDocuments'), notesDirectory: notesDirectory(dataDir), drive: store.get('settings', 'drive-state') || { connection: 'unknown', results: [], nextCursor: null }, jobs: store.list('jobs').filter(j => j.type?.startsWith('knowledge.drive.')).slice(-20).map(({payload, ...j}) => j) }));
  router.post('/notes', (req, res) => res.status(201).json({ note: saveNote(store, dataDir, req.body) }));
  router.patch('/notes/:id', (req, res) => res.json({ note: saveNote(store, dataDir, req.body, record('memories', req.params.id)) }));
  router.delete('/notes/:id', (req, res) => { const note = record('memories', req.params.id); const file = path.join(notesDirectory(dataDir), `${note.id}.md`); fs.rmSync(file, { force: true }); store.remove('memories', note.id); res.json({ deleted: true }); });
  router.get('/notes/:id/download', (req, res) => { const note = record('memories', req.params.id); res.set('Content-Type','text/markdown; charset=utf-8'); res.set('Content-Disposition',`attachment; filename="${note.title.replace(/[^a-z0-9_-]/gi,'-').slice(0,80)}.md"`); res.send(noteMarkdown(note)); });
  router.patch('/documents/:id', (req, res) => {
    const previous = record('knowledgeDocuments', req.params.id);
    if (!req.body || Object.keys(req.body).some(k => !['enabled','scope','projectId'].includes(k)) || req.body.enabled !== undefined && typeof req.body.enabled !== 'boolean') throw fail('Choose the document scope and agent context setting.');
    const fields = { ...previous, ...req.body }; res.json({ document: store.update('knowledgeDocuments', previous.id, { ...knowledgeScope(store, fields), enabled: fields.enabled, revision: knowledgeRevision(fields) }) });
  });
  router.delete('/documents/:id', (req,res) => { record('knowledgeDocuments', req.params.id); store.remove('knowledgeDocuments', req.params.id); res.json({ deleted: true }); });
  router.post('/drive/:action', (req, res) => {
    const action = req.params.action; if (!['inspect','search','import','refresh','cancel'].includes(action)) throw fail('Choose a supported Drive action.');
    if (action === 'cancel') { const j = record('jobs', req.body?.jobId); if (!j.type?.startsWith('knowledge.drive.') || !['queued','running'].includes(j.status)) throw fail('This Drive read is no longer active.',409); store.update('jobs',j.id,{cancelRequested:true,...(j.status==='queued'?{status:'cancelled',finishedAt:now()}:{})}); return res.json({cancelled:true}); }
    if (!getWorkers().some(w => w.status === 'online')) throw fail('Start Mari’s worker to read Google Drive.',409,'WORKER_OFFLINE');
    if (store.list('jobs').some(j => j.type?.startsWith('knowledge.drive.') && ['queued','running'].includes(j.status))) throw fail('Wait for the current Drive read or cancel it.',409,'DRIVE_BUSY');
    let payload = {};
    if (action === 'search') { if (typeof req.body?.query !== 'string' || req.body.query.length > 200 || req.body.cursor != null && (typeof req.body.cursor !== 'string' || req.body.cursor.length > 8000)) throw fail('Search using up to 200 characters.'); payload = {query:cleanKnowledgeText(req.body.query.trim()),cursor:req.body.cursor||null}; }
    if (action === 'import') payload = { sourceUrl: driveFileUrl(req.body?.url), ...knowledgeScope(store, req.body || {}) };
    if (action === 'refresh') { const d = record('knowledgeDocuments',req.body?.documentId); payload={documentId:d.id,sourceUrl:d.sourceUrl,scope:d.scope,projectId:d.projectId}; }
    res.status(202).json({ job: enqueue(`knowledge.drive.${action}`, { payload }) });
  });
  return router;
}
