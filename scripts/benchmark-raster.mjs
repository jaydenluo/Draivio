import {build} from 'rolldown'
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {execFileSync} from 'node:child_process'
const directory=await mkdtemp(join(tmpdir(),'draivio-raster-bench-'))
try{
 const bundle=await build({input:resolve('scripts/raster-benchmark.ts'),platform:'node',write:false,output:{format:'esm'}})
 const file=join(directory,'benchmark.mjs');await writeFile(file,bundle.output[0].code)
 const run=args=>JSON.parse(execFileSync(process.execPath,['--expose-gc',file,...args],{encoding:'utf8'}))
 const cold=Array.from({length:5},()=>run(['--cold'])),warm=run([])
 const coldSamples=cold.map(x=>x.samples[0].elapsedMs).sort((a,b)=>a-b)
 const report={createdAt:new Date().toISOString(),command:'node scripts/benchmark-raster.mjs',method:'5 fresh Node processes (no discarded cold samples); 3 warmup + 20 consecutive warm samples; source creation excluded, output allocation and yields included. All samples retained. Cooperative fallback executes on the measured main thread.',referenceDevice:warm.referenceDevice,input:warm.input,cold:{runs:cold,p50:coldSamples[2],p95:coldSamples[4]},warm,limits:{previewMs:300,mainThreadTaskMs:50},passed:cold.every(x=>x.p95<=300&&x.maxTaskMs<=50)&&warm.p95<=300&&warm.maxTaskMs<=50,memoryCaveat:'trackedPixelPeakBytes counts input/output typed arrays; sampled process RSS includes Node runtime and is not a GPU/browser memory measure.'}
 await mkdir('docs/evidence/performance',{recursive:true});await writeFile('docs/evidence/performance/benchmark.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify({passed:report.passed,referenceDevice:report.referenceDevice,coldP50:report.cold.p50,coldP95:report.cold.p95,warmP50:warm.p50,warmP95:warm.p95,maxTaskMs:Math.max(warm.maxTaskMs,...cold.map(x=>x.maxTaskMs)),pixelPeakBytes:warm.trackedPixelPeakBytes,sampledPeakRss:warm.processMemory.peakSampled.rss,cancelLatencyMs:warm.cancelLatencyMs},null,2))
 if(!report.passed)process.exitCode=1
}finally{await rm(directory,{recursive:true,force:true})}
