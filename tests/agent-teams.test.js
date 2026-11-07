import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { once } from 'node:events';
import { createStore, id, now } from '../server/store.js';
import { createAgentChatRouter } from '../server/agent-chat.js';
import { resolveAgentProfile, migrateAgentNames } from '../server/agent-profiles.js';
import { AGENT_PROFILE_TEMPLATES } from '../shared/agent-catalog.js';
import { atomic, createTeamRun, publishTeamPlan, validateTeamPlan, reconcileTeamRuns, controlTeamRun, chatBusy, interruptTeamRuns } from '../server/agent-teams.js';
import { runAgentTurn } from '../worker/agent-chat.js';
import { startWorker } from '../worker/index.js';

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-team-test-')), store = createStore(directory);
  const cleanup = [];
  t.after(async () => { for (const close of cleanup) await close(); store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const profiles = AGENT_PROFILE_TEMPLATES.map(p => ({ ...p, id: `profile_${p.id}`, skills: [], skillIds: [] }));
  profiles.forEach(p => store.put('agentProfiles', p));
  const chat = store.put('agentChats', { id: id('chat'), profileId: profiles[0].id, profile: profiles[0], projectId: null, title: 'Synthetic team goal', threadId: null });
  const message = store.put('agentMessages', { id: id('message'), chatId: chat.id, role: 'user', content: 'Produce a synthetic project brief with two independent viewpoints.', mode: 'team', createdAt: now() });
  const captured = { coordinator: profiles[0], roster: profiles.slice(1) };
  const create = () => atomic(store, () => createTeamRun(store, chat, message, captured));
  const plan = team => atomic(store, () => publishTeamPlan(store, team, validateTeamPlan(store, team, JSON.stringify({ assignments: profiles.slice(1, 3).map((p, i) => ({ profileId: p.id, instruction: `Synthetic independent report ${i + 1}.` })) }))));
  return { cleanup, directory, store, profiles, chat, message, captured, create, plan };
}
const waitFor = async (predicate) => { const deadline = Date.now() + 5000; while (!predicate()) { if (Date.now() > deadline) throw new Error('Timed out waiting for worker state.'); await new Promise(r => setTimeout(r, 15)); } };

test('named roster migration is reversible, preserves histories/custom identities and keeps names in requested order', async t => {
  const f = await fixture(t), s = f.store;
  assert.deepEqual(AGENT_PROFILE_TEMPLATES.map(p => p.name), ['Elesis','Lire','Arme','Amy','Mari','Rohan','Lass','Zero','Jin','Dio','Ryan','Sieghart']);
  for (const p of f.profiles) s.remove('agentProfiles', p.id);
  const old = { id: 'old', name: 'CEO', role: 'strategy advisor', portraitId: 'elesis', instructions: 'Old captured instructions.', enabled: true, skillIds: [] };
  s.put('agentProfiles', old); s.put('agentProfiles', { ...old, id: 'duplicate', name: 'Reviewer', portraitId: 'lass' });
  s.put('agentProfiles', { ...old, id: 'chosen', name: 'Mari Reviewer', portraitId: 'lass', skillIds: ['custom'] });
  s.put('agentProfiles', { ...old, id: 'custom', name: 'My expert', portraitId: 'lire' });
  s.update('agentChats', f.chat.id, { profile: old });
  migrateAgentNames(s); migrateAgentNames(s);
  assert.equal(s.get('agentProfiles', 'old').name, 'Elesis'); assert.equal(s.get('agentProfiles', 'old').canDelegate, true);
  assert.equal(s.get('agentProfiles', 'old').instructions, old.instructions);
  assert.equal(s.get('agentChats', f.chat.id).profile.name, 'CEO'); assert.equal(s.get('agentChats', f.chat.id).profile.instructions, old.instructions);
  assert.equal(s.get('agentProfiles', 'chosen').name, 'Lass'); assert.equal(s.get('agentProfiles', 'duplicate').archived, true); assert.equal(s.get('agentProfiles', 'duplicate').enabled, false);
  assert.equal(s.get('agentProfiles', 'custom').name, 'My expert');
  assert.equal(s.get('agentProfiles', 'custom').role, old.role);
});

test('team API captures exact personal/project scope, requires explicit coordinator capability and locks active goals', async t => {
  const f = await fixture(t), s = f.store, app = express(), state = { online: true };
  app.use(express.json()); const resolves = [];
  app.use('/api', createAgentChatRouter({ store: s, enqueue: (type, fields) => s.put('jobs', { id: id('job'), type, ...fields, status: 'queued' }), getWorkers: () => state.online ? [{ status: 'online' }] : [], resolveProfile: (store, key, options) => { resolves.push(options); return resolveAgentProfile(store, key, { ...options, inventory: { resolve: async () => [] } }); } }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message, code: err.code }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening'); t.after(async () => { await new Promise(r => { server.close(r); server.closeAllConnections(); }); });
  const request = async (route, body) => { const r = await fetch(`http://127.0.0.1:${server.address().port}/api${route}`, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, value: await r.json() }; };
  state.online = false; assert.equal((await request(`/agent-chats/${f.chat.id}/messages`, { text: 'Goal', mode: 'team' })).status, 503);
  state.online = true; s.update('agentProfiles', f.chat.profileId, { canDelegate: false }); assert.equal((await request(`/agent-chats/${f.chat.id}/messages`, { text: 'Goal', mode: 'team' })).status, 409);
  s.update('agentProfiles', f.chat.profileId, { canDelegate: true });
  const sent = await request(`/agent-chats/${f.chat.id}/messages`, { text: 'A bounded team goal', mode: 'team' }); assert.equal(sent.status, 202);
  assert.ok(resolves.every(o => o.personal === true && o.projectId === null));
  const team = s.list('agentTeams')[0]; assert.equal(team.projectId, null); assert.equal(team.members.length, 0); assert.equal(s.list('agents').length, 0);
  assert.equal((await request(`/agent-chats/${f.chat.id}/messages`, { text: 'Duplicate' })).status, 409);
  assert.equal((await request(`/agent-chats/${f.chat.id}/action`, { action: 'cancel', jobId: sent.value.job.id })).value.code, 'TEAM_CONTROLS');
  f.plan(team); s.update('jobs', team.planJobId, { status: 'completed' });
  const detail = (await request(`/agent-chats/${f.chat.id}`)).value; assert.equal(detail.teams[0].members.length, 2); assert.equal(detail.chat.threadId, undefined); assert.equal(detail.teams[0].roster, undefined);
  assert.ok(detail.teams[0].members.every(m => m.job.projectId === null && m.task.parentTaskId === team.taskId));
  assert.equal((await request(`/agent-chats/${detail.teams[0].members[0].chatId}/messages`, { text: 'Delegate recursively', mode: 'team' })).status, 409);
  assert.equal((await request(`/agent-teams/${team.id}/action`, { action: 'cancel' })).status, 200);
  assert.equal(s.get('agentTeams', team.id).status, 'cancelled');
  s.put('projects', { id: 'project_a', name: 'Scoped project', path: f.directory });
  const projectChat = (await request('/agent-profiles/profile_ceo/chats', { projectId: 'project_a' })).value.chat;
  const goal = await request(`/agent-chats/${projectChat.id}/messages`, { text: 'Scoped project goal', mode: 'team' }); assert.equal(goal.status, 202);
  assert.ok(resolves.some(o => o.projectId === 'project_a' && o.personal === false));
});

test('untrusted plans cannot select foreign profiles, recursive coordinators, permissions or duplicate specialists', async t => {
  const f = await fixture(t), { team } = f.create();
  for (const assignments of [[], Array.from({ length: 7 }, () => ({ profileId: f.profiles[1].id, instruction: 'x' })), [{ profileId: 'foreign', instruction: 'x' }], [{ profileId: f.profiles[0].id, instruction: 'x' }], [{ profileId: f.profiles[1].id, instruction: 'x', projectId: 'other' }], [{ profileId: f.profiles[1].id, instruction: '' }], [{ profileId: f.profiles[1].id, instruction: 'a' }, { profileId: f.profiles[1].id, instruction: 'b' }]]) assert.throws(() => validateTeamPlan(f.store, team, JSON.stringify({ assignments })), { code: 'INVALID_PLAN' });
  assert.throws(() => validateTeamPlan(f.store, team, 'not JSON'), { code: 'INVALID_PLAN' });
  assert.equal(f.store.list('tasks').length, 1); assert.equal(f.store.list('agentChats').length, 1);
  f.store.update('agentProfiles', f.profiles[1].id, { enabled: false }); assert.throws(() => f.plan(team), { code: 'INVALID_PLAN' });
});

test('failed specialists prevent synthesis; team retry preserves completed output and cancellation leaves unrelated services/jobs alone', async t => {
  const f = await fixture(t), s = f.store, { team } = f.create(); f.plan(team); s.update('jobs', team.planJobId, { status: 'completed' });
  let current = s.get('agentTeams', team.id); const [a, b] = current.members;
  s.update('jobs', a.jobId, { status: 'completed' }); s.update('tasks', a.taskId, { status: 'completed', result: 'Verified saved report A.' });
  s.update('jobs', b.jobId, { status: 'failed', error: 'Synthetic failure' }); s.update('tasks', b.taskId, { status: 'failed' });
  reconcileTeamRuns(s); current = s.get('agentTeams', team.id); assert.equal(current.status, 'failed'); assert.equal(current.synthesisJobId, null);
  controlTeamRun(s, current, 'retry'); current = s.get('agentTeams', team.id); assert.equal(current.members[0].jobId, a.jobId); assert.notEqual(current.members[1].jobId, b.jobId); assert.equal(s.get('tasks', a.taskId).result, 'Verified saved report A.');
  const retry = current.members[1]; s.update('jobs', retry.jobId, { status: 'completed' }); s.update('tasks', retry.taskId, { status: 'completed', result: 'Saved report B.' });
  reconcileTeamRuns(s); reconcileTeamRuns(s); current = s.get('agentTeams', team.id); assert.equal(current.status, 'synthesizing'); assert.equal(s.list('jobs').filter(j => j.type === 'agent.team.synthesize').length, 1); assert.equal(chatBusy(s, f.chat.id), true);
  const service = s.put('services', { id: 'external', status: 'running', ownership: 'external' }), unrelated = s.put('jobs', { id: 'unrelated', type: 'capture', status: 'queued' });
  controlTeamRun(s, current, 'cancel'); assert.equal(s.get('agentTeams', team.id).status, 'cancelled'); assert.deepEqual(s.get('services', service.id), service); assert.deepEqual(s.get('jobs', unrelated.id), unrelated);
  assert.equal(s.get('jobs', a.jobId).status, 'completed');
});

test('restart preserves completed results and interrupts queued team work without replay', async t => {
  const f = await fixture(t), s = f.store, { team } = f.create(); f.plan(team); s.update('jobs', team.planJobId, { status: 'completed' });
  const [a, b] = s.get('agentTeams', team.id).members; s.update('jobs', a.jobId, { status: 'completed' }); s.update('tasks', a.taskId, { status: 'completed', result: 'Preserved' });
  interruptTeamRuns(s); reconcileTeamRuns(s); assert.equal(s.get('agentTeams', team.id).status, 'failed'); assert.equal(s.get('jobs', b.jobId).status, 'interrupted'); assert.equal(s.get('tasks', a.taskId).result, 'Preserved');
  controlTeamRun(s, s.get('agentTeams', team.id), 'retry'); assert.equal(s.get('agentTeams', team.id).members[0].jobId, a.jobId);
});

test('worker runs up to three actual independent agent executions while serializing profiles/chats and exclusive workflows', async t => {
  const f = await fixture(t), s = f.store; const executing = new Set(), releases = new Map(), peak = { value: 0 };
  const enqueue = (key, type, profile, chat) => s.put('jobs', { id: key, type, payload: { agentProfile: { id: profile }, chatId: chat }, status: 'queued', createdAt: now() });
  enqueue('one', 'agent.turn', 'a', 'a'); enqueue('same-profile', 'agent.turn', 'a', 'b'); enqueue('two', 'agent.turn', 'b', 'c'); enqueue('three', 'agent.turn', 'c', 'd'); enqueue('four', 'agent.turn', 'd', 'e');
  const worker = await startWorker({ store: s, dataDir: f.directory, pollMs: 10, makeWorkflow: () => ({ run: (job, signal) => new Promise(resolve => { executing.add(job.id); peak.value = Math.max(peak.value, executing.size); const done = () => { executing.delete(job.id); resolve(); }; releases.set(job.id, done); signal.addEventListener('abort', done, { once: true }); }) }) });
  f.cleanup.push(() => worker.stop({ stopServices: false }));
  await waitFor(() => executing.size === 3); assert.deepEqual([...executing], ['one', 'two', 'three']); assert.equal(s.get('jobs', 'same-profile').status, 'queued'); assert.equal(s.get('jobs', 'four').status, 'queued'); assert.equal(worker.capabilities.agentConcurrency, 3);
  releases.get('one')(); await waitFor(() => executing.has('same-profile')); assert.equal(executing.size, 3);
  releases.get('two')(); await waitFor(() => executing.has('four')); assert.equal(peak.value, 3);
  for (const release of releases.values()) release(); await waitFor(() => !s.list('jobs').some(j => j.status === 'running'));
  enqueue('exclusive', 'capture', null, null); enqueue('later', 'agent.turn', 'x', 'x'); await worker.runOnce(); await waitFor(() => executing.has('exclusive')); assert.equal(s.get('jobs', 'later').status, 'queued'); releases.get('exclusive')(); await waitFor(() => executing.has('later')); releases.get('later')();
  await waitFor(() => s.get('jobs', 'later').status === 'completed');
});

test('native planning validates structured output before publication, isolates specialist workspaces and synthesizes saved results', async t => {
  const f = await fixture(t), s = f.store, { job, team } = f.create(); let turns = [];
  const inspect = async () => ({ available: true, authenticated: true, supported: true });
  const makeCodex = options => ({ connect: async () => {}, close: async () => {}, runTurn: async args => { turns.push({ options, args }); args.onThread(`native_${turns.length}`); return { status: 'completed', threadId: `native_${turns.length}`, messages: [args.outputSchema ? JSON.stringify({ assignments: f.profiles.slice(1, 3).map(p => ({ profileId: p.id, instruction: `Write a brief as ${p.name}.` })) }) : 'A completed scoped specialist result.'], changedFiles: [] }; } });
  s.put('agents', { id: 'planner' }); await runAgentTurn({ store: s, dataDir: f.directory, job: { ...job, agentId: 'planner' }, makeCodex, inspect });
  assert.ok(turns[0].args.outputSchema); assert.equal(s.get('agentTeams', team.id).members.length, 2); s.update('jobs', job.id, { status: 'completed' });
  const members = s.get('agentTeams', team.id).members;
  for (const member of members) { const agentId = id('agent'); s.put('agents', { id: agentId }); const j = s.get('jobs', member.jobId); await runAgentTurn({ store: s, dataDir: f.directory, job: { ...j, agentId }, makeCodex, inspect }); s.update('jobs', j.id, { status: 'completed' }); }
  assert.notEqual(turns[1].options.executionPolicy.writableRoot, turns[2].options.executionPolicy.writableRoot); assert.deepEqual(turns[1].options.executionPolicy.readRoots, []);
  reconcileTeamRuns(s); const synthesis = s.get('jobs', s.get('agentTeams', team.id).synthesisJobId); s.put('agents', { id: 'synth' }); await runAgentTurn({ store: s, dataDir: f.directory, job: { ...synthesis, agentId: 'synth' }, makeCodex, inspect });
  assert.equal(turns.at(-1).args.outputSchema, undefined); assert.match(turns.at(-1).args.input[0].text, /completed scoped specialist result/); assert.equal(turns.at(-1).args.threadId, 'native_1');
  s.update('jobs', synthesis.id, { status: 'completed' }); reconcileTeamRuns(s); assert.equal(s.get('agentTeams', team.id).status, 'completed');
});

test('lease loss cancels every concurrent owned turn and shutdown does not touch external services', async t => {
  const f = await fixture(t), s = f.store, started = new Set();
  const external = s.put('services', { id: 'unrelated', status: 'running', ownership: 'external', url: 'http://127.0.0.1:1' });
  // The service reconciler may update external health, so preserve process ownership rather than cached health.
  const worker = await startWorker({ store: s, dataDir: f.directory, pollMs: 10, makeWorkflow: () => ({ run: (job, signal) => new Promise(resolve => { started.add(job.id); signal.addEventListener('abort', resolve, { once: true }); }) }) });
  f.cleanup.push(() => worker.stop({ stopServices: false }));
  for (let i = 0; i < 3; i++) s.put('jobs', { id: `lease_${i}`, type: 'agent.turn', status: 'queued', payload: { agentProfile: { id: `p_${i}` }, chatId: `c_${i}` } });
  await waitFor(() => started.size === 3);
  s.update('settings', 'worker-lease', { ownerId: 'new-worker' });
  await waitFor(() => [...started].every(key => s.get('jobs', key).status === 'cancelled'));
  assert.equal(s.get('services', external.id).ownership, 'external');
});

test('late plan cancellation publishes neither specialists nor a successful response', async t => {
  const f = await fixture(t), s = f.store, { job, team } = f.create(); s.put('agents', { id: 'planner' });
  const makeCodex = () => ({ connect: async () => {}, close: async () => {}, runTurn: async () => { controlTeamRun(s, s.get('agentTeams', team.id), 'cancel'); return { status: 'completed', threadId: 'synthetic', messages: [JSON.stringify({ assignments: [{ profileId: f.profiles[1].id, instruction: 'Scoped analysis.' }] })] }; } });
  await assert.rejects(runAgentTurn({ store: s, dataDir: f.directory, job: { ...job, agentId: 'planner' }, makeCodex, inspect: async () => ({ available: true, authenticated: true, supported: true }) }), { cancelled: true });
  assert.equal(s.get('agentTeams', team.id).members.length, 0); assert.equal(s.list('artifacts').length, 0); assert.equal(s.get('agentMessages', job.payload.replyId).status, 'cancelled');
});

test('team controls reject stale active records after authoritative completion', async t => {
  const f = await fixture(t), s = f.store, { team } = f.create();
  const stale = { ...team, status: 'working' };
  s.update('agentTeams', team.id, { status: 'completed', finishedAt: now() });
  assert.throws(() => controlTeamRun(s, stale, 'cancel'), { code: 'NOT_ACTIVE' });
  assert.equal(s.get('agentTeams', team.id).status, 'completed');
});

test('reconciliation reloads authoritative team state under its write lock before publishing synthesis', async t => {
  for (const childStatus of ['completed', 'cancelled']) {
    const f = await fixture(t), s = f.store, { team } = f.create(); f.plan(team); s.update('jobs', team.planJobId, { status: 'completed' });
    for (const m of s.get('agentTeams', team.id).members) { s.update('jobs', m.jobId, { status: childStatus }); s.update('tasks', m.taskId, { status: childStatus, result: 'Saved synthetic report.' }); }
    const list = s.list.bind(s); let injected = false;
    s.list = collection => { const result = list(collection); if (collection === 'agentTeams' && !injected) { injected = true; s.update('agentTeams', team.id, { status: 'cancelled', cancelRequested: true }); s.update('tasks', team.taskId, { status: 'cancelled' }); } return result; };
    reconcileTeamRuns(s); s.list = list;
    assert.equal(s.get('agentTeams', team.id).status, 'cancelled'); assert.equal(s.list('jobs').filter(j => j.type === 'agent.team.synthesize').length, 0);
  }
});
