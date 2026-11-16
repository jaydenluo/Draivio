import { expect,it } from 'vitest'
import { maskedResult } from './maskedResult'
const image=(width:number,height:number,rgba:number[])=>({width,height,data:new Uint8ClampedArray(Array.from({length:width*height},()=>rgba).flat())})
it('preserves checkerboard protection byte-for-byte and mixes soft alpha at original resolution',()=>{
 const original=image(4,2,[20,40,60,255]);original.data.set([250,5,100,128],0)
 const mask=new Uint8Array([0,128,255,0,0,0,0,0]),generated=image(2,1,[220,140,60,255])
 const out=maskedResult(original,generated,mask,{x:1,y:0,width:2,height:1})
 expect([...out.data.slice(0,16)]).toEqual([250,5,100,128,120,90,60,255,220,140,60,255,20,40,60,255]);expect([...out.data.slice(16)]).toEqual([...original.data.slice(16)])
})
it('accepts a full-size response only by its original coordinates and rejects incompatible sizes/crops',()=>{
 const original=image(4,3,[0,0,0,255]),mask=new Uint8Array(12);mask[5]=255
 const full=image(4,3,[10,20,30,255]);full.data.set([100,110,120,255],20)
 expect([...maskedResult(original,full,mask,{x:1,y:1,width:2,height:1}).data.slice(20,24)]).toEqual([100,110,120,255])
 expect(()=>maskedResult(original,image(1,1,[255,0,0,255]),mask,{x:1,y:1,width:2,height:1})).toThrow('尺寸')
 expect(()=>maskedResult(original,image(2,1,[255,0,0,255]),mask,{x:3,y:1,width:2,height:1})).toThrow('坐标')
})
