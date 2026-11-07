import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createStore,now} from '../server/store.js';
import {AGENT_PROFILE_TEMPLATES} from '../shared/agent-catalog.js';
import {preparePhoneTurn,phoneJobAllowed} from '../server/telegram-work.js';
import {saveTelegramCredentials,telegramApi} from '../server/telegram-client.js';
import {telegramState,queueTelegramAnswer,queueTelegramMessage} from '../server/telegram.js';
import {handleTelegramUpdate,collectTelegramReplies,createTelegramBridge} from '../worker/telegram.js';
import {runTelegramImage} from '../worker/telegram-image.js';
import {telegramPhoto} from '../worker/telegram-photo.js';

const token='123456789:'+'synthetic'.repeat(5);
const supported=async()=>({available:true,authenticated:true,supported:true});
async function fixture(t){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mari-phone-test-')),store=createStore(directory),cleanups=[];
 t.after(async()=>{for(const cleanup of cleanups)await cleanup();store.close();await fs.rm(directory,{recursive:true,force:true});});
 for(const p of AGENT_PROFILE_TEMPLATES)store.put('agentProfiles',{...p,id:'profile_'+p.id,skills:[]});
 store.put('settings',{id:'telegram',generation:'generation_fixture',enabled:true,paired:{id:'binding_fixture',chatId:'42',userId:'42',pairedAt:now()},projectId:null,profileId:'profile_ceo',allowGoals:true,notifications:false});
 saveTelegramCredentials(directory,{botToken:token,generation:'generation_fixture'});
 const preparePhone=(s,args)=>preparePhoneTurn(s,args,async(s,key)=>({...s.get('agentProfiles',key),skills:[]}));
 const update=(id,text,extra={})=>({update_id:id,message:{message_id:id,chat:{id:42,type:'private'},from:{id:42,is_bot:false,first_name:'Synthetic'},date:Math.floor(Date.now()/1000),text,...extra}});
 const send=(id,text,extra={})=>handleTelegramUpdate({store,update:update(id,text,extra),expected:telegramState(store),preparePhone});
 const complete=(job,content='A synthetic definition.')=>{store.update('jobs',job.id,{status:'completed'});store.update('agentMessages',job.payload.replyId,{status:'completed',content});};
 const bridge=(api)=>{store.put('settings',{id:'worker-lease',ownerId:'worker_fixture'});const b=createTelegramBridge({store,dataDir:directory,workerId:'worker_fixture',intervalMs:999999,preparePhone,makeApi:()=>api});cleanups.push(()=>b.stop());return b;};
 return {store,directory,cleanups,send,update,preparePhone,complete,bridge};
}

test('normal messages use Mari, preserve scoped phone history and deduplicate concurrent updates',async t=>{
 const f=await fixture(t);await Promise.all([f.send(1,'What is an API?'),f.send(1,'What is an API?')]);
 assert.equal(f.store.list('jobs').length,1);const first=f.store.list('jobs')[0];assert.equal(first.type,'agent.turn');assert.equal(first.payload.agentProfile.name,'Mari');
 f.complete(first);await f.send(2,'Give one example.');const second=f.store.list('jobs')[1];assert.equal(second.payload.chatId,first.payload.chatId);
 const source=await fs.mkdtemp(path.join(f.directory,'source-'));f.store.put('projects',{id:'project_a',name:'Fixture',path:source});f.store.update('settings','telegram',{projectId:'project_a'});
 await f.send(3,'Describe this project.');assert.notEqual(f.store.list('jobs')[2].payload.chatId,first.payload.chatId);assert.equal(f.store.list('jobs')[2].projectId,'project_a');
 assert.equal(phoneJobAllowed(f.store,second),false);
});

test('rapid different messages serialize into the same phone conversation without dropping receipts',async t=>{
 const f=await fixture(t);await Promise.all([f.send(1,'First message.'),f.send(2,'Second message.')]);
 assert.equal(f.store.list('jobs').length,2);assert.equal(f.store.list('telegramReceipts').length,2);
 assert.equal(new Set(f.store.list('jobs').map(j=>j.payload.chatId)).size,1);
});

test('/new closes old phone history, cancels its active turns and suppresses late replies',async t=>{
 const f=await fixture(t);await f.send(1,'Old question.');const old=f.store.list('jobs')[0];f.complete(old,'Old answer.');collectTelegramReplies(f.store);
 await f.send(2,'Follow-up.');const pending=f.store.list('jobs')[1];await f.send(3,'/new');
 assert.equal(f.store.get('jobs',pending.id).status,'cancelled');assert.equal(f.store.get('agentChats',old.payload.chatId).phoneClosed,true);
 assert(f.store.list('telegramOutbox').filter(o=>o.kind==='answer').every(o=>o.status==='cancelled'));
 await f.send(4,'New question.');assert.notEqual(f.store.list('jobs').at(-1).payload.chatId,old.payload.chatId);
});

test('unknown commands, foreign/forwarded messages and disabled phone requests do not invoke AI',async t=>{
 const f=await fixture(t);await f.send(1,'/image');await f.send(2,'/unknown');await f.send(3,'foreign',{chat:{id:99,type:'private'},from:{id:99,is_bot:false}});await f.send(4,'forwarded',{forward_origin:{type:'user'}});
 f.store.update('settings','telegram',{allowGoals:false});await f.send(5,'What is an API?');await f.send(6,'/image A red cube');assert.equal(f.store.list('jobs').length,0);
});

test('scope change, reset or re-pair during profile resolution cannot queue late work',async t=>{
 for(const change of ['scope','reset','pair']){
  const f=await fixture(t);await handleTelegramUpdate({store:f.store,update:f.update(1,'Hello'),expected:telegramState(f.store),preparePhone:async(s,args)=>{const p=await f.preparePhone(s,args);if(change==='scope')s.update('settings','telegram',{projectId:'project_other'});if(change==='reset')s.update('settings','telegram',{phoneEpoch:'reset'});if(change==='pair')s.update('settings','telegram',{paired:{...telegramState(s).paired,id:'new-binding'}});return p;}});
  assert.equal(f.store.list('jobs').length,0);
 }
});

test('three-request limit and cancellation stay within the current phone binding and leave services unchanged',async t=>{
 const f=await fixture(t);const service=f.store.put('services',{id:'service_external',status:'running',ownership:'external'});
 await Promise.all([f.send(1,'One'),f.send(2,'Two'),f.send(3,'Three'),f.send(4,'Four')]);assert.equal(f.store.list('jobs').length,3);
 const foreign=f.store.put('jobs',{id:'job_foreign',type:'agent.turn',status:'running',origin:{type:'desktop'}});
 await f.send(5,'/cancel '+foreign.id);assert.equal(f.store.get('jobs',foreign.id).cancelRequested,undefined);
 const own=f.store.list('jobs')[0];await f.send(6,'/cancel '+own.id);assert.equal(f.store.get('jobs',own.id).status,'cancelled');assert.deepEqual(f.store.get('services',service.id),service);
});

test('full answers are chunked without losing Unicode, remain ordered and are not duplicated',async t=>{
 const f=await fixture(t);await f.send(1,'Explain.');const job=f.store.list('jobs')[0],text=('A😀é\n').repeat(2000);f.complete(job,text);
 collectTelegramReplies(f.store);collectTelegramReplies(f.store);const parts=f.store.list('telegramOutbox').filter(o=>o.kind==='answer');
 assert(parts.length>2);assert(parts.every(o=>o.text.length<4096));assert.equal(parts.map(o=>o.text.replace(/^\[\d+\/\d+\]\n/,'')).join(''),text);
 for(let i=1;i<parts.length;i++)assert.equal(parts[i].dependsOn,parts[i-1].id);
 const calls=[],b=f.bridge(async(method,args)=>{if(method==='getUpdates')return[];calls.push(args.text);return{message_id:calls.length};});
 for(let i=0;i<8;i++)await b.tick();assert(f.store.list('telegramOutbox').every(o=>o.status==='delivered'));assert.deepEqual(calls.filter(v=>v?.startsWith('[')),parts.map(p=>p.text));
});

test('an uncertain first answer part blocks later parts until explicit retry',async t=>{
 const f=await fixture(t);for(const o of f.store.list('telegramOutbox'))f.store.remove('telegramOutbox',o.id);
 queueTelegramAnswer(f.store,telegramState(f.store),'multipart','x'.repeat(8000),{projectId:null});let sends=0;
 const b=f.bridge(async method=>{if(method==='getUpdates')return[];sends++;throw new Error('Synthetic ambiguous transport.');});await b.tick();await b.tick();
 assert.equal(sends,1);assert.deepEqual(f.store.list('telegramOutbox').map(o=>o.status),['uncertain','pending','pending']);
});

test('direct answers require their original scope, pairing and source job; notification consent is independent',async t=>{
 const f=await fixture(t);await f.send(1,'A private question');const job=f.store.list('jobs')[0];f.complete(job,'Private result');collectTelegramReplies(f.store);
 assert.equal(f.store.list('telegramOutbox').find(o=>o.kind==='answer').status,'pending');
 f.store.update('settings','telegram',{projectId:'different'});let sends=0;const b=f.bridge(async m=>{if(m==='getUpdates')return[];sends++;return{message_id:sends};});await b.tick();
 assert.equal(f.store.list('telegramOutbox').find(o=>o.kind==='answer').status,'cancelled');
});

async function imageJob(f){await f.send(1,'/image A synthetic red cube.');const job=f.store.list('jobs')[0];f.store.put('agents',{id:'executor',status:'working'});f.store.update('jobs',job.id,{status:'running',agentId:'executor'});return {...job,agentId:'executor'};}
const fakeImageClient=(control={})=>options=>({async connect(){control.policy=options.executionPolicy;},async close(){control.closed=true;},async runTurn(args){control.turn=args;if(control.error)throw control.error;const file=control.path||path.join(args.cwd,'synthetic.png');await sharp({create:{width:64,height:64,channels:3,background:'#cc0000'}}).png().toFile(file);return{status:'completed',threadId:'synthetic_thread',turnId:'synthetic_turn',messages:[],images:control.images||[{savedPath:file}]};}});

test('/image saves an actual validated artifact and sends it as an owned multipart photo',async t=>{
 const f=await fixture(t),job=await imageJob(f),control={};await runTelegramImage({store:f.store,dataDir:f.directory,job,inspect:supported,makeCodex:fakeImageClient(control)});f.store.update('jobs',job.id,{status:'completed'});
 assert.equal(control.policy.webSearch,false);assert.deepEqual(control.policy.readRoots,[]);assert(!control.turn.input[0].text.includes('private context'));
 collectTelegramReplies(f.store);const delivery=f.store.list('telegramOutbox').find(o=>o.kind==='photo');assert(delivery);assert.equal((await telegramPhoto({store:f.store,dataDir:f.directory,delivery})).type,'image/jpeg');
 const calls=[],b=f.bridge(async(method,args)=>{if(method==='getUpdates')return[];calls.push({method,args});return{message_id:10,photo:[{file_id:'synthetic_photo'}]};});await b.tick();
 const call=calls.find(c=>c.method==='sendPhoto');assert(call);assert(call.args.photo instanceof Blob);assert.equal(call.args.reply_parameters.message_id,1);assert.equal(f.store.get('telegramOutbox',delivery.id).status,'delivered');
});

test('image files outside generated roots and missing images fail honestly; usage limits remain paused',async t=>{
 for(const mode of ['outside','missing','limit']){
  const f=await fixture(t),job=await imageJob(f),control=mode==='outside'?{path:path.join(f.directory,'outside.png')}:mode==='missing'?{images:[]}:{images:[{failure:{type:'usageLimitExceeded'}}]};
  await assert.rejects(runTelegramImage({store:f.store,dataDir:f.directory,job,inspect:supported,makeCodex:fakeImageClient(control)}));
  assert.equal(f.store.list('artifacts').length,0);assert.equal(f.store.get('agentMessages',job.payload.replyId).status,mode==='limit'?'paused':'failed');assert.equal(control.closed,true);
 }
});

test('changed or foreign image artifacts are rejected before upload, and cancelled scopes never generate',async t=>{
 const f=await fixture(t),job=await imageJob(f);await runTelegramImage({store:f.store,dataDir:f.directory,job,inspect:supported,makeCodex:fakeImageClient()});f.store.update('jobs',job.id,{status:'completed'});collectTelegramReplies(f.store);
 const delivery=f.store.list('telegramOutbox').find(o=>o.kind==='photo'),artifact=f.store.get('artifacts',delivery.artifactId);await fs.writeFile(artifact.path,'tampered');await assert.rejects(telegramPhoto({store:f.store,dataDir:f.directory,delivery}),e=>e.rejected===true);
 let photos=0;const b=f.bridge(async method=>{if(method==='getUpdates')return[];if(method==='sendPhoto')photos++;return{message_id:1};});await b.tick();assert.equal(photos,0);assert.equal(f.store.get('telegramOutbox',delivery.id).status,'failed');
 const g=await fixture(t),other=await imageJob(g);g.store.update('settings','telegram',{enabled:false});await assert.rejects(runTelegramImage({store:g.store,dataDir:g.directory,job:other,inspect:supported,makeCodex:()=>{throw new Error('Must not connect');}}),e=>e.cancelled===true);
});

test('Telegram photo transport uses only multipart bytes, rejects remote URLs and hides token-bearing failures',async()=>{
 let request;const api=telegramApi('  '+token+'\n',{fetchImpl:async(url,options)=>{request=options;return{ok:true,text:async()=>JSON.stringify({ok:true,result:{message_id:1,photo:[{file_id:'fixture'}]}})};}});
 await api('sendPhoto',{chat_id:42,photo:new Blob(['synthetic'],{type:'image/png'}),reply_parameters:{message_id:4}});assert(request.body instanceof FormData);assert.equal(request.headers,undefined);assert.equal(request.body.get('reply_parameters'),'{"message_id":4}');
 await assert.rejects(api('sendPhoto',{chat_id:42,photo:'https://untrusted.invalid/image.png'}),/validated local/);
 const failing=telegramApi(token,{fetchImpl:async url=>{throw new Error('Failure at '+url);}});await assert.rejects(failing('sendPhoto',{chat_id:42,photo:new Blob(['synthetic'],{type:'image/png'})}),e=>e.uncertain&&!e.message.includes(token));
});

test('delegated final answers are returned only for new phone goals and their exact synthesis reply',async t=>{
 const f=await fixture(t),origin={type:'telegram',generation:'generation_fixture',bindingId:'binding_fixture',chatId:'42',messageId:7,directReplies:true};
 f.store.put('agentChats',{id:'chat_goal',projectId:null});
 f.store.put('jobs',{id:'job_synthesis',type:'agent.team.synthesize',status:'completed',payload:{chatId:'chat_goal',replyId:'reply_goal'}});
 f.store.put('agentMessages',{id:'reply_goal',chatId:'chat_goal',status:'completed',content:'The actual final synthesis.'});
 f.store.put('agentTeams',{id:'team_phone',chatId:'chat_goal',projectId:null,status:'completed',synthesisJobId:'job_synthesis',origin});
 f.store.put('agentTeams',{id:'team_desktop',chatId:'chat_goal',projectId:null,status:'completed',synthesisJobId:'job_synthesis',origin:{type:'dashboard'}});
 f.store.put('agentTeams',{id:'team_legacy',chatId:'chat_goal',projectId:null,status:'completed',synthesisJobId:'job_synthesis',origin:{...origin,directReplies:false}});
 collectTelegramReplies(f.store);collectTelegramReplies(f.store);const answers=f.store.list('telegramOutbox').filter(o=>o.kind==='answer');assert.equal(answers.length,1);assert.equal(answers[0].text,'The actual final synthesis.');assert.equal(answers[0].replyMessageId,7);
});

test('a photo upload interrupted by re-pairing is uncertain and is not replayed',async t=>{
 const f=await fixture(t),job=await imageJob(f);await runTelegramImage({store:f.store,dataDir:f.directory,job,inspect:supported,makeCodex:fakeImageClient()});f.store.update('jobs',job.id,{status:'completed'});collectTelegramReplies(f.store);
 let started,release,uploadSignal,sends=0;const ready=new Promise(r=>started=r);
 const b=f.bridge(async(method,args,signal)=>{if(method==='getUpdates')return[];if(method==='sendMessage')return{message_id:1};sends++;uploadSignal=signal;started();return new Promise(r=>release=r);});
 const pending=b.tick();await ready;f.store.update('settings','telegram',{paired:{...telegramState(f.store).paired,id:'another_binding',chatId:'99'}});
 await new Promise(r=>setTimeout(r,250));assert.equal(uploadSignal.aborted,true);release({message_id:2,photo:[{file_id:'synthetic'}]});await pending;await b.tick();
 assert.equal(sends,1);assert.equal(f.store.list('telegramOutbox').find(o=>o.kind==='photo').status,'uncertain');
});

test('a blocked multipart answer does not starve later help or cancellation acknowledgments',async t=>{
 const f=await fixture(t);queueTelegramAnswer(f.store,telegramState(f.store),'blocked','x'.repeat(25000),{projectId:null});
 let calls=0;const b=f.bridge(async(method)=>{if(method==='getUpdates')return[];calls++;if(calls===1)throw new Error('Synthetic uncertain first part');return{message_id:calls};});await b.tick();
 const help=queueTelegramMessage(f.store,telegramState(f.store),'later-help','Help remains available.','command');await b.tick();assert.equal(f.store.get('telegramOutbox',help.id).status,'delivered');assert.equal(calls,2);
});

test('desktop retry preserves the image operation and original phone binding, and rejects stale bindings',async t=>{
 const {default:express}=await import('express');const {once}=await import('node:events');const {createAgentChatRouter}=await import('../server/agent-chat.js');
 const f=await fixture(t),job=await imageJob(f);f.store.update('jobs',job.id,{status:'paused'});
 const app=express();app.use(express.json());let sequence=0;
 app.use(createAgentChatRouter({store:f.store,getWorkers:()=>[{status:'online'}],enqueue:(type,fields)=>f.store.put('jobs',{id:'job_retry_'+(++sequence),type,...fields,status:'queued',createdAt:now(),cancelRequested:false})}));
 app.use((error,req,res,next)=>res.status(error.status||500).json({error:error.message}));
 const server=app.listen(0,'127.0.0.1');await once(server,'listening');f.cleanups.push(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));
 const retry=()=>fetch(`http://127.0.0.1:${server.address().port}/agent-chats/${job.payload.chatId}/action`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'retry'})});
 const response=await retry();assert.equal(response.status,202);const next=(await response.json()).job;assert.equal(next.type,'agent.image');assert.deepEqual(next.origin,job.origin);assert.equal(next.taskId,job.taskId);
 f.store.update('jobs',next.id,{status:'paused'});f.store.update('settings','telegram',{paired:{...telegramState(f.store).paired,id:'different_binding'}});
 assert.equal((await retry()).status,409);assert.equal(f.store.list('jobs').length,2);
});
