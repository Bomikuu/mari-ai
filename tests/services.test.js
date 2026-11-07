import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createStore } from '../server/store.js';
import { createServiceSupervisor, processIdentity } from '../worker/services.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const unusedPort = () => new Promise((resolve) => { const server = net.createServer(); server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); }); });

async function fixture(t, script) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mari-services-'));
  const store = createStore(path.join(directory, 'state'));
  const supervisor = createServiceSupervisor({ store, startupTimeoutMs: 3000, stopTimeoutMs: 400, probeIntervalMs: 80 });
  store.put('projects', { id: 'project', name: 'Service fixture', path: directory });
  const port = await unusedPort();
  await writeFile(path.join(directory, 'fixture.js'), script || `const http=require('node:http'); http.createServer((req,res)=>res.end('ready')).listen(${port},'127.0.0.1');`);
  store.put('services', { id: 'service', projectId: 'project', name: 'web', command: 'node fixture.js', cwd: directory, url: `http://127.0.0.1:${port}`, configVersion: 1, confirmedVersion: 1, status: 'stopped', ownership: 'none' });
  t.after(async () => { await supervisor.close(); store.close(); await rm(directory, { recursive: true, force: true }); });
  return { directory, store, supervisor, port };
}

test('managed readiness is real, duplicate starts fail, and Stop leaves no owned process', async (t) => {
  const { store, supervisor } = await fixture(t);
  const service = await supervisor.start('service');
  assert.equal(service.status, 'running');
  assert.equal(service.ownership, 'managed');
  assert.ok(await processIdentity(service.pid));
  assert.equal(await (await fetch(service.url)).text(), 'ready');
  await assert.rejects(supervisor.start('service'), /already/);
  await supervisor.stop('service');
  assert.equal(store.get('services', 'service').status, 'stopped');
  assert.equal(await processIdentity(service.pid), null);
});

test('occupied external ports are identified and never terminated', async (t) => {
  const { store, supervisor, port } = await fixture(t);
  const external = http.createServer((request, response) => response.end('unrelated'));
  await new Promise((resolve) => external.listen(port, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => external.close(resolve)));
  await assert.rejects(supervisor.start('service'), /occupied outside Mari/);
  assert.equal(store.get('services', 'service').ownership, 'external');
  await assert.rejects(supervisor.stop('service'), /external/);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}`)).text(), 'unrelated');
});

test('a stale or reused PID never receives a stop signal', async (t) => {
  const { store, supervisor } = await fixture(t);
  const identity = await processIdentity(process.pid);
  store.update('services', 'service', { ...identity, startTicks: `${identity.startTicks}wrong`, ownership: 'managed', status: 'running' });
  await assert.rejects(supervisor.stop('service'), /ownership cannot be verified/);
  assert.equal(store.get('services', 'service').status, 'unknown');
  assert.ok(await processIdentity(process.pid));
});

test('Stop terminates the verified descendant tree', async (t) => {
  const fixtureState = await fixture(t);
  await writeFile(path.join(fixtureState.directory, 'fixture.js'), `const {spawn}=require('node:child_process'); const http=require('node:http'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',detached:true}); console.log('child-pid:'+child.pid); http.createServer((req,res)=>res.end('ready')).listen(${fixtureState.port},'127.0.0.1');`);
  await fixtureState.supervisor.start('service');
  let childPid;
  for (let attempt = 0; attempt < 20 && !childPid; attempt++) {
    childPid = fixtureState.store.events().map((event) => event.message.match(/child-pid:(\d+)/)?.[1]).find(Boolean);
    if (!childPid) await wait(30);
  }
  assert.ok(childPid, 'child process PID was recorded from real service output');
  assert.ok(await processIdentity(Number(childPid)));
  await fixtureState.supervisor.stop('service');
  assert.equal(await processIdentity(Number(childPid)), null);
});

test('env-file secrets split across output chunks are redacted before storage', async (t) => {
  const fixtureState = await fixture(t);
  const secret = 'mari-super-secret-service-value';
  await writeFile(path.join(fixtureState.directory, '.env'), `SERVICE_PASSWORD=${secret}\n`);
  await writeFile(path.join(fixtureState.directory, 'fixture.js'), `const http=require('node:http'); const value=process.env.SERVICE_PASSWORD; process.stdout.write(value.slice(0,9));setTimeout(()=>{process.stdout.write(value.slice(9)+'\\n');http.createServer((req,res)=>res.end('ready')).listen(${fixtureState.port},'127.0.0.1')},40);`);
  fixtureState.store.update('services', 'service', { envFile: path.join(fixtureState.directory, '.env') });
  await fixtureState.supervisor.start('service');
  const persisted = JSON.stringify(fixtureState.store.events());
  assert.equal(persisted.includes(secret), false);
  assert.equal(persisted.includes('super-secret-service-value'), false);
  assert.ok(persisted.includes('[REDACTED]'));
});

test('unconfirmed configuration cannot execute a process', async (t) => {
  const { store, supervisor } = await fixture(t);
  store.update('services', 'service', { configVersion: 2, confirmedVersion: 1 });
  await assert.rejects(supervisor.start('service'), /confirm/);
  assert.equal(supervisor.owned.size, 0);
});

test('shutdown during asynchronous startup preflight cannot leave a detached service', async (t) => {
  const { store, supervisor } = await fixture(t);
  const starting = supervisor.start('service');
  const rejected = assert.rejects(starting, /shutting down/);
  await supervisor.close();
  await rejected;
  assert.equal(supervisor.owned.size, 0);
  assert.equal(store.events().some((event) => event.type === 'command.started'), false);
  assert.equal(store.get('services', 'service').pid, undefined);
});
