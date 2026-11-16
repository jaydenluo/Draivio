import type {PixelImage} from '../../canvas/rasterTools'
import type {OcrCandidate} from './ocr'
import {ocrTargetMask} from './nativeOcr'
/** A bounded local donor budget keeps the existing exemplar fill below its CPU limit.
 * Other recognized text is excluded both from repair and donor sampling. */
export function ocrRepairOptions(image:PixelImage,candidates:readonly OcrCandidate[],id:string){
 const selected=candidates.find(c=>c.id===id);if(!selected)throw new Error('找不到文字候选')
 const target=ocrTargetMask(image.width,image.height,selected),protect=new Uint8Array(target.length),donors=new Uint8Array(target.length)
 for(const c of candidates)if(c.id!==id){const m=ocrTargetMask(image.width,image.height,c);for(let i=0;i<m.length;i++)if(m[i])protect[i]=255}
 const xs=selected.quad.map(p=>p.x),ys=selected.quad.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys)
 const nearby:{i:number;d:number}[]=[]
 for(let y=Math.max(0,Math.floor(minY)-24);y<Math.min(image.height,Math.ceil(maxY)+24);y++)for(let x=Math.max(0,Math.floor(minX)-24);x<Math.min(image.width,Math.ceil(maxX)+24);x++){
 const i=y*image.width+x;if(!target[i]&&!protect[i]&&image.data[i*4+3]>0)nearby.push({i,d:Math.max(minX-x,0,x-maxX)**2+Math.max(minY-y,0,y-maxY)**2})
 }
 nearby.sort((a,b)=>a.d-b.d||a.i-b.i)
 const count=target.reduce((sum,value,i)=>sum+(value&&!protect[i]?1:0),0),budget=Math.min(256,Math.max(32,Math.floor(28_000_000/Math.max(1,count*24))))
 for(const p of nearby.slice(0,budget))donors[p.i]=255
 if(!nearby.length)throw new Error('文字周围没有可用采样区域，请手动修补背景')
 return {target,protect,donors}
}
