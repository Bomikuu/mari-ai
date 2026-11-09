import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { boundedJson } from './market-data.js';
import { cleanKnowledgeText } from './knowledge.js';
import { now } from './store.js';
import { atomic } from './agent-teams.js';
import { createRedactor } from './security.js';

const fail = (message, status = 400, code = 'X_REQUEST') => Object.assign(new Error(message), { status, code });
export const xSettings = store => store.get('settings', 'x:preferences') || { accounts: [], allowPaidReads: false, capConfirmed: false, dailyBudgetUSD: 0, postsPerAccount: 5, includeReplies: false, includeReposts: false, newspaper: false, generation: null };
export const xPosts = store => store.list('settings').filter(r => r.id.startsWith('x:post:'));
const digest = config => createHash('sha256').update(JSON.stringify([config.generation, config.accounts.map(a => [a.handle, a.enabled, a.category]), config.allowPaidReads, config.capConfirmed, config.dailyBudgetUSD, config.postsPerAccount, config.includeReplies, config.includeReposts])).digest('hex');
const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
const credentialPath = dataDir => path.join(fs.realpathSync(dataDir), 'x-credentials.json');
function readCredential(dataDir) {
  let fd;
  try { fd = fs.openSync(credentialPath(dataDir), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); if (!fs.fstatSync(fd).isFile() || fs.fstatSync(fd).size > 8000) throw new Error(); return JSON.parse(fs.readFileSync(fd, 'utf8')); }
  catch { return null; } finally { if (fd !== undefined) fs.closeSync(fd); }
}
function writeCredential(dataDir, bearer, generation) {
  const target = credentialPath(dataDir), temp = `${target}.${randomUUID()}.tmp`;
  try { fs.writeFileSync(temp, JSON.stringify({ bearer, generation }), { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, target); }
  finally { fs.rmSync(temp, { force: true }); }
}
const publicConfig = config => Object.fromEntries(['accounts','allowPaidReads','capConfirmed','dailyBudgetUSD','postsPerAccount','includeReplies','includeReposts','newspaper'].map(k => [k,config[k]]));
const knownError = error => error.status ? cleanKnowledgeText(error.message) : 'X could not be reached. Check your network and developer API access.';

export function normalizeXPosts(data, account, fetchedAt) {
  if (!data || data.data !== undefined && !Array.isArray(data.data)) throw fail('X returned an invalid timeline.', 502);
  const rows = (data.data || []).slice(0, 20);
  return rows.map(p => {
    if (!/^\d{1,25}$/.test(p.id || '') || p.author_id !== account.userId || typeof p.text !== 'string' || p.text.length > 30000 || !p.created_at || !Number.isFinite(Date.parse(p.created_at))) throw fail('X returned an incomplete post.', 502);
    return { id: `x:post:${p.id}`, postId: p.id, authorId: p.author_id, handle: account.handle, name: account.name || account.handle, category: account.category, text: cleanKnowledgeText(p.text).slice(0, 12000), publishedAt: p.created_at, fetchedAt, url: `https://x.com/${account.handle}/status/${p.id}`, read: false, saved: false, newspaper: false, unavailable: false };
  });
}

export async function refreshXFeed({store,dataDir,fetchImpl=fetch,signal,handles=null}) {
    const config = xSettings(store), credential = readCredential(dataDir), expected = digest(config);
    if (!credential || credential.generation !== config.generation) throw fail('Configure X developer access first.', 409, 'X_SETUP_REQUIRED');
    if (!config.allowPaidReads || !config.capConfirmed || config.dailyBudgetUSD <= 0) throw fail('Confirm separately billed X reads, your X Developer Console spending cap and a positive local daily limit.', 409, 'X_CONSENT_REQUIRED');
    const selected = config.accounts.filter(a => a.enabled && (handles===null||handles.includes(a.handle))); if (!selected.length) throw fail('Choose at least one X account before refreshing.');
    const connection = store.get('settings', 'x:connection'); if (Date.parse(connection?.retryAt || '') > Date.now()) throw fail(`Wait until ${connection.retryAt} before another X request.`, 429, 'X_BACKOFF');
    const leaseId = randomUUID();
    atomic(store, () => { const lease = store.get('settings', 'x:refresh'); if (Date.parse(lease?.expiresAt || '') > Date.now()) throw fail('An X refresh is already in progress.',409,'X_BUSY'); store.put('settings',{id:'x:refresh',leaseId,expiresAt:new Date(Date.now()+120000).toISOString()}); });
    const errors = []; let fetched = 0; const checkedAt = now();
    const check = () => { if (signal?.aborted) throw Object.assign(new Error('X refresh cancelled.'),{cancelled:true}); if (store.get('settings','x:refresh')?.leaseId !== leaseId) throw fail('X refresh ownership changed.',409,'X_SCOPE_CHANGED'); if (digest(xSettings(store)) !== expected || readCredential(dataDir)?.generation !== config.generation) throw fail('X settings or access changed during this refresh. Late results were discarded.', 409, 'X_SCOPE_CHANGED'); };
    const reserve = (resources, unit) => atomic(store, () => { check(); const key = `x:usage:${day()}`, usage = store.get('settings', key) || { reservedUSD: 0, resourcesReserved: 0 }; const amount = Math.round(resources * unit * 1e6) / 1e6;
      if (usage.reservedUSD + amount > config.dailyBudgetUSD + 1e-9) throw fail('The local daily X reservation limit has been reached. No further paid request was made.', 409, 'X_BUDGET');
      store.put('settings', { ...usage, id: key, reservedUSD: Math.round((usage.reservedUSD + amount) * 1e6) / 1e6, resourcesReserved: usage.resourcesReserved + resources });
    });
    const call = async (route, resources, unit) => { reserve(resources, unit); const result = await boundedJson(`https://api.x.com/2/${route}`, { fetchImpl, headers: { Authorization: `Bearer ${credential.bearer}` } }); check(); return result; };
    store.addSecrets([credential.bearer]);
    try {
      // Three accounts per manual refresh, rotating fairly through larger lists.
      const offset = (connection?.nextAccount || 0) % selected.length, batch = [...selected.slice(offset), ...selected.slice(0, offset)].slice(0, 3);
      for (const original of batch) {
        try {
          check(); let account = original;
          if (!account.userId) {
            const lookup = await call(`users/by/username/${account.handle}`, 1, 0.01);
            if (!/^\d{1,25}$/.test(lookup.data?.id || '') || String(lookup.data?.username || '').toLowerCase() !== account.handle) throw fail(`X could not resolve @${account.handle}.`, 502);
            account = { ...account, userId: lookup.data.id, name: cleanKnowledgeText(lookup.data.name || account.handle).slice(0,100) };
          }
          const exclude = [...(!config.includeReplies ? ['replies'] : []), ...(!config.includeReposts ? ['retweets'] : [])];
          const params = new URLSearchParams({ max_results: config.postsPerAccount, 'tweet.fields': 'created_at,author_id' }); if (exclude.length) params.set('exclude', exclude.join(','));
          const response = await call(`users/${account.userId}/tweets?${params}`, config.postsPerAccount, 0.005);
          if (response.errors?.length && !response.data) throw fail(`X did not return posts for @${account.handle}.`, 502);
          const redactor=createRedactor([credential.bearer]);
          account={...account,name:redactor.redact(account.name)};
          const posts = normalizeXPosts(response, account, checkedAt).map(p=>({...p,text:redactor.redact(p.text)})); check();
          atomic(store, () => { check(); for (const p of posts) { const previous = store.get('settings', p.id); store.put('settings', { ...p, read: previous?.read || false, saved: previous?.saved || false, newspaper: previous?.newspaper || false }); } const latest = xSettings(store); store.put('settings', { ...latest, id: 'x:preferences', accounts: latest.accounts.map(a => a.handle === account.handle ? account : a) }); });
          fetched++; if (response.errors?.length) errors.push(`@${account.handle}: X returned partial data.`);
        } catch (error) {
          if (error.code === 'X_SCOPE_CHANGED' || error.cancelled) throw error;
          errors.push(`@${original.handle}: ${knownError(error)}`);
          if (error.status === 429 || error.code === 'X_BUDGET') { store.put('settings', { ...connection, id: 'x:connection', status: 'partial', retryAt: error.status === 429 ? new Date(Date.now() + 60000 * 5).toISOString() : null }); break; }
        }
      }
      check(); const latestConnection = store.get('settings', 'x:connection');
      store.put('settings', { id: 'x:connection', status: fetched ? errors.length || batch.length < selected.length ? 'partial' : 'connected' : 'error', checkedAt, message: `Refreshed ${fetched} of ${selected.length} selected accounts. ${batch.length < selected.length ? 'Refresh again for the next group. ' : ''}${errors.join(' ')}`.slice(0,1600), nextAccount: (offset + batch.length) % selected.length, retryAt: latestConnection?.retryAt || null });
      const all = xPosts(store).sort((a,b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt)); for (const p of all.slice(500)) if (!p.saved && !p.newspaper) store.remove('settings', p.id);
      return { fetched, errors, connection: store.get('settings', 'x:connection') };
    } catch (error) { if (error.code !== 'X_SCOPE_CHANGED') store.put('settings', { id: 'x:connection', status: 'error', checkedAt, message: knownError(error) }); throw error; }
    finally { if (store.get('settings','x:refresh')?.leaseId === leaseId) store.remove('settings','x:refresh'); }
}

export function createXNewsRouter({ store, dataDir, fetchImpl = fetch }) {
  const router = express.Router();
  const state = () => {
    const config = xSettings(store), credential = readCredential(dataDir), connection = store.get('settings', 'x:connection');
    const posts = xPosts(store).filter(p => config.accounts.some(a => a.enabled && a.handle === p.handle)).map(p => {
      const expired = Date.now() - Date.parse(p.fetchedAt) > 86400000;
      return { ...p, text: expired ? '' : p.text, expired, stale: expired || Date.now() - Date.parse(p.fetchedAt) > 900000, category: config.accounts.find(a => a.handle === p.handle)?.category || '' };
    }).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return { settings: publicConfig(config), configured: Boolean(credential?.bearer && credential.generation === config.generation), connection: connection || { status: 'unverified', message: 'Save API access and explicitly refresh to check the connection.' }, posts, usage: store.get('settings', `x:usage:${day()}`) || { reservedUSD: 0, resourcesReserved: 0 }, pricing: { checkedAt: '2026-11-07', postUSD: 0.005, userUSD: 0.01, url: 'https://docs.x.com/x-api/getting-started/pricing', note: 'Conservative local reservations, not actual billed totals. Set the authoritative spending cap in X Developer Console.' }, refreshing: Date.parse(store.get('settings','x:refresh')?.expiresAt || '') > Date.now() };
  };
  router.get('/', (req, res) => {
    const value = state(), q = String(req.query.query || '').toLowerCase().slice(0, 200);
    value.posts = value.posts.filter(p => (!q || `${p.text} ${p.handle}`.toLowerCase().includes(q)) && (!req.query.account || p.handle === req.query.account) && (!req.query.category || p.category === req.query.category) && (req.query.unread !== '1' || !p.read) && (req.query.saved !== '1' || p.saved) && (!req.query.since || Date.parse(p.publishedAt) >= Date.parse(req.query.since)));
    res.json(value);
  });
  router.put('/preferences', (req, res) => {
    const config = xSettings(store), input = req.body;
    if (!input || Object.keys(input).some(k => !['accounts','allowPaidReads','capConfirmed','dailyBudgetUSD','postsPerAccount','includeReplies','includeReposts','newspaper'].includes(k))) throw fail('Choose the supported X feed settings.');
    const patch = {};
    for (const key of ['allowPaidReads','capConfirmed','includeReplies','includeReposts','newspaper']) if (input[key] !== undefined) { if (typeof input[key] !== 'boolean') throw fail(`${key} must be true or false.`); patch[key] = input[key]; }
    if (input.dailyBudgetUSD !== undefined) { const n = Number(input.dailyBudgetUSD); if (!Number.isFinite(n) || n < 0 || n > 100 || typeof input.dailyBudgetUSD === 'boolean') throw fail('Choose a daily local reservation limit from $0 to $100.'); patch.dailyBudgetUSD = n; }
    if (input.postsPerAccount !== undefined) { if (![5,10,20].includes(Number(input.postsPerAccount))) throw fail('Choose 5, 10 or 20 posts per account.'); patch.postsPerAccount = Number(input.postsPerAccount); }
    if (input.accounts !== undefined) {
      if (!Array.isArray(input.accounts) || input.accounts.length > 20) throw fail('Choose up to 20 X accounts.');
      const seen = new Set(); patch.accounts = input.accounts.map(a => { const handle = String(a.handle || '').replace(/^@/, '').toLowerCase();
        if (!/^[a-z0-9_]{1,15}$/.test(handle) || seen.has(handle) || typeof a.enabled !== 'boolean' || typeof a.category !== 'string' || a.category.length > 60 || Object.keys(a).some(k => !['handle','enabled','category'].includes(k))) throw fail('Use unique valid @handles, a category up to 60 characters, and an enabled choice.');
        seen.add(handle); const previous = config.accounts.find(v => v.handle === handle);
        return { handle, enabled: a.enabled, category: cleanKnowledgeText(a.category.trim()), ...(previous?.userId ? { userId: previous.userId, name: previous.name } : {}) };
      });
    }
    const saved = store.put('settings', { ...config, ...patch, id: 'x:preferences' }); res.json({ settings: publicConfig(saved) });
  });
  router.post('/connection', (req, res) => {
    if (!req.body || Object.keys(req.body).some(k => k !== 'bearer') || typeof req.body.bearer !== 'string' || req.body.bearer.length < 20 || req.body.bearer.length > 4096 || /\s/.test(req.body.bearer)) throw fail('Enter the official X developer app bearer token in this private form.');
    const generation = randomUUID(); store.addSecrets([req.body.bearer]); writeCredential(dataDir, req.body.bearer, generation);
    store.put('settings', { ...xSettings(store), id: 'x:preferences', generation, allowPaidReads: false, capConfirmed: false });
    store.put('settings', { id: 'x:connection', status: 'unverified', message: 'Credential saved privately. No request has been made. Review paid-read controls before refreshing.' }); res.json({ configured: true });
  });
  router.delete('/connection', (req, res) => { fs.rmSync(credentialPath(dataDir), { force: true }); store.put('settings', { ...xSettings(store), id: 'x:preferences', generation: randomUUID(), allowPaidReads: false, capConfirmed: false }); store.put('settings', { id: 'x:connection', status: 'disconnected', message: 'X API access disconnected.' }); res.json({ disconnected: true }); });
  router.patch('/posts/:id', (req, res) => {
    const post = store.get('settings', `x:post:${req.params.id}`);
    if (!post || !xSettings(store).accounts.some(a => a.enabled && a.handle === post.handle)) throw fail('Post not found in the selected feed.', 404);
    if (!req.body || !Object.keys(req.body).length || Object.keys(req.body).some(k => !['read','saved','newspaper'].includes(k) || typeof req.body[k] !== 'boolean')) throw fail('Choose a local read, saved or newspaper state.');
    store.update('settings', post.id, req.body); res.json({ saved: true });
  });
  router.post('/refresh', async (req,res) => res.json(await refreshXFeed({store,dataDir,fetchImpl})));

  return router;
}
