import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { ownedArtifactPath, MAX_IMAGE_BYTES } from '../server/artifacts.js';

export async function telegramPhoto({ store, dataDir, delivery }) {
  try {
    const artifact=store.get('artifacts',delivery.artifactId),job=store.get('jobs',delivery.sourceJobId);
    if(!artifact||artifact.kind!=='telegram_image'||artifact.jobId!==job?.id||artifact.chatId!==job?.payload?.chatId
      ||(artifact.projectId||null)!==(delivery.projectId||null))throw new Error();
    const file=await ownedArtifactPath(dataDir,artifact),handle=await fs.open(file,constants.O_RDONLY|constants.O_NOFOLLOW);
    let buffer;
    try {const stat=await handle.stat();if(!stat.isFile()||!stat.size||stat.size>MAX_IMAGE_BYTES)throw new Error();buffer=await handle.readFile();}
    finally {await handle.close();}
    if(createHash('sha256').update(buffer).digest('hex')!==artifact.sha256)throw new Error();
    // Upload a bounded photo; keep the original validated artifact unchanged.
    const photo=await sharp(buffer,{limitInputPixels:60_000_000,failOn:'warning'}).rotate()
      .resize({width:2048,height:2048,fit:'inside',withoutEnlargement:true}).jpeg({quality:90}).toBuffer();
    if(photo.length>10*1024*1024)throw new Error();
    return new Blob([photo],{type:'image/jpeg'});
  } catch {throw Object.assign(new Error('The saved image could not be verified for upload. Inspect it in Mari.'),{rejected:true,localFailure:true});}
}
