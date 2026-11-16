import { invoke,isTauri } from '@tauri-apps/api/core'
import { validateOcrCandidate,type OcrCandidate } from './ocr'
export function parseNativeOcr(value:unknown,sourceLayerId:string):OcrCandidate[]{
 const v=value as {width:number;height:number;candidates:OcrCandidate[]}
 if(!v||!Number.isInteger(v.width)||!Number.isInteger(v.height)||v.width<1||v.height<1||v.width*v.height>4194304||!Array.isArray(v.candidates)||v.candidates.length>256)throw new Error('OCR 响应尺寸或候选无效')
 const ids=new Set<string>()
 return v.candidates.map(c=>{validateOcrCandidate(c);if(ids.has(c.id)||c.quad.some(p=>p.x<0||p.y<0||p.x>v.width||p.y>v.height))throw new Error('OCR 坐标越界或候选重复');ids.add(c.id);let sign=0;for(let i=0;i<4;i++){const a=c.quad[i],b=c.quad[(i+1)%4],d=c.quad[(i+2)%4],cross=(b.x-a.x)*(d.y-b.y)-(b.y-a.y)*(d.x-b.x);if(Math.abs(cross)<.01||sign&&sign*cross<0)throw new Error('OCR 四边形退化或相交');sign=cross}return {...c,sourceLayerId}})
}
export async function recognizeNativeText(image:string,sourceLayerId:string,signal:AbortSignal){
 if(!isTauri())throw new Error('本机识字需要 macOS 桌面应用；浏览器预览不提供 OCR 后端')
 if(signal.aborted)throw new DOMException('识字已取消','AbortError')
 const value=await invoke('recognize_image_text',{image})
 if(signal.aborted)throw new DOMException('识字已取消','AbortError')
 return parseNativeOcr(value,sourceLayerId)
}
/** Quad plus 2px margin; only this explicit region may be repaired. */
export function ocrTargetMask(width:number,height:number,candidate:OcrCandidate):Uint8Array{
 const mask=new Uint8Array(width*height),q=candidate.quad
 for(let y=Math.max(0,Math.floor(Math.min(...q.map(p=>p.y))-2));y<Math.min(height,Math.ceil(Math.max(...q.map(p=>p.y))+2));y++)for(let x=Math.max(0,Math.floor(Math.min(...q.map(p=>p.x))-2));x<Math.min(width,Math.ceil(Math.max(...q.map(p=>p.x))+2));x++){
 let positive=true,negative=true
 for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],cross=(b.x-a.x)*(y+.5-a.y)-(b.y-a.y)*(x+.5-a.x),margin=2*Math.hypot(b.x-a.x,b.y-a.y);positive&&=cross>=-margin;negative&&=cross<=margin}
 if(positive||negative)mask[y*width+x]=255
 }return mask
}
