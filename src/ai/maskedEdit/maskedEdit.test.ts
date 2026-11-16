import { describe, expect, it } from 'vitest'
import { cropForMask, compositeMaskedResult, encodeEndpointMask } from './pixels'
import type { PixelImage } from '../../canvas/rasterTools'
const image=(w:number,h:number,color:number[]):PixelImage=>({width:w,height:h,data:new Uint8ClampedArray(Array.from({length:w*h},()=>color).flat())})
describe('masked edit physical pixels',()=>{
 it('includes feathered nonzero alpha and clipped context in integer crop',()=>{
  const mask=new Uint8Array(7*3);mask[8]=128;mask[12]=255
  expect(cropForMask(mask,7,3,1)).toEqual({x:0,y:0,width:7,height:3})
  expect(()=>cropForMask(new Uint8Array(4),2,2)).toThrow('选区为空')
 })
 it('maps a differently sized endpoint result into crop, preserving outside bytes and partial alpha',()=>{
  const original=image(4,2,[20,40,60,255]);const mask=new Uint8Array([0,128,255,0,0,0,0,0])
  const result=compositeMaskedResult(original,image(1,1,[220,140,60,255]),mask,{x:1,y:0,width:2,height:1})
  expect([...result.data.slice(0,16)]).toEqual([20,40,60,255,120,90,60,255,220,140,60,255,20,40,60,255])
  expect([...result.data.slice(16)]).toEqual([...original.data.slice(16)])
  expect(original.data[4]).toBe(20)
 })
 it('defines provider alpha transparent edit versus white edit contracts',()=>{
  const mask=new Uint8Array([0,128,255])
  expect([...encodeEndpointMask(mask,3,1,'transparent-edit').data]).toEqual([255,255,255,255,255,255,255,127,255,255,255,0])
  expect([...encodeEndpointMask(mask,3,1,'white-edit').data]).toEqual([0,0,0,255,128,128,128,255,255,255,255,255])
 })
})

import { rasterizeSelectionMask } from '../../canvas/selectionRaster'
import { createSelection } from '../../canvas/selectionGeometry'
it('preserves irregular raster selection alpha rather than promoting partial pixels to opaque',()=>{
 const selection={...createSelection('path',{x:0,y:0,width:100,height:100}),path:{type:'raster' as const,rows:['110','010'],d:'',alpha:[0,128,0,64,255,0],alphaWidth:3,alphaHeight:2}}
 expect([...rasterizeSelectionMask(selection,3,2)]).toEqual([0,128,0,64,255,0])
})
