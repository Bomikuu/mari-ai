import express from 'express';
import { captureKnowledgeContext } from './knowledge.js';
import { agentJob, activeTeam, chatBusy, atomic, captureTeamRoster, createTeamRun, controlTeamRun, publicTeam } from './agent-teams.js';
import { id, now } from './store.js';
import { resolveAgentProfile } from './agent-profiles.js';
import { publicArtifact } from './artifacts.js';
import { createRedactor, secretEnvironmentValues } from './security.js';
import { phoneJobAllowed } from './telegram-work.js';

const active = (job) => ['queued', 'running'].includes(job.status);
const fail = (message, status = 400, code = 'INVALID_CHAT') => Object.assign(new Error(message), { status, code });
const record = (store, collection, key) => { const value = store.get(collection, key); if (!value) throw fail('Conversation or agent was not found.', 404, 'NOT_FOUND'); return value; };
const jobsFor = (store, chatId) => store.list('jobs').filter((job) => agentJob(job) && job.payload?.chatId === chatId);

export function createAgentChatRouter({ store, enqueue, getWorkers, resolveProfile = resolveAgentProfile }) {
  const router = express.Router(), redactor = createRedactor(secretEnvironmentValues());
  const transaction = (run) => { store.db.exec('BEGIN IMMEDIATE'); try { const value = run(); store.db.exec('COMMIT'); return value; } catch (error) { store.db.exec('ROLLBACK'); throw error; } };
  const requireWorker = () => { if (!getWorkers().some((worker) => worker.status === 'online')) throw fail('Start the Mari worker to send messages or assign tasks. Your conversation is saved.', 503, 'WORKER_OFFLINE'); };
  const validateProfile = (chat) => { const p = record(store, 'agentProfiles', chat.profileId); if (!p.enabled) throw fail('This profile is disabled. Enable it before continuing.', 409, 'PROFILE_DISABLED'); };
  const publicChat = (chat) => { const { threadId, ...value } = chat; return { ...value, hasNativeHistory: Boolean(threadId) }; };
  const queue = (chat, message, previous = null) => {
    requireWorker(); validateProfile(chat);
    if (previous?.origin?.type === 'telegram' && !phoneJobAllowed(store, previous)) throw fail('This phone request no longer has its original paired user or context. Submit a new request from the current paired chat.', 409, 'PHONE_SCOPE');
    if (chatBusy(store, chat.id)) throw fail('This conversation already has queued or running work. Wait or cancel it first.', 409, 'CHAT_BUSY');
    const replyId = id('message');
    let taskId = previous?.taskId || null;
    if (message.mode === 'task') {
      taskId ||= id('task');
      store.put('tasks', { ...(store.get('tasks', taskId) || {}), id: taskId, kind: 'agent_task', chatId: chat.id, agentProfileId: chat.profileId, projectId: chat.projectId, name: message.content.slice(0, 100), instruction: message.content, phase: 'agent', status: 'queued', createdAt: store.get('tasks', taskId)?.createdAt || now(), lastActivityAt: now(), finishedAt: null, cancelRequested: false, error: null, artifactIds: store.get('tasks', taskId)?.artifactIds || [], changedFiles: [] });
    }
    const job = enqueue(previous?.type === 'agent.image' ? 'agent.image' : 'agent.turn', { projectId: chat.projectId, taskId, ...(previous?.origin ? { origin: previous.origin } : {}), payload: { chatId: chat.id, userMessageId: message.id, replyId, instruction: message.content, mode: message.mode, agentProfile: chat.profile, knowledgeContext: previous ? previous.payload?.knowledgeContext || null : captureKnowledgeContext(store, { projectId: chat.projectId, instruction: message.content }) } });
    store.put('agentMessages', { id: replyId, chatId: chat.id, role: 'assistant', content: '', status: 'queued', jobId: job.id, taskId, mode: message.mode, createdAt: now() });
    store.update('agentChats', chat.id, { lastActivityAt: now(), latestJobId: job.id });
    store.event({ source: 'system', chatId: chat.id, projectId: chat.projectId, taskId, type: 'agent.message.queued', message: message.mode === 'task' ? 'Queued the assigned agent task.' : 'Queued the conversation message.', data: { jobId: job.id } });
    return job;
  };
  router.get('/agent-profiles/:id/chats', (req, res) => {
    const projectId = req.query.projectId || null;
    if (projectId !== null && typeof projectId !== 'string') throw fail('Choose a registered project.');
    if (projectId) record(store, 'projects', projectId);
    res.json({ chats: store.list('agentChats').filter((chat) => chat.profileId === req.params.id && chat.projectId === projectId).reverse().map(publicChat) });
  });
  router.post('/agent-profiles/:id/chats', async (req, res) => {
    if (!req.body || Object.keys(req.body).some((key) => !['projectId', 'title'].includes(key))) throw fail('Choose a project or a personal conversation.');
    const projectId = req.body.projectId ?? null;
    if (projectId !== null && typeof projectId !== 'string') throw fail('Choose a registered project.');
    if (projectId) record(store, 'projects', projectId);
    const profile = await resolveProfile(store, req.params.id, { projectId, personal: !projectId });
    if (!profile) throw fail('Choose a configured agent.');
    const title = req.body.title ?? 'New conversation';
    if (typeof title !== 'string' || !title.trim() || title.length > 100) throw fail('Conversation title must contain 1–100 characters.');
    const chat = store.put('agentChats', { id: id('chat'), profileId: profile.id, profile, projectId, title: title.trim(), createdAt: now(), lastActivityAt: now(), threadId: null, latestJobId: null });
    res.status(201).json({ chat: publicChat(chat) });
  });
  router.get('/agent-chats/:id', (req, res) => {
    const chat = record(store, 'agentChats', req.params.id), jobs = jobsFor(store, chat.id);
    const all = store.list('agentMessages').filter((message) => message.chatId === chat.id);
    const before = req.query.before ? all.findIndex((message) => message.id === req.query.before) : all.length;
    if (before < 0) throw fail('The message cursor is not part of this conversation.');
    const messages = all.slice(Math.max(0, before - 60), before);
    const agentIds = new Set(jobs.map((job) => job.agentId).filter(Boolean));
    const artifacts = store.list('artifacts').filter((item) => item.chatId === chat.id).map(publicArtifact);
    res.json({ chat: publicChat(chat), messages, hasEarlier: before > 60, jobs: jobs.slice(-40), tasks: store.list('tasks').filter((task) => task.kind === 'agent_task' && task.chatId === chat.id), agents: store.list('agents').filter((agent) => agentIds.has(agent.id)), events: store.events({ chatId: chat.id, tail: true, limit: 250 }), artifacts, teams: store.list('agentTeams').filter(t => t.chatId === chat.id).reverse().map(t => publicTeam(store, t)), parentTeam: chat.teamId ? publicTeam(store, record(store, 'agentTeams', chat.teamId)) : null });
  });
  router.post('/agent-chats/:id/messages', async (req, res) => {
    const chat = record(store, 'agentChats', req.params.id);
    if (!req.body || Object.keys(req.body).some((key) => !['text', 'mode'].includes(key))) throw fail('Send a message or assign a task in this conversation.');
    if (typeof req.body.text !== 'string' || !req.body.text.trim() || req.body.text.length > 12000) throw fail('Messages must contain 1–12,000 characters.');
    const mode = req.body.mode || 'chat'; if (!['chat', 'task', 'team'].includes(mode)) throw fail('Choose Chat, Assign task or Delegate goal.');
    requireWorker(); validateProfile(chat); if (chatBusy(store, chat.id)) throw fail('This conversation already has work in progress.', 409, 'CHAT_BUSY');
    const captured = mode === 'team' ? await captureTeamRoster(store, chat, resolveProfile) : null;
    requireWorker(); validateProfile(chat);
    if (chatBusy(store, chat.id)) throw fail('This conversation already has work in progress.', 409, 'CHAT_BUSY');
    const message = { id: id('message'), chatId: chat.id, role: 'user', content: redactor.redact(req.body.text.trim()), mode, status: 'sent', createdAt: now() };
    const job = transaction(() => {
      store.put('agentMessages', message);
      const queued = mode === 'team' ? createTeamRun(store, chat, message, captured).job : queue(chat, message); store.update('agentMessages', message.id, { jobId: queued.id, taskId: queued.taskId });
      if (chat.title === 'New conversation') store.update('agentChats', chat.id, { title: message.content.slice(0, 70) });
      return queued;
    });
    res.status(202).json({ job });
  });
  router.post('/agent-chats/:id/action', (req, res) => {
    const chat = record(store, 'agentChats', req.params.id), job = record(store, 'jobs', req.body?.jobId || chat.latestJobId);
    if (!agentJob(job) || job.payload?.chatId !== chat.id) throw fail('This action belongs to another conversation.', 409, 'CHAT_SCOPE');
    if (job.type.startsWith('agent.team.')) throw fail('Use the team controls to cancel or retry this goal.', 409, 'TEAM_CONTROLS');
    if (req.body.action === 'retry' && job.payload.teamId) throw fail('Retry stopped specialist work from its team controls.', 409, 'TEAM_CONTROLS');
    if (req.body.action === 'cancel') {
      if (!active(job)) throw fail('This job is no longer running or queued.', 409, 'NOT_ACTIVE');
      store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: now() } : {}) });
      if (job.status === 'queued') store.update('agentMessages', job.payload.replyId, { status: 'cancelled', error: 'Cancelled before execution.' });
      if (job.taskId) store.update('tasks', job.taskId, { status: job.status === 'queued' ? 'cancelled' : 'paused', phase: job.status === 'queued' ? 'agent' : 'cancelling', lastActivityAt: now() });
      store.event({ source: 'system', chatId: chat.id, projectId: chat.projectId, taskId: job.taskId, type: 'agent.cancel_requested', message: 'Requested cancellation of this conversation turn. Project services are independent.', data: { jobId: job.id } });
      return res.json({ cancelled: true });
    }
    if (req.body.action !== 'retry' || !['failed', 'paused', 'cancelled', 'interrupted'].includes(job.status)) throw fail('Only stopped or failed work can be retried.', 409, 'NOT_RETRYABLE');
    if (chat.latestJobId !== job.id) throw fail('Retry the latest stopped action in this conversation.', 409, 'STALE_RETRY');
    const message = record(store, 'agentMessages', job.payload.userMessageId);
    res.status(202).json({ job: transaction(() => queue(chat, message, job)) });
  });
  router.post('/agent-teams/:id/action', (req, res) => {
    const team = record(store, 'agentTeams', req.params.id);
    if (!req.body || Object.keys(req.body).some(k => k !== 'action')) throw fail('Choose a team action.');
    if (req.body.action === 'retry') requireWorker();
    controlTeamRun(store, team, req.body.action);
    res.json({ team: publicTeam(store, record(store, 'agentTeams', team.id)) });
  });
  return router;
}
