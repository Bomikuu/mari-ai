import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtemp, rm, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createStore } from '../server/store.js';
import { createApp } from '../server/index.js';
import { createVoiceRouter, inspectVoice, voiceSettings, voiceText, VOICE_URL } from '../server/voice.js';
import { runVoice, validateWav, stopVoice } from '../worker/voice.js';

function wav() {
  const data = Buffer.alloc(4800, 1), b = Buffer.alloc(44 + data.length);
  b.write('RIFF'); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(24000, 24); b.writeUInt32LE(48000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(data.length, 40); data.copy(b, 44); return b;
}
async function fixture(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'mari-voice-test-')), store = createStore(directory);
  store.put('agents', { id: 'voice-agent' });
  t.after(async () => { store.close(); await rm(directory, { recursive: true, force: true }); });
  return { store, dataDir: directory, job: { id: 'voice-job', agentId: 'voice-agent', type: 'voice.synthesize', payload: { voice: 'expr-voice-2-f', speed: 0.95, text: 'Synthetic test.' } } };
}
async function serve(t, app) {
  const server = await new Promise((resolve) => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  t.after(() => new Promise((resolve) => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}`;
}
test('voice validates fixed presets, speed and bounded explicit input', () => {
  assert.deepEqual(voiceSettings(), { voice: 'expr-voice-2-f', speed: 0.95 });
  for (const input of [{voice: '../custom'}, {speed: '0.95'}, {speed: NaN}, {speed: 1.26}, []]) assert.throws(() => voiceSettings(input));
  for (const input of ['', 'x'.repeat(601), null, 'hello\0world']) assert.throws(() => voiceText(input));
  assert.equal(voiceText('  Hello.  '), 'Hello.');
});
test('voice recognizes the fixed local API and refuses redirects/wrong services', async () => {
  const calls = [];
  const connection = await inspectVoice({ fetchImpl: async (url, options) => {
    calls.push([url, options]); return Response.json(url.endsWith('/health') ? {status:'ok', version:'0.5.7', device:'cpu'} : {backends:[{id:'kittentts',available:true,preset_voices:['expr-voice-2-f']}]});
  }});
  assert.equal(connection.engineAvailable, true); assert.equal(calls.length, 2);
  assert.ok(calls.every(([url, options]) => url.startsWith(VOICE_URL) && options.redirect === 'error'));
  const wrong = await inspectVoice({fetchImpl:async()=>Response.json({status:'ok',version:'unrelated'})});
  assert.equal(wrong.status,'offline'); assert.equal(wrong.engineAvailable,false);
});
test('voice queues deduplicated jobs, persists settings and cancels only voice work', async (t) => {
  const {store} = await fixture(t); const app = express(); app.use(express.json());
  store.put('workers',{id:'worker',status:'online',lastHeartbeatAt:new Date().toISOString()});
  let counter=0;
  app.use('/voice',createVoiceRouter({store,enqueue:(type,fields)=>store.put('jobs',{id:`job-${++counter}`,type,...fields,status:'queued'}),inspect:async()=>({status:'offline'}),installation:async()=>({installed:true})}));
  app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
  const base=await serve(t,app), post=(route,body)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const [a,b]=await Promise.all([post('/voice/preview',{text:'One.'}),post('/voice/preview',{text:'Two.'})]);
  assert.equal(a.status,202); assert.equal(b.status,202); assert.equal(counter,1);
  const unrelated=store.put('jobs',{id:'service-job',type:'service.stop',status:'queued'});
  assert.equal((await post('/voice/cancel',{jobId:unrelated.id})).status,404); assert.equal(store.get('jobs',unrelated.id).status,'queued');
  assert.equal((await post('/voice/cancel',{jobId:'job-1'})).status,200); assert.equal(store.get('jobs','job-1').status,'cancelled');
  const settings=await fetch(base+'/voice/settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({speed:0.9})});
  assert.equal(settings.status,200); assert.equal(store.get('settings','voice').speed,0.9);
  store.update('workers','worker',{status:'offline'}); assert.equal((await post('/voice/start',{})).status,409);
});
test('WAV validation rejects truncated, empty and misleading headers', () => {
  assert.equal(validateWav(wav()).duration,0.1);
  assert.throws(()=>validateWav(Buffer.from('fake.wav')));
  assert.throws(()=>validateWav(wav().subarray(0,50)));
  const b=wav();b.writeUInt32LE(1,28);assert.throws(()=>validateWav(b));
  const c=wav();c.writeUInt32LE(0,40);assert.throws(()=>validateWav(c));
});
test('speech uses fixed local engine, validates and saves a private real artifact', async (t) => {
  const f=await fixture(t); const calls=[];
  const artifact=await runVoice({...f,signal:new AbortController().signal,inspect:async()=>({status:'online',engineAvailable:true}),fetchImpl:async(url,options)=>{calls.push([url,JSON.parse(options.body)]);return new Response(wav(),{headers:{'Content-Type':'audio/wav'}});}});
  assert.equal(calls[0][0],`${VOICE_URL}/v1/audio/speech`); assert.equal(calls[0][1].model,'kittentts');
  assert.deepEqual(await readFile(artifact.path),wav()); assert.equal(artifact.metadata.synthetic,true);
  assert.ok(artifact.path.startsWith(path.join(f.dataDir,'artifacts')+path.sep));
  assert.equal(f.store.list('artifacts').length,1);
});
test('failed/cancelled synthesis never persists an audio artifact', async (t) => {
  const f=await fixture(t); const inspect=async()=>({status:'online',engineAvailable:true});
  await assert.rejects(runVoice({...f,inspect,fetchImpl:async()=>new Response('failed',{status:503})}),/HTTP 503/);
  await assert.rejects(runVoice({...f,inspect,fetchImpl:async()=>new Response('junk',{headers:{'Content-Type':'audio/wav'}})}),/valid bounded WAV/);
  const controller=new AbortController();controller.abort();let called=false;
  await assert.rejects(runVoice({...f,signal:controller.signal,inspect,fetchImpl:async()=>{called=true;}}),/cancelled/);
  assert.equal(called,false);assert.equal(f.store.list('artifacts').length,0);
});
test('voice stop rejects stale ownership and never sends a signal to unrelated processes', async (t) => {
  const {store}=await fixture(t);store.put('settings',{id:'voice-process',pid:process.pid,pgid:process.pid,startTicks:'wrong',bootId:'wrong'});
  await assert.rejects(stopVoice({store}),/No verified Mari-owned/);assert.equal(store.get('settings','voice-process'),null);
});
test('durable cancellation during synthesis discards output before the timer aborts', async (t) => {
  const f=await fixture(t);f.store.put('jobs',{...f.job,status:'running'});
  await assert.rejects(runVoice({...f,signal:new AbortController().signal,inspect:async()=>({status:'online',engineAvailable:true}),fetchImpl:async()=>{
    f.store.update('jobs',f.job.id,{cancelRequested:true});return new Response(wav(),{headers:{'Content-Type':'audio/wav'}});
  }}),/cancelled/);
  assert.equal(f.store.list('artifacts').length,0);
});
test('private media route requires owner session and supports byte ranges/download', async (t) => {
  const f=await fixture(t), directory=path.join(f.dataDir,'artifacts');await mkdir(directory);
  const file=path.join(directory,'test.wav');await writeFile(file,wav());f.store.put('artifacts',{id:'audio-1',kind:'audio',mime:'audio/wav',path:file});
  const base=await serve(t,createApp({...f,accessKey:'synthetic-voice-range-key'}));
  assert.equal((await fetch(base+'/api/artifacts/audio-1/content')).status,401);
  const pair=await fetch(base+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({accessKey:'synthetic-voice-range-key'})});
  const cookie=pair.headers.get('set-cookie').split(';')[0];
  const range=await fetch(base+'/api/artifacts/audio-1/content',{headers:{Cookie:cookie,Range:'bytes=0-11'}});
  assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'audio/wav');assert.equal((await range.arrayBuffer()).byteLength,12);
  const download=await fetch(base+'/api/artifacts/audio-1/content?download=1',{headers:{Cookie:cookie}});assert.match(download.headers.get('content-disposition'),/^attachment;/);await download.body.cancel();
});
