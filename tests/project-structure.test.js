import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {discoverProjects,listDirectories} from '../server/discovery.js';
import {detectProjectStructure,registerProject} from '../server/projects.js';
import {createStore} from '../server/store.js';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'mari-structure-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
async function pkg(directory,data){await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'package.json'),JSON.stringify(data));}

test('one workspace owns runnable child services and shared packages, while nested repositories stay separate',async t=>{
 const root=await fixture(t),app=path.join(root,'application');await pkg(app,{name:'workspace',packageManager:'pnpm@10',workspaces:['apps/*','packages/*']});
 await pkg(path.join(app,'apps','web'),{name:'web',devDependencies:{vite:'*'},scripts:{dev:'vite',build:'vite build'}});
 await pkg(path.join(app,'apps','api'),{name:'api',dependencies:{express:'*'},scripts:{start:'node index.js'}});
 await pkg(path.join(app,'packages','shared'),{name:'shared',scripts:{build:'node build.js'}});
 const independent=path.join(app,'example');await pkg(independent,{name:'independent',scripts:{dev:'vite'}});await fs.mkdir(path.join(independent,'.git'));
 const scan=await discoverProjects(root);assert.deepEqual(scan.candidates.map(p=>p.name).sort(),['independent','workspace']);
 const project=scan.candidates.find(p=>p.path===app);assert.equal(project.serviceCandidates.length,2);assert.equal(project.packages.length,1);
 assert.deepEqual(project.suggestions.map(s=>[s.command,path.relative(app,s.cwd)]),[['pnpm run start','apps/api'],['pnpm run dev','apps/web']]);
 assert(!project.suggestions.some(s=>s.cwd===independent));assert.equal(project.packages[0].relativePath,'packages/shared');
});

test('a repository without a root manifest still groups frontend and backend, and unknown commands remain explicit',async t=>{
 const root=await fixture(t),app=path.join(root,'app');await fs.mkdir(path.join(app,'.git'),{recursive:true});
 await pkg(path.join(app,'frontend'),{name:'frontend',scripts:{dev:'vite'},devDependencies:{vite:'*'}});
 await fs.mkdir(path.join(app,'backend'));await fs.writeFile(path.join(app,'backend','requirements.txt'),'fastapi\n');
 const scan=await discoverProjects(root);assert.equal(scan.candidates.length,1);const project=scan.candidates[0];assert.equal(project.path,app);assert.equal(project.serviceCandidates.length,2);
 const backend=project.serviceCandidates.find(s=>s.relativePath==='backend');assert.equal(backend.commands.length,0);assert.equal(backend.needsCommand,true);
});

test('child package-manager declarations win over inherited workspace defaults',async t=>{
 const root=await fixture(t);await pkg(root,{name:'parent',packageManager:'pnpm@10'});await pkg(path.join(root,'web'),{name:'web',packageManager:'bun@1',scripts:{dev:'vite'}});
 const detected=await detectProjectStructure(root);assert.equal(detected.serviceCandidates[0].packageManager,'bun');assert.equal(detected.suggestions[0].command,'bun run dev');
});

test('explicit registration inspects grouped commands but does not create services, jobs or child projects',async t=>{
 const root=await fixture(t),app=path.join(root,'app');await pkg(app,{name:'app'});await pkg(path.join(app,'frontend'),{scripts:{dev:'vite'}});
 const store=createStore(path.join(root,'runtime'));try{const project=await registerProject(store,{path:app});assert.equal(project.suggestions.length,1);assert.equal(project.suggestions[0].cwd,path.join(app,'frontend'));assert.equal(store.list('projects').length,1);assert.equal(store.list('services').length,0);assert.equal(store.list('jobs').length,0);}finally{store.close();}
});

test('an empty folder-browser path opens the default folder instead of requiring typed input',async()=>{
 const result=await listDirectories('');assert(path.isAbsolute(result.path));assert(Array.isArray(result.directories));
});

test('component limit preserves the parent project and reports incomplete service discovery',async t=>{
 const root=await fixture(t);await pkg(root,{name:'many-services'});for(let i=0;i<105;i++)await pkg(path.join(root,'apps','service-'+i),{scripts:{dev:'node server.js'}});
 const scan=await discoverProjects(root);assert.equal(scan.candidates.length,1);assert.equal(scan.candidates[0].serviceCandidates.length,100);assert.equal(scan.counts.detected,1);assert(scan.truncationReasons.includes('component_limit'));assert.equal(scan.truncated,true);
});

test('worktree-style .git files form independent repository boundaries without becoming shared services',async t=>{
 const root=await fixture(t);await pkg(root,{name:'parent'});const nested=path.join(root,'worktree');await pkg(nested,{name:'worktree',scripts:{dev:'node server.js'}});await fs.writeFile(path.join(nested,'.git'),'gitdir: /unavailable/synthetic-worktree\n');
 const scan=await discoverProjects(root);assert.deepEqual(scan.candidates.map(p=>p.name),['parent','worktree']);assert.equal(scan.candidates[0].serviceCandidates.length,0);assert.equal(scan.candidates[1].serviceCandidates.length,1);
});

test('recognized backend frameworks remain service candidates when a startup command must be supplied',async t=>{
 const root=await fixture(t);await pkg(root,{name:'app'});await pkg(path.join(root,'backend'),{name:'backend',dependencies:{express:'*'}});
 const detected=await detectProjectStructure(root);assert.equal(detected.serviceCandidates.length,1);assert.equal(detected.serviceCandidates[0].relativePath,'backend');assert.equal(detected.serviceCandidates[0].needsCommand,true);assert.equal(detected.suggestions.length,0);
});
