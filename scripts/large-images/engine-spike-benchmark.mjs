import { spawnSync } from 'node:child_process';
import { runJob } from './engine-spike.mjs';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
const root=process.env.LI_FIXTURES??'/tmp/draivio-large-images';
const outputRoot=process.env.LI_OUTPUT??'/tmp/draivio-engine-results'; await mkdir(outputRoot,{recursive:true});
const manifest=JSON.parse(await readFile(path.join(root,'manifest.json'),'utf8'));
const assets=new Map(manifest.fixtures.map(f=>[f.id,path.join(root,f.path)]));
const context={binary:process.env.LI_ENGINE??'/tmp/draivio-engine-spike',outputRoot,assets};
const report={schemaVersion:1,completed:false,date:new Date().toISOString(),host:{platform:os.platform(),arch:os.arch(),release:os.release(),cpus:os.cpus()[0]?.model,totalMemory:os.totalmem()},measurement:'native C libvips API in isolated process; wall includes spawn; native includes vips initialization; RSS native getrusage; warm filesystem unspecified; one sample, no first paint',results:[]};
const destination='docs/verification/large-images/engine-spike-results.json';
const save=()=>writeFile(destination,JSON.stringify(report,null,2)+'\n');
await save();
let sequence=0;
async function measure(assetId,op,options={},expectedStatuses=['ready']) {const job={id:`job-${++sequence}`,assetId,op,...options};const result=await runJob(context,job);report.results.push({assetId,op,...options,expectedStatuses,...result});await save();if(!expectedStatuses.includes(result.status)||(result.status==='failed'&&![1,65].includes(result.code))) throw Error(`unexpected ${assetId} ${op}: ${result.status} code ${result.code}`);process.stderr.write(`${assetId} ${op} ${result.status} ${result.metrics.wallMs.toFixed(1)}ms\n`);return result;}
for(const f of manifest.fixtures) {
 await measure(f.id,'metadata',{},f.expected==='success'?['ready']:['ready','failed']);
 await measure(f.id,'thumbnail',{edge:1024},f.expected==='success'?['ready']:['failed']);
}
for(const id of ['baseline-icc-exif','progressive','8mp-alpha','32mp-rgb','100mp-gray','200mb-gray','300mp-alpha','600mp-rgb']) {
 for(const tileSize of [256,512,1024]) {
  const cache=await measure(id,'cache',{tileSize}); if(cache.status!=='ready') continue;
  const cacheId=`${id}-${tileSize}`;assets.set(cacheId,cache.path);
  await measure(cacheId,'metadata');
  const f=manifest.fixtures.find(f=>f.id===id);
  for(const region of [{x:0,y:0,width:256,height:256},{x:f.width-129,y:f.height-65,width:129,height:65}]) await measure(cacheId,'region',{region});
 }
}
for(const id of ['odd-alpha','gray16','striped-small','baseline-icc-exif','progressive']) {
 await measure(id,'region',{region:{x:3,y:5,width:97,height:61}});
 await measure(id,'export');
 const source=assets.get(id);report.results.push({assetId:id,op:'source-sha256-after',sha256:createHash('sha256').update(await readFile(source)).digest('hex'),bytes:(await stat(source)).size});
}
const loop=spawnSync(context.binary,['metadata-loop',assets.get('odd-alpha')],{encoding:'utf8'});
report.nativeFfiLoop={iterations:100,exitCode:loop.status,stdout:loop.stdout,stderr:loop.stderr};
for(let n=0;n<10;n++) await measure('odd-alpha','metadata',{overheadSample:n});
if(loop.status!==0) throw Error('native FFI loop failed');
report.completed=true;await save();
