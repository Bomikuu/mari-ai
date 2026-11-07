import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { id, now } from '../server/store.js';
import { VOICE_URL, VOICE_HOME, inspectVoice, voiceInstallation, voiceSettings, voiceText } from '../server/voice.js';
import { safeChildEnv, createLineWriter, createRedactor } from '../server/security.js';
import { processIdentity, sameIdentity, isPortOpen } from './services.js';

export const MAX_VOICE_BYTES = 8 * 1024 * 1024;
const cancelled = () => Object.assign(new Error('Voice job cancelled.'), { cancelled: true });
const check = (signal) => { if (signal?.aborted) throw cancelled(); };
export function validateWav(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 44 || buffer.length > MAX_VOICE_BYTES || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE' || buffer.readUInt32LE(4) + 8 !== buffer.length) throw new Error('VoiceStudio did not return a valid bounded WAV file.');
  let fmt, dataBytes = 0;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const kind = buffer.toString('ascii', offset, offset + 4), length = buffer.readUInt32LE(offset + 4), start = offset + 8;
    if (start + length > buffer.length) throw new Error('VoiceStudio returned a truncated WAV chunk.');
    if (kind === 'fmt ' && length >= 16) fmt = { encoding: buffer.readUInt16LE(start), channels: buffer.readUInt16LE(start + 2), sampleRate: buffer.readUInt32LE(start + 4), byteRate: buffer.readUInt32LE(start + 8), blockAlign: buffer.readUInt16LE(start + 12), bits: buffer.readUInt16LE(start + 14) };
    if (kind === 'data') dataBytes += length;
    offset = start + length + (length % 2);
  }
  if (!fmt || ![1, 3].includes(fmt.encoding) || ![1, 2].includes(fmt.channels) || fmt.sampleRate < 16000 || fmt.sampleRate > 48000 || ![16, 24, 32].includes(fmt.bits)
    || fmt.blockAlign !== fmt.channels * fmt.bits / 8 || fmt.byteRate !== fmt.sampleRate * fmt.blockAlign || !dataBytes || dataBytes % fmt.blockAlign) throw new Error('VoiceStudio returned unsupported or empty WAV audio.');
  const duration = dataBytes / fmt.byteRate;
  if (duration < 0.1 || duration > 120) throw new Error('Voice sample duration is outside the allowed range.');
  return { duration, sampleRate: fmt.sampleRate, channels: fmt.channels };
}

function activity(store, job, action, command = null) {
  store.update('agents', job.agentId, { phase: job.type, action, currentCommand: command, lastActivityAt: now() });
  store.event({ source: 'agent', agentId: job.agentId, type: 'voice.activity', message: action, data: { jobId: job.id, ...(command ? { command } : {}) } });
}

export async function stopVoice({ store }) {
  const saved = store.get('settings', 'voice-process');
  if (!saved || !sameIdentity(saved, await processIdentity(saved.pid)) || saved.pgid !== saved.pid || saved.pid === process.pid) {
    if (saved) store.remove('settings', 'voice-process');
    throw new Error('No verified Mari-owned VoiceStudio process can be stopped. An external server is left running.');
  }
  process.kill(-saved.pgid, 'SIGTERM');
  for (let n = 0; n < 40 && sameIdentity(saved, await processIdentity(saved.pid)); n++) await delay(100);
  if (sameIdentity(saved, await processIdentity(saved.pid))) process.kill(-saved.pgid, 'SIGKILL');
  store.remove('settings', 'voice-process');
}

export async function startVoice({ store, job, signal, home = VOICE_HOME, inspect = inspectVoice, spawnImpl = spawn }) {
  check(signal);
  const current = await inspect({ signal });
  if (current.status === 'online') { activity(store, job, 'VoiceStudio is already online. Its existing process is left running.'); return current; }
  if (await isPortOpen(VOICE_URL)) throw new Error('Port 3900 is occupied by a server that is not ready as VoiceStudio 0.5.7. Stop or configure it outside Mari.');
  const installation = await voiceInstallation(home);
  if (!installation.installed || !installation.launcherAvailable) throw new Error('Install the local VoiceStudio runtime before starting its voice API.');
  const launcher = path.join(home, 'run-backend.sh');
  if (await fs.realpath(launcher) !== launcher) throw new Error('VoiceStudio launcher must be a regular local installation file.');
  activity(store, job, 'Starting the local CPU VoiceStudio API.', 'VoiceStudio · loopback:3900 · CPU');
  const child = spawnImpl(launcher, [], { cwd: home, env: safeChildEnv(), detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let startupError = null; child.on('error', (error) => { startupError = error; });
  const writer = createLineWriter(createRedactor(), (line) => store.event({ source: 'voice', type: 'voice.server.output', level: 'info', message: line.slice(0, 2000), data: { jobId: job.id } }));
  child.stdout?.on('data', (chunk) => writer.write(chunk)); child.stderr?.on('data', (chunk) => writer.write(chunk)); child.on('close', () => writer.flush());
  let identity;
  try {
    for (let n = 0; n < 10 && !identity && !startupError; n++) { identity = await processIdentity(child.pid); if (!identity) await delay(50); }
    if (!identity || identity.pgid !== identity.pid) throw new Error('Could not establish safe ownership of the VoiceStudio process.');
    store.put('settings', { id: 'voice-process', ...identity, startedAt: now() });
    for (let n = 0; n < 90; n++) {
      check(signal);
      if (startupError || !sameIdentity(identity, await processIdentity(identity.pid))) throw new Error('VoiceStudio exited during startup. Inspect its local server output.');
      const status = await inspect({ signal });
      if (status.status === 'online') { activity(store, job, 'VoiceStudio API is ready on loopback.'); return status; }
      await delay(500, undefined, { signal });
    }
    throw new Error('VoiceStudio did not become ready within its startup deadline.');
  } catch (error) {
    if (identity && sameIdentity(identity, await processIdentity(identity.pid))) await stopVoice({ store }).catch(() => {});
    else if (!identity && child.pid) child.kill('SIGTERM');
    throw error;
  }
}

export async function runVoice({ store, dataDir, job, signal, fetchImpl = fetch, inspect = inspectVoice }) {
  const checkJob = () => { check(signal); if (store.get('jobs', job.id)?.cancelRequested) throw cancelled(); };
  checkJob();
  if (job.type === 'voice.start') return startVoice({ store, job, signal, inspect });
  if (job.type === 'voice.stop') { activity(store, job, 'Stopping the verified Mari-owned VoiceStudio process.'); await stopVoice({ store }); return; }
  if (job.type !== 'voice.synthesize') throw new Error('Unsupported voice job.');
  const settings = voiceSettings(job.payload), text = voiceText(job.payload?.text);
  const connection = await inspect({ signal }); check(signal);
  if (connection.status !== 'online' || !connection.engineAvailable) throw new Error(connection.error || 'Start VoiceStudio with its installed KittenTTS engine first.');
  activity(store, job, 'Synthesizing the requested text with the selected local preset.', 'POST localhost:3900/v1/audio/speech · KittenTTS');
  const combined = AbortSignal.any([signal || new AbortController().signal, AbortSignal.timeout(90000)]);
  const response = await fetchImpl(`${VOICE_URL}/v1/audio/speech`, { method: 'POST', redirect: 'error', signal: combined, headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'kittentts', input: text, voice: settings.voice, response_format: 'wav', speed: settings.speed, language: 'en' }) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`Local voice synthesis failed (HTTP ${response.status}). Inspect VoiceStudio output and retry.`); }
  if (!/^audio\/(?:wav|x-wav)(?:;|$)/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel(); throw new Error('VoiceStudio returned an unexpected content type.'); }
  const chunks = []; let size = 0;
  for await (const chunk of response.body) { check(signal); size += chunk.length; if (size > MAX_VOICE_BYTES) throw new Error('Voice sample exceeded 8 MiB.'); chunks.push(chunk); }
  const buffer = Buffer.concat(chunks), metadata = validateWav(buffer); checkJob();
  const root = path.join(dataDir, 'artifacts'); await fs.mkdir(root, { recursive: true, mode: 0o700 });
  const directory = await fs.mkdtemp(path.join(await fs.realpath(root), 'voice-')); await fs.chmod(directory, 0o700);
  const artifactId = id('artifact'), filename = path.join(directory, `${artifactId}.wav`);
  try {
    await fs.writeFile(filename, buffer, { flag: 'wx', mode: 0o600 }); checkJob();
    const artifact = { id: artifactId, jobId: job.id, kind: 'audio', mime: 'audio/wav', path: filename, title: 'Mari · synthetic voice', createdAt: now(), sha256: crypto.createHash('sha256').update(buffer).digest('hex'),
      metadata: { source: 'voicestudio', synthetic: true, model: 'KittenTTS Mini 0.8', voice: settings.voice, speed: settings.speed, text, ...metadata } };
    store.put('artifacts', artifact); store.update('jobs', job.id, { artifactIds: [artifact.id] });
    activity(store, job, 'Synthetic voice sample is ready for manual playback.');
    return artifact;
  } catch (error) { await fs.rm(directory, { recursive: true, force: true }); throw error; }
}
