import { expect, it, vi } from 'vitest'
import { tiledInference } from './tiledInference'
import { upscalePixels } from '../../imaging/enhancement'
const image=()=>({width:7,height:5,data:new Uint8ClampedArray(Array.from({length:35},(_,i)=>i%3?[i*5,255-i*3,i,128]:[0,0,0,0]).flat())})
it.each([2,4] as const)('matches full-image pixel dimensions and alpha across overlapping tiles at %sx',async scale=>{
 const source=image(),copy=new Uint8ClampedArray(source.data)
 const result=await tiledInference(source,scale,async tile=>upscalePixels(tile,scale),{tileSize:4,overlap:1})
 expect(result).toMatchObject({width:7*scale,height:5*scale})
 expect([...result.data]).toEqual([...upscalePixels(source,scale).data]);expect(source.data).toEqual(copy)
})
it('checks cancellation after in-flight inference and emits no partial output',async()=>{
 const controller=new AbortController(),infer=vi.fn(async tile=>{controller.abort();return upscalePixels(tile,2)})
 await expect(tiledInference(image(),2,infer,{tileSize:4,overlap:1,signal:controller.signal})).rejects.toMatchObject({name:'AbortError'})
 expect(infer).toHaveBeenCalledTimes(1)
})
it('rejects memory excess before calling a backend and rejects malformed dimensions',async()=>{
 const infer=vi.fn(async tile=>tile)
 await expect(tiledInference(image(),4,infer,{maxBytes:1})).rejects.toThrow('内存')
 expect(infer).not.toHaveBeenCalled()
 await expect(tiledInference(image(),2,infer,{tileSize:4,overlap:1})).rejects.toThrow('尺寸')
})
it('reports completed tiles and rejects invalid tile geometry',async()=>{
 const progress=vi.fn();await tiledInference(image(),2,async tile=>upscalePixels(tile,2),{tileSize:4,overlap:1,onProgress:progress})
 const last=progress.mock.calls.at(-1)!;expect(last[0]).toBe(last[1]);expect(last[0]).toBeGreaterThan(1)
 await expect(tiledInference(image(),2,async tile=>tile,{tileSize:4,overlap:2})).rejects.toThrow('分块')
})
it('allows cancellation during real tile assembly rather than only remote inference',async()=>{
 const controller=new AbortController(),source=image()
 await expect(tiledInference(source,2,async tile=>upscalePixels(tile,2),{tileSize:4,overlap:1,signal:controller.signal,yield:async()=>{controller.abort()}})).rejects.toMatchObject({name:'AbortError'})
})
