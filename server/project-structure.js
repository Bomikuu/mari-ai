import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const SKIP=new Set(['node_modules','dist','build','venv','vendor','target','coverage','__pycache__']);
const MARKERS=new Set(['package.json','pyproject.toml','requirements.txt','Cargo.toml','go.mod','composer.json','pnpm-workspace.yaml','lerna.json','nx.json','turbo.json']);
export const PROJECT_SCAN_LIMITS={maxDepth:3,maxDirectories:500,maxCandidates:100,maxComponents:100};
export const withinDirectory=(root,directory)=>directory===root||directory.startsWith(root.endsWith(path.sep)?root:root+path.sep);
async function mapLimited(items,operation){let next=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(4,items.length)},async()=>{while(next<items.length){const index=next++;result[index]=await operation(items[index]);}}));return result;}

// Directory identity is bounded by the chosen root. No ancestor configuration,
// symlink targets, dependency trees or application commands are inspected.
export async function inspectProjectTree(root,detect,{forceRoot=false}={}){
 const queue=[{directory:root,depth:0}],nodes=[],errors=[],reasons=new Set();let scannedDirectories=0;
 while(queue.length){
  const {directory,depth}=queue.shift();scannedDirectories++;let entries;
  try{const canonical=await fs.realpath(directory);if(!withinDirectory(root,canonical)||canonical!==directory)throw new Error();entries=(await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name));}
  catch(error){errors.push({path:directory,code:error.code||'READ_FAILED',message:'Could not read this directory.'});continue;}
  const markers=entries.filter(e=>e.isFile()&&!e.isSymbolicLink()&&MARKERS.has(e.name)).map(e=>e.name);
  const repository=entries.some(e=>e.name==='.git'&&!e.isSymbolicLink()&&(e.isDirectory()||e.isFile()));
  if(markers.length||repository||forceRoot&&directory===root)nodes.push({path:directory,markers,repository,members:[]});
  for(const entry of entries){
   if(!entry.isDirectory()||entry.isSymbolicLink()||entry.name.startsWith('.')||SKIP.has(entry.name))continue;
   if(depth>=PROJECT_SCAN_LIMITS.maxDepth){reasons.add('depth_limit');continue;}
   if(scannedDirectories+queue.length>=PROJECT_SCAN_LIMITS.maxDirectories){reasons.add('directory_limit');continue;}
   queue.push({directory:path.join(directory,entry.name),depth:depth+1});
  }
 }
 const groups=[];
 for(const node of nodes){
  const parent=groups.filter(g=>g.path!==node.path&&withinDirectory(g.path,node.path)).sort((a,b)=>b.path.length-a.path.length)[0];
  if(node.repository||!parent)groups.push(node);else parent.members.push(node);
 }
 if(groups.length>PROJECT_SCAN_LIMITS.maxCandidates)reasons.add('candidate_limit');
 let remaining=PROJECT_SCAN_LIMITS.maxComponents;
 const selected=groups.slice(0,PROJECT_SCAN_LIMITS.maxCandidates).map(g=>{const members=g.members.slice(0,remaining);remaining-=members.length;if(members.length<g.members.length)reasons.add('component_limit');return {...g,members};});
 const read=async(node,includeGit)=>{try{const meta=await detect(node.path,{includeGit});if(meta.path!==node.path||!withinDirectory(root,meta.path))throw new Error();return {...meta,markers:node.markers};}catch(error){errors.push({path:node.path,code:error.code||'DETECTION_FAILED',message:'Could not read project metadata.'});return{path:node.path,name:path.basename(node.path),framework:'Unknown',packageManager:'Unknown',suggestions:[],scripts:{},git:{available:false,branch:null,dirty:null},markers:node.markers};}};
 const candidates=await mapLimited(selected,async group=>{
  const project=await read(group,true),children=await mapLimited(group.members,node=>read(node,false));
  const serviceCandidates=[],packages=[],suggestions=[];
  for(const component of [project,...children]){
   const relativePath=path.relative(project.path,component.path)||'.';
   const inherited=relativePath!=='.'&&component.packageManagerSource==='default'&&['npm','pnpm','yarn','bun'].includes(project.packageManager);
   const manager=inherited?project.packageManager:component.packageManager;
   const commands=(component.suggestions||[]).map(s=>{
    const command=inherited?s.command.replace(/^npm run /,`${manager} run `):s.command;
    const id='suggestion_'+createHash('sha256').update(JSON.stringify([component.path,command])).digest('hex').slice(0,24);
    return {...s,id,name:`${relativePath==='.'?'Root':relativePath} · ${s.name}`,command,cwd:component.path,relativePath};
   });
   const record={name:relativePath==='.'?'Root':path.basename(component.path),packageName:component.name,path:component.path,relativePath,framework:component.framework,packageManager:manager,markers:component.markers,commands};
   if(commands.length||['Python','Rust','Go','PHP','Laravel','Express','Fastify','NestJS'].includes(component.framework)){
    serviceCandidates.push({...record,needsCommand:commands.length===0});suggestions.push(...commands);
   }else if(relativePath!=='.')packages.push(record);
  }
  const frameworks=[...new Set(children.map(c=>c.framework).filter(f=>f&&f!=='Unknown'))];
  const managers=[...new Set(children.map(c=>c.packageManager).filter(m=>m&&m!=='Unknown'))];
  return {...project,framework:project.framework==='Unknown'&&frameworks.length?(frameworks.length===1?frameworks[0]:'Multi-service'):project.framework,
   packageManager:project.packageManager==='Unknown'&&managers.length?(managers.length===1?managers[0]:'Mixed'):project.packageManager,
   repositoryRoot:group.repository,serviceCandidates,packages,suggestions};
 });
 return {root,candidates,scannedDirectories,detected:groups.length,errors,truncated:reasons.size>0,truncationReasons:[...reasons],structureVersion:2,...PROJECT_SCAN_LIMITS};
}
