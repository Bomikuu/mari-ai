import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { publicArtifact } from './artifacts.js';
import { now } from './store.js';
import { processIdentity, sameIdentity } from '../worker/services.js';

export const VOICE_URL = 'http://127.0.0.1:3900';
export const VOICE_HOME = path.join(os.homedir(), '.local/share/mari-ai/tools/voicestudio');
export const VOICE_DEFAULTS = { voice: 'expr-voice-2-f', speed: 0.95 };
export const VOICES = [
  ['expr-voice-2-f', 'Bella · feminine'], ['expr-voice-3-f', 'Luna · feminine'],
  ['expr-voice-4-f', 'Rosie · feminine'], ['expr-voice-5-f', 'Kiki · feminine'],
  ['expr-voice-2-m', 'Masculine 2'], ['expr-voice-3-m', 'Masculine 3'],
  ['expr-voice-4-m', 'Masculine 4'], ['expr-voice-5-m', 'Masculine 5'],
].map(([id, name]) => ({ id, name }));
export const VOICE_JOB_TYPES = new Set(['voice.start', 'voice.stop', 'voice.synthesize']);
const active = (job) => ['queued', 'running'].includes(job.status);
const fail = (message, status = 400, code = 'INVALID_VOICE') => Object.assign(new Error(message), { status, code });

export function voiceSettings(input = {}, previous = VOICE_DEFAULTS) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Voice settings must be an object.');
  const voice = input.voice ?? previous.voice, speed = input.speed ?? previous.speed;
  if (!VOICES.some((item) => item.id === voice)) throw fail('Choose an installed KittenTTS preset.');
  if (typeof speed !== 'number' || !Number.isFinite(speed) || speed < 0.75 || speed > 1.25) throw fail('Voice speed must be between 0.75 and 1.25.');
  return { voice, speed };
}

export function voiceText(input) {
  if (typeof input !== 'string' || !input.trim() || input.length > 600 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input)) throw fail('Enter between 1 and 600 characters to speak.');
  return input.trim();
}

export async function voiceInstallation(home = VOICE_HOME) {
  const launcher = path.join(home, 'run-backend.sh');
  const installed = await fs.stat(path.join(home, 'venv/bin/python')).then((s) => s.isFile()).catch(() => false);
  const launcherAvailable = await fs.lstat(launcher).then((s) => s.isFile() && !s.isSymbolicLink()).catch(() => false);
  return { installed, launcherAvailable };
}

async function readJson(response, max = 1024 * 1024) {
  if (!response.ok) { await response.body?.cancel(); throw new Error('VoiceStudio is not ready.'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > max) throw new Error('VoiceStudio returned an oversized response.'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function inspectVoice({ fetchImpl = fetch, signal } = {}) {
  try {
    const timeout = AbortSignal.timeout(2500), combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const health = await readJson(await fetchImpl(`${VOICE_URL}/health`, { redirect: 'error', signal: combined }));
    if (health.status !== 'ok' || health.version !== '0.5.7') return { status: 'offline', engineAvailable: false, error: 'Port 3900 is not the installed VoiceStudio 0.5.7 API.' };
    const engines = await readJson(await fetchImpl(`${VOICE_URL}/engines/tts`, { redirect: 'error', signal: combined }));
    const kitten = engines.backends?.find((item) => item.id === 'kittentts');
    if (!kitten || !Array.isArray(kitten.preset_voices)) throw new Error('Unexpected voice engine response.');
    return { status: 'online', version: health.version, device: health.device === 'cpu' ? 'cpu' : 'unknown', engineAvailable: kitten.available === true,
      ...(kitten.available !== true ? { error: 'KittenTTS is unavailable. Check the local VoiceStudio installation.' } : {}) };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: 'offline', engineAvailable: false, error: 'VoiceStudio is offline or not ready on localhost:3900.' };
  }
}

export function createVoiceRouter({ store, enqueue, getWorkers = () => store.list('workers'), inspect = inspectVoice, installation = voiceInstallation }) {
  const router = express.Router();
  const jobs = () => store.list('jobs').filter((job) => VOICE_JOB_TYPES.has(job.type));
  const publicJob = (job) => job ? Object.fromEntries(['id', 'type', 'status', 'agentId', 'cancelRequested', 'error', 'createdAt', 'startedAt', 'finishedAt'].map((key) => [key, job[key] ?? null])) : null;
  const settings = () => voiceSettings({}, store.get('settings', 'voice') || VOICE_DEFAULTS);
  const online = () => getWorkers().some((w) => w.status === 'online' && Date.now() - Date.parse(w.lastHeartbeatAt || '') < 8000);
  router.get('/', async (req, res) => {
    const [connection, install] = await Promise.all([inspect(), installation()]);
    const saved = store.get('settings', 'voice-process');
    const owned = saved && sameIdentity(saved, await processIdentity(saved.pid));
    const pending = jobs().findLast(active);
    res.json({ installation: install, connection: { ...connection, ownership: connection.status === 'online' ? owned ? 'managed' : 'external' : null,
      ...(pending?.type === 'voice.start' && connection.status === 'offline' ? { status: 'starting' } : {}) }, settings: settings(), voices: VOICES,
      job: publicJob(pending || jobs().at(-1)), artifacts: store.list('artifacts').filter((a) => a.kind === 'audio' && a.metadata?.source === 'voicestudio').slice(-12).map(publicArtifact) });
  });
  router.put('/settings', (req, res) => {
    const value = voiceSettings(req.body, settings()); store.put('settings', { id: 'voice', ...value }); res.json({ settings: value });
  });
  for (const action of ['start', 'stop', 'preview']) router.post(`/${action}`, async (req, res) => {
    if (!online()) throw fail('Start the local Mari worker first.', 409, 'WORKER_OFFLINE');
    const payload = action === 'preview' ? { ...voiceSettings(req.body, settings()), text: voiceText(req.body?.text) } : {};
    const pending = jobs().find(active);
    if (pending) { if (pending.type !== `voice.${action === 'preview' ? 'synthesize' : action}`) throw fail('Wait for or cancel the current voice job first.', 409, 'VOICE_BUSY'); return res.status(202).json({ job: publicJob(pending) }); }
    const job = enqueue(`voice.${action === 'preview' ? 'synthesize' : action}`, { payload });
    res.status(202).json({ job: publicJob(job) });
  });
  router.post('/cancel', (req, res) => {
    const job = req.body?.jobId ? store.get('jobs', req.body.jobId) : jobs().find(active);
    if (!job || !VOICE_JOB_TYPES.has(job.type)) throw fail('Voice job was not found.', 404, 'NOT_FOUND');
    if (!active(job)) throw fail('This voice job has finished.', 409, 'JOB_FINISHED');
    res.json({ job: publicJob(store.update('jobs', job.id, { cancelRequested: true, ...(job.status === 'queued' ? { status: 'cancelled', finishedAt: now() } : {}) })) });
  });
  return router;
}
