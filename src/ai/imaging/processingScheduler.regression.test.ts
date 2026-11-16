import {describe,expect,it} from 'vitest'
import {processRaster,processingLimit} from './processingScheduler'
import {compositeLayers,solidImage} from '../../engine/raster/composite'
import {BLEND_MODES} from '../../render/blendModes'

describe('bounded real raster work',()=>{
 it('reports measured work slices and limits each 2048px synchronous task',async()=>{
  const result=await processRaster({width:2048,height:2048,layers:[{image:solidImage(2048,2048,[50,80,100,255])}]})
  expect(result.maxTaskMs).toBeGreaterThan(0)
  expect(result.maxTaskMs).toBeLessThanOrEqual(50)
  expect(result.elapsedMs).toBeLessThanOrEqual(300)
 })
 it('rejects 8192 and invalid dimensions using the default budget',async()=>{
  expect(processingLimit(8192,8192).allowed).toBe(false)
  expect(processingLimit(2,-1).allowed).toBe(false)
  await expect(processRaster({width:8192,height:8192,layers:[]})).rejects.toThrow('处理上限')
 })
 it('rejects a total input/output memory excess before scheduling work',async()=>{
  const image=solidImage(8,8,[0,0,0,255])
  await expect(processRaster({width:8,height:8,layers:[{image}]},{maxBytes:256})).rejects.toThrow('内存预算')
 })
 it('is byte-identical to the reference for every blend mode with fractional alpha and mask',async()=>{
  const base=solidImage(9,7,[90,140,200,137]),top=solidImage(9,7,[240,30,80,193])
  const mask=Uint8Array.from({length:63},(_,i)=>i*37%256)
  for(const {id} of BLEND_MODES){
   const request={width:9,height:7,layers:[{image:base},{image:top,opacity:.63,blendMode:id,mask}]}
   expect((await processRaster(request,{chunkRows:2})).image).toEqual(compositeLayers(9,7,request.layers))
  }
 })
 it('stops after actual work progress and never mutates the input on cancellation',async()=>{
  const controller=new AbortController(),image=solidImage(128,128,[17,42,63,255]),before=image.data.slice(),progress:number[]=[]
  await expect(processRaster({width:128,height:128,layers:[{image}]},{chunkRows:8,signal:controller.signal,onProgress:x=>{progress.push(x);if(x>0)controller.abort()}})).rejects.toMatchObject({name:'AbortError'})
  expect(progress.some(x=>x>0&&x<1)).toBe(true);expect(progress).not.toContain(1);expect(image.data).toEqual(before)
 })
})
