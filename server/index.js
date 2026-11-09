import express from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';
import { createStore,id,now } from './store.js';
import { createRedactor,secretEnvironmentValues,validateHttpUrl } from './security.js';
import { DEFAULT_DESIGN_PROMPT,VIEWPORTS } from '../shared/constants.js';
import { isFreshServiceObservation } from '../shared/health.js';
import { detectProject,detectProjectStructure,registerProject,serviceConfig,probeExternalServices } from './projects.js';
import { createFolderPicker } from './folder-picker.js';
import { listDirectories,discoverProjects,getProjectScans } from './discovery.js';
import { migrateAgentNames, createResourcesRouter,resolveAgentProfile } from './agent-profiles.js';
import { controlTeamRun } from './agent-teams.js';
import { createTelegramRouter } from './telegram.js';
import { createKnowledgeRouter } from './knowledge.js';
import { createAgentChatRouter } from './agent-chat.js';
import { createPixelpopRouter } from './pixelpop.js';
import { createGoogleRouter } from './google.js';
import { createGithubRouter } from './github.js';
import { createVoiceRouter } from './voice.js';
import { createBragRouter } from './brag.js';
import { createNewspaperRouter } from './newspaper.js';
import { createMarketsRouter } from './markets.js';
import { createMarketData } from './market-data.js';
import { createXNewsRouter } from './x-news.js';
import { createPersonalAnalysisRouter } from './personal-analysis.js';
import { inventoryRoutes,normalizeRoute } from './routes.js';
import { MAX_IMAGE_BYTES,publicArtifact,ownedArtifactPath,artifactHash,importProposal,latestProposal } from './artifacts.js';
const repoRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ACTIVE=new Set(['queued','running']);
const taskStages=['capture','design','approval','implement','verify'];
const err=(message,status=400,code='INVALID_REQUEST',details)=>Object.assign(new Error(message),{status,code,details});
const requireRecord=(store,collection,recordId)=>{const record=store.get(collection,recordId);if(!record)throw err(`${collection.replace(/s$/,'')} was not found.`,404,'NOT_FOUND');return record;};
const isBusy=(store,filter)=>store.list('jobs').some((job)=>ACTIVE.has(job.status)&&filter(job));
const timestamp=(value)=>new Date(value||0).getTime();
function checkedUrl(value){try{return validateHttpUrl(value);}catch(error){throw err(error.message,400,'INVALID_URL');}}
function cookieValue(req,name){return (req.headers.cookie||'').split(';').map((s)=>s.trim()).find((s)=>s.startsWith(name+'='))?.slice(name.length+1);}
function constantEqual(a,b){const aa=Buffer.from(String(a||'')),bb=Buffer.from(String(b||''));return aa.length===bb.length&&crypto.timingSafeEqual(aa,bb);}
function portOccupied(host,port){return new Promise((resolve)=>{const socket=net.createConnection({host,port});socket.once('connect',()=>{socket.destroy();resolve(true);});socket.once('error',()=>{socket.destroy();resolve(false);});socket.setTimeout(900,()=>{socket.destroy();resolve(false);});});}
function workerViews(store){return store.list('workers').map((worker)=>{const age=Date.now()-timestamp(worker.lastHeartbeatAt);return {...worker,status:worker.status==='offline'?'offline':age<8000?'online':age<20000?'reconnecting':'offline'};});}
function capabilitiesFor(workers){const active=workers.find((w)=>w.status==='online');const actual=active?.capabilities||{};return {...actual,worker:active?'online':'offline',codex:actual.codex||{available:false,authenticated:false,version:null},imageGeneration:actual.imageGeneration||'unverified',manualHandoff:true};}
function publicService(service,workers){
 const online=workers.some((w)=>w.status==='online');
 if(service.ownership==='managed'&&!online&&['running','starting','stopping'].includes(service.status))return {...service,status:'unknown',healthReason:'Worker is disconnected; process health has not been confirmed.'};
 if(service.status==='running'&&!isFreshServiceObservation(service))return {...service,status:'unknown',healthReason:'The last service observation is stale. Refresh this project to confirm its current health.'};
 return service;
}
function selectBaseUrl(store,projectId){const services=store.list('services').filter((s)=>s.projectId===projectId&&s.url);return services.find((s)=>s.required)?.url||services.find((s)=>s.status==='running')?.url||services[0]?.url;}
function enqueue(store,type,fields={}){
 const job={id:id('job'),type,...fields,payload:fields.payload||{},status:'queued',cancelRequested:false,workerId:null,createdAt:now()};store.put('jobs',job);
 store.event({source:'system',projectId:job.projectId,taskId:job.taskId,serviceId:job.serviceId,type:'job.queued',level:'info',message:`Queued ${type}.`,data:{jobId:job.id}});return job;
}
async function reachable(url){try{const response=await fetch(url,{signal:AbortSignal.timeout(2500),redirect:'manual'});await response.body?.cancel();return response.status>=200&&response.status<400;}catch{return false;}}
function safeRoutes(values,baseUrl){const routes=Array.isArray(values)&&values.length?values:['/'];if(routes.length>20)throw err('Choose at most 20 routes.');const normalized=routes.map((r)=>normalizeRoute(r,baseUrl));if(normalized.some((r)=>!r))throw err('All routes must be bounded paths on the configured website origin.');return [...new Set(normalized)];}
function safeViewports(values){const result=Array.isArray(values)&&values.length?[...new Set(values)]:['desktop'];if(result.length>2||result.some((v)=>!Object.hasOwn(VIEWPORTS,v)))throw err('Choose desktop and/or mobile viewport.');return result;}
function unfinishedVerification(task){const last=Array.isArray(task.verification)?task.verification.at(-1):null;return last&&last.approvedArtifactId===task.approvedArtifactId&&['capturing','capture_failed','comparison_pending'].includes(last.outcome);}
async function approveArtifact(store,dataDir,task,artifactId,decision,notes){
 const artifact=requireRecord(store,'artifacts',artifactId);
 if(artifact.taskId!==task.id||artifact.projectId!==task.projectId||artifact.kind!=='proposal')throw err('Approval must refer to a proposal belonging to this task.',409,'INVALID_APPROVAL');
 if(latestProposal(store,artifact)?.id!==artifact.id)throw err('A newer image revision exists. Review the current revision.',409,'STALE_REVISION');
 const hash=await artifactHash(dataDir,artifact);if(hash!==artifact.sha256)throw err('The image changed on disk. Import it as a new revision.',409,'ARTIFACT_CHANGED');
 const approval={id:id('approval'),taskId:task.id,artifactId:artifact.id,sha256:hash,page:artifact.page,viewport:artifact.viewport,revision:artifact.revision,decision,notes:String(notes||'').slice(0,10000),actor:'user',createdAt:now()};
 store.put('approvals',approval);store.update('tasks',task.id,{approvedArtifactId:decision==='approved'?artifact.id:null,activeArtifactId:artifact.id,status:'awaiting_input',phase:'approval',steps:(task.steps||[]).map((step)=>step.id==='approval'?{...step,status:decision==='approved'?'completed':'failed',detail:decision==='approved'?'Approved. Select Implement to start editing.':'Image rejected by user.'}:step),lastActivityAt:now()});
 store.event({source:'system',projectId:task.projectId,taskId:task.id,type:`proposal.${decision}`,level:'info',message:`User ${decision} design revision ${artifact.revision}.`,data:{artifactId:artifact.id,approvalId:approval.id}});return approval;
}
async function ensureApproved(store,dataDir,task,artifactId){
 const target=artifactId||task.approvedArtifactId;if(!target||target!==task.approvedArtifactId)throw err('Approve this exact design image before implementation.',409,'APPROVAL_REQUIRED');
 const artifact=requireRecord(store,'artifacts',target);
 if(artifact.taskId!==task.id||artifact.projectId!==task.projectId||artifact.kind!=='proposal'||latestProposal(store,artifact)?.id!==artifact.id)throw err('Approval does not match the current page revision.',409,'STALE_APPROVAL');
 const approvals=store.list('approvals').filter((a)=>a.taskId===task.id&&a.artifactId===artifact.id).reverse().sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt));
 const approval=approvals[0],hash=await artifactHash(dataDir,artifact);
 if(!approval||approval.actor!=='user'||approval.decision!=='approved'||approval.sha256!==hash||artifact.sha256!==hash||approval.revision!==artifact.revision||approval.page!==artifact.page||approval.viewport!==artifact.viewport)throw err('The approved image no longer matches this proposal.',409,'STALE_APPROVAL');
 return artifact;
}
async function assertImplementationBoundary(store,dataDir,task){
 const project=requireRecord(store,'projects',task.projectId);
 const [root,runtime]=await Promise.all([fs.realpath(project.path),fs.realpath(dataDir)]);
 const relative=path.relative(root,runtime);
 if(relative===''||relative!=='..'&&!relative.startsWith(`..${path.sep}`)&&!path.isAbsolute(relative))throw err('Mari runtime data is inside this target project. Move MARI_DATA_DIR outside the project and restart Mari before implementation, then retry.',409,'RUNTIME_IN_PROJECT');
}
export function createApp({store,dataDir,accessKey,telegramOptions={},folderPicker=createFolderPicker(),marketOptions={},xOptions={},analysisOptions={}}={}) {
 dataDir=path.resolve(dataDir||store?.dataDir||process.env.MARI_DATA_DIR||path.join(repoRoot,'.mari'));
 store ||= createStore(dataDir);
 migrateAgentNames(store);
 accessKey ||= (process.env.NODE_ENV==='test'?process.env.MARI_ACCESS_KEY:undefined)||crypto.randomBytes(32).toString('hex');
 const app=express(),sessions=new Map(),redactor=createRedactor(secretEnvironmentValues());
 app.disable('x-powered-by');app.locals.store=store;app.locals.accessKey=accessKey;app.locals.dataDir=dataDir;
 let paired=false;
 app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Cache-Control','no-store');
  let host;try{host=new URL(`http://${req.headers.host||''}`);}catch{return res.status(403).json({error:'Invalid local host.',code:'HOST_REJECTED'});}
  if(!['127.0.0.1','localhost','[::1]'].includes(host.hostname))return res.status(403).json({error:'Only loopback hosts are allowed.',code:'HOST_REJECTED'});
  const origin=req.headers.origin;
  if(origin){let parsed;try{parsed=new URL(origin);}catch{return res.status(403).json({error:'Invalid origin.',code:'ORIGIN_REJECTED'});}
   const allowed=new Set([`http://${req.headers.host}`,`http://127.0.0.1:5173`,`http://localhost:5173`,process.env.MARI_UI_ORIGIN].filter(Boolean));
   if(!allowed.has(parsed.origin)||!['127.0.0.1','localhost','[::1]'].includes(parsed.hostname))return res.status(403).json({error:'Foreign origins are not allowed.',code:'ORIGIN_REJECTED'});
  }
  if(req.headers['sec-fetch-site']==='cross-site')return res.status(403).json({error:'Cross-site requests are not allowed.',code:'ORIGIN_REJECTED'});
  const json=res.json.bind(res);res.json=(value)=>json(redactor.redact(value));next();
 });
 app.use(express.json({limit:'1mb'}));
 app.post('/api/session',(req,res)=>{
  if(paired||!constantEqual(req.body?.accessKey,accessKey))throw err('Pairing key is invalid or has already been used. Open Mari from the URL printed in your terminal.',401,'PAIRING_REQUIRED');
  const token=crypto.randomBytes(32).toString('hex'),csrfToken=crypto.randomBytes(24).toString('hex');sessions.set(token,{csrfToken,createdAt:Date.now()});paired=true;
  res.setHeader('Set-Cookie',`mari_owner=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000`);res.json({paired:true,csrfToken});
 });
 app.use('/api',(req,res,next)=>{
  const session=sessions.get(cookieValue(req,'mari_owner'));
  if(!session)return res.status(401).json({error:'Pair this browser with the URL in the Mari terminal.',code:'PAIRING_REQUIRED'});
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!constantEqual(req.headers['x-mari-csrf'],session.csrfToken))return res.status(403).json({error:'The owner CSRF token is required.',code:'CSRF_REQUIRED'});
  req.owner=session;next();
 });
 app.use('/api',createResourcesRouter({store}));
 app.use('/api/telegram',createTelegramRouter({store,dataDir,...telegramOptions}));
 app.use('/api/knowledge',createKnowledgeRouter({store,dataDir,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 app.use('/api',createAgentChatRouter({store,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 app.use('/api/personal/pixelpop',createPixelpopRouter({store,dataDir}));
 app.use('/api/personal/google',createGoogleRouter({store,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 app.use('/api/projects/:projectId/github',createGithubRouter({store,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 app.use('/api/voice',createVoiceRouter({store,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 app.use('/api/personal/newspaper',createNewspaperRouter({store,dataDir,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 app.use('/api/personal/markets',createMarketsRouter({store,marketData:createMarketData({store,...marketOptions})}));
 app.use('/api/personal/x',createXNewsRouter({store,dataDir,...xOptions}));
 app.use('/api/personal/analysis',createPersonalAnalysisRouter({store,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store),...analysisOptions}));
 app.use('/api/projects/:projectId/brag',createBragRouter({store,dataDir,enqueue:(type,fields)=>enqueue(store,type,fields),getWorkers:()=>workerViews(store)}));
 const mutationLocks=new Set();
 for(const collection of ['tasks','services'])app.use(`/api/${collection}/:id`,(req,res,next)=>{
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  const key=`${collection}:${req.params.id}`;
  if(mutationLocks.has(key))return res.status(409).json({error:'Another action for this item is still being saved.',code:'ACTION_BUSY'});
  mutationLocks.add(key);const release=()=>mutationLocks.delete(key);res.once('finish',release);res.once('close',release);next();
 });
 app.get('/api/bootstrap',(req,res)=>{
  const workers=workerViews(store),connected=new Set(workers.filter((w)=>w.status==='online').map((w)=>w.id));
  const agents=store.list('agents').map((agent)=>{const live=connected.has(agent.workerId)&&!agent.finishedAt;return {...agent,connectivity:live?'online':'offline',live,historical:Boolean(agent.finishedAt),stale:!live};});
  res.json({agentProfiles:store.list('agentProfiles'),projectScans:getProjectScans(store),projects:store.list('projects'),services:store.list('services').map((s)=>publicService(s,workers)),tasks:store.list('tasks'),jobs:store.list('jobs'),agents,workers,artifacts:store.list('artifacts').map(publicArtifact),requests:store.list('requests'),events:store.events({tail:true,limit:500}),capabilities:capabilitiesFor(workers),csrfToken:req.owner.csrfToken,selectedProjectId:store.get('settings','app')?.selectedProjectId||null});
 });
 app.get('/api/events',(req,res)=>{
  res.setHeader('Content-Type','text/event-stream');res.setHeader('Connection','keep-alive');res.setHeader('X-Accel-Buffering','no');res.flushHeaders();
  let after=Number(req.query.after||req.headers['last-event-id'])||0;
  const send=()=>{for(const event of store.events({...req.query,after,limit:500})){after=event.id;res.write(`id: ${event.id}\nevent: event\ndata: ${JSON.stringify(event)}\n\n`);}};
  send();const poll=setInterval(send,700),ping=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clearInterval(poll);clearInterval(ping);});
 });
 app.get('/api/logs',async(req,res)=>{
  if(req.query.download==='1'){
   res.setHeader('Content-Disposition','attachment; filename="mari-execution.jsonl"');res.type('application/x-ndjson');
   let after=Number(req.query.after)||0;const through=store.events({tail:true,limit:1})[0]?.id||0;
   while(!res.destroyed&&after<through){const events=store.events({...req.query,after,limit:500}).filter((event)=>event.id<=through);if(!events.length)break;for(const event of events){if(res.destroyed)break;after=event.id;if(!res.write(JSON.stringify(event)+'\n'))await new Promise((resolve)=>{const done=()=>{res.off('drain',done);res.off('close',done);resolve();};res.once('drain',done);res.once('close',done);});}await new Promise(setImmediate);}
   return res.end();
  }
  const limit=Math.min(1000,Math.max(1,Number(req.query.limit)||500));res.json({events:store.events({...req.query,tail:true,limit})});
 });
 app.get('/api/directories',async(req,res)=>res.json(await listDirectories(req.query.path)));
 app.post('/api/directories/pick',async(req,res)=>{
  if(!req.body||Object.keys(req.body).some(key=>key!=='path')||req.body.path!==undefined&&typeof req.body.path!=='string')throw err('Choose a local folder.');
  const controller=new AbortController(),cancel=()=>{if(!res.writableEnded)controller.abort();};res.once('close',cancel);
  try{res.json(await folderPicker({initialPath:req.body.path,signal:controller.signal}));}finally{res.off('close',cancel);}
 });
 app.get('/api/projects/scans',(req,res)=>res.json(getProjectScans(store)));
 app.post('/api/projects/discover',async(req,res)=>res.json(await discoverProjects(req.body.path,{store})));
 app.post('/api/projects',async(req,res)=>res.status(201).json(await registerProject(store,req.body)));
 app.post('/api/demo',async(req,res)=>{
  const project=await registerProject(store,{path:path.join(repoRoot,'examples/demo-project'),name:'Demo workspace'});
  let services=store.list('services').filter((s)=>s.projectId===project.id);
  if(!services.length){for(const input of [{name:'Frontend',command:'node server.js',cwd:project.path,url:'http://127.0.0.1:4173',required:true},{name:'Backend',command:'node api.js',cwd:project.path,url:'http://127.0.0.1:4174/health',required:false}])store.put('services',await serviceConfig(project,input));services=store.list('services').filter((s)=>s.projectId===project.id);}
  store.put('settings',{id:'app',selectedProjectId:project.id});res.status(201).json({project,services});
 });
 app.patch('/api/projects/:id',(req,res)=>{const p=requireRecord(store,'projects',req.params.id),patch={};for(const key of ['name','designBrief'])if(req.body[key]!==undefined){if(typeof req.body[key]!=='string')throw err(`${key} must be text.`);patch[key]=req.body[key].slice(0,key==='name'?150:20000);}res.json(store.update('projects',p.id,patch));});
 app.post('/api/projects/:id/select',(req,res)=>{const p=requireRecord(store,'projects',req.params.id);store.put('settings',{id:'app',selectedProjectId:p.id});res.json({selectedProjectId:p.id});});
 app.post('/api/projects/:id/refresh',async(req,res)=>{const p=requireRecord(store,'projects',req.params.id),detected=await detectProjectStructure(p.path);const project=store.update('projects',p.id,{...detected,name:p.name});await probeExternalServices(store,p.id);res.json({project,services:store.list('services').filter((s)=>s.projectId===p.id)});});
 app.delete('/api/projects/:id',(req,res)=>{const p=requireRecord(store,'projects',req.params.id);if(store.list('services').some((s)=>s.projectId===p.id&&(s.pid&&s.ownership==='managed'||['starting','stopping'].includes(s.status))))throw err('Stop managed services before removing the project.',409,'SERVICE_ACTIVE');if(isBusy(store,(j)=>j.projectId===p.id))throw err('Cancel active project jobs first.',409,'JOB_ACTIVE');store.remove('projects',p.id);for(const s of store.list('services').filter((s)=>s.projectId===p.id))store.remove('services',s.id);if(store.get('settings','app')?.selectedProjectId===p.id)store.update('settings','app',{selectedProjectId:null});res.json({removed:true});});
 app.post('/api/projects/:id/services',async(req,res)=>{const p=requireRecord(store,'projects',req.params.id);const service=await serviceConfig(p,req.body);store.put('services',service);res.status(201).json(service);});
 app.patch('/api/services/:id',async(req,res)=>{const previous=requireRecord(store,'services',req.params.id),p=requireRecord(store,'projects',previous.projectId);const config=await serviceConfig(p,req.body,previous);const patch=Object.fromEntries(['name','command','cwd','envFile','url','port','required','configVersion','updatedAt'].map((key)=>[key,config[key]]));res.json(store.update('services',previous.id,patch));});
 app.post('/api/services/:id/:action',async(req,res)=>{
  const service=requireRecord(store,'services',req.params.id),action=req.params.action;if(!['start','stop','restart'].includes(action))throw err('Unknown service action.');
  if(isBusy(store,(j)=>j.serviceId===service.id))throw err('A service action is already queued or running.',409,'DUPLICATE_START');
  if(action==='start'&&service.ownership==='managed'&&service.pid)throw err('This managed process is already started. Use restart.',409,'DUPLICATE_START');
  if(action!=='start'&&service.ownership!=='managed')throw err('Only processes started and owned by Mari can be stopped.',409,'NOT_MANAGED');
  if(action!=='stop'){
   if(Number(req.body.confirmedVersion)!==service.configVersion)throw err('Review the resolved command, working directory, environment file location, and expected URL before starting.',409,'COMMAND_REVIEW_REQUIRED',{configVersion:service.configVersion});
   if(action==='start'&&service.url){const u=new URL(service.url);if(['localhost','127.0.0.1','[::1]'].includes(u.hostname)&&await portOccupied(u.hostname==='localhost'?'127.0.0.1':u.hostname,service.port)){store.update('services',service.id,{status:await reachable(service.url)?'running':'unknown',ownership:'external',lastError:'Expected port is occupied by a process not started by Mari.',lastProbeAt:now()});throw err('This port is already occupied. The process is external; use its URL for capture or change the port.',409,'PORT_OCCUPIED');}}
   store.update('services',service.id,{confirmedVersion:service.configVersion});
  }
  const job=enqueue(store,`service.${action}`,{projectId:service.projectId,serviceId:service.id,payload:{confirmedVersion:service.configVersion}});res.status(202).json({job,service:store.get('services',service.id)});
 });
 app.post('/api/projects/:id/routes',async(req,res)=>{const p=requireRecord(store,'projects',req.params.id),baseUrl=req.body.baseUrl||selectBaseUrl(store,p.id);if(!baseUrl)throw err('Configure an expected service URL before discovering routes.');res.json(await inventoryRoutes(p,baseUrl));});
 app.post('/api/tasks',async(req,res)=>{
  const p=requireRecord(store,'projects',req.body.projectId||store.get('settings','app')?.selectedProjectId),instruction=String(req.body.instruction||'').trim();if(!instruction||instruction.length>30000)throw err('Describe the requested work (maximum 30,000 characters).');
  const explicit=req.body.intent;let intent=['capture','design'].includes(explicit)?explicit:/\b(capture|screenshot)\b/i.test(instruction)?'capture':/\b(design|redesign|proposal)\b/i.test(instruction)?'design':null;
  if(/\b(implement|edit|code|delete|deploy|commit|merge)\b/i.test(instruction)&&!explicit)intent=null;
  const agentProfileId=req.body.agentProfileId||null;
  const agentProfile=await resolveAgentProfile(store,agentProfileId,{projectId:p.id});
  const baseUrl=req.body.baseUrl||selectBaseUrl(store,p.id);if(baseUrl)checkedUrl(baseUrl);
  const routes=safeRoutes(req.body.routes,baseUrl||'http://localhost'),viewports=safeViewports(req.body.viewports),mode=req.body.mode==='builtin'?'builtin':'handoff';
  const task={id:id('task'),projectId:p.id,name:instruction.slice(0,100),instruction,status:intent?'queued':'awaiting_input',phase:intent?'capture':'input',routes,viewports,mode,baseUrl:baseUrl||null,requestedIntent:intent,agentProfileId,steps:taskStages.map((stage)=>({id:stage,name:stage,status:'queued'})),artifactIds:[],activeArtifactId:null,approvedArtifactId:null,createdAt:now(),lastActivityAt:now(),verificationPasses:0,changedFiles:[],error:intent?null:'Choose Capture page or Generate design. Implementation requires reviewing and approving a specific image first.'};
  if(intent&&(!baseUrl||!await reachable(baseUrl)))throw err('The selected website is not ready. Start its service, confirm readiness, or configure a reachable external URL.',409,'SITE_NOT_READY');
  store.put('tasks',task);let job=null;if(intent)job=enqueue(store,'capture',{projectId:p.id,taskId:task.id,payload:{routes,viewports,baseUrl,afterCapture:intent==='design'?'design':'capture',...(agentProfile?{agentProfile}:{})}});res.status(201).json({task,job});
 });
 app.post('/api/tasks/:id/action',async(req,res)=>{
  let task=requireRecord(store,'tasks',req.params.id);const action=req.body.action;
  if(task.teamId&&store.get('agentTeams',task.teamId)?.taskId===task.id){if(action!=='cancel')throw err('Use this goal’s team controls.',409,'TEAM_CONTROLS');controlTeamRun(store,requireRecord(store,'agentTeams',task.teamId),'cancel');return res.json({task:store.get('tasks',task.id)});}
  if(task.kind==='agent_task'&&action!=='cancel')throw err('Open this agent conversation to inspect or retry its assigned task.',409,'AGENT_TASK_CONTROLS');
  const allowed=['generate','revise','reject','approve','implement','verify','cancel','retry','resume','accept'];if(!allowed.includes(action))throw err('Unknown task action.');
  if(action==='cancel'){
   const jobs=store.list('jobs').filter((j)=>j.taskId===task.id&&ACTIVE.has(j.status));
   for(const job of jobs)store.update('jobs',job.id,{cancelRequested:true,...(job.status==='queued'?{status:'cancelled',finishedAt:now()}: {})});
   const running=jobs.some((j)=>j.status==='running');task=store.update('tasks',task.id,{status:running?'paused':'cancelled',phase:running?'cancelling':task.phase,lastActivityAt:now(),...(running?{}:{finishedAt:now()})});
   store.event({source:'system',projectId:task.projectId,taskId:task.id,type:'task.cancel_requested',message:'User requested task cancellation. Project services remain independent.'});return res.json({task});
  }
  if(isBusy(store,(j)=>j.taskId===task.id))throw err('Wait for the current task action or cancel it first.',409,'TASK_BUSY');
  if(['approve','reject'].includes(action)){
   const approval=await approveArtifact(store,dataDir,task,req.body.artifactId||task.activeArtifactId,action==='approve'?'approved':'rejected',req.body.feedback);return res.json({task:store.get('tasks',task.id),approval});
  }
  if(action==='accept'){
   const approved=await ensureApproved(store,dataDir,task,task.approvedArtifactId),verification=Array.isArray(task.verification)?task.verification.at(-1):null;
   const verifiedImage=verification?.approvedArtifactId||verification?.artifactId||task.implementationArtifactId;
   if(task.implementationArtifactId!==approved.id||!task.implementationFinishedAt||!verification||verifiedImage!==approved.id||timestamp(verification.capturedAt)<timestamp(task.implementationFinishedAt)||verification.captures?.some((capture)=>capture.status==='failed')||['capture_failed','comparison_failed','comparison_pending'].includes(verification.outcome)||task.error||!store.list('artifacts').some((a)=>a.taskId===task.id&&a.kind==='implemented'))throw err('Complete successful browser verification for this exact approved implementation before accepting it.',409,'VERIFICATION_REQUIRED');
   task=store.update('tasks',task.id,{status:'completed',phase:'completed',finishedAt:now(),lastActivityAt:now()});store.event({source:'system',projectId:task.projectId,taskId:task.id,type:'task.accepted',message:'User accepted the verified implementation.'});return res.json({task});
  }
  const profileSpecified=Object.hasOwn(req.body,'agentProfileId');
  const selectedProfileId=profileSpecified?(req.body.agentProfileId||null):(task.agentProfileId||null);
  let resolvedProfile;
  if(!['retry','resume'].includes(action)||profileSpecified)resolvedProfile=await resolveAgentProfile(store,selectedProfileId,{projectId:task.projectId});
  let type,payload={};
  if(['generate','revise'].includes(action)){
   const artifact=req.body.artifactId?requireRecord(store,'artifacts',req.body.artifactId):store.get('artifacts',task.activeArtifactId);
   if(artifact&&(artifact.taskId!==task.id||artifact.projectId!==task.projectId))throw err('Artifact belongs to another task.',409,'INVALID_ARTIFACT_SCOPE');
   const original=store.list('artifacts').find((a)=>a.taskId===task.id&&a.kind==='original'&&(!artifact||a.page===artifact.page&&a.viewport===artifact.viewport));
   if(!original)throw err('Capture a page before generating a design.',409,'CAPTURE_REQUIRED');
   const mode=req.body.mode==='builtin'?'builtin':req.body.mode==='handoff'?'handoff':task.mode||'handoff';
   const prompt=req.body.prompt!==undefined?String(req.body.prompt).slice(0,30000):task.designPrompt||DEFAULT_DESIGN_PROMPT;
   task=store.update('tasks',task.id,{mode,designPrompt:prompt,approvedArtifactId:null,steps:(task.steps||[]).map((step)=>['design','approval','implement','verify'].includes(step.id)?{id:step.id,name:step.name||step.id,status:'queued'}:step),status:'queued',phase:'design',error:null,lastActivityAt:now()});
   type='design';payload={mode,prompt,feedback:String(req.body.feedback||'').slice(0,10000),page:original.page,viewport:original.viewport};
  }else if(action==='implement'){
   await assertImplementationBoundary(store,dataDir,task);
   const artifact=await ensureApproved(store,dataDir,task,req.body.artifactId);task=store.update('tasks',task.id,{implementationFinishedAt:null});type='implement';payload={artifactId:artifact.id,notes:String(req.body.feedback||'').slice(0,10000)};
  }else if(action==='verify'){
   if(!store.list('artifacts').some((a)=>a.taskId===task.id&&a.kind==='implemented')&&!task.implementationFinishedAt&&task.phase!=='verification'&&task.phase!=='verify'&&task.phase!=='review')throw err('Implement the approved design before verification.',409,'IMPLEMENTATION_REQUIRED');
   if((task.verificationPasses||0)>=2&&!unfinishedVerification(task))throw err('The two verification passes are complete. Review the results and remaining differences.',409,'VERIFICATION_LIMIT');
   const artifact=await ensureApproved(store,dataDir,task,req.body.artifactId);type='verify';payload={artifactId:artifact.id,...(unfinishedVerification(task)?{resume:true}:{})};
  }else if(['retry','resume'].includes(action)){
   const candidates=store.list('jobs').filter((j)=>j.taskId===task.id).reverse().sort((a,b)=>timestamp(b.createdAt)-timestamp(a.createdAt));
   const previous=candidates.find((j)=>['failed','paused','cancelled','interrupted'].includes(j.status))||candidates.find((j)=>j.type==='capture'&&task.captures?.some((capture)=>capture.status==='failed'))||candidates.find((j)=>j.type==='design'&&task.status==='awaiting_input'&&task.error);
   if(!previous)throw err('No interrupted or failed action can be resumed. Choose the next workflow action.',409,'NOT_RESUMABLE');
   type=previous.type;payload={...previous.payload,resume:true};
   if(type==='implement'){await assertImplementationBoundary(store,dataDir,task);await ensureApproved(store,dataDir,task,payload.artifactId);}
   if(type==='verify'&&(task.verificationPasses||0)>=2&&!unfinishedVerification(task))throw err('Verification pass limit reached.',409,'VERIFICATION_LIMIT');
   if(type==='capture'){
    const originals=store.list('artifacts').filter((a)=>a.taskId===task.id&&a.kind==='original');
    payload.completedItems=originals.map((a)=>({page:a.page,viewport:a.viewport}));
   }
  }
  if(['design','implement','verify','capture'].includes(type)){
   const keepSnapshot=['retry','resume'].includes(action)&&!profileSpecified&&payload.agentProfile;
   const agentProfile=keepSnapshot?payload.agentProfile:resolvedProfile===undefined?await resolveAgentProfile(store,selectedProfileId,{projectId:task.projectId}):resolvedProfile;
   if(agentProfile)payload.agentProfile=agentProfile;else delete payload.agentProfile;
  }
  task=store.update('tasks',task.id,{agentProfileId:selectedProfileId,status:'queued',phase:type==='implement'?'implement':type==='verify'?'verify':type,error:null,lastActivityAt:now(),finishedAt:null});
  const job=enqueue(store,type,{projectId:task.projectId,taskId:task.id,payload});res.status(202).json({task,job});
 });
 const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:MAX_IMAGE_BYTES,files:1,fields:8}});
 app.post('/api/tasks/:id/proposals',upload.single('image'),async(req,res)=>{
  const task=requireRecord(store,'tasks',req.params.id);if(isBusy(store,(j)=>j.taskId===task.id))throw err('Wait for the current task action before importing a proposal.',409,'TASK_BUSY');
  const artifact=await importProposal({store,dataDir,task,buffer:req.file?.buffer,page:req.body.page||task.routes?.[0],viewport:req.body.viewport||task.viewports?.[0],notes:redactor.redact(req.body.notes||'')});
  res.status(201).json({artifact:publicArtifact(artifact),task:store.get('tasks',task.id)});
 });
 app.get('/api/artifacts/:id/content',async(req,res)=>{
  const artifact=requireRecord(store,'artifacts',req.params.id),file=await ownedArtifactPath(dataDir,artifact);
  const formats={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','application/json':'json','application/pdf':'pdf','text/plain':'txt','video/mp4':'mp4','audio/wav':'wav','audio/mpeg':'mp3'};
  res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");res.setHeader('Content-Disposition',`${req.query.download==='1'?'attachment':'inline'}; filename="${artifact.id.replace(/[^a-zA-Z0-9_-]/g,'')}.${formats[artifact.mime]||'bin'}"`);res.type(formats[artifact.mime]?artifact.mime:'application/octet-stream');res.sendFile(file,{dotfiles:'allow',acceptRanges:true});
 });
 app.get('/api/tasks/:id/handoff',(req,res)=>{
  const task=requireRecord(store,'tasks',req.params.id),project=requireRecord(store,'projects',task.projectId),active=store.get('artifacts',task.activeArtifactId);
  const screenshots=store.list('artifacts').filter((a)=>a.taskId===task.id&&a.kind==='original');if(!screenshots.length)throw err('Capture the page before preparing a ChatGPT handoff.',409,'CAPTURE_REQUIRED');
  const screenshot=screenshots.find((a)=>a.page===active?.page&&a.viewport===active?.viewport)||screenshots[0];
  const result={mode:'manual-chatgpt-handoff',instructions:'Download the screenshot and attach it with this prompt in your own ChatGPT conversation. Import the returned design image into Mari. Mari cannot read or control that conversation.',prompt:[task.designPrompt||DEFAULT_DESIGN_PROMPT,project.designBrief?`Shared project design brief:\n${project.designBrief}`:''].filter(Boolean).join('\n\n'),project:project.name,page:screenshot.page,viewport:screenshot.viewport,screenshot:publicArtifact(screenshot)};
  if(req.query.download==='1'){res.setHeader('Content-Disposition','attachment; filename="mari-chatgpt-handoff.json"');res.type('application/json').send(JSON.stringify(redactor.redact(result),null,2));}else res.json(result);
 });
 app.post('/api/requests/:id/respond',(req,res)=>{
  const request=requireRecord(store,'requests',req.params.id);if(request.status!=='pending'&&request.status!=='awaiting_input'&&request.status!=='awaiting_approval')throw err('This execution request is no longer pending.',409,'REQUEST_RESOLVED');
  const response=req.body.response??req.body.answer??req.body.decision;if(response===undefined)throw err('An explicit response is required.');
  const updated=store.update('requests',request.id,{response:redactor.redact(response),status:'responded',actor:'user',respondedAt:now()});
  store.event({source:'system',projectId:request.projectId,taskId:request.taskId,type:'request.responded',message:'User responded to an execution request.',data:{requestId:request.id}});res.json(updated);
 });
 app.post('/api/browser/login',(req,res)=>{
  const project=requireRecord(store,'projects',req.body.projectId||store.get('settings','app')?.selectedProjectId);const baseUrl=req.body.baseUrl||req.body.url||selectBaseUrl(store,project.id);checkedUrl(baseUrl);
  if(isBusy(store,(j)=>j.type==='browser.login'&&j.projectId===project.id))throw err('A login browser is already queued or open.',409,'LOGIN_ACTIVE');
  res.status(202).json({job:enqueue(store,'browser.login',{projectId:project.id,payload:{baseUrl,url:baseUrl}})});
 });
 app.use('/api',(req,res)=>res.status(404).json({error:'Unknown API endpoint.',code:'NOT_FOUND'}));
 app.use(express.static(path.join(repoRoot,'dist'),{index:'index.html',dotfiles:'deny'}));
 app.get('/{*path}',async(req,res,next)=>{if(req.path.startsWith('/api'))return next();try{await fs.access(path.join(repoRoot,'dist/index.html'));res.sendFile(path.join(repoRoot,'dist/index.html'));}catch{res.status(503).type('text').send('Mari backend is running. Start the Vite development server or build the frontend.');}});
 app.use((error,req,res,next)=>{
  if(res.headersSent)return next(error);
  const status=error.code==='LIMIT_FILE_SIZE'?413:error instanceof multer.MulterError?400:error.status||(/ENOENT|ENOTDIR/.test(error.code||'')?400:500);
  res.status(status).json({error:status===500?'The local operation failed. Inspect the server terminal for details.':error.message,code:error.code||'INTERNAL_ERROR',...(error.details?{details:error.details}:{})});
  if(status===500)console.error(redactor.redact(error.stack||error.message));
 });
 return app;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=createApp(),port=Number(process.env.MARI_PORT||4310);app.listen(port,'127.0.0.1',()=>{
  const origin=process.env.MARI_UI_ORIGIN||`http://127.0.0.1:${port}`;
  console.log(`Mari local backend listening at http://127.0.0.1:${port}`);
  console.log(`Pair your browser (one use): ${origin}/#accessKey=${app.locals.accessKey}`);
 });
}
