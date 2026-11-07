import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createFolderPicker} from '../server/folder-picker.js';
import {createApp} from '../server/index.js';
import {createStore} from '../server/store.js';
async function fixture(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'mari-picker-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
const desktop={DISPLAY:':synthetic',PATH:'/usr/bin',API_SECRET:'must-not-reach-dialog'};

test('native chooser returns a canonical directory using fixed arguments and a minimal desktop environment',async t=>{
 const root=await fixture(t),selected=path.join(root,'project with spaces');await fs.mkdir(selected);let call;
 const pick=createFolderPicker({platform:'linux',homeDirectory:root,env:desktop,run:async(...args)=>{call=args;return{stdout:selected+'\n'};}});
 assert.deepEqual(await pick(),{path:selected,cancelled:false});assert.equal(call[0],'zenity');assert(call[1].includes('--directory'));assert(call[1].includes('--filename='+root+'/'));assert.equal(call[2].env.API_SECRET,undefined);assert.equal(call[2].env.DISPLAY,':synthetic');assert.equal(call[2].timeout,120000);
});

test('cancel, abort and chooser unavailability have separate outcomes without changing a selected path',async t=>{
 const root=await fixture(t),make=run=>createFolderPicker({platform:'linux',homeDirectory:root,env:desktop,run});
 assert.deepEqual(await make(async()=>{throw Object.assign(new Error('cancel'),{code:1});})(),{cancelled:true});
 const controller=new AbortController();controller.abort();assert.deepEqual(await make(async()=>{throw new Error('Must not run');})({signal:controller.signal}),{cancelled:true});
 await assert.rejects(make(async()=>{throw Object.assign(new Error('missing'),{code:'ENOENT'});})(),e=>e.code==='FOLDER_PICKER_UNAVAILABLE');
 await assert.rejects(createFolderPicker({platform:'linux',env:{},homeDirectory:root})(),e=>e.code==='FOLDER_PICKER_UNAVAILABLE');
});

test('one owned chooser is allowed at a time and invalid initial locations fall back to home',async t=>{
 const root=await fixture(t);let release,started;const ready=new Promise(r=>started=r);
 const pick=createFolderPicker({platform:'linux',homeDirectory:root,env:desktop,run:async(command,args)=>{assert(args.includes('--filename='+root+'/'));started();return new Promise(r=>release=r);}});
 const first=pick({initialPath:'/nonexistent/mari-synthetic-path'});await ready;await assert.rejects(pick(),e=>e.code==='FOLDER_PICKER_ACTIVE');release({stdout:root+'\n'});assert.equal((await first).path,root);
});

test('native picker route is owner/CSRF protected and returns cancellation without a scan or registration',async t=>{
 const root=await fixture(t),store=createStore(path.join(root,'runtime'));let calls=0;
 const app=createApp({store,folderPicker:async()=>{calls++;return{cancelled:true};}}),server=app.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(r=>{server.close(r);server.closeAllConnections();});store.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;const post=(route,body,headers={})=>fetch(origin+route,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await post('/api/directories/pick',{})).status,401);assert.equal(calls,0);
 const session=await post('/api/session',{accessKey:app.locals.accessKey}),cookie=session.headers.get('set-cookie').split(';')[0];const boot=await fetch(origin+'/api/bootstrap',{headers:{Cookie:cookie}}).then(r=>r.json());
 assert.equal((await post('/api/directories/pick',{}, {Cookie:cookie})).status,403);assert.equal(calls,0);
 const result=await post('/api/directories/pick',{}, {Cookie:cookie,'x-mari-csrf':boot.csrfToken});assert.equal(result.status,200);assert.deepEqual(await result.json(),{cancelled:true});assert.equal(calls,1);assert.equal(store.list('projects').length,0);assert.equal(store.list('services').length,0);assert.equal(store.list('jobs').length,0);
});
