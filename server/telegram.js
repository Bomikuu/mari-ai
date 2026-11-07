import express from 'express';
import fs from 'node:fs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { now } from './store.js';
import { telegramApi, telegramFailure, readTelegramCredentials, saveTelegramCredentials, telegramCredentialsFile } from './telegram-client.js';
import { phoneJobAllowed } from './telegram-work.js';

export const telegramState = store => store.get('settings','telegram') || {enabled:false,paired:null,status:'disconnected',generation:null};
export function publicTelegramState(store) {
  const s=telegramState(store);return {enabled:s.enabled,configured:Boolean(s.bot),bot:s.bot||null,paired:s.paired?{name:s.paired.name,username:s.paired.username,pairedAt:s.paired.pairedAt}:null,pendingPair:s.pendingPair?{id:s.pendingPair.id,name:s.pendingPair.name,username:s.pendingPair.username,receivedAt:s.pendingPair.receivedAt}:null,pairingExpiresAt:s.pairingExpiresAt||null,profileId:s.profileId||null,projectId:s.projectId||null,allowGoals:s.allowGoals===true,notifications:s.notifications===true,notifyAllGoals:s.notifyAllGoals===true,status:s.enabled&&s.lastPollAt&&Date.now()-Date.parse(s.lastPollAt)>20000?'offline':s.status,lastPollAt:s.lastPollAt||null,error:s.error||null,outbox:store.list('telegramOutbox').filter(o=>o.generation===s.generation).slice(-30).reverse().map(({id,status,error,createdAt,sentAt,kind})=>({id,status,error,createdAt,sentAt,kind}))};
}
export function telegramDeliveryAllowed(state,message,store=null) {
  if(!state.enabled||!state.paired||message.generation!==state.generation||message.bindingId!==state.paired.id||String(message.chatId)!==String(state.paired.chatId))return false;
  if(['team','attention'].includes(message.kind)&&(!state.notifications||message.consentScope==='all_goals'&&!state.notifyAllGoals))return false;
  if(['answer','photo'].includes(message.kind)) {
    if(!state.allowGoals||(message.projectId||null)!==(state.projectId||null))return false;
    if(store&&message.sourceJobId){const job=store.get('jobs',message.sourceJobId);if(!job||job.cancelRequested||!phoneJobAllowed(store,job))return false;}
  }
  return true;
}
export function revokePendingTelegramMessages(store,state) {
  for(const message of store.list('telegramOutbox').filter(m=>m.generation===state.generation&&['pending','sending'].includes(m.status)))if(!telegramDeliveryAllowed(state,message,store))store.update('telegramOutbox',message.id,{status:message.status==='sending'?'uncertain':'cancelled',error:message.status==='sending'?'Settings or the paired user changed during an in-flight attempt. Delivery is unconfirmed.':'Cancelled before delivery because its consent or paired user changed.'});
}
export function queueTelegramMessage(store,state,key,text,kind='status',{consentScope=null,...delivery}={}) {
  if(!state.paired)return null;
  const id='telegram_'+createHash('sha256').update(`${state.generation}:${key}`).digest('hex');if(store.get('telegramOutbox',id))return store.get('telegramOutbox',id);
  return store.put('telegramOutbox',{...delivery,id,generation:state.generation,bindingId:state.paired.id,chatId:state.paired.chatId,consentScope,text:Array.from(String(text)).slice(0,3500).join(''),kind,status:'pending',createdAt:now(),attempts:0});
}
export function queueTelegramAnswer(store,state,key,text,delivery={}) {
  const parts=[];let current='';
  for(const point of String(text)){if(current.length+point.length>3400){parts.push(current);current='';}current+=point;}
  if(current)parts.push(current);
  let previous=delivery.conversationId?store.list('telegramOutbox').filter(o=>o.generation===state.generation&&o.bindingId===state.paired?.id&&o.kind==='answer'&&o.conversationId===delivery.conversationId).at(-1)?.id:null;
  return parts.map((part,index)=>{
    const message=queueTelegramMessage(store,state,`${key}:${index}`,parts.length>1?`[${index+1}/${parts.length}]\n${part}`:part,'answer',{...delivery,dependsOn:previous,groupId:key,part:index});
    previous=message.id;return message;
  });
}
function settings(store,input,previous={}) {
  if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['botToken','profileId','projectId','allowGoals','notifications','notifyAllGoals'].includes(k)))throw telegramFailure('Choose Telegram connection and notification settings.');
  const v={...previous,...input};const profile=store.get('agentProfiles',v.profileId);
  if(!profile?.enabled||profile.archived||!profile.canDelegate)throw telegramFailure('Choose an enabled agent with goal delegation enabled.');
  if(v.projectId!=null&&(typeof v.projectId!=='string'||!store.get('projects',v.projectId)))throw telegramFailure('Choose Personal or a registered project.');
  for(const k of ['allowGoals','notifications','notifyAllGoals'])if(v[k]!==undefined&&typeof v[k]!=='boolean')throw telegramFailure('Telegram permissions must be true or false.');
  return {profileId:v.profileId,projectId:v.projectId||null,allowGoals:v.allowGoals===true,notifications:v.notifications===true,notifyAllGoals:v.notifyAllGoals===true};
}
function pairCode(store,state) {
  const code=randomBytes(16).toString('hex'),expires=new Date(Date.now()+600000).toISOString();
  store.update('settings','telegram',{pairingHash:createHash('sha256').update('mari_'+code).digest('hex'),pairingExpiresAt:expires,pendingPair:null});
  return {pairingUrl:`https://t.me/${state.bot.username}?start=mari_${code}`,pairingCommand:`/start mari_${code}`,pairingExpiresAt:expires};
}
export function createTelegramRouter({store,dataDir,makeApi=telegramApi}) {
  const router=express.Router();
  router.get('/',(req,res)=>res.json(publicTelegramState(store)));
  router.post('/connect',async(req,res)=>{
    const fields=settings(store,req.body),token=typeof req.body.botToken==='string'?req.body.botToken.trim():req.body.botToken;const call=makeApi(token),generation=randomUUID();store.addSecrets([token]);
    store.put('settings',{id:'telegram',...fields,generation,enabled:false,status:'connecting',paired:null});
    try {
      const bot=await call('getMe'),webhook=await call('getWebhookInfo');
      if(!bot?.is_bot||!Number.isSafeInteger(bot.id)||bot.id<1||!/^\w{5,32}$/.test(bot.username||''))throw telegramFailure('This token did not identify a Telegram bot.');
      if(webhook?.url)throw telegramFailure('This bot already has a webhook. Create a dedicated Mari bot; its webhook was left unchanged.');
      if(telegramState(store).generation!==generation)throw telegramFailure('A newer connection replaced this setup.',409);
      saveTelegramCredentials(dataDir,{botToken:token,generation});
      const state=store.put('settings',{id:'telegram',...fields,generation,enabled:true,status:'awaiting_pair',bot:{id:bot.id,username:bot.username,name:bot.first_name||bot.username},paired:null,offset:0,connectedAt:now(),error:null});
      res.json({...publicTelegramState(store),...pairCode(store,state)});
    }catch(error){if(telegramState(store).generation===generation){store.update('settings','telegram',{enabled:false,status:'error',error:error.code==='TELEGRAM_ERROR'?error.message:'Telegram connection failed.'});fs.rmSync(telegramCredentialsFile(dataDir),{force:true});}throw error.code==='TELEGRAM_ERROR'?error:telegramFailure('Telegram connection failed.',502);}
  });
  router.patch('/',(req,res)=>{const previous=telegramState(store);const fields=settings(store,req.body,previous);const current=store.update('settings','telegram',{...fields});revokePendingTelegramMessages(store,current);res.json(publicTelegramState(store));});
  router.post('/pair-code',(req,res)=>{const state=telegramState(store);if(!state.enabled||!state.bot)throw telegramFailure('Connect a bot first.',409);res.json(pairCode(store,state));});
  router.post('/confirm-pair',(req,res)=>{
    const state=telegramState(store);if(!state.enabled||!state.pendingPair||req.body?.pairId!==state.pendingPair.id||Date.parse(state.pairingExpiresAt)<Date.now())throw telegramFailure('Open a fresh pairing link in your private Telegram chat first.',409);
    const next=store.update('settings','telegram',{paired:{...state.pendingPair,pairedAt:now()},pendingPair:null,pairingHash:null,pairingExpiresAt:null,status:'connected',error:null});
    revokePendingTelegramMessages(store,next);
    queueTelegramMessage(store,next,`paired:${next.paired.id}`,'Mari is paired. Send a normal message to chat, /image PROMPT for a picture, /goal YOUR GOAL to delegate, /new for a fresh conversation, /status, /cancel ID or /help. Answers and requested images return here. Website implementation and design approval stay in Mari.','pairing');res.json(publicTelegramState(store));
  });
  router.post('/disconnect',(req,res)=>{const previous=telegramState(store);store.put('settings',{id:'telegram',enabled:false,status:'disconnected',generation:randomUUID(),paired:null});fs.rmSync(telegramCredentialsFile(dataDir),{force:true});for(const o of store.list('telegramOutbox').filter(o=>o.generation===previous.generation&&['pending','sending'].includes(o.status)))store.update('telegramOutbox',o.id,{status:o.status==='sending'?'uncertain':'cancelled',error:'Disconnected before confirmed delivery.'});res.json(publicTelegramState(store));});
  router.post('/outbox/:id/retry',(req,res)=>{const s=telegramState(store),o=store.get('telegramOutbox',req.params.id);if(!s.enabled||!s.paired||!o||o.generation!==s.generation||!['failed','uncertain'].includes(o.status))throw telegramFailure('Only this connection’s failed or uncertain messages can be retried.',409);store.update('telegramOutbox',o.id,{status:'pending',error:null,nextAttemptAt:null});res.json(publicTelegramState(store));});
  return router;
}
