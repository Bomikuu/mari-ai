import fs from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { id, now } from './store.js';
import { validateHttpUrl } from './security.js';
import { inspectProjectTree } from './project-structure.js';

const exec = promisify(execFile);
const exists = async (file) => fs.access(file).then(() => true, () => false);
export async function canonicalDirectory(input) {
  if (typeof input !== 'string' || !input.trim() || !path.isAbsolute(input)) throw Object.assign(new Error('Enter an absolute local directory.'), { status: 400, code: 'INVALID_DIRECTORY' });
  const resolved = await fs.realpath(input.trim()).catch(() => null);
  if (!resolved || !(await fs.stat(resolved)).isDirectory()) throw Object.assign(new Error('Directory does not exist.'), { status: 400, code: 'INVALID_DIRECTORY' });
  return resolved;
}
export async function detectProject(directory, { includeGit = true } = {}) {
  const root = await canonicalDirectory(directory);
  const pkg = await fs.readFile(path.join(root, 'package.json'), 'utf8').then((v) => JSON.parse(v)).catch(() => null);
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? Object.fromEntries(Object.entries(pkg.scripts).filter(([k,v]) => typeof v === 'string' && k.length < 100)) : {};
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  let framework = deps.next ? 'Next.js' : deps['@sveltejs/kit'] ? 'SvelteKit' : deps.nuxt ? 'Nuxt' : deps.astro ? 'Astro' : deps.vite ? 'Vite' : deps.react ? 'React' : null;
  let packageManager = null, packageManagerSource = null;
  if (pkg) {
    const preferred = typeof pkg.packageManager === 'string' ? pkg.packageManager.split('@')[0] : '';
    packageManager = ['npm','pnpm','yarn','bun'].includes(preferred) ? preferred : null;
    if (packageManager) packageManagerSource = 'explicit';
    if (!packageManager) {
      for (const [file,manager] of [['pnpm-lock.yaml','pnpm'],['yarn.lock','yarn'],['bun.lock','bun'],['bun.lockb','bun'],['package-lock.json','npm']]) {
        if (await exists(path.join(root,file))) { packageManager = manager; packageManagerSource = 'lockfile'; break; }
      }
    }
    if (!packageManager) { packageManager = 'npm'; packageManagerSource = 'default'; }
  }
  if (!framework && deps.express) framework='Express';
  if (!framework && deps.fastify) framework='Fastify';
  if (!framework && deps['@nestjs/core']) framework='NestJS';
  if (!framework && await exists(path.join(root,'composer.json'))) framework='PHP';
  if (!framework && await exists(path.join(root,'pyproject.toml'))) framework='Python';
  if (!framework && await exists(path.join(root,'requirements.txt'))) framework='Python';
  if (!framework && await exists(path.join(root,'Cargo.toml'))) framework='Rust';
  if (!framework && await exists(path.join(root,'go.mod'))) framework='Go';
  const suggestions = Object.keys(scripts).filter((name) => /^(dev|start|serve)(:|$)/.test(name)).map((name) => ({ name, command: `${packageManager} run ${/^[a-zA-Z0-9:_-]+$/.test(name) ? name : `'${name.replaceAll("'", "'\\''")}'`}`, cwd:root, script:scripts[name] }));
  let git = { available:false, branch:null, dirty:null };
  try {
    if (!includeGit) throw new Error('Git metadata belongs to the project root.');
    const opts={cwd:root,timeout:3000,maxBuffer:512*1024,env:{...process.env,GIT_OPTIONAL_LOCKS:'0'}};
    const branch=(await exec('git',['-c','core.fsmonitor=false','branch','--show-current'],opts)).stdout.trim();
    const status=(await exec('git',['-c','core.fsmonitor=false','status','--porcelain','--untracked-files=normal'],opts)).stdout;
    git={available:true,branch:branch || '(detached)',dirty:status.length>0};
  } catch { /* Missing Git or non-repository remains unknown. */ }
  return { path:root, name:typeof pkg?.name==='string' ? pkg.name : path.basename(root), framework:framework || 'Unknown',packageManager:packageManager || 'Unknown',packageManagerSource,scripts,suggestions,git };
}
export async function detectProjectStructure(directory) {
  const root=await canonicalDirectory(directory),tree=await inspectProjectTree(root,detectProject,{forceRoot:true});
  const project=tree.candidates.find(p=>p.path===root);
  if (!project) throw Object.assign(new Error('Could not inspect the selected project directory.'),{status:400,code:'PROJECT_DETECTION_FAILED'});
  return {...project,structureScan:{scannedDirectories:tree.scannedDirectories,truncated:tree.truncated,truncationReasons:tree.truncationReasons,structureVersion:tree.structureVersion}};
}
export async function registerProject(store, input) {
  const detected=await detectProjectStructure(input.path);
  const existing=store.list('projects').find((p)=>p.path===detected.path);
  if(existing) return existing;
  const project={...detected,id:id('project'),name:typeof input.name==='string' && input.name.trim()?input.name.trim().slice(0,150):detected.name,designBrief:'',createdAt:now(),updatedAt:now()};
  store.put('projects',project);
  if(!store.get('settings','app')?.selectedProjectId)store.put('settings',{id:'app',selectedProjectId:project.id});
  store.event({source:'system',projectId:project.id,type:'project.registered',level:'info',message:`Registered ${project.name}.`});
  return project;
}
export async function serviceConfig(project,input,previous=null) {
  const allowed=['name','command','cwd','envFile','url','required'];
  const config=Object.fromEntries(allowed.filter((k)=>input[k]!==undefined).map((k)=>[k,input[k]]));
  const next={...previous,...config};
  if(typeof next.command!=='string'||!next.command.trim()||next.command.length>4000)throw Object.assign(new Error('A startup command is required (maximum 4,000 characters).'),{status:400,code:'INVALID_COMMAND'});
  next.command=next.command.trim();
  next.name=typeof next.name==='string'&&next.name.trim()?next.name.trim().slice(0,120):'Development service';
  next.cwd=await canonicalDirectory(next.cwd||project.path);
  if(next.envFile!=null&&typeof next.envFile!=='string')throw Object.assign(new Error('Environment file location must be a path.'),{status:400,code:'INVALID_ENV_FILE'});
  next.envFile=next.envFile?path.resolve(next.cwd,next.envFile):null;
  if(next.envFile) {
    if(typeof input.envFile!=='string' && input.envFile!==undefined) throw Object.assign(new Error('Environment file location must be a path.'),{status:400});
    const stat=await fs.stat(next.envFile).catch(()=>null);
    if(!stat?.isFile())throw Object.assign(new Error('Environment file does not exist. Only its location is saved.'),{status:400,code:'INVALID_ENV_FILE'});
  }
  if(next.url) {
    if(typeof next.url!=='string')throw Object.assign(new Error('Expected URL must be text.'),{status:400,code:'INVALID_URL'});
    try{validateHttpUrl(next.url);}catch(e){throw Object.assign(e,{status:400,code:'INVALID_URL'});}
    const u=new URL(next.url);
    if(u.username||u.password)throw Object.assign(new Error('URLs cannot contain credentials.'),{status:400,code:'INVALID_URL'});
    next.url=u.href.replace(/\/$/,''); next.port=Number(u.port||(u.protocol==='https:'?443:80));
  } else {next.url=null;next.port=null;}
  next.required=next.required!==false;
  const version=(previous?.configVersion||0)+1;
  return {...next,id:previous?.id||id('service'),projectId:project.id,configVersion:version,confirmedVersion:previous?.confirmedVersion||0,status:previous?.status||'stopped',ownership:previous?.ownership||'none',pid:previous?.pid||null,createdAt:previous?.createdAt||now(),updatedAt:now()};
}
export async function probeExternalServices(store,projectId) {
  const result=[];
  for(const service of store.list('services').filter((s)=>s.projectId===projectId)) {
    if(service.ownership==='managed'||!service.url){result.push(service);continue;}
    let reachable=false;
    try {const response=await fetch(service.url,{signal:AbortSignal.timeout(1800),redirect:'manual'});reachable=response.status>=200&&response.status<400;await response.body?.cancel();} catch {}
    const patched=store.update('services',service.id,{status:reachable?'running':'stopped',ownership:reachable?'external':'none',lastProbeAt:now()});result.push(patched);
  }
  return result;
}
