import { createHash } from 'node:crypto';
import { now } from './store.js';
import { prepareDelegatedGoal, commitDelegatedGoal } from './agent-goals.js';
import { atomic, activeTeam, controlTeamRun } from './agent-teams.js';
import { cleanKnowledgeText } from './knowledge.js';
import { processIdentity, sameIdentity } from '../worker/services.js';

// Local owner CLI only. A source label is provenance, not cloud-Dot authentication.
const source = 'local-dot-handoff';
const fail = (code, message) => Object.assign(new Error(message), { code });
const clean = (value, max = 1000) => cleanKnowledgeText(String(value ?? '')).slice(0, max);
const receiptKey = requestId => `dot:request:${createHash('sha256').update(requestId).digest('hex')}`;
function validId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,95}$/.test(value)) throw fail('INVALID_REQUEST', 'Use a stable requestId of 1–96 letters, numbers, dots, underscores or hyphens.');
  return value;
}
function validateSubmission(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['requestId', 'projectId', 'instruction', 'title'].includes(k))) throw fail('INVALID_REQUEST', 'Submit a JSON object containing requestId, projectId, instruction and optional title.');
  validId(input.requestId);
  if (!Object.hasOwn(input, 'projectId') || (input.projectId !== null && (typeof input.projectId !== 'string' || !input.projectId || input.projectId.length > 120))) throw fail('INVALID_SCOPE', 'Set projectId to a registered project ID, or explicitly null for Personal.');
  if (typeof input.instruction !== 'string' || !input.instruction.trim() || input.instruction.length > 6000) throw fail('INVALID_REQUEST', 'An instruction must contain 1–6,000 characters.');
  if (input.title !== undefined && (typeof input.title !== 'string' || !input.title.trim() || input.title.length > 120)) throw fail('INVALID_REQUEST', 'A title must contain 1–120 characters.');
  return { requestId: input.requestId, projectId: input.projectId, instruction: clean(input.instruction.trim(), 6000), title: input.title === undefined ? 'Dot handoff' : clean(input.title.trim(), 120) };
}

const fresh = timestamp => { const age = Date.now() - Date.parse(timestamp || ''); return age >= -5000 && age < 8000; };
function workerRecord(store) {
  const lease = store.get('settings', 'worker-lease');
  const worker = lease?.ownerId ? store.get('workers', lease.ownerId) : null;
  return worker?.status === 'online' && fresh(worker.lastHeartbeatAt) && fresh(lease.lastHeartbeatAt) && worker.capabilities?.jobTypes === null && sameIdentity(lease, worker) ? { lease, worker } : null;
}
export async function dotWorkerState(store, identity = processIdentity) {
  const record = workerRecord(store);
  if (!record || !sameIdentity(record.lease, await identity(record.lease.pid))) return { status: 'offline', reason: 'Start Mari’s normal worker before handing off work. Temporary newspaper workers cannot run agent goals.' };
  const latest = workerRecord(store);
  if (!latest || latest.lease.ownerId !== record.lease.ownerId || !sameIdentity(record.lease, latest.lease)) return { status: 'offline', reason: 'The queue owner changed. Check Mari and retry.' };
  return { status: 'online', workerId: record.worker.id, lastHeartbeatAt: latest.worker.lastHeartbeatAt };
}

function ownedRequest(store, requestId) {
  const receipt = store.get('settings', receiptKey(validId(requestId)));
  const team = receipt?.teamId ? store.get('agentTeams', receipt.teamId) : null;
  if (!receipt || receipt.source !== source || !team || team.origin?.type !== 'dot' || team.origin.source !== source || team.origin.requestId !== requestId || team.projectId !== receipt.projectId || team.chatId !== receipt.chatId || team.taskId !== receipt.taskId) throw fail('NOT_FOUND', 'No matching Dot handoff was found in this Mari data directory.');
  return { receipt, team };
}
const ownRequests = store => store.list('settings').filter(r => r.id.startsWith('dot:request:') && r.source === source);

export async function submitDotGoal(store, input, { prepare = prepareDelegatedGoal, identity = processIdentity } = {}) {
  const value = validateSubmission(input);
  const fingerprint = createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const reused = () => {
    const previous = store.get('settings', receiptKey(value.requestId));
    if (!previous) return null;
    if (previous.fingerprint !== fingerprint) throw fail('REQUEST_CONFLICT', 'That requestId already belongs to a different instruction or scope. Reuse the original request, or choose a new ID for new work.');
    ownedRequest(store, value.requestId);
    return { requestId: value.requestId, teamId: previous.teamId, chatId: previous.chatId, taskId: previous.taskId, reused: true };
  };
  const existing = reused(); if (existing) return existing;
  if (value.projectId !== null && !store.get('projects', value.projectId)) throw fail('INVALID_SCOPE', 'Select an existing registered project ID from the projects command.');
  const coordinator = store.list('agentProfiles').find(p => p.name === 'Elesis' && p.canDelegate && p.enabled && !p.archived);
  if (!coordinator) throw fail('COORDINATOR_UNAVAILABLE', 'Enable Elesis with delegation and at least one specialist in Mari.');
  const worker = await dotWorkerState(store, identity);
  if (worker.status !== 'online') throw fail('WORKER_OFFLINE', worker.reason);
  const prepared = await prepare(store, { profileId: coordinator.id, projectId: value.projectId, text: value.instruction, title: value.title });
  return atomic(store, () => {
    const duplicate = reused(); if (duplicate) return duplicate;
    if (workerRecord(store)?.worker.id !== worker.workerId) throw fail('WORKER_OFFLINE', 'The local worker stopped or changed while preparing this handoff. Retry explicitly.');
    if (value.projectId !== null && !store.get('projects', value.projectId)) throw fail('INVALID_SCOPE', 'The selected project is no longer registered.');
    const current = store.get('agentProfiles', coordinator.id);
    if (!current?.enabled || current.archived || !current.canDelegate || current.updatedAt !== coordinator.updatedAt) throw fail('COORDINATOR_UNAVAILABLE', 'Elesis changed while preparing this handoff. Retry explicitly.');
    if (ownRequests(store).filter(r => activeTeam(store.get('agentTeams', r.teamId))).length >= 3) throw fail('HANDOFF_LIMIT', 'Three Dot goals are already active. Wait for one to finish or cancel one before submitting another.');
    const team = commitDelegatedGoal(store, prepared, { type: 'dot', source, requestId: value.requestId });
    store.put('settings', { id: receiptKey(value.requestId), source, requestId: value.requestId, fingerprint, teamId: team.id, chatId: team.chatId, taskId: team.taskId, projectId: team.projectId, createdAt: now() });
    store.event({ source: 'system', type: 'dot.handoff.received', projectId: team.projectId, taskId: team.taskId, chatId: team.chatId, message: 'Dot handoff accepted. Elesis will coordinate this scoped goal.', data: { requestId: value.requestId, teamId: team.id } });
    return { requestId: value.requestId, teamId: team.id, chatId: team.chatId, taskId: team.taskId, reused: false };
  });
}

function taskStatus(store, taskId, jobId, worker) {
  const task = store.get('tasks', taskId), job = jobId ? store.get('jobs', jobId) : null;
  const agent = job?.agentId ? store.get('agents', job.agentId) : null;
  const live = worker.status === 'online' && job?.status === 'running' && job.workerId === worker.workerId && agent?.workerId === job.workerId && agent.status === 'working';
  return { taskId, jobId: job?.id || null, status: job?.status || task?.status || 'unknown', phase: task?.phase || job?.type || null,
    action: live ? clean(agent?.action, 500) || null : null, lastReportedAction: clean(agent?.action, 500) || null,
    currentCommand: live && agent?.currentCommand ? clean(typeof agent.currentCommand === 'string' ? agent.currentCommand : agent.currentCommand.command, 500) : null,
    startedAt: job?.startedAt || null, finishedAt: job?.finishedAt || null, lastActivityAt: agent?.lastActivityAt || task?.lastActivityAt || null,
    error: clean(job?.error || task?.error, 1500) || null, cancelRequested: Boolean(job?.cancelRequested) };
}

export async function dotStatus(store, requestId, { after = 0, identity = processIdentity } = {}) {
  if (!Number.isSafeInteger(after) || after < 0) throw fail('INVALID_CURSOR', 'after must be a nonnegative safe integer.');
  ownedRequest(store, requestId);
  const worker = await dotWorkerState(store, identity), { team, receipt } = ownedRequest(store, requestId);
  const taskIds = [team.taskId, ...team.members.map(m => m.taskId)];
  const events = taskIds.flatMap(taskId => store.events({ taskId, after, limit: 60 })).sort((a, b) => a.id - b.id).slice(0, 60)
    .map(e => ({ id: e.id, at: e.at, taskId: e.taskId, source: e.source, type: e.type, level: e.level, message: clean(e.message, 1000) }));
  return { requestId, teamId: team.id, chatId: team.chatId, projectId: team.projectId, coordinator: { id: team.coordinator.id, name: team.coordinator.name },
    status: team.status, error: clean(team.error, 1500) || null, createdAt: receipt.createdAt, lastActivityAt: team.lastActivityAt, finishedAt: team.finishedAt || null, worker,
    coordinatorExecution: taskStatus(store, team.taskId, team.synthesisJobId || team.planJobId, worker),
    specialists: team.members.map(m => ({ name: m.profile.name, role: m.profile.role, ...taskStatus(store, m.taskId, m.jobId, worker) })),
    events, nextCursor: events.at(-1)?.id || after };
}

export async function dotResult(store, requestId, options) {
  const status = await dotStatus(store, requestId, options), { team } = ownedRequest(store, requestId);
  const synthesis = team.synthesisJobId ? store.get('jobs', team.synthesisJobId) : null;
  const reply = synthesis?.payload?.replyId ? store.get('agentMessages', synthesis.payload.replyId) : null;
  const raw = team.status === 'completed' && synthesis?.status === 'completed' && reply?.status === 'completed' ? reply.content : '';
  const tasks = new Set([team.taskId, ...team.members.map(m => m.taskId)]);
  return { ...status, complete: Boolean(raw), response: clean(raw, 16000) || null, responseTruncated: String(raw || '').length > 16000,
    specialistResults: team.members.filter(m => store.get('jobs', m.jobId)?.status === 'completed').map(m => {
      const result = store.get('tasks', m.taskId)?.result || '';
      return { name: m.profile.name, taskId: m.taskId, response: clean(result, 6000), truncated: result.length > 6000 };
    }),
    artifacts: store.list('artifacts').filter(a => tasks.has(a.taskId) && a.jobId && store.get('jobs', a.jobId)?.payload?.teamId === team.id).slice(-40)
      .map(a => ({ id: a.id, taskId: a.taskId, kind: a.kind, title: clean(a.title, 160), mimeType: a.mimeType || a.mime })) };
}

export function cancelDotGoal(store, requestId) {
  return atomic(store, () => {
    const { team } = ownedRequest(store, requestId);
    if (activeTeam(team)) {
      controlTeamRun(store, team, 'cancel', { transaction: false });
      store.event({ source: 'system', type: 'dot.handoff.cancel_requested', projectId: team.projectId, taskId: team.taskId, chatId: team.chatId, message: 'Dot requested cancellation of its own team goal.', data: { requestId, teamId: team.id } });
    }
    const current = store.get('agentTeams', team.id);
    return { requestId, teamId: team.id, status: current.status, cancelRequested: Boolean(current.cancelRequested) };
  });
}

export function dotProjects(store) {
  return { projects: store.list('projects').slice(0, 200).map(p => ({ id: p.id, name: clean(p.name, 120), path: p.path, framework: p.framework, packageManager: p.packageManager })), personal: { projectId: null }, truncated: store.list('projects').length > 200 };
}

export function dotRequests(store) {
  return { requests: ownRequests(store).slice(-50).reverse().map(r => ({ requestId: r.requestId, teamId: r.teamId, projectId: r.projectId, status: store.get('agentTeams', r.teamId)?.status || 'unknown', createdAt: r.createdAt })) };
}
