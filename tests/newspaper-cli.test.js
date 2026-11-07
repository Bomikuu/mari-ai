import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../server/store.js';
import { newspaperArguments, scheduledNewspaperForce, runDailyNewspaper } from '../scripts/newspaper.js';
import { newspaperDate } from '../server/newspaper.js';

async function fixture(t) {
  const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'mari-newspaper-cli-')),store=createStore(dataDir);
  t.after(async()=>{store.close();await fs.rm(dataDir,{recursive:true,force:true});});return{dataDir,store};
}

test('newspaper CLI flags are explicit and do not accept arbitrary paths/options',()=>{
  assert.deepEqual(newspaperArguments([]),{force:false,scheduled:false});
  assert.deepEqual(newspaperArguments(['--scheduled','--data-dir','/private/mari']),{force:false,scheduled:true,dataDir:'/private/mari'});
  for(const args of [['--data-dir','relative'],['--unknown'],['--force','--scheduled']])assert.throws(()=>newspaperArguments(args));
});

test('scheduled edition refreshes pre-7am drafts once and reuses a post-7am edition',async(t)=>{
  const {store}=await fixture(t),at=new Date('2026-11-06T23:00:00Z');
  assert.throws(()=>scheduledNewspaperForce(store,new Date('2026-11-06T22:59:00Z')),/07:00/);
  assert.equal(scheduledNewspaperForce(store,at),true);
  store.put('settings',{id:'newspaper:edition:early',edition:{id:'early',date:'2026-11-07',generatedAt:'2026-11-06T20:00:00Z'}});
  assert.equal(scheduledNewspaperForce(store,at),true);
  store.put('settings',{id:'newspaper:edition:morning',edition:{id:'morning',date:'2026-11-07',generatedAt:'2026-11-06T23:00:00Z'}});
  assert.equal(scheduledNewspaperForce(store,new Date('2026-11-07T01:00:00Z')),false);
});

test('a saved edition is reusable offline without starting any worker or services',async(t)=>{
  const f=await fixture(t),dir=path.join(f.dataDir,'artifacts');await fs.mkdir(dir);
  const filename=path.join(dir,'saved.pdf');await fs.writeFile(filename,'%PDF-1.7\nSynthetic CLI fixture\n%%EOF');
  f.store.put('artifacts',{id:'pdf',path:filename,mime:'application/pdf'});
  f.store.put('settings',{id:'newspaper:edition:saved',edition:{id:'saved',date:newspaperDate(),generatedAt:new Date().toISOString(),status:'ready',stories:[],pdfArtifact:{id:'pdf'}}});
  const result=await runDailyNewspaper({...f,makeWorker:async()=>{throw new Error('Cached reads must never start a worker');}});
  assert.equal(result.reused,true);assert.equal(result.pdfPath,filename);assert.equal(f.store.list('jobs').length,0);
});

test('a temporary newspaper timeout requests only its own job cancellation and preserves services',async(t)=>{
  const f=await fixture(t);f.store.put('jobs',{id:'unrelated',type:'service.start',status:'queued'});let stopped;
  await assert.rejects(runDailyNewspaper({...f,waitMs:-1,makeWorker:async(options)=>{
    assert.deepEqual(options.jobTypes,['personal.newspaper.generate']);
    f.store.put('workers',{id:'temporary',status:'online',lastHeartbeatAt:new Date().toISOString()});return{stop:async(value)=>{stopped=value;}};
  }}),/bounded wait/);
  assert.deepEqual(stopped,{stopServices:false});assert.equal(f.store.get('jobs','unrelated').status,'queued');
  const own=f.store.list('jobs').find(job=>job.type==='personal.newspaper.generate');assert.equal(own.cancelRequested,true);
});
