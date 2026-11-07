import path from 'node:path';
import { createTelegramBridge } from './telegram.js';
import { phoneJobAllowed, cancelPhoneJob } from '../server/telegram-work.js';
import { agentJob, reconcileTeamRuns, interruptTeamRuns } from '../server/agent-teams.js';
import { pathToFileURL } from 'node:url';
import { createStore, id, now } from '../server/store.js';
import { createRedactor } from '../server/security.js';
import { createServiceSupervisor, processIdentity, sameIdentity } from './services.js';
import { inspectCodex } from './codex.js';
import { createWorkflow } from './workflow.js';
import { stopVoice } from './voice.js';

export async function startWorker({ dataDir = process.env.MARI_DATA_DIR || path.resolve('.mari'), store: providedStore, pollMs = 250, supervisorOptions = {}, makeWorkflow = createWorkflow, jobTypes = null, telegramOptions = {}, agentConcurrency = 3 } = {}) {
  dataDir = path.resolve(dataDir);
  if (!Number.isInteger(agentConcurrency) || agentConcurrency < 1 || agentConcurrency > 4) throw new Error('Agent concurrency must be an integer from 1 to 4.');
  const store = providedStore || createStore(dataDir);
  const allowedJobs = jobTypes ? new Set(jobTypes) : null;
  const workerId = id('worker');
  const identity = await processIdentity(process.pid);
  if (!identity) { if (!providedStore) store.close(); throw new Error('Mari could not establish the local Linux process identity required for safe service ownership.'); }
  const redactor = createRedactor();
  const leaseId = 'worker-lease';
  // A transaction plus OS identity protects against a second launcher claiming the same queue.
  const prior = store.get('settings', leaseId);
  const priorIdentity = prior?.pid ? await processIdentity(prior.pid) : null;
  store.db.exec('BEGIN IMMEDIATE');
  try {
    const current = store.get('settings', leaseId);
    if (current && (current.id !== prior?.id || current.ownerId !== prior?.ownerId || current.lastHeartbeatAt !== prior?.lastHeartbeatAt)) throw new Error('Another worker acquired the local queue.');
    if (current?.ownerId && sameIdentity(current, priorIdentity)) throw new Error('Another live Mari worker already owns this data directory.');
    store.put('settings', { id: leaseId, ownerId: workerId, ...identity, lastHeartbeatAt: now() });
    store.db.exec('COMMIT');
  } catch (error) { store.db.exec('ROLLBACK'); if (!providedStore) store.close(); throw error; }

  const capabilities = { agentConcurrency, jobTypes: allowedJobs ? [...allowedJobs] : null, codex: { available: false, authenticated: false, version: null }, imageGeneration: 'unverified', manualHandoff: true };
  const previousWorkers = store.list('workers');
  const verifiedImage = previousWorkers.some((worker) => worker.capabilities?.imageGeneration === 'verified');
  if (verifiedImage) capabilities.imageGeneration = 'verified';
  store.put('workers', { id: workerId, name: 'Local worker', status: 'online', pid: process.pid, ...identity, startedAt: now(), lastHeartbeatAt: now(), capabilities });
  store.event({ source: 'system', type: 'worker.online', level: 'info', message: 'Local execution worker connected.', data: { workerId, pid: process.pid } });
  for (const worker of previousWorkers) store.update('workers', worker.id, { status: 'offline' });
  for (const agent of store.list('agents')) if (['working', 'awaiting_approval', 'waiting_for_input', 'idle'].includes(agent.status)) store.update('agents', agent.id, { status: 'failed', action: 'The previous worker disconnected. Resume the task explicitly.', error: 'Worker interrupted.', lastActivityAt: now() });
  for (const job of store.list('jobs').filter((item) => item.status === 'running')) {
    store.update('jobs', job.id, { status: 'interrupted', error: 'Worker restarted. This job was not replayed.', finishedAt: now() });
    if (job.taskId) store.update('tasks', job.taskId, { status: 'paused', error: 'Execution was interrupted. Resume the incomplete stage explicitly; completed stages are preserved.', lastActivityAt: now() });
    if (agentJob(job) && job.payload?.replyId) store.update('agentMessages', job.payload.replyId, { status: 'interrupted', error: 'Worker restarted. Retry explicitly.', finishedAt: now() });
  }
  interruptTeamRuns(store);
  for (const request of store.list('requests')) if (request.status === 'pending') store.update('requests', request.id, { status: 'cancelled', resolvedAt: now(), error: 'Worker disconnected before a response.' });

  const services = createServiceSupervisor({ store, dataDir, ...supervisorOptions });
  await services.reconcile();
  const updateCapabilities = (patch) => { Object.assign(capabilities, patch); store.update('workers', workerId, { capabilities: { ...capabilities } }); };
  inspectCodex().then((codex) => updateCapabilities({ codex, ...(!codex.available || !codex.authenticated || !codex.supported ? { imageGeneration: 'unavailable' } : {}) })).catch(() => {});
  const workflow = makeWorkflow({ store, dataDir, workerId, updateCapabilities });
  const telegram = allowedJobs ? null : createTelegramBridge({ store, dataDir, workerId, ...telegramOptions });
  const activeServices = new Map();
  const activeWorkflows = new Map();
  let stopped = false;
  let ticking = false;

  function claim(jobId) {
    store.db.exec('BEGIN IMMEDIATE');
    try {
      const lease = store.get('settings', leaseId);
      const job = store.get('jobs', jobId);
      if (lease?.ownerId !== workerId || job?.status !== 'queued') { store.db.exec('COMMIT'); return null; }
      const claimed = store.update('jobs', jobId, { status: 'running', workerId, startedAt: now() });
      store.db.exec('COMMIT');
      return claimed;
    } catch (error) { store.db.exec('ROLLBACK'); throw error; }
  }

  async function executeService(job) {
    try {
      const action = job.type.split('.')[1];
      await services[action](job.serviceId, { ...job.payload, cancelled: () => Boolean(store.get('jobs', job.id)?.cancelRequested) });
      store.update('jobs', job.id, { status: 'completed', finishedAt: now(), error: null });
    } catch (error) {
      const message = redactor.redact(error.message);
      store.update('jobs', job.id, { status: 'failed', error: message, finishedAt: now() });
      store.event({ source: 'service', projectId: job.projectId, serviceId: job.serviceId, type: 'service.action.failed', level: 'error', message, data: { jobId: job.id } });
    } finally { activeServices.delete(job.id); }
  }

  async function executeWorkflow(job) {
    const controller = new AbortController();
    const agentId = id('agent');
    job = { ...job, agentId };
    store.update('jobs', job.id, { agentId });
    const googleJob = job.type?.startsWith('personal.google.');
    const githubJob = job.type?.startsWith('project.github.');
    const newspaperJob = job.type === 'personal.newspaper.generate';
    const voiceJob = job.type?.startsWith('voice.');
    const bragJob = job.type === 'project.brag.generate';
    store.put('agents', { id: agentId, name: newspaperJob ? 'Newspaper editor' : voiceJob ? 'Mari voice' : bragJob ? 'Brag video maker' : githubJob ? 'GitHub reader' : googleJob ? 'Google reader' : job.type === 'capture' || job.type === 'verify' ? 'Browser worker' : 'Local executor', role: newspaperJob ? 'daily news editor' : voiceJob ? 'local synthetic speech' : bragJob ? 'local project video' : githubJob ? 'repository activity reader' : googleJob ? 'email and calendar reader' : job.type === 'capture' || job.type === 'verify' ? 'browser capture' : 'workflow executor', agentProfileId: job.payload?.agentProfile?.id || null, agentProfileName: job.payload?.agentProfile?.name || null, category: job.payload?.agentProfile?.category || 'general', portraitId: job.payload?.agentProfile?.portraitId || null, workerId, projectId: job.projectId, taskId: job.taskId, chatId: job.payload?.chatId || null, status: 'working', phase: job.type, action: `Starting ${job.type}.`, currentCommand: null, startedAt: now(), lastActivityAt: now(), instruction: (job.taskId ? store.get('tasks', job.taskId)?.instruction : null) || job.payload?.instruction || (newspaperJob ? 'Prepare a two-page sourced daily edition from bounded public feeds. Use native subscription summarization, preserve publication times, and never invent prices, stories or source links.' : voiceJob ? 'Synthesize explicitly requested text locally with the installed KittenTTS preset. No cloning, microphone capture, cloud fallback or automatic playback.' : bragJob ? 'Generate a local Brag video about the selected project. Inspect a curated source snapshot; never edit target source, publish or use paid media.' : githubJob ? 'Read bounded GitHub repository activity through connected MCP tools. Do not change GitHub records or local Git configuration.' : googleJob ? 'Read a bounded Google email and calendar brief through the connected MCP tools. Do not send messages or change calendar events.' : job.type), scope: { projectId: job.projectId, taskId: job.taskId, phase: job.type } });
    activeWorkflows.set(job.id, { job, controller });
    const cancellation = setInterval(() => {
      const current = store.get('jobs', job.id);
      const task = job.taskId && store.get('tasks', job.taskId);
      if (current?.cancelRequested || task?.cancelRequested || task?.status === 'cancelled' || !phoneJobAllowed(store,job)) controller.abort();
    }, 200);
    try {
      await workflow.run(job, controller.signal);
      // The durable request can arrive between the final operation and the
      // polling timer. Honor it before committing completion.
      if (store.get('jobs', job.id)?.cancelRequested || (job.taskId && store.get('tasks', job.taskId)?.cancelRequested) || !phoneJobAllowed(store,job)) controller.abort();
      if (controller.signal.aborted) { const error = new Error('Task cancelled by the user.'); error.cancelled = true; throw error; }
      const task = job.taskId && store.get('tasks', job.taskId);
      store.update('jobs', job.id, { status: 'completed', finishedAt: now(), error: null });
      const next = task?.status === 'awaiting_approval' ? 'awaiting_approval' : task?.status === 'awaiting_input' ? 'waiting_for_input' : task?.status === 'paused' ? 'waiting_for_input' : 'completed';
      // A disconnected Codex process is historical; its awaited user review belongs to the task.
      const agent = store.get('agents', agentId);
      const codexFinished = agent?.runtime === 'codex' || agent?.name === 'Codex';
      store.update('agents', agentId, { status: codexFinished ? 'completed' : next, ...(agentJob(job) ? { action: job.type === 'agent.image' ? 'Saved the generated image for Telegram delivery.' : job.type === 'agent.team.plan' ? 'Saved specialist assignments.' : job.type === 'agent.team.synthesize' ? 'Saved the team synthesis.' : 'Saved the agent response.' } : {}), currentCommand: null, lastActivityAt: now(), finishedAt: now(), ...(codexFinished && next !== 'completed' ? { action: 'Codex execution finished. The task is waiting for your next action.' } : {}) });
    } catch (error) {
      const cancelled = controller.signal.aborted || error.cancelled;
      const message = redactor.redact(error.message);
      const status = cancelled ? 'cancelled' : error.usageLimit ? 'paused' : 'failed';
      store.update('jobs', job.id, { status, error: message, finishedAt: now() });
      if (job.taskId) store.update('tasks', job.taskId, { status, error: message, lastActivityAt: now(), ...(cancelled || !error.usageLimit ? { finishedAt: now() } : {}) });
      store.update('agents', agentId, { status: cancelled ? 'cancelled' : error.usageLimit ? 'waiting_for_input' : 'failed', currentCommand: null, error: message, action: error.usageLimit ? 'Paused at the subscription usage limit. Retry explicitly when available.' : message, lastActivityAt: now(), finishedAt: now() });
      store.event({ source: 'agent', projectId: job.projectId, taskId: job.taskId, chatId: job.payload?.chatId, agentId, type: cancelled ? 'task.cancelled' : error.usageLimit ? 'task.usage_limit' : 'task.failed', level: cancelled ? 'info' : 'error', message });
    } finally { clearInterval(cancellation); activeWorkflows.delete(job.id); }
  }

  async function runOnce() {
    if (stopped || ticking) return;
    ticking = true;
    try {
      reconcileTeamRuns(store);
      let exclusiveWaiting = false;
      for (const candidate of store.list('jobs').filter((job) => job.status === 'queued')) {
        if (allowedJobs && !allowedJobs.has(candidate.type)) continue;
        if (!phoneJobAllowed(store,candidate)) { cancelPhoneJob(store,candidate); continue; }
        if (candidate.cancelRequested) { store.update('jobs', candidate.id, { status: 'cancelled', finishedAt: now() }); continue; }
        if (candidate.type?.startsWith('service.')) {
          if (!['service.start', 'service.stop', 'service.restart'].includes(candidate.type)) continue;
          const job = claim(candidate.id);
          if (job) { const promise = executeService(job); activeServices.set(job.id, promise); }
        } else {
          const running = [...activeWorkflows.values()].map(value => value.job);
          const independent = agentJob(candidate);
          const locked = running.some(j => !agentJob(j) || (candidate.payload?.chatId && j.payload?.chatId === candidate.payload.chatId) || (candidate.payload?.agentProfile?.id && j.payload?.agentProfile?.id === candidate.payload.agentProfile.id));
          const eligible = independent ? !exclusiveWaiting && !locked && running.length < agentConcurrency : running.length === 0;
          if (!independent) exclusiveWaiting = true;
          if (!eligible) continue;
          const job = claim(candidate.id);
          if (job) { const promise = executeWorkflow(job); const entry = activeWorkflows.get(job.id); if (entry) entry.promise = promise; }
        }
      }
    } finally { ticking = false; }
  }

  const heartbeat = setInterval(() => {
    if (stopped) return;
    try {
      const lease = store.get('settings', leaseId);
      if (lease?.ownerId !== workerId) { for (const entry of activeWorkflows.values()) entry.controller.abort(); return; }
      store.update('settings', leaseId, { lastHeartbeatAt: now() });
      store.update('workers', workerId, { status: 'online', lastHeartbeatAt: now(), capabilities: { ...capabilities } });
    } catch { /* Backend can observe stale heartbeat if local storage becomes unavailable. */ }
  }, 2000);
  const poll = setInterval(() => runOnce().catch((error) => store.event({ source: 'system', type: 'worker.error', level: 'error', message: redactor.redact(error.message) })), pollMs);
  await runOnce();
  return { workerId, store, services, runOnce, capabilities,
    async stop({ stopServices = true } = {}) {
      if (stopped) return;
      stopped = true;
      clearInterval(heartbeat); clearInterval(poll);
      await telegram?.stop();
      for (const entry of activeWorkflows.values()) entry.controller.abort();
      await Promise.allSettled([...activeWorkflows.values()].map(entry => entry.promise));
      await services.close({ stopServices });
      if (stopServices && store.get('settings', 'voice-process')) await stopVoice({ store }).catch((error) => store.event({ source: 'voice', type: 'voice.shutdown', level: 'warning', message: redactor.redact(error.message) }));
      await Promise.allSettled([...activeServices.values()]);
      store.update('workers', workerId, { status: 'offline', lastHeartbeatAt: now() });
      const lease = store.get('settings', leaseId);
      if (lease?.ownerId === workerId) store.remove('settings', leaseId);
      store.event({ source: 'system', type: 'worker.offline', level: 'info', message: 'Local execution worker stopped.', data: { workerId } });
      if (!providedStore) store.close();
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  startWorker().then((worker) => {
    let shuttingDown = false;
    const shutdown = () => { if (shuttingDown) return; shuttingDown = true; worker.stop().then(() => process.exit(0)).catch((error) => { console.error(error.message); process.exit(1); }); };
    process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
    console.log('Mari local worker is online.');
  }).catch((error) => { console.error(`Mari worker failed: ${error.message}`); process.exitCode = 1; });
}
