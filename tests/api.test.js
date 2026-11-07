import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import sharp from 'sharp';
import { createApp } from '../server/index.js';
import { createStore,now } from '../server/store.js';

async function fixture(t){
 const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'mari-api-')),dataDir=path.join(sandbox,'.mari'),store=createStore(dataDir),accessKey='owner-test-key-123456789';
 const projectDir=await fs.mkdtemp(path.join(os.tmpdir(),'mari-project-'));store.fixtureProjectPath=projectDir;
 const app=createApp({store,dataDir,accessKey}),server=app.listen(0,'127.0.0.1');await new Promise((r)=>server.once('listening',r));const base=`http://127.0.0.1:${server.address().port}`;
 t.after(async()=>{await new Promise((r)=>{server.close(r);server.closeAllConnections();});store.close();await fs.rm(sandbox,{recursive:true,force:true});await fs.rm(projectDir,{recursive:true,force:true});});
 let cookie,csrf;
 const request=async(url,{method='GET',body,headers={},auth=true}={})=>{
  const response=await fetch(base+url,{method,headers:{...(auth&&cookie?{Cookie:cookie,'x-mari-csrf':csrf}:{}),...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:body instanceof FormData?body:JSON.stringify(body)}:{})});
  const text=await response.text();let json;try{json=JSON.parse(text);}catch{json=text;}return {response,status:response.status,json};
 };
 const pair=async()=>{const paired=await request('/api/session',{method:'POST',body:{accessKey},auth:false});assert.equal(paired.status,200);cookie=paired.response.headers.get('set-cookie').split(';')[0];csrf=paired.json.csrfToken;};
 return {dataDir,store,base,request,pair,get cookie(){return cookie;},get csrf(){return csrf;}};
}
function seedTask(store){store.put('projects',{id:'project_fixture',name:'Test fixture',path:store.fixtureProjectPath,git:{available:false},createdAt:now()});return store.put('tasks',{id:'task_fixture',projectId:'project_fixture',instruction:'Fixture only',name:'Fixture',status:'awaiting_input',phase:'design',routes:['/'],viewports:['desktop'],mode:'handoff',artifactIds:[],verificationPasses:0,createdAt:now()});}
async function upload(f,pixels={r:0,g:120,b:140,alpha:1}){const buffer=await sharp({create:{width:8,height:8,channels:4,background:pixels}}).png().toBuffer();if(!f.store.get('artifacts','original_fixture')){const directory=path.join(f.dataDir,'artifacts','task_fixture');await fs.mkdir(directory,{recursive:true});const file=path.join(directory,'original.png');await fs.writeFile(file,buffer);f.store.put('artifacts',{id:'original_fixture',taskId:'task_fixture',projectId:'project_fixture',kind:'original',page:'/',viewport:'desktop',path:file,mime:'image/png'});}const body=new FormData();body.append('image',new Blob([buffer],{type:'image/png'}),'proposal.png');body.append('page','/');body.append('viewport','desktop');return f.request('/api/tasks/task_fixture/proposals',{method:'POST',body});}

test('owner pairing is required, one use, host/origin and CSRF protected',async(t)=>{
 const f=await fixture(t);
 assert.equal((await f.request('/api/bootstrap',{auth:false})).status,401);
 assert.equal((await f.request('/api/session',{method:'POST',body:{accessKey:'worker-key'},auth:false})).status,401);
 await f.pair();
 assert.equal((await f.request('/api/bootstrap')).status,200);
 assert.equal((await f.request('/api/session',{method:'POST',body:{accessKey:'owner-test-key-123456789'}})).status,401);
 assert.equal((await f.request('/api/projects',{method:'POST',body:{path:os.tmpdir()},headers:{'x-mari-csrf':'wrong'}})).status,403);
 assert.equal((await f.request('/api/projects',{method:'POST',body:{path:os.tmpdir()},headers:{Origin:'https://evil.example'}})).status,403);
 const foreignHostStatus=await new Promise((resolve,reject)=>{const request=http.get(new URL('/api/bootstrap',f.base),{headers:{Host:'evil.example'}},(response)=>{response.resume();response.once('end',()=>resolve(response.statusCode));});request.once('error',reject);});
 assert.equal(foreignHostStatus,403);
});
test('immutable revisions require exact human approval and detect changed image bytes',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);
 const first=await upload(f);assert.equal(first.status,201);assert.equal(first.json.artifact.revision,1);assert.equal(first.json.artifact.path,undefined);
 const one=first.json.artifact.id;
 const content=await f.request(`/api/artifacts/${one}/content`);assert.equal(content.status,200);assert.match(content.response.headers.get('content-type'),/^image\/png/);
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'implement',artifactId:one}})).json.code,'APPROVAL_REQUIRED');
 const approved=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'approve',artifactId:one,actor:'agent'}});assert.equal(approved.status,200);assert.equal(approved.json.approval.actor,'user');
 const second=await upload(f,{r:120,g:0,b:80,alpha:1});assert.equal(second.status,201);assert.equal(second.json.artifact.revision,2);assert.equal(second.json.task.approvedArtifactId,null);
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'approve',artifactId:one}})).json.code,'STALE_REVISION');
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'implement',artifactId:one}})).status,409);
 const two=second.json.artifact.id;assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'approve',artifactId:two}})).status,200);
 await fs.appendFile(f.store.get('artifacts',two).path,Buffer.from('changed'));
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'implement',artifactId:two}})).json.code,'STALE_APPROVAL');
 assert.equal(f.store.list('jobs').length,0);
});
test('malformed imports and symlinked artifact content are rejected',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);
 const body=new FormData();body.append('image',new Blob(['not an image'],{type:'image/png'}),'bad.png');body.append('page','/');body.append('viewport','desktop');assert.equal((await f.request('/api/tasks/task_fixture/proposals',{method:'POST',body})).json.code,'INVALID_IMAGE');
 const outside=path.join(f.dataDir,'private.txt'),owned=path.join(f.dataDir,'artifacts','fixture');await fs.mkdir(owned,{recursive:true});await fs.writeFile(outside,'private');const link=path.join(owned,'link.png');await fs.symlink(outside,link);f.store.put('artifacts',{id:'artifact_link',path:link,mime:'image/png'});
 assert.equal((await f.request('/api/artifacts/artifact_link/content')).status,403);
});
test('project discovery is scoped and ignores symlinked directories',async(t)=>{
 const f=await fixture(t);await f.pair();const root=path.join(f.dataDir,'scan'),outside=path.join(f.dataDir,'outside');await fs.mkdir(path.join(root,'child'),{recursive:true});await fs.mkdir(outside);await fs.writeFile(path.join(root,'child','package.json'),'{}');await fs.writeFile(path.join(outside,'package.json'),'{}');await fs.symlink(outside,path.join(root,'escaped'));
 const result=await f.request('/api/projects/discover',{method:'POST',body:{path:root}});assert.equal(result.status,200);assert.deepEqual(result.json.candidates.map((p)=>p.path),[path.join(root,'child')]);
});
test('startup needs current command confirmation and never takes over an occupied port',async(t)=>{
 const f=await fixture(t);await f.pair();const project=await f.request('/api/projects',{method:'POST',body:{path:f.dataDir,name:'Test'}});assert.equal(project.status,201);
 const sockets=new Set(),occupant=net.createServer((socket)=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));socket.on('error',()=>{});socket.end();});await new Promise((r)=>occupant.listen(0,'127.0.0.1',r));t.after(()=>new Promise((resolve)=>{occupant.close(resolve);for(const socket of sockets)socket.destroy();}));
 const config=await f.request(`/api/projects/${project.json.id}/services`,{method:'POST',body:{command:'node harmless.js',cwd:f.dataDir,url:`http://127.0.0.1:${occupant.address().port}`}});assert.equal(config.status,201);
 const url=`/api/services/${config.json.id}/start`;
 assert.equal((await f.request(url,{method:'POST',body:{confirmedVersion:0}})).json.code,'COMMAND_REVIEW_REQUIRED');
 assert.equal((await f.request(url,{method:'POST',body:{confirmedVersion:1}})).json.code,'PORT_OCCUPIED');
 const service=f.store.get('services',config.json.id);assert.equal(service.ownership,'external');assert.equal(service.status,'unknown');assert.equal(f.store.list('jobs').length,0);
 assert.equal((await f.request(`/api/services/${config.json.id}/stop`,{method:'POST',body:{}})).json.code,'NOT_MANAGED');
});
test('worker freshness stays separate from stale agent execution and service health',async(t)=>{
 const f=await fixture(t);await f.pair();f.store.put('workers',{id:'worker_old',lastHeartbeatAt:new Date(Date.now()-30000).toISOString()});f.store.put('agents',{id:'agent_old',workerId:'worker_old',status:'working'});f.store.put('services',{id:'service_old',status:'running',ownership:'managed',pid:123});
 const result=(await f.request('/api/bootstrap')).json;assert.equal(result.workers[0].status,'offline');assert.equal(result.agents[0].connectivity,'offline');assert.equal(result.agents[0].status,'working');assert.equal(result.agents[0].stale,true);assert.equal(result.services[0].status,'unknown');
});
test('a reviewed exact image queues implementation; cancelling it leaves project services untouched',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);
 const imported=await upload(f),artifactId=imported.json.artifact.id;
 await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'approve',artifactId}});
 const implementation=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'implement',artifactId,feedback:'Preserve form validation.'}});
 assert.equal(implementation.status,202);assert.equal(implementation.json.job.type,'implement');assert.deepEqual(implementation.json.job.payload,{artifactId,notes:'Preserve form validation.'});
 f.store.put('services',{id:'service_independent',projectId:'project_fixture',status:'running',ownership:'managed',pid:999});
 const cancelled=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'cancel'}});assert.equal(cancelled.status,200);assert.equal(f.store.get('jobs',implementation.json.job.id).status,'cancelled');assert.equal(f.store.get('services','service_independent').status,'running');assert.equal(f.store.get('services','service_independent').pid,999);
});
test('partial capture retry retains completed item identities rather than replaying the whole workflow',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);await upload(f);
 f.store.update('tasks','task_fixture',{status:'awaiting_input',phase:'capture',captures:[{page:'/',viewport:'desktop',status:'completed'},{page:'/missing',viewport:'desktop',status:'failed'}]});
 f.store.put('jobs',{id:'job_prior_capture',taskId:'task_fixture',projectId:'project_fixture',type:'capture',status:'completed',createdAt:now(),payload:{routes:['/','/missing'],viewports:['desktop'],baseUrl:'http://127.0.0.1:4173',afterCapture:'capture'}});
 const result=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'retry'}});assert.equal(result.status,202);assert.equal(result.json.job.type,'capture');assert.deepEqual(result.json.job.payload.completedItems,[{page:'/',viewport:'desktop'}]);
});

test('implementation cannot grant a writable root containing the approval database',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);const imported=await upload(f),artifactId=imported.json.artifact.id;
 await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'approve',artifactId}});f.store.update('projects','project_fixture',{path:f.dataDir});
 const result=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'implement',artifactId}});assert.equal(result.json.code,'RUNTIME_IN_PROJECT');assert.equal(f.store.list('jobs').length,0);
});
test('live log windows show newest events and download keeps the full redacted history',async(t)=>{
 const f=await fixture(t);await f.pair();for(let i=0;i<510;i++)f.store.event({source:'service',type:'fixture.output',message:`Fixture line ${i}`});
 const bootstrap=(await f.request('/api/bootstrap')).json;assert.equal(bootstrap.events.length,500);assert.equal(bootstrap.events.at(-1).message,'Fixture line 509');
 const logs=(await f.request('/api/logs?source=service&limit=2')).json;assert.deepEqual(logs.events.map((event)=>event.message),['Fixture line 508','Fixture line 509']);
 const download=await f.request('/api/logs?source=service&download=1');assert.equal(download.status,200);assert.equal(download.json.trim().split('\n').length,510);assert.equal(JSON.parse(download.json.trim().split('\n')[0]).message,'Fixture line 0');
});
test('acceptance is tied to the current approved implementation and successful verification',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);const first=await upload(f),artifactId=first.json.artifact.id;
 await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'approve',artifactId}});
 f.store.put('artifacts',{id:'implemented_fixture',projectId:'project_fixture',taskId:'task_fixture',kind:'implemented',page:'/',viewport:'desktop'});
 const finishedAt=new Date(Date.now()-1000).toISOString();f.store.update('tasks','task_fixture',{implementationArtifactId:artifactId,implementationFinishedAt:finishedAt,verificationPasses:1,error:null,verification:[{approvedArtifactId:artifactId,capturedAt:now(),outcome:'capture_failed',captures:[{status:'failed'}]}]});
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'accept'}})).json.code,'VERIFICATION_REQUIRED');
 f.store.update('tasks','task_fixture',{verification:[{approvedArtifactId:artifactId,capturedAt:now(),outcome:'awaiting_visual_review',captures:[{status:'completed',artifactId:'implemented_fixture'}]}]});
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'accept'}})).status,200);
 await upload(f,{r:100,g:100,b:100,alpha:1});
 assert.equal((await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'accept'}})).json.code,'APPROVAL_REQUIRED');
});

test('gracefully stopped workers and finished agents never appear connected from fresh timestamps',async(t)=>{
 const f=await fixture(t);await f.pair();f.store.put('workers',{id:'worker_stopped',status:'offline',lastHeartbeatAt:now()});f.store.put('workers',{id:'worker_live',status:'online',lastHeartbeatAt:now()});f.store.put('agents',{id:'agent_done',workerId:'worker_live',status:'completed',finishedAt:now()});
 const result=(await f.request('/api/bootstrap')).json;assert.equal(result.workers.find((worker)=>worker.id==='worker_stopped').status,'offline');assert.equal(result.agents[0].status,'completed');assert.equal(result.agents[0].connectivity,'offline');assert.equal(result.agents[0].historical,true);assert.equal(result.agents[0].live,false);
});
test('selected website target does not switch to a running backend when the main frontend is stopped',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);
 f.store.put('services',{id:'frontend_target',projectId:'project_fixture',required:true,status:'stopped',url:'http://127.0.0.1:4173'});
 f.store.put('services',{id:'backend_target',projectId:'project_fixture',required:false,status:'running',url:'http://127.0.0.1:4174'});
 const result=await f.request('/api/tasks',{method:'POST',body:{projectId:'project_fixture',instruction:'Inspect my current context'}});assert.equal(result.status,201);assert.equal(result.json.task.baseUrl,'http://127.0.0.1:4173');assert.equal(result.json.task.status,'awaiting_input');
});


test('profile validation precedes task mutation and queued jobs keep immutable role instructions',async(t)=>{
 const f=await fixture(t);await f.pair();seedTask(f.store);await upload(f);
 f.store.put('agentProfiles',{id:'profile_test',name:'Fixture role',role:'reviewer',description:'',instructions:'Check actual evidence.',skillIds:[],enabled:false});
 const before=f.store.get('tasks','task_fixture');
 const blocked=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'generate',mode:'handoff',agentProfileId:'profile_test'}});
 assert.equal(blocked.status,409);assert.equal(blocked.json.code,'PROFILE_DISABLED');assert.deepEqual(f.store.get('tasks','task_fixture'),before);assert.equal(f.store.list('jobs').length,0);
 f.store.update('agentProfiles','profile_test',{enabled:true});
 const queued=await f.request('/api/tasks/task_fixture/action',{method:'POST',body:{action:'generate',mode:'handoff',agentProfileId:'profile_test'}});
 assert.equal(queued.status,202);assert.equal(queued.json.task.agentProfileId,'profile_test');assert.equal(queued.json.job.payload.agentProfile.instructions,'Check actual evidence.');
 f.store.update('agentProfiles','profile_test',{instructions:'Changed later.'});
 assert.equal(f.store.get('jobs',queued.json.job.id).payload.agentProfile.instructions,'Check actual evidence.');
 assert.equal(f.store.list('agents').length,0);
});


test('bootstrap expires stale external website health independently of online worker connectivity',async(t)=>{
 const f=await fixture(t);await f.pair();f.store.put('workers',{id:'fresh_worker',status:'online',lastHeartbeatAt:now()});
 f.store.put('services',{id:'external_stale',status:'running',ownership:'external',url:'http://127.0.0.1:12345',lastProbeAt:new Date(Date.now()-31000).toISOString()});
 const state=(await f.request('/api/bootstrap')).json;assert.equal(state.workers[0].status,'online');assert.equal(state.services[0].status,'unknown');assert.match(state.services[0].healthReason,/stale/);
});

test('agent chat routes keep owner authentication and direct assignments cannot enter website implementation',async(t)=>{
 const f=await fixture(t);
 assert.equal((await f.request('/api/agent-profiles/profile_chat/chats')).status,401);
 assert.equal((await f.request('/api/knowledge')).status,401);
 assert.equal((await f.request('/api/telegram')).status,401);
 assert.equal((await f.request('/api/agent-teams/foreign/action',{method:'POST',body:{action:'cancel'},auth:false})).status,401);
 await f.pair();f.store.put('settings',{id:'drive-state',connection:'connected',results:[],nextCursor:'opaque-provider-cursor'});
 assert.equal((await f.request('/api/knowledge')).json.drive.nextCursor,'opaque-provider-cursor');
 f.store.put('agentProfiles',{id:'profile_chat',name:'Fixture advisor',role:'advisor',instructions:'Use real evidence.',skillIds:[],enabled:true});
 const created=await f.request('/api/agent-profiles/profile_chat/chats',{method:'POST',body:{projectId:null}});assert.equal(created.status,201);assert.equal(created.json.chat.projectId,null);
 const forbidden=await f.request(`/api/agent-chats/${created.json.chat.id}/messages`,{method:'POST',body:{text:'Test'},auth:false});assert.equal(forbidden.status,401);
 f.store.put('tasks',{id:'direct_task',kind:'agent_task',chatId:created.json.chat.id,status:'completed'});
 const before=f.store.get('tasks','direct_task');
 const editing=await f.request('/api/tasks/direct_task/action',{method:'POST',body:{action:'implement'}});assert.equal(editing.status,409);assert.equal(editing.json.code,'AGENT_TASK_CONTROLS');assert.deepEqual(f.store.get('tasks','direct_task'),before);
});
