import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRedactor, safeChildEnv, secretEnvironmentValues } from '../server/security.js';
import { id, now } from '../server/store.js';

const execute = promisify(execFile);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Brag's composition turn has no need for connected apps, user hooks or host
// project access. A named native profile enforces its read boundary as well as
// its write boundary; ordinary implementation/MCP turns keep their own policy.
export async function restrictedCodexArguments(policy, { executeImpl = execute } = {}) {
  if (!policy || !Array.isArray(policy.readRoots) || !path.isAbsolute(policy.writableRoot || '')) throw new Error('A restricted Codex run needs explicit local roots.');
  let binary;
  for (const entry of (process.env.PATH || '').split(path.delimiter)) {
    if (!path.isAbsolute(entry)) continue;
    const candidate = path.join(entry, 'codex');
    if (await fs.access(candidate, 1).then(() => true).catch(() => false)) { binary = await fs.realpath(candidate); break; }
  }
  if (!binary) throw new Error('Codex executable is unavailable for the restricted task profile.');
  const root = await fs.realpath(policy.writableRoot);
  if (root !== policy.writableRoot) throw new Error('Restricted task storage must use its canonical path.');
  const helpers = await fs.realpath(path.join(process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex'), 'tmp')).catch(() => null);
  if (!helpers) throw new Error('Native Codex sandbox helpers are unavailable for the restricted task profile.');
  const reads = [...new Set([path.dirname(path.dirname(binary)), path.dirname(path.dirname(process.execPath)), helpers, ...policy.readRoots])];
  const filesystem = ['":minimal"="read"'];
  for (const directory of reads) {
    if (!path.isAbsolute(directory) || await fs.realpath(directory) !== directory || !(await fs.stat(directory)).isDirectory()) throw new Error('Restricted Codex read roots must be canonical directories.');
    filesystem.push(`${JSON.stringify(directory)}="read"`);
  }
  filesystem.push(`${JSON.stringify(root)}="write"`);
  let servers;
  try {
    const result = await executeImpl('codex', ['mcp', 'list', '--json'], { env: safeChildEnv(), timeout: 5000, maxBuffer: 1024 * 1024 });
    const entries = JSON.parse(result.stdout); if (!Array.isArray(entries)) throw new Error();
    servers = entries.map((server) => server.name);
    if (servers.some((name) => typeof name !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(name))) throw new Error();
  } catch { throw new Error('Could not isolate the configured MCP servers for this restricted task.'); }
  const values = [`permissions.mari_media={filesystem={${filesystem.join(',')}},network={enabled=false}}`, 'default_permissions="mari_media"',
    `web_search="${policy.webSearch === true ? 'live' : 'disabled'}"`, 'notify=[]', 'apps._default.enabled=false',
    ...['apps', 'plugins', 'remote_plugin', 'hooks', 'skill_mcp_dependency_install', 'browser_use', 'computer_use', 'in_app_browser', 'skill_search', 'multi_agent', 'multi_agent_v2'].map((name) => `features.${name}=false`),
    ...servers.map((name) => `mcp_servers.${name}={command="/bin/false",enabled=false}`)];
  return values.flatMap((value) => ['-c', value]);
}

export async function inspectCodex() {
  try {
    const version = (await execute('codex', ['--version'], { timeout: 5000, env: safeChildEnv() })).stdout.trim();
    const authentication = (await execute('codex', ['login', 'status'], { timeout: 5000, env: safeChildEnv() }));
    const authenticated = /Logged in using ChatGPT/i.test(`${authentication.stdout}\n${authentication.stderr}`);
    return { available: true, authenticated, version, supported: /^codex-cli 0\.160\./.test(version) };
  } catch (error) { return { available: false, authenticated: false, version: null, supported: false, error: error.code === 'ENOENT' ? 'Codex CLI is not installed.' : 'Codex CLI or its native authentication could not be inspected.' }; }
}

export class CodexClient extends EventEmitter {
  constructor({ store, projectId, taskId, chatId, agentId, onActivity = () => {}, executionPolicy = null, model = null, reasoningEffort = null }) {
    super();
    this.store = store;
    this.projectId = projectId;
    this.taskId = taskId;
    this.chatId = chatId;
    this.agentId = agentId;
    this.onActivity = onActivity;
    this.executionPolicy = executionPolicy;
    if (model !== null && !/^[a-zA-Z0-9._:-]{1,100}$/.test(model)) throw new Error('Invalid per-job model.');
    if (reasoningEffort !== null && !['none','minimal','low','medium','high','xhigh','max','ultra'].includes(reasoningEffort)) throw new Error('Invalid per-job reasoning effort.');
    this.model = model;
    this.reasoningEffort = reasoningEffort;
    this.pending = new Map();
    this.incoming = new Map();
    this.output = new Map();
    this.sequence = 0;
    this.redactor = createRedactor(secretEnvironmentValues());
    this.closed = false;
  }

  event(type, message, data = {}, level = 'info') {
    this.store.event(this.redactor.redact({ source: 'agent', projectId: this.projectId, taskId: this.taskId, chatId: this.chatId, agentId: this.agentId, type, message, data, level }));
  }

  send(value) { if (!this.child?.stdin.writable) throw new Error('Codex worker is disconnected.'); this.child.stdin.write(`${JSON.stringify(value)}\n`); }

  request(method, params = {}, timeout = 30000) {
    const requestId = `mari_${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(requestId); reject(new Error(`Codex ${method} timed out.`)); }, timeout);
      this.pending.set(requestId, { resolve, reject, timer });
      try { this.send({ id: requestId, method, params }); } catch (error) { clearTimeout(timer); this.pending.delete(requestId); reject(error); }
    });
  }

  async connect() {
    const isolated = this.executionPolicy ? await restrictedCodexArguments(this.executionPolicy) : [];
    if (this.model) isolated.push('-c', `model=${JSON.stringify(this.model)}`);
    if (this.reasoningEffort) isolated.push('-c', `model_reasoning_effort=${JSON.stringify(this.reasoningEffort)}`);
    this.child = spawn('codex', ['app-server', '--listen', 'stdio://', '-c', 'forced_login_method="chatgpt"', '-c', 'model_provider="openai"', '-c', `approval_policy="${this.executionPolicy ? 'never' : 'on-request'}"`, '-c', 'approvals_reviewer="user"', ...isolated], { env: safeChildEnv(), stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    let buffer = '';
    let stderr = '';
    let stderrOversized = false;
    this.child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 40 * 1024 * 1024) { this.fail(new Error('Codex protocol message exceeded the safe size limit.')); this.child.kill('SIGTERM'); return; }
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        try { this.receive(JSON.parse(line)); } catch { this.event('protocol.warning', 'Ignored an unreadable Codex protocol message.', {}, 'warning'); }
      }
    });
    this.child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
      let end;
      while ((end = stderr.indexOf('\n')) !== -1) { const line = stderr.slice(0, end); stderr = stderr.slice(end + 1); if (stderrOversized || line.length > 65536) this.event('codex.stderr', '[Oversized Codex diagnostic omitted.]', { channel: 'stderr' }, 'warning'); else if (line) this.event('codex.stderr', line, { channel: 'stderr' }, 'warning'); stderrOversized = false; }
      if (stderr.length > 65536) { stderr = ''; stderrOversized = true; }
    });
    this.child.on('error', (error) => this.fail(error));
    this.child.on('exit', (code, signal) => {
      if (stderrOversized) this.event('codex.stderr', '[Oversized Codex diagnostic omitted.]', { channel: 'stderr' }, 'warning');
      else if (stderr) this.event('codex.stderr', stderr, { channel: 'stderr' }, 'warning');
      this.closed = true;
      this.fail(new Error(`Codex app-server disconnected${code !== null ? ` (exit ${code})` : ` (${signal})`}.`));
      this.emit('disconnected');
    });
    await this.request('initialize', { clientInfo: { name: 'mari_personal_assistant', title: 'mari-ai personal assistant', version: '0.1.0' }, ...(this.executionPolicy ? { capabilities: { experimentalApi: true } } : {}) });
    this.send({ method: 'initialized', params: {} });
    const account = await this.request('account/read', {});
    if (account.account?.type !== 'chatgpt') { await this.close(); throw new Error('Sign in to Codex with ChatGPT. Mari only runs subscription-authenticated Codex jobs.'); }
    this.replyTimer = setInterval(() => this.flushResponses(), 250);
    this.event('worker.connected', 'Connected to the local Codex app-server using native ChatGPT authentication.');
    this.store.update('agents', this.agentId, { name: 'Codex', role: 'coding agent', status: 'idle', lastActivityAt: now() });
    return account;
  }

  fail(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.emit('failure', error);
  }

  receive(message) {
    if (message.method && message.id !== undefined) { this.serverRequest(message); return; }
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id); clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(this.redactor.redact(message.error.message || 'Codex request failed.')));
      else pending.resolve(message.result);
      return;
    }
    const { method, params = {} } = message;
    if (!method || /reasoning/i.test(method)) return;
    if (/tokenUsage/i.test(method)) { this.emit('notification', { method, params }); return; }
    if (method === 'item/started' || method === 'item/completed') {
      const item = params.item || {};
      if (item.type === 'reasoning') return;
      if (item.type === 'imageGeneration') {
        this.event(method, method === 'item/started' ? 'Generating a proposed design image.' : 'Image generation action finished.', { itemId: item.id, itemType: item.type, status: item.status, hasSavedFile: Boolean(item.savedPath), failure: item.failure });
      } else if (item.type === 'commandExecution') {
        this.onActivity(method === 'item/started' ? 'Running the displayed command.' : 'Command execution finished.', method === 'item/started' ? this.redactor.redact(item.command) : null);
        this.event(method, method === 'item/started' ? 'Command started.' : 'Command finished.', { itemId: item.id, command: item.command, cwd: item.cwd, status: item.status, exitCode: item.exitCode ?? null, durationMs: item.durationMs ?? null, [method === 'item/started' ? 'startedAt' : 'finishedAt']: now() }, item.status === 'failed' ? 'error' : 'info');
        if (method === 'item/completed') { const writer = this.output.get(item.id); if (writer?.oversized) this.event('command.output', '[Oversized command output line omitted.]', { itemId: item.id, channel: 'combined' }); else if (writer?.buffer) this.event('command.output', writer.buffer, { itemId: item.id, channel: 'combined' }); this.output.delete(item.id); }
      } else {
        const data = { itemId: item.id, itemType: item.type, status: item.status };
        if (['mcpToolCall', 'dynamicToolCall', 'webSearch', 'fileChange'].includes(item.type)) {
          const action = item.type === 'webSearch' ? 'Searching the web.' : item.type === 'fileChange' ? 'Applying a file change.' : `Using ${item.tool || item.type}.`;
          this.onActivity(method === 'item/started' ? action : 'Tool action finished.', method === 'item/started' ? this.redactor.redact(item.tool || item.type) : null);
        }
        if (item.type === 'fileChange') data.changes = item.changes;
        if (['mcpToolCall', 'dynamicToolCall'].includes(item.type)) { data.tool = item.tool; data.server = item.server; data.arguments = item.arguments; data.error = item.error; }
        if (item.type === 'agentMessage') data.text = item.text;
        this.event(method, item.type === 'agentMessage' ? 'Codex returned a message.' : `${item.type || 'Tool action'} ${method === 'item/started' ? 'started' : 'finished'}.`, data, item.status === 'failed' ? 'error' : 'info');
      }
    } else if (method === 'item/commandExecution/outputDelta') {
      const itemId = params.itemId;
      const writer = this.output.get(itemId) || { buffer: '', oversized: false };
      writer.buffer += params.delta || '';
      let newline;
      while ((newline = writer.buffer.indexOf('\n')) !== -1) {
        const line = writer.buffer.slice(0, newline); writer.buffer = writer.buffer.slice(newline + 1);
        this.event('command.output', writer.oversized || line.length > 65536 ? '[Oversized command output line omitted.]' : line, { itemId, channel: params.stream || 'combined' });
        writer.oversized = false;
      }
      if (writer.buffer.length > 65536) { writer.buffer = ''; writer.oversized = true; }
      this.output.set(itemId, writer);
    } else if (method === 'item/agentMessage/delta') {
      // The completed agentMessage records the complete, redacted text. Avoid partial-token logging.
    } else if (method === 'turn/diff/updated') {
      this.event(method, 'Codex updated the working changes.', { diff: params.diff });
    } else if (method === 'turn/plan/updated') {
      this.event(method, 'Codex updated its observable work plan.', { plan: params.plan });
    } else if (method === 'error') {
      this.event('codex.error', params.error?.message || params.message || 'Codex reported an error.', { error: params.error, willRetry: params.willRetry }, 'error');
    } else if (method === 'turn/completed') {
      this.event(method, `Codex turn ${params.turn?.status || 'finished'}.`, { turnId: params.turn?.id, status: params.turn?.status, error: params.turn?.error });
    } else if (method === 'serverRequest/resolved') {
      for (const [requestId, pending] of this.incoming) if (String(pending.rpcId) === String(params.requestId)) { this.store.update('requests', requestId, { status: 'resolved', resolvedAt: now() }); this.incoming.delete(requestId); }
    } else if (/warning|progress|thread\/status/i.test(method)) this.event(method, params.message || 'Codex execution state changed.', { ...params, threadId: params.threadId });
    this.emit('notification', { method, params });
  }

  serverRequest(message) {
    const { method, params = {} } = message;
    const kinds = { 'item/commandExecution/requestApproval': 'command', 'item/fileChange/requestApproval': 'file', 'item/tool/requestUserInput': 'input', 'tool/requestUserInput': 'input' };
    const kind = kinds[method];
    if (!kind) {
      if (method === 'item/permissions/requestApproval') this.send({ id: message.id, result: { permissions: {}, scope: 'turn' } });
      else this.send({ id: message.id, error: { code: -32601, message: 'Mari does not support this tool request; no authority was granted.' } });
      this.event('request.unsupported', 'Declined an unsupported Codex tool request.', { method }, 'warning');
      return;
    }
    const requestId = id('request');
    const record = this.store.put('requests', this.redactor.redact({ id: requestId, kind, method, status: 'pending', projectId: this.projectId, taskId: this.taskId, agentId: this.agentId, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId, rpcId: message.id, approvalId: params.approvalId, command: params.command, cwd: params.cwd, questions: params.questions, reason: params.reason, params, createdAt: now() }));
    this.incoming.set(requestId, { rpcId: message.id, kind });
    this.store.update('agents', this.agentId, { status: kind === 'input' ? 'waiting_for_input' : 'awaiting_approval', action: kind === 'input' ? 'Waiting for your answer to a Codex question.' : 'Waiting for approval of the displayed execution action.', lastActivityAt: now() });
    this.event('request.created', kind === 'input' ? 'Codex requested user input.' : 'Codex requested execution approval.', { requestId, kind, command: record.command, cwd: record.cwd });
  }

  flushResponses() {
    for (const [requestId, pending] of this.incoming) {
      const record = this.store.get('requests', requestId);
      if (!['answered', 'responded'].includes(record?.status)) continue;
      let result;
      if (pending.kind === 'input') result = { answers: record.response?.answers || {} };
      else { const decision = record.response?.decision; result = { decision: ['accept', 'decline', 'cancel'].includes(decision) ? decision : 'decline' }; }
      try { this.send({ id: pending.rpcId, result }); } catch { continue; }
      this.incoming.delete(requestId);
      this.store.update('requests', requestId, { status: 'resolved', resolvedAt: now() });
      this.store.update('agents', this.agentId, { status: 'working', action: 'Continuing after your response.', lastActivityAt: now() });
      this.event('request.responded', 'Forwarded your response to the pending Codex request.', { requestId, decision: result.decision });
    }
  }

  async runTurn({ cwd, input, writableRoots, threadId, signal, developerInstructions, outputSchema, onThread = () => {} }) {
    if (this.closed) throw new Error('Codex app-server is disconnected.');
    if (signal?.aborted) { const error = new Error('Codex execution cancelled.'); error.cancelled = true; throw error; }
    const permission = this.executionPolicy ? { permissions: 'mari_media' } : { sandbox: 'workspace-write' };
    const approvalPolicy = this.executionPolicy ? 'never' : 'on-request';
    if (this.executionPolicy && (cwd !== this.executionPolicy.writableRoot || !Array.isArray(writableRoots) || writableRoots.length !== 1 || writableRoots[0] !== cwd)) throw new Error('The restricted turn cannot expand its restricted workspace.');
    if (!threadId) {
      const result = await this.request('thread/start', { cwd, ...permission, approvalPolicy, approvalsReviewer: 'user', developerInstructions });
      threadId = result.thread.id;
    } else await this.request('thread/resume', { threadId, cwd, ...permission, approvalPolicy, approvalsReviewer: 'user', developerInstructions });
    this.store.update('agents', this.agentId, { threadId, status: 'working', lastActivityAt: now() });
    onThread(threadId);
    const result = { threadId, turnId: null, images: [], messages: [], changedFiles: [], status: null };
    return new Promise((resolve, reject) => {
      let settled = false;
      let interruptRequested = false;
      let cancellationDeadline;
      const cleanup = () => { clearTimeout(deadline); clearTimeout(cancellationDeadline); this.off('notification', listener); this.off('failure', failed); signal?.removeEventListener('abort', interrupt); };
      const done = (error) => { if (settled) return; settled = true; cleanup(); if (error) reject(error); else resolve(result); };
      const failed = (error) => done(error);
      const interrupt = () => {
        interruptRequested = true;
        if (result.turnId) this.request('turn/interrupt', { threadId, turnId: result.turnId }, 5000).catch(() => {});
        if (!cancellationDeadline) cancellationDeadline = setTimeout(() => {
          // This is our dedicated app-server child, never a project service or user terminal.
          this.child?.kill('SIGTERM');
          const error = new Error('Codex cancellation timed out; the dedicated agent process was terminated.'); error.cancelled = true; done(error);
        }, 8000);
      };
      const listener = ({ method, params }) => {
        if (params.threadId && params.threadId !== threadId) return;
        if (method === 'thread/tokenUsage/updated' && params.tokenUsage?.last) {
          const usage = params.tokenUsage.last;
          const keys = ['inputTokens','cachedInputTokens','outputTokens','reasoningOutputTokens','totalTokens'];
          if (keys.every(k => Number.isSafeInteger(usage[k]) && usage[k] >= 0)) result.tokenUsage = Object.fromEntries(keys.map(k => [k,usage[k]]));
        }
        if (method === 'turn/started') { result.turnId = params.turn?.id; if (interruptRequested || signal?.aborted) interrupt(); }
        if (method === 'item/completed') {
          const item = params.item || {};
          if (item.type === 'imageGeneration') result.images.push({ status: item.status, savedPath: item.savedPath, failure: item.failure, revisedPrompt: item.revisedPrompt });
          if (item.type === 'agentMessage') result.messages.push(item.text || '');
          if (item.type === 'fileChange') for (const change of item.changes || []) if (!result.changedFiles.includes(change.path)) result.changedFiles.push(change.path);
        }
        if (method === 'turn/completed') {
          result.status = params.turn?.status;
          if (signal?.aborted || result.status === 'interrupted') { const error = new Error('Codex execution cancelled.'); error.cancelled = true; done(error); }
          else if (result.status !== 'completed') { const error = new Error(params.turn?.error?.message || 'Codex turn failed.'); error.usageLimit = JSON.stringify(params.turn?.error || {}).includes('usageLimitExceeded'); done(error); }
          else done();
        }
      };
      const deadline = setTimeout(() => { interrupt(); done(new Error('Codex exceeded the bounded 20-minute stage timeout. Resume or retry explicitly.')); }, 20 * 60 * 1000);
      this.on('notification', listener); this.on('failure', failed); signal?.addEventListener('abort', interrupt, { once: true });
      this.request('turn/start', { threadId, cwd, input, approvalPolicy, approvalsReviewer: 'user', ...(this.executionPolicy ? { permissions: 'mari_media' } : { sandboxPolicy: { type: 'workspaceWrite', writableRoots, excludeSlashTmp: true, excludeTmpdirEnvVar: true, networkAccess: false } }), ...(outputSchema ? { outputSchema } : {}) }).then((response) => { result.turnId = response.turn?.id || result.turnId; this.store.update('agents', this.agentId, { turnId: result.turnId }); if (signal?.aborted || interruptRequested) interrupt(); }).catch(done);
    });
  }

  async close() {
    clearInterval(this.replyTimer);
    for (const [requestId, pending] of this.incoming) { try { this.send({ id: pending.rpcId, result: pending.kind === 'input' ? { answers: {} } : { decision: 'cancel' } }); } catch { /* Already disconnected. */ } this.store.update('requests', requestId, { status: 'cancelled', resolvedAt: now() }); }
    this.incoming.clear();
    if (this.child && !this.closed) { this.child.stdin.end(); await Promise.race([new Promise((resolve) => this.child.once('exit', resolve)), wait(1000)]); if (!this.closed) this.child.kill('SIGTERM'); }
    this.closed = true;
  }
}
