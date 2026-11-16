import { describe, expect, it } from 'vitest'
import { defaultCurves } from '../adjustments/curves'
import { createPixelBuffer, readNormalized } from './pixelBuffer'
import { processPrecision, compositePrecision, precisionMemoryEstimate, convertPrecision } from './precisionPipeline'

describe('scene-linear high precision processing', () => {
  it('keeps a16bit gradient above256 levels and float highlights through exposure', async () => {
    const gradient = createPixelBuffer(1024,1,'rgba16')
    for (let i=0;i<1024;i++) gradient.data.set([i*32,i*32,i*32,65535],i*4)
    const out = await processPrecision(gradient,{exposureEV:1})
    expect(new Set(Array.from(out.data).filter((_,i)=>i%4===0)).size).toBe(1024)
    const hdr = createPixelBuffer(1,1,'rgba32f',[2.5,1.25,-0.25,0.5])
    expect(readNormalized(await processPrecision(hdr,{exposureEV:1}),0)).toEqual([5,2.5,-0.5,0.5])
  })
  it('evaluates curves continuously and preserves HDR using endpoint extrapolation', async () => {
    const curves=defaultCurves();curves.rgb=[{x:0,y:0},{x:.5,y:.25},{x:1,y:1}]
    const source=createPixelBuffer(2,1,'rgba32f',[.5,.5,.5,1,2,2,2,1])
    const out=await processPrecision(source,{curves})
    expect(readNormalized(out,0)).toEqual([.25,.25,.25,1])
    expect(readNormalized(out,1)[0]).toBeGreaterThan(1)
  })
  it('applies scalar masks without clipping source highlights', async()=>{
    const source=createPixelBuffer(2,1,'rgba32f',[2,2,2,1,2,2,2,1])
    const out=await processPrecision(source,{exposureEV:1,mask:new Float32Array([0,.5])})
    expect(readNormalized(out,0)[0]).toBe(2);expect(readNormalized(out,1)[0]).toBe(3)
  })
  it('composites normal multiply and screen in scene-linear float with correct alpha',()=>{
    const base=createPixelBuffer(1,1,'rgba32f',[2,1,.5,1]),top=createPixelBuffer(1,1,'rgba32f',[.5,.5,.5,.5])
    expect(readNormalized(compositePrecision(base,top,'normal'),0)).toEqual([1.25,.75,.5,1])
    expect(readNormalized(compositePrecision(base,top,'multiply'),0)).toEqual([1.5,.75,.375,1])
    expect(readNormalized(compositePrecision(base,top,'screen'),0)[0]).toBe(1.75)
  })
  it('yields by rows and cancellation discards the temporary output', async()=>{
    const controller=new AbortController(),source=createPixelBuffer(64,64,'rgba32f')
    const before=source.data.slice()
    await expect(processPrecision(source,{exposureEV:1,signal:controller.signal,yieldRows:8,yieldControl:async()=>controller.abort()})).rejects.toThrow(/取消/)
    expect(source.data).toEqual(before)
    expect(()=>precisionMemoryEstimate(4096,4096,'rgba32f',1000)).toThrow(/预算/)
  })
  it('converts depth cooperatively with explicit clipping, alpha preserved, and cancellable temporary output',async()=>{
    const source=createPixelBuffer(2,1,'rgba32f',[2.5,-.25,.5,.5,.1,.2,.3,1])
    const converted=await convertPrecision(source,'rgba16',{dither:true})
    expect(readNormalized(converted,0)[0]).toBe(1);expect(readNormalized(converted,0)[1]).toBe(0)
    expect(converted.data[3]).toBe(32768)
    const controller=new AbortController()
    await expect(convertPrecision(createPixelBuffer(16,16,'rgba32f'),'rgba8',{signal:controller.signal,yieldRows:1,yieldControl:async()=>controller.abort()})).rejects.toThrow(/取消/)
  })
})
