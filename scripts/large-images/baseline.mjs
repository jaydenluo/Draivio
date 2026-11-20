import { readFile, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';

export async function validateManifest(manifest, root) {
  const errors = [], seen = new Set();
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fixtures) || !manifest.fixtures.length) return {valid:false,errors:['Unsupported or empty manifest']};
  const base = await realpath(root);
  for (const entry of manifest.fixtures) {
    try {
      if (!entry.id || seen.has(entry.id)) throw Error('Missing/duplicate id');
      seen.add(entry.id);
      if (!entry.path || isAbsolute(entry.path)) throw Error('Relative path required');
      const file = await realpath(resolve(base,entry.path)), rel = relative(base,file);
      if (rel.startsWith('..') || isAbsolute(rel)) throw Error('Path escapes fixture root');
      if (!['success','decode_error'].includes(entry.expected) || !entry.source || !entry.format) throw Error('Missing provenance/format/expected');
      if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 1 || !/^[a-f0-9]{64}$/.test(entry.sha256)) throw Error('Invalid bytes/SHA256');
      if (entry.expected === 'success' && (!Number.isSafeInteger(entry.width) || entry.width < 1 || !Number.isSafeInteger(entry.height) || entry.height < 1 || !entry.depth)) throw Error('Missing image metadata');
      if ((await stat(file)).size !== entry.bytes) throw Error('Byte count mismatch');
      const hash=createHash('sha256'); for await (const chunk of createReadStream(file)) hash.update(chunk);
      if (hash.digest('hex') !== entry.sha256) throw Error('SHA256 mismatch');
    } catch(error) { errors.push({id:entry.id,error:error.message}); }
  }
  return {valid:errors.length===0,errors};
}
export function summarize(rows) {
  const times=rows.filter(r=>r.outcome==='passed' && Number.isFinite(r.ms)).map(r=>r.ms).sort((a,b)=>a-b);
  const percentile=p=>times.length ? times[Math.ceil(p*times.length)-1] : null;
  return {attempts:rows.length,passed:rows.filter(r=>r.outcome==='passed').length,failed:rows.filter(r=>r.outcome==='failed').length,not_run:rows.filter(r=>r.outcome==='not_run').length,p50Ms:percentile(.5),p95Ms:percentile(.95),maxMs:times.at(-1)??null};
}
export function runCommand(command,args,{timeoutMs=30000,expectedFailure=false}={}) {
  return new Promise(resolveResult=>{
    const start=performance.now(); let stdout='',stderr='',timedOut=false,spawnError=null;
    const child=spawn(command,args,{stdio:['ignore','pipe','pipe']});
    // Retain bounded diagnostic output; continue draining to avoid child deadlocks.
    child.stdout.on('data',d=>{if(stdout.length<65536)stdout+=d.toString().slice(0,65536-stdout.length);});
    child.stderr.on('data',d=>{if(stderr.length<65536)stderr+=d.toString().slice(0,65536-stderr.length);});
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeoutMs);
    child.on('error',e=>{spawnError=e.message;});
    child.on('close',(exitCode,signal)=>{clearTimeout(timer);resolveResult({outcome:!timedOut&&!spawnError&&(expectedFailure?exitCode!==null&&exitCode!==0:exitCode===0)?'passed':'failed',ms:performance.now()-start,exitCode,signal,timedOut,stdout,stderr,...(spawnError?{error:spawnError}:{})});});
  });
}
export function interpretProbe(result,fixture,stage) {
  let probe;try {probe=JSON.parse(result.stdout);}catch{return {outcome:'failed',error:'Probe returned invalid JSON'};}
  if(result.timedOut||result.error||!['passed','failed','not_run'].includes(probe.outcome))return {...probe,outcome:'failed',error:'Probe infrastructure failed'};
  if(fixture.expected==='decode_error'){
    const expectedRejection=result.exitCode===2&&probe.outcome==='failed'&&probe.errorKind==='decode_rejected';
    const acceptedHeader=stage==='inspect'&&result.exitCode===0&&probe.outcome==='passed';
    return {...probe,outcome:expectedRejection||acceptedHeader?'passed':'failed',expectedRejection,validationScope:stage==='inspect'?'header only; successful header inspection does not validate image payload':'full decode must reject malformed input'};
  }
  if(result.exitCode!==0)return {...probe,outcome:'failed'};
  if(probe.metadata&&(probe.metadata.width!==fixture.width||probe.metadata.height!==fixture.height||probe.metadata.format!==fixture.format))return {...probe,outcome:'failed',error:'Metadata differs from manifest'};
  return probe;
}
