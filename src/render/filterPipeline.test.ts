import { describe, it, expect } from 'vitest'
import { applySmartFilters, createSmartFilter, validateSmartFilters, FilterRenderQueue, filterCacheKey, type SmartFilterKind } from './filterPipeline'
const input = new Uint8ClampedArray([0,0,0,255, 80,80,80,255, 255,255,255,255, 30,30,30,255, 180,180,180,255])
const blur = { ...createSmartFilter('gaussian', 'b'), radius: 1 }
const sharp = { ...createSmartFilter('sharpen', 's'), radius: 1, amount: 2 }

describe('box blur, median, edges, bloom and duotone', () => {
 const run = (source: number[], kind: SmartFilterKind, settings: object) => applySmartFilters(
  new Uint8ClampedArray(source), source.length / 4, 1, { items: [{ ...createSmartFilter(kind, kind), ...settings }] },
 )

 it('averages centered box samples in premultiplied alpha', async () => {
  const result = await run([0, 0, 255, 0, 255, 0, 0, 255, 0, 255, 0, 0], 'boxBlur', { radius: 1 })
  expect([...result.slice(4, 8)]).toEqual([255, 0, 0, 28])
 })

 it('replaces a bright outlier with the median and retains alpha', async () => {
  const result = await run([32, 48, 64, 255, 255, 255, 255, 128, 32, 48, 64, 255], 'median', { radius: 1 })
  expect([...result.slice(4, 8)]).toEqual([32, 48, 64, 128])
 })

 it('detects a contrast boundary and preserves alpha', async () => {
  const result = await run([40, 40, 40, 255, 40, 40, 40, 255, 200, 200, 200, 255], 'edges', { amount: 1 })
  expect([...result.slice(0, 4)]).toEqual([0, 0, 0, 255])
  expect([...result.slice(4, 8)]).toEqual([160, 160, 160, 255])
 })

 it('spreads only light above the bloom threshold and retains source alpha', async () => {
  const pixels = [32, 32, 32, 128, 255, 255, 255, 255, 32, 32, 32, 0]
  const result = await run(pixels, 'bloom', { radius: 1, amount: 1, threshold: 192 })
  expect(result[0]).toBeGreaterThan(32)
  expect(result[3]).toBe(128)
  expect([...result.slice(8, 12)]).toEqual([32, 32, 32, 0])
  expect(await run(pixels, 'bloom', { radius: 1, amount: 1, threshold: 255 })).toEqual(new Uint8ClampedArray(pixels))
 })

 it('maps black and white to the selected duotone colors and rejects invalid colors', async () => {
  const colors = { shadowColor: '#102030', highlightColor: '#e0d0c0' }
  const result = await run([0, 0, 0, 255, 255, 255, 255, 200], 'duotone', { ...colors, amount: 1 })
  expect([...result]).toEqual([16, 32, 48, 255, 224, 208, 192, 200])
  expect(() => validateSmartFilters({ items: [{ ...createSmartFilter('duotone', 'd'), shadowColor: 'red' }] })).toThrow(/颜色/)
 })
})
describe('non destructive smart filter pixels', () => {
 it('defaults and disabled filters are exact identity including transparent RGB', async()=> { const p=new Uint8ClampedArray([210,40,90,0, 90,30,20,128]); expect(await applySmartFilters(p,2,1,{items:[createSmartFilter('gaussian','a'),createSmartFilter('sharpen','b'),createSmartFilter('highpass','c')]})).toEqual(p);expect(await applySmartFilters(input,5,1,{items:[{...blur,enabled:false}]})).toEqual(input) })
 it('uses actual Gaussian weights and does not mutate source',async()=>{ const src = new Uint8ClampedArray(7*7*4);for(let i=0;i<49;i++)src[i*4+3]=255;src.set([255,255,255,255],(3*7+3)*4);const before=src.slice();const p=await applySmartFilters(src,7,7,{items:[blur]});expect(p[(3*7+3)*4]).toBeCloseTo(41,0);expect(p[(3*7+2)*4]).toBeCloseTo(25,0);expect(src).toEqual(before) })
 it('ordered clipping makes sharpen then blur different from blur then sharpen',async()=>{const a=await applySmartFilters(input,5,1,{items:[sharp,blur]});const b=await applySmartFilters(input,5,1,{items:[blur,sharp]});expect(a).not.toEqual(b);expect(await applySmartFilters(input,5,1,{items:[sharp,blur]})).toEqual(a)})
 it('has an independent rectangular mask and inversion preserving outside pixels',async()=>{const mask={enabled:true,inverted:false,rect:{x:40,y:0,width:20,height:100}};const p=await applySmartFilters(input,5,1,{items:[blur],mask});expect(p.slice(0,8)).toEqual(input.slice(0,8));expect(p.slice(12)).toEqual(input.slice(12));expect(p.slice(8,12)).not.toEqual(input.slice(8,12));const q=await applySmartFilters(input,5,1,{items:[blur],mask:{...mask,inverted:true}});expect(q.slice(8,12)).toEqual(input.slice(8,12))})
 it('rejects malformed chains and huge radius with explanatory bound',()=>{expect(()=>validateSmartFilters({items:[{...blur,radius:1000}]})).toThrow(/64.*性能/);expect(()=>validateSmartFilters({items:[blur,blur]})).toThrow(/重复/);expect(()=>validateSmartFilters({items:[{...blur,radius:NaN}]})).toThrow();expect(()=>validateSmartFilters({items:[],mask:{enabled:true,inverted:false,rect:{x:0,y:0,width:-1,height:10}}})).toThrow()})
 it('cancels during real convolution without returning partial pixels',async()=>{const controller=new AbortController();let yields=0;await expect(applySmartFilters(new Uint8ClampedArray(128*128*4),128,128,{items:[blur]},{signal:controller.signal,yield:async()=>{if(++yields===2)controller.abort()}})).rejects.toThrow(/取消/);expect(yields).toBe(2)})
 it('keys include source bytes and revision, mask, parameters and order',()=>{const key=(p=input,c={items:[blur,sharp]},r='r1')=>filterCacheKey(p,5,1,c,r);expect(key()).not.toBe(key(input,{items:[sharp,blur]}));expect(key()).not.toBe(key(new Uint8ClampedArray(input.length)));expect(key()).not.toBe(key(input,{items:[{...blur,radius:2},sharp]}));expect(key()).not.toBe(key(input,undefined,'r2'));expect(key()).not.toBe(filterCacheKey(input,5,1,{items:[blur,sharp],mask:{enabled:true,inverted:false,rect:{x:0,y:0,width:50,height:100}}},'r1'))})
 it('a newer render supersedes an older real convolution and failed jobs do not publish',async()=>{const q=new FilterRenderQueue();const outputs:Uint8ClampedArray[]=[];const old=q.run(input,5,1,{items:[blur]},p=>outputs.push(p));const fresh=q.run(input,5,1,{items:[]},p=>outputs.push(p));await Promise.all([old,fresh]);expect(outputs).toEqual([input]);await expect(q.run(input,5,1,{items:[{...blur,radius:1000}]},p=>outputs.push(p))).rejects.toThrow();expect(outputs).toHaveLength(1)})
})

it('renders new color styles with their own pixel operations and preserves alpha', async () => {
 const source = new Uint8ClampedArray([200, 100, 50, 128, 4, 30, 90, 0])
 const cases = [
  ['grayscale', {}, [118, 118, 118, 128]],
  ['sepia', {}, [165, 147, 114, 128]],
  ['invert', {}, [55, 155, 205, 128]],
  ['posterize', { size: 4 }, [170, 85, 85, 128]],
  ['threshold', { threshold: 128 }, [0, 0, 0, 128]],
  ['emboss', {}, [128, 128, 128, 128]],
 ] as const
 for (const [kind, params, expected] of cases) {
  const neutral = createSmartFilter(kind, kind)
  expect(await applySmartFilters(source, 2, 1, { items: [neutral] })).toEqual(source)
  const result = await applySmartFilters(source, 2, 1, { items: [{ ...neutral, ...params, amount: 1 }] })
  expect([...result]).toEqual([...expected, ...source.slice(4)])
 }
})
