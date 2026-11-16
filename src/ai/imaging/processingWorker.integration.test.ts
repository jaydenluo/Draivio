import {afterAll,beforeAll,expect,it,vi} from 'vitest'
import {Worker as NodeWorker} from 'node:worker_threads'
import {mkdtemp,mkdir,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {build} from 'rolldown'
import {processRaster} from './processingScheduler'
import {solidImage} from '../../engine/raster/composite'
let directory:string,workerUrl:string,created=0,terminated=0
// Runs the actual bundled browser Worker module on a separate OS thread, with
// only the Worker transport bridged. Compositor/scheduler are never mocked.
class ThreadBridge {
 onmessage:((event:{data:unknown})=>void)|null=null
 onerror:(()=>void)|null=null
 thread:NodeWorker
 constructor(){
  created++
  this.thread=new NodeWorker(`const {parentPort}=require('node:worker_threads');globalThis.self=globalThis;globalThis.postMessage=(data,options)=>parentPort.postMessage(data,options?.transfer);import(${JSON.stringify(workerUrl)}).then(()=>{parentPort.on('message',data=>self.onmessage({data}))});`,{eval:true})
  this.thread.on('message',data=>this.onmessage?.({data}))
  this.thread.on('error',()=>this.onerror?.())
 }
 postMessage(value:unknown){this.thread.postMessage(value)}
 terminate(){terminated++;void this.thread.terminate()}
}
beforeAll(async()=>{
 directory=await mkdtemp(join(tmpdir(),'draivio-raster-worker-'))
 const bundle=await build({input:join(process.cwd(),'src/ai/imaging/processingWorker.ts'),write:false,output:{format:'esm'}})
 const file=join(directory,'worker.mjs');await writeFile(file,bundle.output[0].code);workerUrl=pathToFileURL(file).href
 vi.stubGlobal('Worker',ThreadBridge)
})
afterAll(async()=>{vi.unstubAllGlobals();if(directory)await rm(directory,{recursive:true,force:true})})
it('runs real worker pixels, transfers result and preserves caller buffers',async()=>{
 const input=solidImage(128,64,[18,45,99,255]),before=input.data.slice(),prior=created
 const result=await processRaster({width:128,height:64,layers:[{image:input}]})
 expect(created).toBe(prior+1);expect(Array.from(result.image.data)).toEqual(Array.from(before));expect(input.data).toEqual(before)
 expect(result.workerMaxTaskMs).toBeGreaterThan(0);expect(terminated).toBe(created)
})
it('terminates a running worker on progress cancellation and publishes no result',async()=>{
 const controller=new AbortController(),input=solidImage(2048,2048,[18,45,99,255])
 await expect(processRaster({width:2048,height:2048,layers:[{image:input}]},{chunkRows:8,signal:controller.signal,onProgress:x=>{if(x>0)controller.abort()}})).rejects.toMatchObject({name:'AbortError'})
 expect(terminated).toBe(created);expect(input.data.byteLength).toBe(2048*2048*4)
})

it('measures seven consecutive fresh-worker 2048 previews including startup and structured clone',async()=>{
 const input=solidImage(2048,2048,[20,30,40,255]),samples=[]
 for(let i=0;i<7;i++){
  const result=await processRaster({width:2048,height:2048,layers:[{image:input}]})
  samples.push({elapsedMs:result.elapsedMs,maxMainTaskMs:result.maxTaskMs,maxWorkerTaskMs:result.workerMaxTaskMs,trackedPixelPeakBytes:result.peakBytes})
  result.image.data.fill(0)
 }
 const sorted=samples.map(s=>s.elapsedMs).sort((a,b)=>a-b),p50=sorted[3],p95=sorted[6],maxMainTaskMs=Math.max(...samples.map(s=>s.maxMainTaskMs))
 const report={samples,p50,p95,maxMainTaskMs,transport:'Real bundled module worker on Node worker_threads; source clone + startup + output transfer included; no fake pixels/backend.',input:{width:2048,height:2048,layers:1},caveat:'Real separate OS threads with a transport bridge, not a claim of browser GPU/desktop end-to-end timing.'}
 if(process.env.PERFORMANCE_EVIDENCE_DIR){await mkdir(process.env.PERFORMANCE_EVIDENCE_DIR,{recursive:true});await writeFile(`${process.env.PERFORMANCE_EVIDENCE_DIR}/worker-benchmark.json`,JSON.stringify(report,null,2)+'\n')}
 console.info(JSON.stringify(report));expect(p95).toBeLessThanOrEqual(300);expect(maxMainTaskMs).toBeLessThanOrEqual(50);expect(terminated).toBe(created)
},15000)
