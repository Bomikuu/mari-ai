import { id, now } from './store.js';
import { resolveAgentProfile } from './agent-profiles.js';
import { captureKnowledgeContext, cleanKnowledgeText } from './knowledge.js';
import { enqueueAgentJob } from './agent-teams.js';

export const ownsPhoneWork = (record, state) => record?.origin?.type === 'telegram'
  && record.origin.generation === state.generation && record.origin.bindingId === state.paired?.id
  && String(record.origin.chatId) === String(state.paired?.chatId);

export function phoneJobAllowed(store, job) {
  if (!['chat', 'image'].includes(job?.origin?.kind)) return true;
  const state = store.get('settings', 'telegram') || {};
  const profile = store.get('agentProfiles', job.payload?.agentProfile?.id);
  return Boolean(state.enabled && state.allowGoals && ownsPhoneWork(job, state)
    && (state.projectId || null) === (job.projectId || null)
    && (!job.projectId || store.get('projects', job.projectId))
    && profile?.enabled && !profile.archived
    && !store.get('agentChats', job.payload.chatId)?.phoneClosed);
}

export async function preparePhoneTurn(store, { state, text, kind = 'chat' }, resolveProfile = resolveAgentProfile) {
  if (!['chat', 'image'].includes(kind) || typeof text !== 'string' || !text.trim() || text.length > 6000) throw new Error('Use a message or image prompt of 1–6,000 characters.');
  if (state.projectId && !store.get('projects', state.projectId)) throw new Error('Choose a registered project or Personal in Mari.');
  const mari = store.list('agentProfiles').find(p => p.name?.trim().toLowerCase() === 'mari' && p.enabled && !p.archived);
  if (!mari) throw new Error('Enable the Mari agent profile before using phone chat or images.');
  const profile = await resolveProfile(store, mari.id, { projectId: state.projectId || null, personal: !state.projectId });
  return { profile, text: cleanKnowledgeText(text.trim()), kind, projectId: state.projectId || null };
}

// Called inside the update receipt transaction. Phone conversations never borrow
// a desktop thread, another binding, or another project's native history.
export function commitPhoneTurn(store, prepared, state, messageId) {
  const previous = prepared.kind === 'chat' && state.phoneChatId && store.get('agentChats', state.phoneChatId);
  const reusable = previous && !previous.phoneClosed && ownsPhoneWork(previous, state)
    && previous.projectId === prepared.projectId && previous.profileId === prepared.profile.id;
  const origin = { type: 'telegram', generation: state.generation, bindingId: state.paired.id,
    chatId: state.paired.chatId, messageId, kind: prepared.kind, directReplies: true };
  const chat = reusable ? previous : store.put('agentChats', {
    id: id('chat'), profileId: prepared.profile.id, profile: prepared.profile,
    projectId: prepared.projectId, title: prepared.kind === 'image' ? 'Telegram image' : 'Telegram · Mari',
    origin, threadId: null, createdAt: now(), lastActivityAt: now(), latestJobId: null,
  });
  const message = store.put('agentMessages', { id: id('message'), chatId: chat.id, role: 'user',
    content: prepared.text, mode: prepared.kind === 'image' ? 'task' : 'chat', status: 'sent', createdAt: now() });
  const replyId = id('message'), taskId = prepared.kind === 'image' ? id('task') : null;
  if (taskId) store.put('tasks', { id: taskId, kind: 'agent_task', chatId: chat.id, agentProfileId: chat.profileId,
    projectId: chat.projectId, name: prepared.text.slice(0, 100), instruction: prepared.text,
    phase: 'image', status: 'queued', createdAt: now(), lastActivityAt: now(), artifactIds: [] });
  const job = enqueueAgentJob(store, prepared.kind === 'image' ? 'agent.image' : 'agent.turn', {
    projectId: chat.projectId, taskId, origin, payload: { chatId: chat.id, userMessageId: message.id, replyId,
      instruction: prepared.text, mode: prepared.kind === 'image' ? 'task' : 'chat', agentProfile: chat.profile,
      knowledgeContext: prepared.kind === 'chat' ? captureKnowledgeContext(store, { projectId: chat.projectId, instruction: prepared.text }) : null },
  });
  store.update('agentMessages', message.id, { jobId: job.id, taskId });
  store.put('agentMessages', { id: replyId, chatId: chat.id, role: 'assistant', content: '', status: 'queued',
    jobId: job.id, taskId, mode: message.mode, createdAt: now() });
  store.update('agentChats', chat.id, { latestJobId: job.id, lastActivityAt: now() });
  if (prepared.kind === 'chat') store.update('settings', 'telegram', { phoneChatId: chat.id });
  store.event({ source: 'system', type: 'telegram.work.queued', chatId: chat.id, taskId, projectId: chat.projectId,
    message: prepared.kind === 'image' ? 'Queued the requested Telegram image.' : 'Queued a Mari phone conversation turn.', data: { jobId: job.id } });
  return job;
}

export function cancelPhoneJob(store, job) {
  store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: now() } : {}) });
  if (job.status === 'queued') store.update('agentMessages', job.payload.replyId, { status: 'cancelled', error: 'Cancelled before execution.' });
  if (job.taskId) store.update('tasks', job.taskId, { cancelRequested: true, status: job.status === 'queued' ? 'cancelled' : 'cancelling', lastActivityAt: now() });
}
