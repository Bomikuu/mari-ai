import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { once } from 'node:events';
import { createStore, id, now } from '../server/store.js';
import { createAgentChatRouter } from '../server/agent-chat.js';
import { resolveAgentProfile } from '../server/agent-profiles.js';
import { createAgentSnapshot } from '../worker/agent-snapshot.js';
import { runAgentTurn } from '../worker/agent-chat.js';
import { startWorker } from '../worker/index.js';

async function fixture(t) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'mari-agent-chat-test-')),source=path.join(directory,'project');await fs.mkdir(source);await fs.writeFile(path.join(source,'index.js'),'export const synthetic = true;');
  const store=createStore(path.join(directory,'data'));
  store.put('projects',{id:'project_a',name:'Synthetic project',path:source});store.put('settings',{id:'app',selectedProjectId:'project_a'});
  store.put('agentProfiles',{id:'profile_a',name:'Synthetic CEO',role:'advisor',description:'Test fixture',instructions:'Answer using real evidence.',portraitId:'elesis',category:'leadership',skillIds:[],enabled:true});
  const state={online:true},app=express();app.use(express.json());
  const enqueue=(type,fields)=>store.put('jobs',{id:id('job'),type,...fields,status:'queued',createdAt:now(),cancelRequested:false});
  app.use('/api',createAgentChatRouter({store,enqueue,getWorkers:()=>state.online?[{status:'online'}]:[],resolveProfile:(s,key,options)=>resolveAgentProfile(s,key,{...options,inventory:{resolve:async()=>[]}})}));
  app.use((err,req,res,next)=>res.status(err.status||500).json({error:err.message,code:err.code}));
  const server=app.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections()});store.close();await fs.rm(directory,{recursive:true,force:true});});
  const request=async(route,body)=>{const r=await fetch(`http://127.0.0.1:${server.address().port}/api${route}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:r.status,value:await r.json()};};
  const chat=async(projectId=null)=>(await request('/agent-profiles/profile_a/chats',{projectId})).value.chat;
  return {store,state,source,directory,request,chat};
}

test('agent chats persist independent personal/project scope and immutable role snapshots without executing',async t=>{
 const f=await fixture(t),personal=await f.chat(),project=await f.chat('project_a');
 assert.equal(personal.projectId,null);assert.equal(project.projectId,'project_a');assert.notEqual(personal.id,project.id);assert.equal(personal.threadId,undefined);
 f.store.update('agentProfiles','profile_a',{instructions:'Changed later.'});
 const saved=(await f.request('/agent-chats/'+personal.id)).value;assert.equal(saved.chat.profile.instructions,'Answer using real evidence.');
 assert.deepEqual((await f.request('/agent-profiles/profile_a/chats')).value.chats.map(x=>x.id),[personal.id]);
 assert.deepEqual((await f.request('/agent-profiles/profile_a/chats?projectId=project_a')).value.chats.map(x=>x.id),[project.id]);
 assert.equal((await f.request('/agent-profiles/profile_a/chats',{projectId:{bad:1}})).status,400);
 assert.equal((await f.request('/agent-profiles/profile_a/chats',{threadId:'foreign'})).status,400);
 assert.equal(f.store.list('jobs').length,0);assert.equal(f.store.list('agents').length,0);
});

test('direct assignments validate before mutation, preserve user/reply order and deduplicate active turns',async t=>{
 const f=await fixture(t),chat=await f.chat('project_a');f.state.online=false;
 assert.equal((await f.request(`/agent-chats/${chat.id}/messages`,{text:'Offline task',mode:'task'})).status,503);assert.equal(f.store.list('agentMessages').length,0);assert.equal(f.store.list('tasks').length,0);
 f.state.online=true;const sent=await f.request(`/agent-chats/${chat.id}/messages`,{text:'Create a synthetic plan.',mode:'task'});assert.equal(sent.status,202);
 const task=f.store.get('tasks',sent.value.job.taskId);assert.equal(task.kind,'agent_task');assert.equal(task.chatId,chat.id);assert.equal(task.projectId,'project_a');
 assert.deepEqual(f.store.list('agentMessages').map(m=>m.role),['user','assistant']);
 assert.equal((await f.request(`/agent-chats/${chat.id}/messages`,{text:'Duplicate'})).status,409);assert.equal(f.store.list('agentMessages').length,2);
 assert.equal((await f.request(`/agent-chats/${chat.id}/messages`,{text:'Invalid scope',projectId:'other'})).status,400);
});

test('cancel and retry stay in the conversation, keep one user message and leave services alone',async t=>{
 const f=await fixture(t),a=await f.chat(),b=await f.chat();f.store.put('services',{id:'unrelated',status:'running',ownership:'external'});const service=f.store.get('services','unrelated');
 const job=(await f.request(`/agent-chats/${a.id}/messages`,{text:'Synthetic assignment',mode:'task'})).value.job;
 assert.equal((await f.request(`/agent-chats/${b.id}/action`,{action:'cancel',jobId:job.id})).status,409);assert.equal(f.store.get('jobs',job.id).cancelRequested,false);
 assert.equal((await f.request(`/agent-chats/${a.id}/action`,{action:'cancel',jobId:job.id})).status,200);assert.equal(f.store.get('agentMessages',job.payload.replyId).status,'cancelled');
 const retry=await f.request(`/agent-chats/${a.id}/action`,{action:'retry',jobId:job.id});assert.equal(retry.status,202);assert.notEqual(retry.value.job.id,job.id);assert.equal(retry.value.job.taskId,job.taskId);assert.equal(f.store.list('agentMessages').filter(m=>m.role==='user').length,1);assert.deepEqual(f.store.get('services','unrelated'),service);
});

test('history pagination and indexed activity never mix conversations; deleted roles retain readable history',async t=>{
 const f=await fixture(t),a=await f.chat(),b=await f.chat();
 for(let i=0;i<65;i++)f.store.put('agentMessages',{id:'message_'+i,chatId:a.id,role:'user',content:'Fixture '+i,createdAt:now()});
 f.store.put('agentMessages',{id:'foreign',chatId:b.id,role:'user',content:'Other context'});
 f.store.event({source:'agent',chatId:a.id,type:'command.output',message:'A output'});f.store.event({source:'agent',chatId:b.id,type:'command.output',message:'B output'});
 f.store.remove('agentProfiles','profile_a');const page=(await f.request('/agent-chats/'+a.id)).value;
 assert.equal(page.messages.length,60);assert.equal(page.hasEarlier,true);assert.deepEqual(page.events.map(e=>e.message),['A output']);
 assert.equal((await f.request(`/agent-chats/${a.id}?before=${page.messages[0].id}`)).value.messages.length,5);
 assert.equal((await f.request(`/agent-chats/${a.id}?before=foreign`)).status,400);
 assert.equal((await f.request(`/agent-chats/${a.id}/messages`,{text:'Removed role'})).status,404);
});

test('project snapshots exclude credentials, hidden/runtime files, symlinks and runnable package scripts',async t=>{
 const f=await fixture(t);await fs.writeFile(path.join(f.source,'.env'),'SECRET=synthetic-secret');await fs.writeFile(path.join(f.source,'token.js'),'private token');await fs.writeFile(path.join(f.source,'package.json'),JSON.stringify({name:'fixture',scripts:{dev:'echo password=synthetic'}}));await fs.symlink(path.join(f.source,'.env'),path.join(f.source,'linked.js'));await fs.mkdir(path.join(f.source,'customers'));await fs.writeFile(path.join(f.source,'customers','records.js'),'private fixture');
 const destination=path.join(f.directory,'snapshot'),snap=await createAgentSnapshot(f.source,destination);assert(snap.files.some(f=>f.path==='index.js'));assert(!snap.files.some(f=>/env|token|linked|customer/.test(f.path)));assert(!await fs.readFile(path.join(destination,'package.json'),'utf8').then(s=>s.includes('password')));assert.equal(await fs.readFile(path.join(f.source,'.env'),'utf8'),'SECRET=synthetic-secret');
});

const supported=async()=>({available:true,authenticated:true,supported:true});
async function queued(f,project=null,mode='task') {const c=await f.chat(project),j=(await f.request(`/agent-chats/${c.id}/messages`,{text:'Synthetic native result fixture',mode})).value.job;f.store.put('agents',{id:'executor',status:'working'});f.store.update('jobs',j.id,{agentId:'executor',status:'running'});return {...j,agentId:'executor'};}

test('native agent work resumes its server-owned thread, captures actual output/files and preserves source',async t=>{
 const f=await fixture(t),job=await queued(f,'project_a');let options,turn;
 const makeCodex=o=>(options=o,{connect:async()=>{},close:async()=>{},runTurn:async value=>{turn=value;assert.equal(f.store.get('tasks',job.taskId).status,'running');value.onThread('native_fixture_thread');assert.equal(f.store.get('agentChats',job.payload.chatId).threadId,'native_fixture_thread');await fs.writeFile(path.join(value.cwd,'brief.md'),'Synthetic generated brief');return {status:'completed',threadId:'native_fixture_thread',messages:['Synthetic completed answer.'],changedFiles:[path.join(value.cwd,'brief.md')]};}});
 await runAgentTurn({store:f.store,dataDir:f.store.dataDir,job,signal:new AbortController().signal,makeCodex,inspect:supported});
 assert.equal(options.executionPolicy.webSearch,true);assert(!options.executionPolicy.readRoots.includes(f.source));assert.equal(turn.threadId,undefined);assert.equal(f.store.get('agentMessages',job.payload.replyId).status,'completed');assert.equal(f.store.get('tasks',job.taskId).status,'completed');assert.equal(f.store.list('artifacts').length,2);assert(f.store.list('artifacts').some(a=>a.title==='brief.md'));assert.equal(await fs.readFile(path.join(f.source,'index.js'),'utf8'),'export const synthetic = true;');
 f.store.update('jobs',job.id,{status:'completed'});const next=(await f.request(`/agent-chats/${job.payload.chatId}/messages`,{text:'Continue',mode:'chat'})).value.job;f.store.update('jobs',next.id,{status:'running'});
 await runAgentTurn({store:f.store,dataDir:f.store.dataDir,job:{...next,agentId:'executor'},signal:new AbortController().signal,inspect:supported,makeCodex:o=>({connect:async()=>{},close:async()=>{},runTurn:async value=>{assert.equal(value.threadId,'native_fixture_thread');return {status:'completed',threadId:value.threadId,messages:['Continued fixture answer.'],changedFiles:[]};}})});
 assert.equal(f.store.get('agentMessages',next.payload.replyId).content,'Continued fixture answer.');
});

test('late durable cancellation and empty native results never publish completed messages or artifacts',async t=>{
 for(const cancel of [true,false]){
  const f=await fixture(t),job=await queued(f);const client={connect:async()=>{},close:async()=>{if(cancel)f.store.update('jobs',job.id,{cancelRequested:true});},runTurn:async()=>({status:'completed',threadId:'native_test',messages:cancel?['Should be discarded']:[],changedFiles:[]})};
  await assert.rejects(runAgentTurn({store:f.store,dataDir:f.store.dataDir,job,signal:new AbortController().signal,inspect:supported,makeCodex:()=>client}));
  assert.equal(f.store.list('artifacts').length,0);assert.equal(f.store.get('agentMessages',job.payload.replyId).status,cancel?'cancelled':'failed');
 }
});

test('worker restart marks pending chat replies interrupted without automatic replay',async t=>{
 const f=await fixture(t),job=await queued(f);const worker=await startWorker({store:f.store,dataDir:f.store.dataDir,jobTypes:[],pollMs:10000});
 try{assert.equal(f.store.get('jobs',job.id).status,'interrupted');assert.equal(f.store.get('agentMessages',job.payload.replyId).status,'interrupted');}finally{await worker.stop({stopServices:false});}
});

test('pre-native failure appears in only its conversation activity and errors',async t=>{
 const f=await fixture(t),chat=await f.chat(),other=await f.chat();
 const job=(await f.request(`/agent-chats/${chat.id}/messages`,{text:'Synthetic unsupported native client',mode:'task'})).value.job;
 const worker=await startWorker({store:f.store,dataDir:f.store.dataDir,jobTypes:['agent.turn'],makeWorkflow:options=>({run:(job,signal)=>runAgentTurn({...options,job,signal,inspect:async()=>({available:false,authenticated:false,supported:false}),makeCodex:()=>{throw new Error('Must not connect');}})})});
 try{
  const deadline=Date.now()+2000;while(f.store.get('jobs',job.id).status==='running'&&Date.now()<deadline)await new Promise(setImmediate);
  assert.equal(f.store.get('jobs',job.id).status,'failed');assert.equal(f.store.get('agentMessages',job.payload.replyId).status,'failed');
  const failed=(await f.request(`/agent-chats/${chat.id}`)).value.events.filter(e=>e.level==='error');assert(failed.some(e=>e.type==='task.failed'&&e.chatId===chat.id));
  assert.equal((await f.request(`/agent-chats/${other.id}`)).value.events.length,0);
 }finally{await worker.stop({stopServices:false});}
});
