import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {canonicalDirectory} from './projects.js';
const execute=promisify(execFile);
const unavailable=()=>Object.assign(new Error('The desktop folder chooser is unavailable. Use the folder browser in Mari.'),{status:503,code:'FOLDER_PICKER_UNAVAILABLE'});

export function createFolderPicker({run=execute,platform=process.platform,env=process.env,homeDirectory=os.homedir()}={}){
 let active=false;
 return async function pickFolder({initialPath,signal}={}){
  if(initialPath!==undefined&&typeof initialPath!=='string')throw Object.assign(new Error('Choose a local folder.'),{status:400,code:'INVALID_DIRECTORY'});
  if(active)throw Object.assign(new Error('A folder chooser is already open. Finish or cancel it first.'),{status:409,code:'FOLDER_PICKER_ACTIVE'});
  if(platform!=='linux'||!(env.DISPLAY||env.WAYLAND_DISPLAY))throw unavailable();
  active=true;
  try {
   const initial=await canonicalDirectory(initialPath?.trim()||homeDirectory).catch(()=>canonicalDirectory(homeDirectory));
   if(signal?.aborted)return{cancelled:true};
   const desktopEnv=Object.fromEntries(Object.entries(env).filter(([key])=>['PATH','HOME','USER','LANG','DISPLAY','WAYLAND_DISPLAY','XAUTHORITY','DBUS_SESSION_BUS_ADDRESS'].includes(key)||/^(LC_|XDG_|GTK_|GDK_)/.test(key)));
   const result=await run('zenity',['--file-selection','--directory','--title=Choose a folder — Mari',`--filename=${initial.endsWith(path.sep)?initial:initial+path.sep}`],{env:desktopEnv,timeout:120000,maxBuffer:65536,signal});
   if(signal?.aborted)return{cancelled:true};
   const value=result.stdout.replace(/\r?\n$/,'');
   if(!value)return{cancelled:true};
   return{path:await canonicalDirectory(value),cancelled:false};
  }catch(error){
   if(signal?.aborted||error.name==='AbortError'||error.code===1&&!error.killed&&!/cannot open display|failed to open display/i.test(error.stderr||''))return{cancelled:true};
   if(error.code==='INVALID_DIRECTORY')throw error;
   throw unavailable();
  }finally{active=false;}
 };
}
