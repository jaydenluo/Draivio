import type { PixelImage } from '../canvas/rasterTools'
import { describe, expect, it } from 'vitest'
import { tonalBrushPixels, tonalRangeWeight } from './tonalBrush'
const image = (v: number[], alpha=255) => ({width:v.length,height:1,data:new Uint8ClampedArray(v.flatMap(x=>[x,x,x,alpha]))})
const opts = {mode:'dodge' as const,range:'midtones' as const,exposure:50,size:100,hardness:100,flow:100,protectTones:true}
describe('tonal brush pixels',()=>{
 it('separates shadows/midtones/highlights on a grayscale ramp',()=>{
  expect(tonalRangeWeight(.1,'shadows')).toBeGreaterThan(tonalRangeWeight(.9,'shadows'))
  expect(tonalRangeWeight(.9,'highlights')).toBeGreaterThan(tonalRangeWeight(.1,'highlights'))
  expect(tonalRangeWeight(.5,'midtones')).toBeGreaterThan(tonalRangeWeight(.1,'midtones'))
 })
 it('dodge/burn accumulate without mutating source or overflowing',()=>{
  const src=image([128]);const a=tonalBrushPixels(src,[{x:50,y:50}],opts);const b=tonalBrushPixels(a,[{x:50,y:50}],opts)
  expect(a.data[0]).toBeGreaterThan(128);expect(b.data[0]).toBeGreaterThan(a.data[0]);expect(src.data[0]).toBe(128)
  expect(tonalBrushPixels(src,[{x:50,y:50}],{...opts,mode:'burn'}).data[0]).toBeLessThan(128)
  let result:PixelImage=src;for(let i=0;i<100;i++)result=tonalBrushPixels(result,[{x:50,y:50}],opts)
  expect(result.data[0]).toBeLessThanOrEqual(255)
 })
 it('protects saturated skin highlights with a hue preserving shoulder',()=>{
  const src={width:1,height:1,data:new Uint8ClampedArray([245,160,115,255])}
  const p=tonalBrushPixels(src,[{x:50,y:50}],{...opts,range:'highlights',exposure:100})
  const raw=tonalBrushPixels(src,[{x:50,y:50}],{...opts,range:'highlights',exposure:100,protectTones:false})
  expect(p.data[0]).toBeLessThan(255);expect(raw.data[0]).toBe(255);expect(p.data[0]).toBeGreaterThan(245)
 })
 it('samples long sparse drags continuously, respects selection/alpha and clipped edges',()=>{
  const src=image(Array(40).fill(128));const out=tonalBrushPixels(src,[{x:-5,y:50},{x:105,y:50}],{...opts,size:4})
  expect(Array.from({length:40},(_,i)=>out.data[i*4]).every(v=>v>128)).toBe(true)
  expect(tonalBrushPixels(image([128],0),[{x:0,y:0}],opts).data).toEqual(image([128],0).data)
  expect(tonalBrushPixels(src,[{x:50,y:50}],opts,new Uint8Array(40)).data).toEqual(src.data)
 })
 it('rejects aborted processing and invalid numerical input',()=>{
  const controller=new AbortController();controller.abort()
  expect(()=>tonalBrushPixels(image([128]),[{x:50,y:50}],{...opts,signal:controller.signal})).toThrow()
  expect(()=>tonalBrushPixels(image([128]),[{x:50,y:50}],{...opts,exposure:NaN})).toThrow()
 })
})
