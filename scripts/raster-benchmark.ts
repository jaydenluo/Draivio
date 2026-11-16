import {cpus,platform,release,arch} from 'node:os'
import {processRaster,disposeRaster,processingLimit} from '../src/ai/imaging/processingScheduler'
import {solidImage} from '../src/engine/raster/composite'
const gc=()=>globalThis.gc?.()
const samples=[] as {elapsedMs:number;maxTaskMs:number;peakBytes:number}[]
const memoryStart=process.memoryUsage();let memoryPeak=memoryStart
const runs=process.argv.includes('--cold')?1:23
for(let i=0;i<runs;i++){
 const image=solidImage(2048,2048,[20,30,40,255])
 const result=await processRaster({width:2048,height:2048,layers:[{image}]},{execution:'cooperative'})
 const memory=process.memoryUsage();if(memory.rss>memoryPeak.rss)memoryPeak=memory
 if(runs===1||i>=3)samples.push({elapsedMs:result.elapsedMs,maxTaskMs:result.maxTaskMs,peakBytes:result.peakBytes})
 disposeRaster(result.image)
 image.data.fill(0)
 gc()
}
const controller=new AbortController(),cancelImage=solidImage(2048,2048,[20,30,40,255]);let cancelStart=0,cancelLatencyMs=0
try{await processRaster({width:2048,height:2048,layers:[{image:cancelImage}]},{execution:'cooperative',chunkRows:8,signal:controller.signal,onProgress:f=>{if(f>0){cancelStart=performance.now();controller.abort()}}})}catch(error){if(!(error instanceof DOMException)||error.name!=='AbortError')throw error;cancelLatencyMs=performance.now()-cancelStart}
const sorted=samples.map(s=>s.elapsedMs).sort((a,b)=>a-b)
console.log(JSON.stringify({referenceDevice:{cpu:cpus()[0].model,cores:cpus().length,platform:platform(),osRelease:release(),arch:arch(),runtime:process.version},input:{width:2048,height:2048,layers:1,blendMode:'normal',alpha:255},warmupRuns:runs===1?0:3,samples,p50:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.ceil(sorted.length*.95)-1],maxTaskMs:Math.max(...samples.map(s=>s.maxTaskMs)),trackedPixelPeakBytes:Math.max(...samples.map(s=>s.peakBytes)),processMemory:{start:memoryStart,peakSampled:memoryPeak},cancelLatencyMs,limit8192:processingLimit(8192,8192)}))
