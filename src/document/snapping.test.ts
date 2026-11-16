import { describe, it, expect } from 'vitest'
import { createSnapIndex, snapBounds, rotatedBounds } from './snapping'
const rect={x:90,y:70,width:20,height:20}
const guideIndex=()=>createSnapIndex({guides:[{id:'guide',axis:'x',position:100,locked:false}],objects:[]})
describe('document-pixel snapping',()=>{
 it.each([25,100,400])('uses the same six screen-pixel acquisition threshold at %s%%',zoomPercent=>{
  const index=guideIndex(),scale=zoomPercent/100
  const inside=snapBounds(index,{x:100-5.9/scale,y:20,width:100,height:1},{zoomPercent,thresholdPx:6,mode:'resize',handle:'w'})
  expect(inside.rect.x).toBeCloseTo(100);expect(inside.hits.x!.screenDistance).toBeCloseTo(5.9)
  const outside=snapBounds(index,{x:100-6.1/scale,y:20,width:100,height:1},{zoomPercent,thresholdPx:6,mode:'resize',handle:'w'})
  expect(outside.hits.x).toBeUndefined()
 })
 it('moves edges or centers and reports target/anchor without mutating input',()=>{
  const index=guideIndex(),input={...rect,x:89}
  const result=snapBounds(index,input,{zoomPercent:100,mode:'move'})
  expect(result.rect.x).toBe(90);expect(result.hits.x).toMatchObject({source:'guide',targetId:'guide',anchor:'center',position:100,correction:1})
  expect(input.x).toBe(89)
 })
 it('resizes only the active edge and keeps the opposite edge fixed',()=>{
  const index=guideIndex()
  const result=snapBounds(index,{x:50,y:20,width:48,height:20},{zoomPercent:100,mode:'resize',handle:'e'})
  expect(result.rect).toEqual({x:50,y:20,width:50,height:20});expect(result.hits.y).toBeUndefined()
  const west=snapBounds(index,{x:98,y:20,width:52,height:20},{zoomPercent:100,mode:'resize',handle:'w'})
  expect(west.rect.x+west.rect.width).toBe(150);expect(west.rect.width).toBe(50)
 })
 it('uses stable tie priority and hysteresis until release, while Alt and disabled clear it immediately',()=>{
  const index=createSnapIndex({canvas:{width:200,height:200},guides:[{id:'z',axis:'x',position:100,locked:false},{id:'a',axis:'x',position:100,locked:false}],objects:[{id:'obj',bounds:{x:100,y:300,width:40,height:20}}]})
  const first=snapBounds(index,{...rect,x:99,width:20},{zoomPercent:100,mode:'resize',handle:'w'})
  expect(first.hits.x!.targetId).toBe('a');expect(first.hits.x!.source).toBe('guide')
  const retained=snapBounds(index,{...rect,x:107,width:20},{zoomPercent:100,mode:'resize',handle:'w',previous:first.hits,hysteresisPx:2})
  expect(retained.rect.x).toBe(100)
  expect(snapBounds(index,{...rect,x:109},{zoomPercent:100,mode:'resize',handle:'w',previous:first.hits,hysteresisPx:2}).hits.x).toBeUndefined()
  for(const disabled of [{altKey:true},{enabled:false}])expect(snapBounds(index,rect,{zoomPercent:100,mode:'move',previous:first.hits,...disabled}).hits).toEqual({})
 })
 it('excludes dragged/hidden objects, snaps canvas and configured grids with negative origins',()=>{
  const index=createSnapIndex({objects:[{id:'self',bounds:rect},{id:'hidden',visible:false,bounds:rect}],excludeIds:['self'],canvas:{width:500,height:400},grid:{enabled:true,spacingX:20,spacingY:25,originX:-3,originY:2}})
  const result=snapBounds(index,{x:98,y:52,width:20,height:20},{zoomPercent:100,mode:'resize',handle:'nw'})
  expect(result.rect.x).toBe(97);expect(result.rect.y).toBe(52);expect(result.hits.x!.source).toBe('grid')
  expect(snapBounds(index,{x:1,y:210,width:20,height:20},{zoomPercent:100,mode:'resize',handle:'w'}).hits.x!.source).toBe('canvas')
 })
 it('computes actual rotated AABB in physical pixels, not percent aspect space',()=>{
  const b=rotatedBounds({x:10,y:20,width:80,height:20},90)
  expect(b.x).toBeCloseTo(40);expect(b.y).toBeCloseTo(-10);expect(b.width).toBeCloseTo(20);expect(b.height).toBeCloseTo(80)
 })
 it('rejects invalid geometry/zoom and refuses a snap that crosses the fixed resize edge',()=>{
  expect(()=>createSnapIndex({objects:[{id:'bad',bounds:{...rect,width:Infinity}}]})).toThrow()
  expect(()=>snapBounds(guideIndex(),rect,{zoomPercent:0,mode:'move'})).toThrow()
  const result=snapBounds(guideIndex(),{x:99,y:1,width:.5,height:2},{zoomPercent:100,mode:'resize',handle:'w'})
  expect(result.rect.width).toBeGreaterThan(0);expect(result.hits.x).toBeUndefined()
 })
 it.each([100,10000])('indexes %s objects once and queries local neighborhoods over 500 drags',count=>{
  const objects=Array.from({length:count},(_,i)=>({id:`o-${i}`,bounds:{x:i*100,y:i*100,width:20,height:20}}))
  const start=performance.now(),index=createSnapIndex({objects}),built=performance.now();let inspected=0
  for(let i=0;i<500;i++){const result=snapBounds(index,{x:(i%count)*100+2,y:47,width:10,height:10},{zoomPercent:100,mode:'move'});inspected+=result.stats.inspected;expect(result.rect.x).toBe((i%count)*100)}
  const elapsed=performance.now()-built
  console.info(JSON.stringify({benchmark:'F08 snap query',objects:count,queries:500,buildMs:built-start,queryMs:elapsed,inspected}))
  expect(inspected).toBeLessThan(500*40);expect(elapsed).toBeLessThan(3000)
 })
})

it('does not scan every aligned or densely packed reference in a drag frame',()=>{
 const objects=Array.from({length:10000},(_,i)=>({id:`o-${String(i).padStart(5,'0')}`,bounds:{x:100+i*.0001,y:100,width:20,height:20}}))
 const index=createSnapIndex({objects})
 const result=snapBounds(index,{x:100.00201,y:100.1,width:20,height:20},{zoomPercent:100,mode:'move'})
 expect(result.hits.x?.position).toBeCloseTo(100.002)
 expect(result.stats.inspected).toBeLessThan(30)
})
