import {normalizeImageSize} from '../../creation/imageEditCapabilities'
import type {PixelCrop} from './pixels'
export type EndpointFrame={width:number;height:number;content:PixelCrop}
export function endpointSize(requested:string,sizes:readonly string[]|undefined,crop:{width:number;height:number}){
 if(!sizes)return undefined
 const available=sizes.map(normalizeImageSize).filter(s=>s!=='auto')
 const normalized=normalizeImageSize(requested)
 const selected=normalized==='auto'?available.sort((a,b)=>{
  const distance=(s:string)=>{const [w,h]=s.split('x').map(Number);return Math.abs(Math.log(w/h/(crop.width/crop.height)))}
  return distance(a)-distance(b)
 })[0]:normalized
 if(!selected)return undefined
 if(!available.includes(selected))throw new Error(`模型不支持输出尺寸 ${selected}，未发送请求`)
 const [width,height]=selected.split('x').map(Number)
 if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width*height>16777216)throw new Error('编辑端点尺寸无效或超出预算')
 return {width,height}
}
export function endpointFrame(crop:{width:number;height:number},size:{width:number;height:number}):EndpointFrame{
 const scale=Math.min(size.width/crop.width,size.height/crop.height)
 const width=Math.max(1,Math.round(crop.width*scale)),height=Math.max(1,Math.round(crop.height*scale))
 return {...size,content:{x:Math.floor((size.width-width)/2),y:Math.floor((size.height-height)/2),width,height}}
}
