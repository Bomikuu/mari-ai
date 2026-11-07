import { createHash, timingSafeEqual, randomUUID } from 'node:crypto';
import { now } from '../server/store.js';
import { cleanKnowledgeText } from '../server/knowledge.js';
import { preparePhoneTurn, commitPhoneTurn, cancelPhoneJob, ownsPhoneWork, phoneJobAllowed } from '../server/telegram-work.js';
import { telegramPhoto } from './telegram-photo.js';
import { atomic, activeTeam, controlTeamRun } from '../server/agent-teams.js';
import { prepareDelegatedGoal, commitDelegatedGoal } from '../server/agent-goals.js';
import { telegramState, queueTelegramMessage, queueTelegramAnswer, revokePendingTelegramMessages, telegramDeliveryAllowed } from '../server/telegram.js';
import { telegramApi, readTelegramCredentials } from '../server/telegram-client.js';

const privateMessage = m => m?.chat?.type === 'private' && Number.isSafeInteger(m.chat.id) && m.chat.id > 0 && Number.isSafeInteger(m.from?.id) && !m.from?.is_bot && String(m.from?.id) === String(m.chat.id) && !m.forward_origin && !m.forward_date && !m.via_bot;
const ownTeam = (t,s) => t.origin?.type === 'telegram' && t.origin.generation === s.generation && String(t.origin.chatId) === String(s.paired?.chatId) && t.origin.bindingId === s.paired?.id;
const receiptId = (s,update) => `telegram_${s.generation}_${update.update_id}`;
const peerName = m => [m.from.first_name,m.from.last_name].filter(Boolean).join(' ').slice(0,120) || 'Telegram user';
const validBinding = (store,expected) => {const s=telegramState(store);return s.enabled&&s.generation===expected.generation&&String(s.paired?.chatId)===String(expected.paired?.chatId)&&s.paired?.id===expected.paired?.id;};
const help = 'Mari commands:\nSend a normal message to chat with Mari and receive the answer here.\n/image PROMPT — generate and receive one image\n/new — start a fresh phone conversation\n/goal YOUR GOAL — delegate to your configured coordinator and receive the final answer\n/status — recent phone work\n/cancel ID — cancel your chat/image job or team goal (omit ID for the latest active request)\n/help — show commands\n\nUse Mari on your computer for saved history, artifacts, website design approval and implementation. Mari and its worker must be running.';
const activeJob = j => ['queued','running'].includes(j.status);
const directJobs = (store,s) => store.list('jobs').filter(j => ownsPhoneWork(j,s) && ['chat','image'].includes(j.origin.kind));

export async function handleTelegramUpdate({store,update,expected,prepareGoal=prepareDelegatedGoal,preparePhone=preparePhoneTurn,stillActive=()=>true}) {
  if(!Number.isSafeInteger(update?.update_id)||update.update_id<0)return;
  if(!stillActive()||telegramState(store).generation!==expected.generation)return;
  const receipt=receiptId(expected,update);if(store.get('telegramReceipts',receipt))return;
  const m=update.message,s=telegramState(store),text=typeof m?.text==='string'?m.text.trim():'';
  const finish = (reply=null) => atomic(store,()=>{
    if(!stillActive()||telegramState(store).generation!==expected.generation||store.get('telegramReceipts',receipt))return;
    store.put('telegramReceipts',{id:receipt,updateId:update.update_id,generation:s.generation,handledAt:now()});
    if(reply&&validBinding(store,s))queueTelegramMessage(store,telegramState(store),`update:${update.update_id}`,reply,'command');
  });
  if(!s.enabled||!privateMessage(m)||!text||text.length>6000){finish();return;}
  if(text.startsWith('/start mari_')&&s.pairingHash&&Date.parse(s.pairingExpiresAt)>Date.now()){
    const supplied=createHash('sha256').update(text.slice(7)).digest('hex');
    if(supplied.length===s.pairingHash.length&&timingSafeEqual(Buffer.from(supplied),Buffer.from(s.pairingHash)))atomic(store,()=>{
      const current=telegramState(store);if(current.generation!==s.generation||current.pairingHash!==s.pairingHash||!current.enabled)return;
      store.update('settings','telegram',{pendingPair:{id:randomUUID(),chatId:String(m.chat.id),userId:String(m.from.id),username:String(m.from.username||'').slice(0,64),name:peerName(m),receivedAt:now()}});
      store.put('telegramReceipts',{id:receipt,updateId:update.update_id,generation:s.generation,handledAt:now()});
    });else finish();return;
  }
  if(!s.paired||String(m.chat.id)!==String(s.paired.chatId)||!Number.isFinite(m.date)||m.date*1000<Date.parse(s.paired.pairedAt)-2000){finish();return;}
  if(/^\/(?:help|start)(?:@\w+)?$/i.test(text)){finish(help);return;}
  if(/^\/status(?:@\w+)?$/i.test(text)){
    const work=[...store.list('agentTeams').filter(t=>ownTeam(t,s)).map(t=>({id:t.id,status:t.status,kind:'goal',createdAt:t.createdAt})),...directJobs(store,s).map(j=>({id:j.id,status:j.status,kind:j.origin.kind,createdAt:j.createdAt}))];
    work.sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    finish(work.length?work.slice(0,6).map(t=>`${t.kind} ${t.id}: ${t.status}`).join('\n'):'No phone work has been submitted for this connection.');return;
  }
  if(/^\/new(?:@\w+)?$/i.test(text)){
    atomic(store,()=>{
      if(!stillActive()||!validBinding(store,s)||store.get('telegramReceipts',receipt))return;
      const current=telegramState(store),chat=current.phoneChatId&&store.get('agentChats',current.phoneChatId);
      if(chat&&ownsPhoneWork(chat,current)){
        store.update('agentChats',chat.id,{phoneClosed:true});
        for(const j of directJobs(store,current).filter(j=>j.payload.chatId===chat.id&&activeJob(j)))cancelPhoneJob(store,j);
      }
      store.update('settings','telegram',{phoneChatId:null,phoneEpoch:randomUUID()});revokePendingTelegramMessages(store,telegramState(store));
      store.put('telegramReceipts',{id:receipt,updateId:update.update_id,generation:s.generation,handledAt:now()});
      queueTelegramMessage(store,current,`update:${update.update_id}`,'Started a fresh phone conversation. Your previous history remains saved in Mari.','command');
    });return;
  }
  const cancel=text.match(/^\/cancel(?:@\w+)?(?:\s+((?:team|job)_[\w-]+))?$/i);
  if(cancel){atomic(store,()=>{
    const current=telegramState(store);if(!stillActive()||!validBinding(store,s)||store.get('telegramReceipts',receipt))return;
    const teams=store.list('agentTeams').filter(t=>ownTeam(t,current)&&activeTeam(t));
    const jobs=directJobs(store,current).filter(activeJob);
    const candidates=[...teams,...jobs].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
    const selected=cancel[1]?candidates.find(j=>j.id===cancel[1]):candidates[0];
    if(selected){if(selected.id.startsWith('team_'))controlTeamRun(store,selected,'cancel',{transaction:false});else cancelPhoneJob(store,selected);}
    revokePendingTelegramMessages(store,current);
    store.put('telegramReceipts',{id:receipt,updateId:update.update_id,generation:s.generation,handledAt:now(),action:'cancel',workId:selected?.id||null});
    queueTelegramMessage(store,current,`update:${update.update_id}`,selected?'Cancellation requested for '+selected.id:'Only active work submitted by this paired phone can be cancelled here.','command');
  });return;}
  const goal=text.match(/^\/goal(?:@\w+)?\s+([\s\S]+)$/i), image=text.match(/^\/image(?:@\w+)?\s+([\s\S]+)$/i);
  if(text.startsWith('/')&&!goal&&!image){finish('Send a normal message, /image PROMPT, /goal YOUR GOAL, /new, /status, /cancel ID or /help.');return;}
  if(!s.allowGoals){finish('Phone chat, images and goals are disabled. Enable phone requests in Mari’s Telegram settings.');return;}
  const workCount=()=>store.list('agentTeams').filter(t=>ownTeam(t,telegramState(store))&&activeTeam(t)).length+directJobs(store,telegramState(store)).filter(activeJob).length;
  if(workCount()>=3){finish('Three phone requests are already active. Wait for one to finish or cancel it.');return;}
  let prepared;
  try{
    prepared=goal?await prepareGoal(store,{profileId:s.profileId,projectId:s.projectId,text:goal[1],title:`Telegram goal · ${new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}).format(new Date())}`})
      :await preparePhone(store,{state:s,text:image?image[1]:text,kind:image?'image':'chat'});
  }catch(error){finish(goal?'This goal could not be queued. Check the coordinator, project and installed skills in Mari.':cleanKnowledgeText(error.message));return;}
  if(!stillActive())return;
  atomic(store,()=>{
    const current=telegramState(store);
    if(!validBinding(store,s)||!current.allowGoals||current.projectId!==s.projectId||current.profileId!==s.profileId||current.phoneEpoch!==s.phoneEpoch||store.get('telegramReceipts',receipt))return;
    if(workCount()>=3){store.put('telegramReceipts',{id:receipt,generation:s.generation,updateId:update.update_id,handledAt:now()});queueTelegramMessage(store,current,`update:${update.update_id}`,'Three phone requests are already active. Wait or cancel one.','command');return;}
    if(!goal){const profile=store.get('agentProfiles',prepared.profile.id);if(!profile?.enabled||profile.archived)return;}
    const work=goal?commitDelegatedGoal(store,prepared,{type:'telegram',generation:s.generation,bindingId:s.paired.id,chatId:String(m.chat.id),messageId:m.message_id,directReplies:true}):commitPhoneTurn(store,prepared,current,m.message_id);
    store.put('telegramReceipts',{id:receipt,generation:s.generation,updateId:update.update_id,teamId:goal?work.id:null,jobId:goal?null:work.id,handledAt:now()});
    queueTelegramMessage(store,current,`update:${update.update_id}`,`Queued ${goal?'goal':image?'image':'Mari reply'} ${work.id}. The result will return here; saved activity is also available in Mari.`,'command');
  });
}

export function collectTelegramReplies(store) {
  const s=telegramState(store);if(!s.enabled||!s.paired)return;
  for(const job of directJobs(store,s)){
    if(!['completed','failed','paused','interrupted'].includes(job.status))continue;
    const key=`result:${job.id}:${job.status}`,delivery={sourceJobId:job.id,projectId:job.projectId||null,replyMessageId:job.origin.messageId,conversationId:job.origin.kind==='chat'?job.payload.chatId:null};
    if(job.status!=='completed'){
      queueTelegramAnswer(store,s,key,`Mari ${job.status} (${job.id}). ${cleanKnowledgeText(job.error||'Inspect the saved execution in Mari and retry explicitly.')}`,delivery);continue;
    }
    const reply=store.get('agentMessages',job.payload.replyId);
    if(reply?.status!=='completed'||reply.chatId!==job.payload.chatId)continue;
    if(job.origin.kind==='image'){
      const artifact=store.list('artifacts').find(a=>a.jobId===job.id&&a.chatId===job.payload.chatId&&a.kind==='telegram_image');
      if(artifact)queueTelegramMessage(store,s,key,'Generated by Mari. Original saved in Mari → Agents → Mari → Tasks.','photo',{...delivery,artifactId:artifact.id});
      else queueTelegramAnswer(store,s,key,'Image generation finished without a verified image artifact. Inspect the job in Mari.',delivery);
    }else if(reply.content)queueTelegramAnswer(store,s,key,cleanKnowledgeText(reply.content),delivery);
  }
  for(const team of store.list('agentTeams').filter(t=>ownTeam(t,s)&&t.origin.directReplies&&t.status==='completed')){
    const job=store.get('jobs',team.synthesisJobId),reply=job&&store.get('agentMessages',job.payload?.replyId);
    if(job?.status==='completed'&&reply?.status==='completed'&&reply.chatId===team.chatId&&reply.content)
      queueTelegramAnswer(store,s,`goal-result:${team.id}:${job.id}`,cleanKnowledgeText(reply.content),{sourceJobId:job.id,projectId:team.projectId||null,replyMessageId:team.origin.messageId});
  }
  revokePendingTelegramMessages(store,s);
}

export function collectTelegramNotifications(store) {
  const s=telegramState(store);if(!s.enabled||!s.paired||!s.notifications)return;
  const teams=store.list('agentTeams').filter(t=>ownTeam(t,s)||(s.notifyAllGoals&&Date.parse(t.createdAt)>=Date.parse(s.paired.pairedAt)));
  for(const team of teams){
    const attempt=[team.planJobId,team.synthesisJobId,...team.members.map(m=>m.jobId)].filter(Boolean).join(':');
    if(['completed','failed','cancelled'].includes(team.status))queueTelegramMessage(store,s,`team:${team.id}:${attempt}:${team.status}`,`${team.coordinator.name}: ${team.id} ${team.status}. Open Mari → Agents → ${team.coordinator.name} → Team for results and next actions.`,'team',{consentScope:ownTeam(team,s)?'phone':'all_goals'});
    if(activeTeam(team)){const taskIds=new Set([team.taskId,...team.members.map(m=>m.taskId)]);for(const r of store.list('requests').filter(r=>r.status==='pending'&&taskIds.has(r.taskId)))queueTelegramMessage(store,s,`input:${r.id}`,`${team.coordinator.name}: ${team.id} needs your input or approval. Review the request inside Mari on your computer.`,'attention',{consentScope:ownTeam(team,s)?'phone':'all_goals'});}
  }
}

export function createTelegramBridge({store,dataDir,workerId,makeApi=telegramApi,prepareGoal,preparePhone,intervalMs=3000}) {
  let stopped=false,pending=null,currentAbort=null,currentGeneration=null,currentBinding=null,currentDelivery=null;
  for(const o of store.list('telegramOutbox').filter(o=>o.status==='sending'))store.update('telegramOutbox',o.id,{status:'uncertain',error:'The worker stopped before delivery could be confirmed. Retry explicitly; it may duplicate a delivered message.'});
  const lease=()=>!stopped&&store.get('settings','worker-lease')?.ownerId===workerId;
  const tick=()=>{
    if(stopped||pending)return pending||Promise.resolve();
    pending=(async()=>{
      if(!lease())return;const s=telegramState(store);if(!s.enabled)return;
      const creds=readTelegramCredentials(dataDir);if(!creds||creds.generation!==s.generation){store.update('settings','telegram',{status:'error',error:'Reconnect Telegram: private bot credentials are unavailable.'});return;}
      currentGeneration=s.generation;currentBinding=s.paired?.id;currentAbort=new AbortController();const api=makeApi(creds.botToken);store.addSecrets([creds.botToken]);
      const valid=()=>lease()&&telegramState(store).enabled&&telegramState(store).generation===s.generation&&telegramState(store).paired?.id===s.paired?.id;
      try{
        const updates=await api('getUpdates',{offset:s.offset||0,limit:20,timeout:2,allowed_updates:['message']},currentAbort.signal);
        if(!valid())return;if(!Array.isArray(updates))throw new Error('Unsupported updates');
        for(const update of updates.slice(0,20)){
          if(!valid())return;
          await handleTelegramUpdate({store,update,expected:s,prepareGoal,preparePhone,stillActive:valid});
          if(valid()&&Number.isSafeInteger(update?.update_id))store.update('settings','telegram',{offset:Math.max(telegramState(store).offset||0,update.update_id+1)});
        }
        if(!valid())return;
        const current=telegramState(store);store.update('settings','telegram',{status:current.paired?'connected':'awaiting_pair',lastPollAt:now(),error:null});
        collectTelegramReplies(store);
        collectTelegramNotifications(store);
        let attempted=0;
        for(const candidate of store.list('telegramOutbox').filter(o=>o.generation===s.generation&&o.status==='pending'&&(!o.nextAttemptAt||Date.parse(o.nextAttemptAt)<=Date.now()))){
          if(attempted>=4)break;
          if(!valid())return;
          const delivery=atomic(store,()=>{const record=store.get('telegramOutbox',candidate.id);if(!valid()||record?.status!=='pending')return null;if(record.dependsOn&&!['delivered','cancelled'].includes(store.get('telegramOutbox',record.dependsOn)?.status))return null;if(!telegramDeliveryAllowed(telegramState(store),record,store)){store.update('telegramOutbox',record.id,{status:'cancelled',error:'Consent or paired user changed before delivery.'});return null;}return store.update('telegramOutbox',record.id,{status:'sending',attempts:record.attempts+1,attemptedAt:now()});});
          if(!delivery)continue;attempted++;currentDelivery=delivery;
          try{
            const reply=Number.isSafeInteger(delivery.replyMessageId)?{reply_parameters:{message_id:delivery.replyMessageId,allow_sending_without_reply:true}}:{};
            const photo=delivery.kind==='photo'?await telegramPhoto({store,dataDir,delivery}):null;
            if(!valid()||currentAbort.signal.aborted||!telegramDeliveryAllowed(telegramState(store),delivery,store)){store.update('telegramOutbox',delivery.id,{status:'cancelled',error:'Cancelled before upload because the request scope changed.'});continue;}
            const result=await api(photo?'sendPhoto':'sendMessage',photo?{chat_id:delivery.chatId,photo,caption:delivery.text,...reply}:{chat_id:delivery.chatId,text:delivery.text,link_preview_options:{is_disabled:true},...reply},currentAbort.signal);
            if(!Number.isSafeInteger(result?.message_id)||result.message_id<1||photo&&(!Array.isArray(result.photo)||!result.photo.some(p=>typeof p.file_id==='string')))throw new Error('Unconfirmed Telegram response');
            if(valid()&&!currentAbort.signal.aborted&&telegramDeliveryAllowed(telegramState(store),delivery,store)&&store.get('telegramOutbox',delivery.id)?.status==='sending')store.update('telegramOutbox',delivery.id,{status:'delivered',sentAt:now(),messageId:result.message_id,error:null});
            else store.update('telegramOutbox',delivery.id,{status:'uncertain',error:'The paired user or notification settings changed during this attempt. Delivery is unconfirmed.'});
          }catch(error){store.update('telegramOutbox',delivery.id,error.rateLimit&&valid()&&telegramDeliveryAllowed(telegramState(store),delivery,store)?{status:'pending',nextAttemptAt:new Date(Date.now()+error.retryAfter*1000).toISOString(),error:'Telegram rate limit; delivery will retry after its stated delay.'}:{status:error.rejected?'failed':'uncertain',error:error.localFailure?error.message:error.rejected?'Telegram rejected delivery. Check the connection and retry.':'Delivery was not confirmed. Retry explicitly; it may duplicate a delivered message.'});if(error.rateLimit)break;}
          finally{currentDelivery=null;}
        }
      }catch{if(valid())store.update('settings','telegram',{status:'reconnecting',error:'Telegram polling failed. Check the bot connection; the worker will reconnect.'});}
      finally{currentAbort=null;currentGeneration=null;currentBinding=null;currentDelivery=null;}
    })().finally(()=>{pending=null;});return pending;
  };
  const timer=setInterval(()=>tick().catch(()=>{}),intervalMs);
  const watch=setInterval(()=>{if(currentAbort&&(!lease()||!telegramState(store).enabled||telegramState(store).generation!==currentGeneration||telegramState(store).paired?.id!==currentBinding||currentDelivery&&!telegramDeliveryAllowed(telegramState(store),currentDelivery,store)))currentAbort.abort();},200);
  return {tick,async stop(){stopped=true;clearInterval(timer);clearInterval(watch);currentAbort?.abort();await pending;for(const o of store.list('telegramOutbox').filter(o=>o.status==='sending'))store.update('telegramOutbox',o.id,{status:'uncertain',error:'The worker stopped before delivery was confirmed. Retry explicitly.'});}};
}
