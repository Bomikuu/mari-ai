import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { id,now } from './store.js';
export const MAX_IMAGE_BYTES=25*1024*1024;
export function publicArtifact(artifact) {
 if(!artifact)return null;
 const {path:_path,...record}=artifact;return {...record,url:`/api/artifacts/${artifact.id}/content`};
}
export async function ownedArtifactPath(dataDir,artifact) {
 if(!artifact?.path)throw Object.assign(new Error('Artifact file is unavailable.'),{status:404,code:'ARTIFACT_MISSING'});
 const root=await fs.realpath(path.join(dataDir,'artifacts')).catch(()=>null);
 const candidate=path.resolve(artifact.path);
 const canonical=await fs.realpath(candidate).catch(()=>null);
 if(!root||!canonical||!canonical.startsWith(root+path.sep)||candidate!==canonical)throw Object.assign(new Error('Artifact path is outside owned storage or uses a symbolic link.'),{status:403,code:'ARTIFACT_BOUNDARY'});
 const stat=await fs.lstat(candidate);if(!stat.isFile()||stat.isSymbolicLink())throw Object.assign(new Error('Artifact is not a regular file.'),{status:403,code:'ARTIFACT_BOUNDARY'});
 return candidate;
}
export async function artifactHash(dataDir,artifact) {
 const file=await ownedArtifactPath(dataDir,artifact);
 const stat=await fs.stat(file);if(stat.size>MAX_IMAGE_BYTES)throw Object.assign(new Error('Artifact exceeds 25 MiB.'),{status:400});
 return crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex');
}
export async function importProposal({store,dataDir,task,buffer,page='/',viewport='desktop',notes=''}) {
 if(!Buffer.isBuffer(buffer)||!buffer.length||buffer.length>MAX_IMAGE_BYTES)throw Object.assign(new Error('Import a PNG, JPEG, or WebP image no larger than 25 MiB.'),{status:400,code:'INVALID_IMAGE'});
 if(!task.routes?.includes(page)||!task.viewports?.includes(viewport))throw Object.assign(new Error('Choose a page and viewport belonging to this task.'),{status:400,code:'INVALID_ARTIFACT_SCOPE'});
 let output,meta;
 try {
  const source=sharp(buffer,{limitInputPixels:60000000,failOn:'warning',animated:false});const inputMeta=await source.metadata();
  if(!['png','jpeg','webp'].includes(inputMeta.format))throw new Error('Unsupported image type.');
  output=await source.rotate().png().toBuffer();meta=await sharp(output).metadata();
  if(output.length>MAX_IMAGE_BYTES)throw new Error('Decoded image exceeds 25 MiB.');
 } catch {throw Object.assign(new Error('Image could not be decoded as PNG, JPEG, or WebP.'),{status:400,code:'INVALID_IMAGE'});}
 if(!store.list('artifacts').some((a)=>a.taskId===task.id&&a.kind==='original'&&a.page===page&&a.viewport===viewport))throw Object.assign(new Error('Capture this page and viewport before importing its design.'),{status:409,code:'CAPTURE_REQUIRED'});
 const existing=store.list('artifacts').filter((a)=>a.taskId===task.id&&a.kind==='proposal'&&a.page===page&&a.viewport===viewport);
 const revision=Math.max(0,...existing.map((a)=>a.revision||0))+1;
 const artifactId=id('artifact'),directory=path.join(dataDir,'artifacts',task.id);
 await fs.mkdir(directory,{recursive:true,mode:0o700});
 const filename=path.join(directory,`${artifactId}.png`);await fs.writeFile(filename,output,{flag:'wx',mode:0o600});
 const artifact={id:artifactId,projectId:task.projectId,taskId:task.id,kind:'proposal',revision,page,viewport,path:filename,mime:'image/png',width:meta.width,height:meta.height,sha256:crypto.createHash('sha256').update(output).digest('hex'),title:`Design revision ${revision}`,createdAt:now(),metadata:{source:'manual-chatgpt-handoff',notes:String(notes).slice(0,10000)}};
 store.put('artifacts',artifact);
 store.update('tasks',task.id,{activeArtifactId:artifact.id,approvedArtifactId:null,artifactIds:[...new Set([...(task.artifactIds||[]),artifact.id])],status:'awaiting_approval',phase:'approval',steps:(task.steps||[]).map((step)=>step.id==='design'?{...step,status:'completed',completed:1,total:1}:['approval','implement','verify'].includes(step.id)?{id:step.id,name:step.name||step.id,status:'queued'}:step),lastActivityAt:now(),error:null});
 store.event({source:'agent',projectId:task.projectId,taskId:task.id,type:'artifact.imported',level:'info',message:`Imported design revision ${revision} for ${page} (${viewport}).`,data:{artifactId:artifact.id,revision,page,viewport}});
 return artifact;
}
export function latestProposal(store,artifact) {
 return store.list('artifacts').filter((a)=>a.taskId===artifact.taskId&&a.kind==='proposal'&&a.page===artifact.page&&a.viewport===artifact.viewport).sort((a,b)=>(b.revision||0)-(a.revision||0))[0];
}
