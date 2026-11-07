import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverProjects, getProjectScans } from '../server/discovery.js';

const exec = promisify(execFile);
const current = () => new Date().toISOString();
function memoryStore() {
  const records = new Map();
  const writes = [];
  return {
    writes,
    list: (collection) => [...records.values()].filter((item) => item.collection === collection).map((item) => item.record),
    get: (collection, id) => records.get(`${collection}:${id}`)?.record || null,
    put(collection, record) { writes.push({ collection, id: record.id }); records.set(`${collection}:${record.id}`, { collection, record }); return record; },
  };
}
async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'mari-discovery-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return directory;
}
async function packageAt(directory, content = {}) {
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(path.join(directory, 'package.json'), JSON.stringify(content));
}

test('an explicit folder scan reads metadata within scope, skips symlinks and dependencies, and never registers or starts projects', async (t) => {
  const directory = await fixture(t), root = path.join(directory, 'chosen'), app = path.join(root, 'web');
  await packageAt(app, { name: 'catalog-ui', packageManager: 'pnpm@10.0.0', devDependencies: { vite: '^7' }, scripts: { dev: 'vite' } });
  await exec('git', ['init', '--initial-branch=scan-fixture', app]);
  await packageAt(path.join(root, 'node_modules', 'dependency'), { name: 'dependency' });
  await packageAt(path.join(root, '.private'), { name: 'hidden' });
  await packageAt(path.join(root, 'dist'), { name: 'generated' });
  await packageAt(path.join(directory, 'outside'), { name: 'outside' });
  await fs.symlink(path.join(directory, 'outside'), path.join(root, 'linked-outside'));
  await packageAt(path.join(root, 'one', 'two', 'three'), { name: 'depth-three' });
  await packageAt(path.join(root, 'one', 'two', 'three', 'four'), { name: 'too-deep' });
  const alias = path.join(directory, 'registered-alias');
  await fs.symlink(app, alias);
  const store = memoryStore();
  store.put('projects', { id: 'existing-web', path: alias, name: 'Saved web' });
  const before = store.writes.length;
  const result = await discoverProjects(root, { store });
  assert.deepEqual(result.candidates.map((item) => item.name).sort(), ['catalog-ui', 'depth-three']);
  const web = result.candidates.find((item) => item.path === app);
  assert.equal(web.framework, 'Vite');
  assert.equal(web.packageManager, 'pnpm');
  assert.equal(web.git.available, true);
  assert.equal(web.git.branch, 'scan-fixture');
  assert.equal(web.git.dirty, true);
  assert.equal(web.registeredId, 'existing-web');
  assert.equal(web.status, 'unknown');
  assert.equal(web.managementStatus, 'not_managed');
  const unmanaged = result.candidates.find((item) => item.name === 'depth-three');
  assert.equal(unmanaged.registeredId, null);
  assert.equal(unmanaged.registrationStatus, 'not_registered');
  assert.equal(unmanaged.health, 'unknown');
  assert.deepEqual(unmanaged.serviceStatuses, []);
  assert.equal(result.truncated, true);
  assert.ok(result.truncationReasons.includes('depth_limit'));
  assert.equal(result.scannedDirectories, 5);
  assert.deepEqual(result.counts, { candidates: 2, detected: 2, registered: 1, unregistered: 1, errors: 0 });
  assert.deepEqual(store.writes.slice(before), [{ collection: 'settings', id: 'project-scans' }]);
  assert.equal(store.list('projects').length, 1);
  assert.deepEqual(store.list('jobs'), []);
  assert.deepEqual(store.list('services'), []);
  const saved = getProjectScans(store);
  assert.equal(saved.roots[0].path, root);
  assert.equal(saved.recentScans[0].root, root);
});

test('service status comes from fresh service observations, and saved results refresh status without rescanning', async (t) => {
  const root = await fixture(t), app = path.join(root, 'app');
  await packageAt(app, { name: 'observed-app' });
  const store = memoryStore();
  store.put('projects', { id: 'app', path: app });
  store.put('services', { id: 'frontend', projectId: 'app', name: 'Frontend', status: 'running', ownership: 'managed', lastProbeAt: current() });
  store.put('workers', { id: 'worker', status: 'online', lastHeartbeatAt: new Date(Date.now() - 60_000).toISOString() });
  const result = await discoverProjects(root, { store });
  assert.equal(result.candidates[0].status, 'unknown');
  assert.match(result.candidates[0].serviceStatuses[0].healthReason, /disconnected/);
  store.put('workers', { id: 'worker', status: 'online', lastHeartbeatAt: current() });
  assert.equal(getProjectScans(store).recentScans[0].candidates[0].status, 'running');
  store.put('services', { id: 'frontend', projectId: 'app', name: 'Frontend', status: 'running', ownership: 'external', lastProbeAt: new Date(Date.now() - 60_000).toISOString() });
  assert.equal(getProjectScans(store).recentScans[0].candidates[0].status, 'unknown');
  store.put('services', { id: 'frontend', projectId: 'app', name: 'Frontend', status: 'running', ownership: 'external', lastProbeAt: current() });
  await fs.rm(app, { recursive: true });
  const saved = getProjectScans(store).recentScans[0];
  assert.equal(saved.candidates[0].status, 'running');
  assert.equal(saved.candidates[0].managementStatus, 'not_managed');
  assert.equal(saved.scannedAt, result.scannedAt);
  assert.equal(saved.candidates[0].name, 'observed-app');
  store.put('services', { id: 'frontend', projectId: 'app', status: 'stopped', ownership: 'none' });
  assert.equal(getProjectScans(store).recentScans[0].candidates[0].status, 'unknown');
  store.put('services', { id: 'frontend', projectId: 'app', status: 'stopped', ownership: 'none', lastProbeAt: current() });
  assert.equal(getProjectScans(store).recentScans[0].candidates[0].status, 'stopped');
});

test('folder traversal and returned candidates are bounded and report the limits reached', async (t) => {
  const directory = await fixture(t), wide = path.join(directory, 'wide'), projects = path.join(directory, 'projects');
  await fs.mkdir(wide);
  await Promise.all(Array.from({ length: 510 }, (_, index) => fs.mkdir(path.join(wide, `folder-${String(index).padStart(3, '0')}`))));
  const directoryLimited = await discoverProjects(wide);
  assert.equal(directoryLimited.scannedDirectories, 500);
  assert.equal(directoryLimited.truncated, true);
  assert.ok(directoryLimited.truncationReasons.includes('directory_limit'));
  await Promise.all(Array.from({ length: 105 }, (_, index) => packageAt(path.join(projects, `app-${String(index).padStart(3, '0')}`), { name: `App ${index}` })));
  const candidateLimited = await discoverProjects(projects);
  assert.equal(candidateLimited.candidates.length, 100);
  assert.equal(candidateLimited.counts.detected, 105);
  assert.ok(candidateLimited.truncationReasons.includes('candidate_limit'));
  assert.ok(candidateLimited.candidates.every((candidate) => candidate.status === 'unknown' && !candidate.registeredId));
  assert.equal(candidateLimited.maxDepth, 3);
  assert.equal(candidateLimited.maxDirectories, 500);
  assert.equal(candidateLimited.maxCandidates, 100);
});

test('scan history has no implicit root and stays bounded to explicitly scanned folders', async (t) => {
  const root = await fixture(t), store = memoryStore();
  assert.deepEqual(getProjectScans(store), { roots: [], recentScans: [] });
  await assert.rejects(discoverProjects(undefined, { store }), /absolute local directory/);
  await assert.rejects(discoverProjects('relative/folder', { store }), /absolute local directory/);
  assert.equal(store.writes.length, 0);
  for (let index = 0; index < 13; index++) {
    const directory = path.join(root, `chosen-${index}`);
    await fs.mkdir(directory);
    await discoverProjects(directory, { store });
  }
  const saved = getProjectScans(store);
  assert.equal(saved.roots.length, 12);
  assert.equal(saved.recentScans.length, 5);
  assert.equal(saved.roots[0].path, path.join(root, 'chosen-12'));
  assert.ok(saved.roots.every((item) => item.path.startsWith(root)));
  await discoverProjects(path.join(root, 'chosen-12'), { store });
  assert.equal(getProjectScans(store).roots.length, 12);
});
