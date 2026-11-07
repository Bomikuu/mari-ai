import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import net from 'node:net';
const METHODS = new Set(['getMe','getWebhookInfo','getUpdates','sendMessage','sendPhoto']);
export const telegramFailure = (message, status = 400) => Object.assign(new Error(message),{status,code:'TELEGRAM_ERROR'});
export function telegramCredentialsFile(dataDir) {
  const root = path.resolve(dataDir);
  if (fs.realpathSync(root) !== root) throw telegramFailure('Telegram storage must use Mari’s canonical runtime directory.');
  return path.join(root,'telegram-credentials.json');
}
export function saveTelegramCredentials(dataDir, value) {
  const file=telegramCredentialsFile(dataDir),temp=file+'.'+randomUUID()+'.tmp';
  if (fs.existsSync(file) && fs.lstatSync(file).isSymbolicLink()) throw telegramFailure('Telegram credential storage changed unexpectedly.');
  try { fs.writeFileSync(temp,JSON.stringify(value),{mode:0o600,flag:'wx'});fs.renameSync(temp,file); } finally {fs.rmSync(temp,{force:true});}
}
export function readTelegramCredentials(dataDir) {
  const file=telegramCredentialsFile(dataDir);let handle;
  try {handle=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);const stat=fs.fstatSync(handle);if(!stat.isFile()||stat.size>4096||(stat.mode&0o077)!==0)throw new Error();return JSON.parse(fs.readFileSync(handle,'utf8'));}catch{return null;}finally{if(handle!==undefined)fs.closeSync(handle);}
}
export function telegramApi(botToken, {fetchImpl=fetch}={}) {
  if(typeof botToken!=='string'||!/^\d{5,20}:[A-Za-z0-9_-]{30,80}$/.test(botToken.trim()))throw telegramFailure('Enter the bot token supplied by BotFather.');
  botToken=botToken.trim();
  // Keep native address-family fallback, but allow the working IPv4 route
  // enough time before attempting an unavailable IPv6 route on this host.
  net.setDefaultAutoSelectFamilyAttemptTimeout(Math.max(2000,net.getDefaultAutoSelectFamilyAttemptTimeout()));
  return async (method,body={},signal) => {
    if(!METHODS.has(method))throw telegramFailure('This Telegram action is unavailable.');
    let payload,headers;
    if(method==='sendPhoto') {
      if(!(body.photo instanceof Blob)||!body.photo.size||body.photo.size>10*1024*1024||!['image/png','image/jpeg'].includes(body.photo.type))throw telegramFailure('Send a validated local PNG or JPEG photo no larger than 10 MiB.');
      payload=new FormData();
      for(const [key,value] of Object.entries(body))if(key!=='photo')payload.set(key,typeof value==='object'?JSON.stringify(value):String(value));
      payload.set('photo',body.photo,body.photo.type==='image/png'?'mari.png':'mari.jpg');
    } else {headers={'Content-Type':'application/json'};payload=JSON.stringify(body);}
    let response,value;
    const timeout=AbortSignal.timeout(method==='sendPhoto'?60000:12000);
    try {response=await fetchImpl(`https://api.telegram.org/bot${botToken}/${method}`,{method:'POST',redirect:'error',...(headers?{headers}:{}),body:payload,signal:signal?AbortSignal.any([signal,timeout]):timeout});const text=await response.text();if(text.length>2*1024*1024)throw new Error();value=JSON.parse(text);if(!value||typeof value!=='object'||Array.isArray(value))throw new Error();}catch {throw Object.assign(telegramFailure('Telegram could not confirm this request. Check the connection and retry.',502),{uncertain:method==='sendMessage'||method==='sendPhoto'});}
    if(!response.ok||value.ok!==true)throw Object.assign(telegramFailure(value.error_code===429?'Telegram rate limit reached.':'Telegram rejected this request. Check the bot connection.',502),{rateLimit:value.error_code===429,retryAfter:Math.min(Math.max(Number(value.parameters?.retry_after)||30,1),3600),rejected:true});
    return value.result;
  };
}
