import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStore, now } from '../server/store.js';
import { AGENT_PROFILE_TEMPLATES } from '../shared/agent-catalog.js';
import { prepareDelegatedGoal } from '../server/agent-goals.js';
import { dotWorkerState, submitDotGoal, dotStatus, dotResult, cancelDotGoal, dotRequests } from '../server/dot-handoff.js';
import { processIdentity } from '../worker/services.js';
import { atomic, publishTeamPlan, reconcileTeamRuns } from '../server/agent-teams.js';
import { dotArguments, readDotInput } from '../scripts/dot-handoff.js';

const exec = promisify(execFile);
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-dot-test-')), store = createStore(directory);
  t.after(async () => { store.close(); await fs.rm(directory, { recursive: true, force: true }); });
  for (const profile of AGENT_PROFILE_TEMPLATES) store.put('agentProfiles', { ...profile, id: `profile_${profile.id}`, skillIds: [] });
  const identity = await processIdentity(process.pid);
  store.put('settings', { id: 'worker-lease', ownerId: 'worker_fixture', ...identity, lastHeartbeatAt: now() });
  store.put('workers', { id: 'worker_fixture', status: 'online', ...identity, lastHeartbeatAt: now(), capabilities: { jobTypes: null } });
  const prepare = (s, args) => prepareDelegatedGoal(s, args, async (s, key) => ({ ...s.get('agentProfiles', key), skills: [] }));
  const payload = { requestId: 'dot-fixture-01', projectId: null, instruction: 'Produce a concise synthetic plan.', title: 'Dot · synthetic goal' };
  return { directory, store, prepare, payload, submit: (input = payload, options = {}) => submitDotGoal(store, input, { prepare, ...options }) };
}

test('concurrent identical handoffs queue once, conflicts reject, and replay works offline', async t => {
  const f = await fixture(t), s = f.store;
  const submitted = await Promise.all([f.submit(), f.submit()]);
  assert.equal(new Set(submitted.map(r => r.teamId)).size, 1); assert.equal(submitted.filter(r => r.reused).length, 1);
  assert.equal(s.list('agentTeams').length, 1); assert.equal(s.list('jobs').length, 1);
  assert.equal(s.list('agentTeams')[0].origin.type, 'dot'); assert.equal(s.list('agentChats')[0].title, f.payload.title);
  await assert.rejects(f.submit({ ...f.payload, instruction: 'Different work.' }), { code: 'REQUEST_CONFLICT' });
  s.update('workers', 'worker_fixture', { status: 'offline' });
  assert.equal((await f.submit()).reused, true); assert.equal((await dotStatus(s, f.payload.requestId)).worker.status, 'offline');
});

test('explicit registered scope, immutable roster and enabled context are required', async t => {
  const f = await fixture(t), s = f.store;
  for (const input of [{ ...f.payload, projectId: undefined }, { ...f.payload, projectId: 'missing' }, { ...f.payload, command: 'anything' }, { ...f.payload, instruction: '' }, { ...f.payload, requestId: '../escape' }]) await assert.rejects(f.submit(input));
  assert.equal(s.list('jobs').length, 0);
  s.put('projects', { id: 'project_a', path: f.directory, name: 'Synthetic project' });
  const result = await f.submit({ ...f.payload, projectId: 'project_a' });
  const team = s.get('agentTeams', result.teamId); assert.equal(team.projectId, 'project_a'); assert.equal(team.coordinator.name, 'Elesis');
  s.update('agentProfiles', team.roster[0].id, { name: 'Changed later' }); assert.notEqual(team.roster[0].name, s.get('agentProfiles', team.roster[0].id).name);
});

test('stale, restricted, mismatched and dead worker identities cannot accept goals', async t => {
  for (const mode of ['stale', 'restricted', 'mismatch', 'dead']) {
    const f = await fixture(t), s = f.store;
    if (mode === 'stale') s.update('workers', 'worker_fixture', { lastHeartbeatAt: '2000-01-01T00:00:00Z' });
    if (mode === 'restricted') s.update('workers', 'worker_fixture', { capabilities: { jobTypes: ['personal.newspaper.generate'] } });
    if (mode === 'mismatch') s.update('settings', 'worker-lease', { startTicks: '0' });
    await assert.rejects(f.submit(f.payload, mode === 'dead' ? { identity: async () => null } : {}), { code: 'WORKER_OFFLINE' });
    assert.equal(s.list('jobs').length, 0);
  }
});

test('scope removal, coordinator disable and worker replacement during preparation leave no partial writes', async t => {
  for (const mode of ['scope', 'coordinator', 'worker']) {
    const f = await fixture(t), s = f.store; s.put('projects', { id: 'project_a', name: 'Synthetic', path: f.directory });
    await assert.rejects(f.submit({ ...f.payload, projectId: 'project_a' }, { prepare: async (s, args) => {
      const result = await f.prepare(s, args);
      if (mode === 'scope') s.remove('projects', 'project_a');
      if (mode === 'coordinator') s.update('agentProfiles', 'profile_ceo', { enabled: false });
      if (mode === 'worker') s.update('settings', 'worker-lease', { ownerId: 'other' });
      return result;
    } }));
    assert.equal(s.list('agentTeams').length, 0); assert.equal(s.list('agentChats').length, 0); assert.equal(dotRequests(s).requests.length, 0);
  }
});

test('own request cancellation is idempotent, bound to its team, and independent of services/foreign work', async t => {
  const f = await fixture(t), s = f.store, result = await f.submit();
  const foreign = s.put('jobs', { id: 'foreign', type: 'capture', status: 'running' });
  const service = s.put('services', { id: 'external', status: 'running', ownership: 'external' });
  assert.throws(() => cancelDotGoal(s, result.teamId), { code: 'NOT_FOUND' });
  assert.equal(cancelDotGoal(s, f.payload.requestId).status, 'cancelled'); assert.equal(cancelDotGoal(s, f.payload.requestId).status, 'cancelled');
  assert.deepEqual(s.get('jobs', 'foreign'), foreign); assert.deepEqual(s.get('services', 'external'), service);
  s.update('agentTeams', result.teamId, { origin: { type: 'desktop' } });
  await assert.rejects(dotStatus(s, f.payload.requestId), { code: 'NOT_FOUND' });
});

test('three active handoff limit is enforced atomically across concurrent submissions', async t => {
  const f = await fixture(t), results = await Promise.allSettled(Array.from({ length: 5 }, (_, i) => f.submit({ ...f.payload, requestId: `concurrent-${i}` })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert(results.filter(r => r.status === 'rejected').every(r => r.reason.code === 'HANDOFF_LIMIT'));
  assert.equal(f.store.list('jobs').length, 3);
});

test('reported live actions require the current worker and preserve stale activity as historical', async t => {
  const f = await fixture(t), s = f.store, result = await f.submit(), team = s.get('agentTeams', result.teamId);
  s.put('agents', { id: 'agent_fixture', workerId: 'worker_fixture', status: 'working', action: 'Preparing specialist assignments.', currentCommand: 'native turn', lastActivityAt: now() });
  s.update('jobs', team.planJobId, { status: 'running', workerId: 'worker_fixture', agentId: 'agent_fixture' });
  assert.equal((await dotStatus(s, f.payload.requestId)).coordinatorExecution.action, 'Preparing specialist assignments.');
  s.update('agents', 'agent_fixture', { workerId: 'old_worker' });
  const stale = await dotStatus(s, f.payload.requestId); assert.equal(stale.coordinatorExecution.action, null); assert.equal(stale.coordinatorExecution.currentCommand, null); assert.equal(stale.coordinatorExecution.lastReportedAction, 'Preparing specialist assignments.');
});

test('status/result follow actual team phases, scope events, redact secrets and bound output', async t => {
  const f = await fixture(t), s = f.store, result = await f.submit(); let team = s.get('agentTeams', result.teamId);
  assert.equal((await dotResult(s, f.payload.requestId)).complete, false);
  s.event({ source: 'agent', taskId: 'foreign', message: 'Unrelated private output' });
  atomic(s, () => publishTeamPlan(s, team, [{ profile: team.roster[0], instruction: 'Synthetic independent work.' }]));
  s.update('jobs', team.planJobId, { status: 'completed' }); team = s.get('agentTeams', team.id); const member = team.members[0];
  s.update('jobs', member.jobId, { status: 'completed' }); s.update('tasks', member.taskId, { result: 'token=synthetic-credential ' + 'a'.repeat(7000), status: 'completed' });
  const partial = await dotResult(s, f.payload.requestId); assert.equal(partial.complete, false); assert.equal(partial.specialistResults.length, 1); assert.equal(partial.specialistResults[0].truncated, true);
  assert(!JSON.stringify(partial).includes('synthetic-credential')); assert(!JSON.stringify(partial.events).includes('Unrelated private'));
  reconcileTeamRuns(s); team = s.get('agentTeams', team.id); const synth = s.get('jobs', team.synthesisJobId);
  s.update('jobs', synth.id, { status: 'completed' }); s.update('agentMessages', synth.payload.replyId, { status: 'completed', content: 'Saved final synthesis.' }); reconcileTeamRuns(s);
  const complete = await dotResult(s, f.payload.requestId); assert.equal(complete.status, 'completed'); assert.equal(complete.response, 'Saved final synthesis.'); assert.equal(complete.complete, true);
  assert.equal((await dotStatus(s, f.payload.requestId, { after: complete.nextCursor })).events.length, 0);
});

test('CLI parses bounded JSON, rejects unsupported authority and works outside repository cwd', async t => {
  const f = await fixture(t);
  assert.throws(() => dotArguments(['submit', '--command', 'anything'])); assert.throws(() => dotArguments(['status'])); assert.throws(() => dotArguments(['health', '--data-dir', 'relative']));
  assert.equal(dotArguments(['status', 'request-1', '--after', '20']).after, 20);
  await assert.rejects(readDotInput(Readable.from(['{invalid']))); await assert.rejects(readDotInput(Readable.from(['x'.repeat(33000)])));
  assert.deepEqual(await readDotInput(Readable.from([JSON.stringify(f.payload)])), f.payload);
  const script = path.resolve('scripts/dot-handoff.js');
  const { stdout } = await exec(process.execPath, [script, 'health', '--data-dir', f.directory], { cwd: os.tmpdir() });
  assert.equal(JSON.parse(stdout).worker.status, 'online');
  const missing = path.join(f.directory, 'never-create');
  await assert.rejects(exec(process.execPath, [script, 'health', '--data-dir', missing]));
  await assert.rejects(fs.stat(missing), { code: 'ENOENT' });
});
