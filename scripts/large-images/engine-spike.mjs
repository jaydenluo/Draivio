// Offline spike supervisor. Production must implement this contract in Rust, not ship Node.
import { spawn } from 'node:child_process';
import { rename, rm, stat, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
const identifier=/^[a-zA-Z0-9_-]{1,80}$/;
export function resolveResource(context, raw) {
 const u=new URL(raw);
 if(u.protocol!=='draivio-image:' || u.hostname!==context.session || u.username || u.password || u.port || u.hash || [...u.searchParams.keys()].some(k=>k!=='revision') || u.searchParams.getAll('revision').length!==1) throw Error('unauthorized resource');
 const key=u.pathname.slice(1); if(!identifier.test(key)) throw Error('invalid resource');
 const result=context.resources.get(key); if(!result||result.revision!==u.searchParams.get('revision')) throw Error('stale resource');
 return result;
}
export async function runJob(context, job, signal) {
 if(!identifier.test(job.id)) throw Error('invalid id');
 const source=context.assets.get(job.assetId); if(!source) throw Error('unknown asset');
 const op=job.op; if(!['metadata','thumbnail','region','cache','export'].includes(op)) throw Error('unsupported operation');
 if(job.timeoutMs!==undefined && (!Number.isInteger(job.timeoutMs)||job.timeoutMs<1||job.timeoutMs>120000)) throw Error('timeout budget');
 const suffix=op==='cache'?'.tiff':'.png';
 const destination=path.join(context.outputRoot,job.id+suffix), partial=destination+'.partial';
 const args=[op,source]; if(op!=='metadata') args.push(partial);
 if(op==='thumbnail') { if(!Number.isInteger(job.edge)||job.edge<1||job.edge>4096) throw Error('edge budget'); args.push(String(job.edge)); }
 if(op==='cache') { if(![256,512,1024].includes(job.tileSize)) throw Error('tile budget'); args.push(String(job.tileSize)); }
 if(op==='region') {
  const r=job.region;
  if(!r || !['x','y','width','height'].every(k=>Number.isSafeInteger(r[k])) || r.x<0||r.y<0||r.width<1||r.height<1||r.width*r.height>4194304) throw Error('region budget');
  args.push(...['x','y','width','height'].map(k=>String(r[k])));
 }
 const temporaryRoot=await mkdtemp(path.join(context.outputRoot,job.id+'-tmp-'));
 const start=performance.now(); let reason=signal?.aborted?'cancelled':undefined;
 if(reason) {await rm(temporaryRoot,{recursive:true,force:true}); return {id:job.id,status:reason,metrics:{wallMs:0}};}
 // A private directory per session and unique, never-reused job IDs are caller obligations.
 let child; let stderr='',stdout='',spawnError; let timer;
 const result=await new Promise(resolve=>{
  child=spawn(context.binary,args,{stdio:['ignore','pipe','pipe'],env:{...process.env,TMPDIR:temporaryRoot}});
  const cancel=()=>{ reason??='cancelled'; child.kill('SIGKILL'); };
  signal?.addEventListener('abort',cancel,{once:true});
  timer=setTimeout(()=>{ reason??='timed_out'; child.kill('SIGKILL'); },job.timeoutMs??120000);
  child.stdout.on('data',b=>{if(stdout.length<65536) stdout+=b;}); child.stderr.on('data',b=>{if(stderr.length<65536) stderr+=b;});
  child.once('error',error=>{spawnError=error;stderr+=error.message;});
  child.once('close',(code,killedSignal)=>{ clearTimeout(timer); signal?.removeEventListener('abort',cancel); resolve({code,killedSignal}); });
 });
 await rm(temporaryRoot,{recursive:true,force:true});
 const match=stderr.match(/LI_METRICS (\{[^\n]+\})/); const metrics={wallMs:performance.now()-start,nativeStarted:stderr.includes("LI_STARTED native-operation"),...(match?JSON.parse(match[1]):{})};
 if(reason||result.code!==0) {metrics.partialBytesAtTermination=await stat(partial).then(s=>s.size).catch(()=>0);await rm(partial,{force:true});return {id:job.id,status:reason??(spawnError?'unavailable':'failed'),...result,error:stderr,metrics};}
 if(op==='metadata') return {id:job.id,status:'ready',metadata:JSON.parse(stdout),metrics,...result};
 await rename(partial,destination); return {id:job.id,status:'ready',path:destination,bytes:(await stat(destination)).size,metrics,...result};
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const context={binary:process.env.LI_ENGINE??'/tmp/draivio-engine-spike',outputRoot:process.env.LI_OUTPUT,assets:new Map(Object.entries(JSON.parse(process.env.LI_ASSETS??'{}')))};
 // JSONL inputs are trusted host jobs; paths are supplied out-of-band, never from WebView URLs.
 const jobs=new Map(); const lines=createInterface({input:process.stdin});
 for await(const line of lines) { try {const job=JSON.parse(line);if(job.op==='cancel'){jobs.get(job.id)?.abort();continue;}if(jobs.size>=2||jobs.has(job.id)) throw Error('worker busy or duplicate id');const abort=new AbortController();jobs.set(job.id,abort);process.stdout.write(JSON.stringify({id:job.id,status:'running'})+'\n');runJob(context,job,abort.signal).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(e=>process.stdout.write(JSON.stringify({id:job.id,status:'rejected',error:e.message})+'\n')).finally(()=>jobs.delete(job.id));}catch(e){process.stdout.write(JSON.stringify({status:'rejected',error:e.message})+'\n');} }
}
