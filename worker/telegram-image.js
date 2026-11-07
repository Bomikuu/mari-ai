import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CodexClient, inspectCodex } from './codex.js';
import { saveImageArtifact } from './capture.js';
import { ensureInside } from '../server/security.js';
import { cleanKnowledgeText } from '../server/knowledge.js';
import { phoneJobAllowed } from '../server/telegram-work.js';
import { now } from '../server/store.js';

export async function runTelegramImage({store,dataDir,job,signal,makeCodex=options=>new CodexClient(options),inspect=inspectCodex,updateCapabilities=()=>{}}) {
  const chat=store.get('agentChats',job.payload?.chatId),profile=job.payload?.agentProfile;
  if(!chat||!store.get('agentMessages',job.payload.replyId))throw new Error('The image conversation was not found.');
  const cancelled=()=>{if(signal?.aborted||store.get('jobs',job.id)?.cancelRequested||!phoneJobAllowed(store,job))throw Object.assign(new Error('Image request cancelled or its phone permission changed.'),{cancelled:true});};
  const activity=(action,currentCommand=null)=>store.update('agents',job.agentId,{phase:'image',action:cleanKnowledgeText(action),currentCommand:currentCommand?cleanKnowledgeText(currentCommand):null,lastActivityAt:now()});
  let client,artifact;
  try {
    cancelled();const native=await inspect();
    if(!native.available||!native.authenticated||!native.supported)throw new Error('Image generation requires the supported Codex CLI signed in through ChatGPT. No API billing fallback is used.');
    const directory=path.join(dataDir,'agent-work',chat.id,'images',job.id);await fs.mkdir(directory,{recursive:true,mode:0o700});
    if(await fs.realpath(directory)!==directory)throw new Error('The image workspace changed unexpectedly.');
    cancelled();store.update('agentMessages',job.payload.replyId,{status:'working'});
    client=makeCodex({store,projectId:job.projectId,taskId:job.taskId,chatId:chat.id,agentId:job.agentId,onActivity:activity,
      executionPolicy:{writableRoot:directory,readRoots:[],webSearch:false}});
    activity('Connecting to subscription image generation.');await client.connect();cancelled();
    store.update('agents',job.agentId,{runtime:'codex',name:profile.name,role:profile.role,portraitId:profile.portraitId,category:profile.category,phase:'image'});
    const result=await client.runTurn({cwd:directory,writableRoots:[directory],signal,
      developerInstructions:'Generate exactly one image using native built-in image generation under the existing ChatGPT subscription. Never use API keys, API-billed providers, paid media, external accounts, shell-based image rendering, SVG, HTML screenshots or placeholder images. No tools that send messages are granted. Do not read project files or private knowledge, edit a website, approve a design, install dependencies, or expand the local sandbox. If native image generation is unavailable or reaches a usage limit, report the actual failure. Return the generated image through the native image-generation tool; no file-copy command is required. The host validates and delivers the image. Any website implementation still requires the separate screenshot, image approval and explicit implementation workflow in Mari.',
      input:[{type:'text',text:`Create one image for this user request:\n\n${job.payload.instruction}`}],
    });
    cancelled();
    if(result.status!=='completed')throw new Error('Native image generation did not complete.');
    const limit=result.images?.find(image=>image.failure?.type==='usageLimitExceeded');
    if(limit)throw Object.assign(new Error('Image generation reached the subscription usage limit. Retry explicitly after the reset.'),{usageLimit:true});
    const image=result.images?.find(image=>image.savedPath&&!image.failure);
    if(!image)throw new Error('Built-in image generation returned no actual image file. Image generation may be unavailable for this signed-in session; inspect the native job in Mari.');
    const source=await fs.realpath(image.savedPath),generated=path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'generated_images');
    let permitted=false;
    for(const root of [directory,generated]){try{ensureInside(root,source);permitted=true;break;}catch{/* Only native generated-image roots are accepted. */}}
    if(!permitted)throw new Error('The native image was outside the permitted generated-image roots.');
    artifact=await saveImageArtifact({store,dataDir,projectId:job.projectId,taskId:job.taskId,sourcePath:source,kind:'telegram_image',title:'Mari generated image',metadata:{source:'native-subscription',threadId:result.threadId,turnId:result.turnId}});
    artifact=store.update('artifacts',artifact.id,{jobId:job.id,chatId:chat.id});cancelled();
    store.db.exec('BEGIN IMMEDIATE');
    try {
      store.update('agentMessages',job.payload.replyId,{content:'Generated your image. The original is saved with this task.',status:'completed',artifactIds:[artifact.id],finishedAt:now()});
      store.update('jobs',job.id,{artifactIds:[artifact.id]});
      store.update('tasks',job.taskId,{status:'completed',phase:'image',artifactIds:[artifact.id],result:'Generated image saved locally and queued for delivery to the paired Telegram chat.',finishedAt:now(),lastActivityAt:now(),error:null});
      store.event({source:'agent',type:'telegram.image.generated',agentId:job.agentId,taskId:job.taskId,chatId:chat.id,projectId:job.projectId,message:'Validated and saved the actual native generated image.',data:{jobId:job.id,artifactId:artifact.id}});
      store.db.exec('COMMIT');
    }catch(error){store.db.exec('ROLLBACK');throw error;}
    updateCapabilities({imageGeneration:'verified'});activity('Saved the generated image for Telegram delivery.');
  } catch(error) {
    if(artifact){store.remove('artifacts',artifact.id);await fs.rm(artifact.path,{force:true});}
    const status=signal?.aborted||error.cancelled?'cancelled':error.usageLimit?'paused':'failed';
    store.update('agentMessages',job.payload.replyId,{status,error:cleanKnowledgeText(error.message),finishedAt:now()});
    throw error;
  } finally {await client?.close();}
}
