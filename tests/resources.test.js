import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, mkdir, writeFile, rm, symlink, realpath } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import express from 'express';
import { createStore } from '../server/store.js';
import { createSkillsInventory, readNativeSkills, assertSnapshotSkills } from '../server/codex-resources.js';
import { createResourcesRouter, resolveAgentProfile, validateAgentProfile } from '../server/agent-profiles.js';
import { buildAgentProfileTurn } from '../worker/workflow.js';

async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mari-resources-'));
  const project = path.join(directory, 'project'), other = path.join(directory, 'other');
  await Promise.all([mkdir(project), mkdir(other), mkdir(path.join(directory, 'skills'))]);
  const store = createStore(path.join(directory, 'data'));
  store.put('projects', { id: 'project', path: project });
  store.put('projects', { id: 'other', path: other });
  store.put('settings', { id: 'app', selectedProjectId: 'project' });
  const records = [];
  for (const [name, scope, enabled, pluginId] of [['user-example', 'user', true, null], ['repo-example', 'repo', true, null], ['plugin-example', 'user', true, 'example@marketplace'], ['disabled-example', 'system', false, null]]) {
    const skillDir = path.join(directory, 'skills', name);
    await mkdir(skillDir);
    const skillPath = path.join(skillDir, 'SKILL.md');
    await writeFile(skillPath, `---\nname: ${name}\ndescription: Test installed skill\n---\nUse the ${name} instructions.`);
    records.push({ name, scope, enabled, pluginId, path: skillPath, description: `${name} description` });
  }
  const calls = [];
  const inventory = createSkillsInventory({ requestSkills: async (cwd, options) => { calls.push({ cwd, options }); return { data: [{ cwd, skills: cwd === project ? records : records.filter((item) => item.scope !== 'repo'), errors: [] }] }; } });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, project, other, store, records, inventory, calls };
}

test('native metadata discovery uses sanitized ChatGPT authentication and never starts inference', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  let killed = false;
  child.kill = () => { killed = true; queueMicrotask(() => child.emit('exit', 0)); return true; };
  const requests = [];
  let buffer = '', spawnArguments;
  child.stdin.on('data', (chunk) => {
    buffer += chunk.toString();
    let end;
    while ((end = buffer.indexOf('\n')) !== -1) {
      const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1); requests.push(message);
      if (message.id === undefined) continue;
      const result = message.method === 'account/read' ? { account: { type: 'chatgpt' } } : message.method === 'skills/list' ? { data: [{ cwd: '/tmp', skills: [], errors: [] }] } : {};
      queueMicrotask(() => child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`));
    }
  });
  const result = await readNativeSkills('/tmp', { refresh: true, spawnProcess: (...args) => { spawnArguments = args; return child; } });
  assert.deepEqual(result.data[0].skills, []);
  assert.deepEqual(requests.map((item) => item.method), ['initialize', 'initialized', 'account/read', 'skills/list']);
  assert.deepEqual(requests.at(-1).params, { cwds: ['/tmp'], forceReload: true });
  assert.equal(spawnArguments[0], 'codex');
  assert.ok(spawnArguments[1].includes('forced_login_method="chatgpt"'));
  assert.ok(Object.keys(spawnArguments[2].env).every((key) => !/OPENAI_API_KEY|MARI_|TOKEN|SECRET|PASSWORD/.test(key)));
  assert.equal(killed, true);
});

test('native discovery timeout terminates its dedicated metadata child', async () => {
  const child = new EventEmitter();
  child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const kills = [];
  child.kill = (signal) => { kills.push(signal); queueMicrotask(() => child.emit('exit', 0)); return true; };
  await assert.rejects(readNativeSkills('/tmp', { timeoutMs: 15, spawnProcess: () => child }), { code: 'CODEX_TIMEOUT' });
  assert.deepEqual(kills, ['SIGTERM']);
});

test('effective skills preserve native project scope, disabled state and plugin source; cache is per canonical project', async (t) => {
  const f = await fixture(t);
  const [one, two] = await Promise.all([f.inventory.list(f.store, { projectId: 'project' }), f.inventory.list(f.store, { projectId: 'project' })]);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(one, two);
  assert.equal(one.provider, 'codex');
  assert.equal(one.contextScope, 'project');
  assert.equal(one.skills.find((skill) => skill.name === 'disabled-example').enabled, false);
  assert.equal(one.skills.find((skill) => skill.name === 'plugin-example').source, 'plugin:example@marketplace');
  assert.equal(one.skills.find((skill) => skill.name === 'repo-example').scope, 'repo');
  await f.inventory.list(f.store, { projectId: 'project', refresh: true });
  assert.equal(f.calls.length, 2);
  assert.equal(f.calls.at(-1).options.refresh, true);
  const other = await f.inventory.list(f.store, { projectId: 'other' });
  assert.equal(f.calls.length, 3);
  assert.equal(other.skills.some((skill) => skill.scope === 'repo'), false);
  await assert.rejects(f.inventory.list(f.store, { projectId: 'missing' }), { code: 'NOT_FOUND' });
  const noRegisteredProject = { get() { throw new Error('Mari inventory must not require a registered project.'); } };
  const global = await f.inventory.list(noRegisteredProject, { global: true, projectId: 'missing' });
  assert.equal(global.contextScope, 'mari'); assert.equal(global.projectId, null);
  assert.equal(global.cwd, await realpath(process.cwd()));
  assert.equal(f.calls.at(-1).cwd, await realpath(process.cwd()));
  const repoSkill = one.skills.find((skill) => skill.scope === 'repo');
  assert.equal((await f.inventory.resolve(f.store, [repoSkill.id], { projectId: 'project', global: true }))[0].id, repoSkill.id, 'Profile resolution always stays in the selected project.');
  f.store.put('projects', { id: 'mari', path: process.cwd() });
  const sameCwd = await f.inventory.list(f.store, { projectId: 'mari' });
  assert.equal(sameCwd.contextScope, 'project'); assert.equal(sameCwd.projectId, 'mari');
  assert.equal((await f.inventory.list(noRegisteredProject, { global: true })).contextScope, 'mari', 'Shared cwd cache never changes the requested display context.');
});

test('skill reads use inventory IDs only and reject symlink replacement and oversized content', async (t) => {
  const f = await fixture(t), list = await f.inventory.list(f.store, {}), skill = list.skills.find((item) => item.name === 'user-example');
  assert.match((await f.inventory.read(f.store, skill.id)).content, /user-example instructions/);
  await assert.rejects(f.inventory.read(f.store, f.records[0].path), { code: 'NOT_FOUND' });
  await assert.rejects(f.inventory.read(f.store, '../private'), { code: 'NOT_FOUND' });
  const privatePath = path.join(f.directory, 'private.txt'); await writeFile(privatePath, 'Private contents.');
  await rm(skill.path); await symlink(privatePath, skill.path);
  await assert.rejects(f.inventory.read(f.store, skill.id), { code: 'SKILL_UNAVAILABLE' });
  await rm(skill.path); await writeFile(skill.path, Buffer.alloc(256 * 1024 + 1));
  const refreshed = await f.inventory.list(f.store, { refresh: true });
  assert.equal(refreshed.skills.some((item) => item.id === skill.id), false);
  assert.equal(refreshed.errors[0].code, 'SKILL_UNAVAILABLE');
});

test('metadata failures are explicit and selected unavailable skills are never silently dropped', async (t) => {
  const f = await fixture(t), list = await f.inventory.list(f.store, {});
  const disabled = list.skills.find((item) => !item.enabled);
  await assert.rejects(f.inventory.resolve(f.store, [disabled.id]), /disabled/);
  const unavailable = createSkillsInventory({ requestSkills: async () => { throw Object.assign(new Error('Codex is offline.'), { code: 'CODEX_UNAVAILABLE' }); } });
  const result = await unavailable.list(f.store, {});
  assert.deepEqual(result.skills, []); assert.equal(result.errors[0].code, 'CODEX_UNAVAILABLE');
  await assert.rejects(unavailable.resolve(f.store, [list.skills[0].id]), { code: 'SKILL_UNAVAILABLE' });
});

test('profile execution takes an immutable skill snapshot and rejects later skill file changes', async (t) => {
  const f = await fixture(t), list = await f.inventory.list(f.store, {});
  const skill = list.skills.find((item) => item.name === 'repo-example');
  f.store.put('agentProfiles', { id: 'profile', name: 'Focused builder', role: 'builder', instructions: 'Preserve existing behavior.', description: '', category: 'engineering', portraitId: 'mari', skillIds: [skill.id], enabled: true, createdAt: new Date().toISOString() });
  const snapshot = await resolveAgentProfile(f.store, 'profile', { projectId: 'project', inventory: f.inventory });
  assert.equal(snapshot.skills[0].path, skill.path); assert.ok(snapshot.skills[0].sha256);
  assert.ok(Object.isFrozen(snapshot) && Object.isFrozen(snapshot.skills[0]));
  f.store.update('agentProfiles', 'profile', { name: 'Changed name', instructions: 'Changed instructions.', category: 'growth', portraitId: 'dio' });
  assert.equal(snapshot.name, 'Focused builder'); assert.equal(snapshot.instructions, 'Preserve existing behavior.');
  assert.equal(snapshot.category, 'engineering'); assert.equal(snapshot.portraitId, 'mari');
  await assertSnapshotSkills(snapshot.skills);
  await writeFile(skill.path, 'Changed installed skill instructions.');
  await assert.rejects(assertSnapshotSkills(snapshot.skills), /changed after this job/);
  await assert.rejects(resolveAgentProfile(f.store, 'profile', { projectId: 'other', inventory: f.inventory }), { code: 'SKILL_UNAVAILABLE' });
  f.store.update('agentProfiles', 'profile', { enabled: false });
  await assert.rejects(resolveAgentProfile(f.store, 'profile', { inventory: f.inventory }), { code: 'PROFILE_DISABLED' });
  assert.equal(await resolveAgentProfile(f.store, null), null);
});

test('profile instructions and native skill items reach actual turn options while mandatory boundaries remain last', () => {
  const profile = { name: 'Interface reviewer', role: 'reviewer', instructions: 'Concentrate on typography.', skills: [{ name: 'visual-review', path: '/installed/visual-review/SKILL.md' }] };
  const turn = buildAgentProfileTurn(profile, { input: [{ type: 'text', text: 'Review the reference.' }, { type: 'localImage', path: '/reference.png' }], guardrails: 'Do not modify the target project.' });
  assert.match(turn.developerInstructions, /Concentrate on typography/);
  assert.ok(turn.developerInstructions.indexOf('Do not modify the target project.') > turn.developerInstructions.indexOf(profile.instructions));
  assert.match(turn.developerInstructions, /cannot approve its own work/);
  assert.match(turn.input[0].text, /\$visual-review/);
  assert.deepEqual(turn.input.at(-1), { type: 'skill', name: 'visual-review', path: '/installed/visual-review/SKILL.md' });
  assert.deepEqual(Object.keys(turn).sort(), ['developerInstructions', 'input']);
  assert.deepEqual(buildAgentProfileTurn(null, { input: [{ type: 'text', text: 'Original capture flow.' }], guardrails: 'Stage constraint.' }).input, [{ type: 'text', text: 'Original capture flow.' }]);
});

test('profile endpoints persist instructions, install reviewed templates, and round trip portable JSON without creating live agents', async (t) => {
  const f = await fixture(t), app = express();
  app.use(express.json({ limit: '1mb' })); app.use('/api', createResourcesRouter({ store: f.store, inventory: f.inventory }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: error.message, code: error.code }));
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (url, method = 'GET', body) => { const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) }); return { status: response.status, headers: response.headers, value: await response.json() }; };
  const list = await request('/skills?projectId=project'), skill = list.value.skills.find((item) => item.name === 'repo-example');
  const global = await request('/skills?scope=global&projectId=missing');
  assert.equal(global.status, 200); assert.equal(global.value.contextScope, 'mari');
  assert.equal(global.value.cwd, await realpath(process.cwd()));
  const globalRead = await request(`/skills/${global.value.skills[0].id}?scope=global&projectId=missing`);
  assert.equal(globalRead.status, 200); assert.match(globalRead.value.content, /instructions/);
  const created = await request('/agent-profiles', 'POST', { name: 'Custom builder', role: 'engineer', description: 'Local configuration.', instructions: 'Review before changing.', category: 'engineering', portraitId: 'mari', skillIds: [skill.id], projectId: 'project' });
  assert.equal(created.status, 201);
  const profileId = created.value.profile.id;
  assert.equal(f.store.get('agentProfiles', profileId).instructions, 'Review before changing.');
  assert.equal((await request(`/agent-profiles/${profileId}`, 'PATCH', { name: 'Updated builder' })).value.profile.name, 'Updated builder');
  const exported = await request(`/agent-profiles/${profileId}/export`);
  assert.match(exported.headers.get('content-disposition'), /\.json/);
  assert.equal(exported.value.profile.id, undefined);
  const imported = await request('/agent-profiles/import', 'POST', exported.value);
  assert.equal(imported.status, 409);
  assert.equal((await request('/agent-profiles', 'POST', { name: ' UPDATED BUILDER ', instructions: 'Duplicate.' })).value.code, 'PROFILE_NAME_TAKEN');
  exported.value.profile.name = 'Imported builder';
  const uniqueImport = await request('/agent-profiles/import', 'POST', exported.value);
  assert.equal(uniqueImport.status, 201); imported.value = uniqueImport.value; assert.notEqual(imported.value.profile.id, profileId);
  assert.deepEqual(imported.value.profile.skillIds, [skill.id]);
  assert.equal(imported.value.profile.portraitId, 'mari');
  assert.equal(imported.value.profile.category, 'engineering');
  const installed = await request('/agent-profiles/install', 'POST', { templateId: 'designer' });
  assert.equal(installed.status, 201); assert.equal(installed.value.profile.name, 'Amy');
  const catalog = (await request('/agent-profiles')).value.templates;
  assert.equal(catalog.length, 12);
  const ceo = await request('/agent-profiles/install', 'POST', { templateId: 'ceo' });
  assert.equal(ceo.status, 201); assert.equal(ceo.value.profile.category, 'leadership'); assert.equal(ceo.value.profile.portraitId, 'elesis');
  assert.match(ceo.value.profile.instructions, /advisory specialty/);
  for (const invalid of [{ portraitId: 'https://example.com/track.png' }, { portraitId: '../secret' }, { portraitId: [] }, { category: 'invalid' }, { category: null }]) {
    assert.equal((await request(`/agent-profiles/${profileId}`, 'PATCH', invalid)).status, 400);
    assert.equal(f.store.get('agentProfiles', profileId).portraitId, 'mari');
  }
  const legacy = await request('/agent-profiles/import', 'POST', { name: 'Legacy role', instructions: 'Review.' });
  assert.equal(legacy.value.profile.category, 'general'); assert.equal(legacy.value.profile.portraitId, null);
  assert.equal((await request(`/agent-profiles/${profileId}`, 'PATCH', { portraitId: null })).value.profile.portraitId, null);
  assert.equal((await request('/agent-profiles/import', 'POST', { profile: { name: 'Bad profile', instructions: 'Run a script.', scripts: ['bad.sh'] } })).status, 400);
  assert.equal((await request('/agent-profiles/import', 'POST', { name: 'Too large', instructions: 'x'.repeat(65536) })).status, 413);
  assert.equal((await request('/agent-profiles', 'POST', { name: 'Empty', instructions: '' })).status, 400);
  assert.equal((await request('/agent-profiles', 'POST', { name: 'Unavailable', instructions: 'Use missing skill.', skillIds: [`skill_${'0'.repeat(32)}`] })).status, 409);
  assert.equal((await request(`/agent-profiles/${profileId}`, 'DELETE')).status, 200);
  assert.equal(f.store.get('agentProfiles', profileId), null);
  assert.deepEqual(f.store.list('agents'), []);
});

test('profile schema rejects executable and permission fields', () => {
  for (const extra of [{ scripts: [] }, { permissions: {} }, { writableRoots: ['/'] }, { command: 'bad' }, { url: 'https://external.example/profile.json' }]) assert.throws(() => validateAgentProfile({ name: 'Profile', instructions: 'Instructions.', ...extra }), /Unsupported profile field/);
  assert.throws(() => validateAgentProfile({ name: 'x'.repeat(81), instructions: 'Instructions.' }), /Name/);
  assert.throws(() => validateAgentProfile({ name: 'Profile', instructions: 'x'.repeat(16001) }), /Instructions/);
});
