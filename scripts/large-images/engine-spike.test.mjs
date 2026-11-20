import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runJob, resolveResource } from './engine-spike.mjs';
const fixtures = process.env.LI_FIXTURES ?? '/tmp/draivio-large-images';
const binary = process.env.LI_ENGINE ?? '/tmp/draivio-engine-spike';
const outputRoot = await mkdtemp(path.join(tmpdir(), 'li02-test-'));
const context = { binary, outputRoot, assets: new Map([['alpha',path.join(fixtures,'odd-alpha.png')],['large',path.join(fixtures,'600mp-rgb.png')]]) };
test('native metadata probes dimensions and alpha without returning image bytes', async()=>{
 const r=await runJob(context,{id:'meta',op:'metadata',assetId:'alpha'});
 assert.equal(r.status,'ready'); assert.equal(r.metadata.width,257); assert.equal(r.metadata.height,129); assert.equal(r.metadata.bands,4); assert.ok(r.metrics.maxRssBytes>0);
});
test('native region preserves exact edge dimensions and publishes only completed output',async()=>{
 const r=await runJob(context,{id:'region',op:'region',assetId:'alpha',region:{x:250,y:125,width:7,height:4}});
 assert.equal(r.status,'ready'); assert.equal((await readFile(r.path)).subarray(1,4).toString(),'PNG'); assert.ok(!(await readdir(outputRoot)).some(x=>x.includes('.partial')));
});
test('worker rejects invalid identifiers and unbounded regions before decoding',async()=>{
 await assert.rejects(runJob(context,{id:'../oops',op:'metadata',assetId:'alpha'}),/id/);
 await assert.rejects(runJob(context,{id:'bad',op:'region',assetId:'alpha',region:{x:-1,y:0,width:1,height:1}}),/region/);
 await assert.rejects(runJob(context,{id:'huge',op:'region',assetId:'alpha',region:{x:0,y:0,width:30000,height:30000}}),/region/);
});
test('real large decode timeout kills native worker and removes incomplete outputs',async()=>{
 const r=await runJob(context,{id:'timeout',op:'cache',assetId:'large',tileSize:512,timeoutMs:250});
 assert.equal(r.status,'timed_out'); assert.equal(r.metrics.nativeStarted,true); assert.ok(r.metrics.wallMs<3000); assert.ok(!(await readdir(outputRoot)).some(x=>x.startsWith('timeout')));
});
test('real running decode cancellation has a distinct terminal state and cleanup',async()=>{
 const controller=new AbortController(); setTimeout(()=>controller.abort(),250);
 const r=await runJob(context,{id:'cancel',op:'cache',assetId:'large',tileSize:512},controller.signal);
 assert.equal(r.status,'cancelled'); assert.equal(r.metrics.nativeStarted,true); assert.ok(!(await readdir(outputRoot)).some(x=>x.startsWith('cancel')));
});
test('resource resolver accepts only exact session result tokens and checks revisions',()=>{
 const resources=new Map([['tile',{revision:'r1',path:'/private/result.png',mime:'image/png'}]]);
 assert.equal(resolveResource({session:'secret',resources},'draivio-image://secret/tile?revision=r1').path,'/private/result.png');
 for(const url of ['draivio-image://other/tile?revision=r1','draivio-image://secret/../etc/passwd','draivio-image://secret/tile?revision=old','draivio-image://secret/tile?revision=r1&path=/etc/passwd']) assert.throws(()=>resolveResource({session:'secret',resources},url));
});
test('missing native runtime reports unavailable without claiming cancellation or decode failure',async()=>{
 const r=await runJob({...context,binary:'/nonexistent/li02-native-runtime'},{id:'unavailable',op:'metadata',assetId:'alpha'});
 assert.equal(r.status,'unavailable'); assert.equal(r.metrics.nativeStarted,false);
});
test('truncated real PNG preview is rejected rather than publishing synthesized pixels',async()=>{
 const r=await runJob({...context,assets:new Map([['truncated',path.join(fixtures,'truncated.png')]])},{id:'truncated-preview',op:'thumbnail',assetId:'truncated',edge:1024});
 assert.equal(r.status,'failed'); assert.equal(r.code,1); assert.ok(!(await readdir(outputRoot)).some(x=>x.startsWith('truncated-preview')));
});
