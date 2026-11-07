import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CodexClient, restrictedCodexArguments } from '../worker/codex.js';
import { safeChildEnv } from '../server/security.js';

const syntheticServers = async () => ({ stdout: JSON.stringify([{ name: 'review_fixture' }]) });

test('restricted video turns select a native profile without changing ordinary turn policy', async () => {
  for (const restricted of [false, true]) {
    const calls = [];
    const store = { update() {} };
    const client = new CodexClient({ store, agentId: 'synthetic', ...(restricted ? { executionPolicy: { writableRoot: '/synthetic/run', readRoots: [] } } : {}) });
    client.request = async (method, params) => {
      calls.push({ method, params });
      if (method === 'thread/start') return { thread: { id: 'synthetic-thread' } };
      if (method === 'turn/start') {
        setImmediate(() => client.emit('notification', { method: 'turn/completed', params: { threadId: 'synthetic-thread', turn: { id: 'synthetic-turn', status: 'completed' } } }));
        return { turn: { id: 'synthetic-turn' } };
      }
      return {};
    };
    await client.runTurn({ cwd: '/synthetic/run', writableRoots: ['/synthetic/run'], input: [] });
    const thread = calls.find((call) => call.method === 'thread/start').params;
    const turn = calls.find((call) => call.method === 'turn/start').params;
    if (restricted) {
      assert.equal(thread.permissions, 'mari_media'); assert.equal(turn.permissions, 'mari_media');
      assert.equal(thread.sandbox, undefined); assert.equal(turn.sandboxPolicy, undefined);
      assert.equal(thread.approvalPolicy, 'never'); assert.equal(turn.approvalPolicy, 'never');
      await assert.rejects(client.runTurn({ cwd: '/synthetic/other', writableRoots: ['/synthetic/other'], input: [] }), /cannot expand/);
    } else {
      assert.equal(thread.sandbox, 'workspace-write'); assert.equal(turn.sandboxPolicy.type, 'workspaceWrite');
      assert.equal(thread.permissions, undefined); assert.equal(turn.permissions, undefined);
      assert.equal(thread.approvalPolicy, 'on-request'); assert.equal(turn.approvalPolicy, 'on-request');
    }
  }
});

test('installed native video profile denies neighboring files and permits owned writes without external network or inference', { timeout: 20000 }, async (t) => {
  if (process.platform !== 'linux' || !await fs.access('/usr/bin/bwrap', 1).then(() => true).catch(() => false)) return t.skip('Linux bubblewrap is unavailable.');
  const cache = path.join(os.homedir(), '.cache'); await fs.mkdir(cache, { recursive: true });
  const root = await fs.mkdtemp(path.join(cache, 'mari-codex-isolation-'));
  const run = path.join(root, 'run'), codexHome = path.join(root, 'codex'), helpers = path.join(codexHome, 'tmp'), outside = path.join(root, 'outside.txt'), privateFile = path.join(codexHome, 'private-review-credentials.txt');
  await fs.mkdir(run); await fs.mkdir(helpers, { recursive: true }); await fs.writeFile(outside, 'synthetic-outside-marker'); await fs.writeFile(privateFile, 'synthetic-private-marker');
  // Seed an existing file-layer server: disable overrides must remain valid
  // across configuration layers, not only next to another CLI override.
  await fs.writeFile(path.join(codexHome, 'config.toml'), '[mcp_servers.review_fixture]\ncommand = "/bin/false"\nenabled = true\n');
  const snapshot = path.join(root, 'snapshot'); await fs.mkdir(snapshot); await fs.writeFile(path.join(snapshot, 'source.txt'), 'synthetic-context');
  let args;
  try { args = await restrictedCodexArguments({ writableRoot: run, readRoots: [helpers, snapshot] }, { executeImpl: syntheticServers }); }
  catch (error) { await fs.rm(root, { recursive: true, force: true }); if (/executable is unavailable/.test(error.message)) return t.skip(error.message); throw error; }
  assert.ok(args.includes('mcp_servers.review_fixture={command="/bin/false",enabled=false}'));
  // The native tool sandbox creates its own user namespace; wrapping the server
  // in another bubblewrap namespace prevents that on this host. Keep the server
  // credential-free and force provider/discovery endpoints to closed loopback.
  // No turn/start or model inference is requested by this test.
  const child = spawn('codex', ['app-server', '--listen', 'stdio://', '-c', 'openai_base_url="http://127.0.0.1:1"', '-c', 'chatgpt_base_url="http://127.0.0.1:1"', ...args], { env: { ...safeChildEnv(), CODEX_HOME: codexHome }, stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let sequence = 0, buffer = '', diagnostic = '';
  child.stderr.on('data', (chunk) => { diagnostic = (diagnostic + chunk).slice(-3000); });
  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      let message; try { message = JSON.parse(line); } catch { continue; }
      const item = pending.get(message.id); if (!item) continue;
      pending.delete(message.id); clearTimeout(item.timer);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    }
  });
  child.on('exit', () => { for (const item of pending.values()) { clearTimeout(item.timer); item.reject(new Error(`Offline app-server exited: ${diagnostic}`)); } pending.clear(); });
  const request = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence, timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} exceeded the offline test deadline.`)); }, 6000);
    pending.set(id, { resolve, reject, timer }); child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
  });
  t.after(async () => {
    for (const item of pending.values()) clearTimeout(item.timer);
    child.stdin.end();
    if (child.exitCode === null) await Promise.race([new Promise((resolve) => child.once('exit', resolve)), new Promise((resolve) => setTimeout(resolve, 500))]);
    if (child.exitCode === null) child.kill('SIGTERM');
    await fs.rm(root, { recursive: true, force: true });
  });
  await request('initialize', { clientInfo: { name: 'mari_offline_isolation_test', version: '1' }, capabilities: { experimentalApi: true } });
  child.stdin.write(`${JSON.stringify({ method: 'initialized', params: {} })}\n`);
  const config = (await request('config/read', { cwd: run })).config;
  for (const feature of ['apps', 'plugins', 'hooks', 'browser_use', 'computer_use', 'in_app_browser', 'multi_agent', 'multi_agent_v2']) assert.equal(config.features[feature], false);
  assert.equal(config.web_search, 'disabled'); assert.equal(config.mcp_servers.review_fixture.enabled, false);
  const denied = await request('command/exec', { cwd: run, command: ['/bin/cat', outside], permissionProfile: 'mari_media' });
  assert.notEqual(denied.exitCode, 0); assert.equal(denied.stdout.includes('synthetic-outside-marker'), false);
  const privateRead = await request('command/exec', { cwd: run, command: ['/bin/cat', privateFile], permissionProfile: 'mari_media' });
  assert.notEqual(privateRead.exitCode, 0); assert.equal(privateRead.stdout.includes('synthetic-private-marker'), false);
  const context = await request('command/exec', { cwd: run, command: ['/bin/cat', path.join(snapshot, 'source.txt')], permissionProfile: 'mari_media' });
  assert.equal(context.stdout, 'synthetic-context');
  const contextWrite = await request('command/exec', { cwd: run, command: ['/bin/sh', '-c', 'printf forbidden > ' + path.join(snapshot, 'source.txt')], permissionProfile: 'mari_media' });
  assert.notEqual(contextWrite.exitCode, 0); assert.equal(await fs.readFile(path.join(snapshot, 'source.txt'), 'utf8'), 'synthetic-context');
  const allowed = await request('command/exec', { cwd: run, command: ['/bin/sh', '-c', 'printf synthetic-owned-marker > result.txt; cat result.txt'], permissionProfile: 'mari_media' });
  assert.equal(allowed.exitCode, 0, allowed.stderr); assert.equal(allowed.stdout, 'synthetic-owned-marker');
  const thread = await request('thread/start', { cwd: run, permissions: 'mari_media', approvalPolicy: 'never', ephemeral: true });
  assert.ok(thread.thread.id);
});

test('observable activity clears finished commands, tracks real tools and omits reasoning',()=>{
 const calls=[],events=[];const client=new CodexClient({store:{event:e=>events.push(e)},agentId:'fixture',chatId:'chat_fixture',onActivity:(message,command)=>calls.push({message,command})});
 client.receive({method:'item/started',params:{item:{id:'cmd',type:'commandExecution',command:'echo synthetic'}}});
 assert.equal(calls.at(-1).command,'echo synthetic');
 client.receive({method:'item/completed',params:{item:{id:'cmd',type:'commandExecution',command:'echo synthetic',status:'completed'}}});assert.equal(calls.at(-1).command,null);
 client.receive({method:'item/started',params:{item:{id:'web',type:'webSearch'}}});assert.equal(calls.at(-1).message,'Searching the web.');
 const count=events.length;client.receive({method:'item/started',params:{item:{id:'private',type:'reasoning',text:'hidden'}}});assert.equal(events.length,count);assert(events.every(e=>e.chatId==='chat_fixture'));
});

test('resuming an agent conversation reapplies captured instructions and per-turn structured output', async () => {
  const calls = [], client = new CodexClient({ store: { update() {} }, agentId: 'synthetic', executionPolicy: { writableRoot: '/synthetic/run', readRoots: [] } });
  client.request = async (method, params) => {
    calls.push({ method, params });
    if (method === 'turn/start') { setImmediate(() => client.emit('notification', { method: 'turn/completed', params: { threadId: 'saved', turn: { status: 'completed' } } })); return { turn: { id: 'turn' } }; }
    return {};
  };
  const schema = { type: 'object', properties: {}, additionalProperties: false };
  await client.runTurn({ threadId: 'saved', cwd: '/synthetic/run', writableRoots: ['/synthetic/run'], input: [], developerInstructions: 'Captured coordinator scope and mandatory boundaries.', outputSchema: schema });
  assert.equal(calls.find(c => c.method === 'thread/resume').params.developerInstructions, 'Captured coordinator scope and mandatory boundaries.');
  assert.deepEqual(calls.find(c => c.method === 'turn/start').params.outputSchema, schema);
});
