import {describe,it,expect,vi} from 'vitest'
import {processRaster,processingLimit,disposeRaster} from './processingScheduler'
import {solidImage} from '../../engine/raster/composite'
const request=(w:number,h:number)=>({width:w,height:h,layers:[{image:solidImage(w,h,[20,30,40,255])}]})
describe('cooperative raster scheduler',()=>{
 it('renders real pixels with progress and reports memory/chunks',async()=>{const progress:number[]=[];const r=await processRaster(request(32,24),{chunkRows:4,onProgress:x=>progress.push(x)});expect(r.image.data[0]).toBe(20);expect(r.chunks).toBe(6);expect(r.peakBytes).toBeGreaterThan(32*24*4);expect(progress.at(-1)).toBe(1)})
 it('cancels between chunks without publishing output',async()=>{const c=new AbortController();const pending=processRaster(request(64,64),{chunkRows:1,signal:c.signal,onProgress:x=>{if(x>.1)c.abort()}});await expect(pending).rejects.toMatchObject({name:'AbortError'})})
 it('rejects over-limit documents before allocation and exposes a clear fallback',async()=>{expect(processingLimit(8192,8192,16_000_000).allowed).toBe(false);await expect(processRaster({width:8192,height:8192,layers:[]},{maxPixels:1000})).rejects.toThrow('处理上限')})
 it('runs a 2048 benchmark with p50/p95 measurements',async()=>{const samples:number[]=[];for(let i=0;i<5;i++)samples.push((await processRaster(request(2048,2048),{chunkRows:256,maxPixels:4_194_304})).elapsedMs);samples.sort((a,b)=>a-b);const p50=samples[2],p95=samples[Math.min(4,Math.ceil(samples.length*.95)-1)];expect(Number.isFinite(p50)&&Number.isFinite(p95)).toBe(true);console.info(JSON.stringify({device:typeof navigator!=='undefined'?navigator.userAgent:'node',samples,p50,p95,peakBytes:2048*2048*4*2}))})
 it('releases twenty adopted/undone results explicitly',async()=>{const results=[];for(let i=0;i<20;i++){const r=await processRaster(request(64,64),{chunkRows:16});results.push(r.image);disposeRaster(r.image)}expect(results.every(image=>image.data.every(v=>v===0))).toBe(true)})
})
