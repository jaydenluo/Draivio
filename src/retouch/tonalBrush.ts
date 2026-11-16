import type { PixelImage } from '../canvas/rasterTools'
import type { SelectionPoint } from '../canvas/selectionGeometry'
import type { Layer } from '../state/editor'
export type TonalRange = 'shadows' | 'midtones' | 'highlights'
export type TonalBrushOptions = { mode: 'dodge' | 'burn'; range: TonalRange; exposure: number; size: number; hardness: number; flow: number; protectTones: boolean; signal?: AbortSignal }
const clamp = (v: number, lo=0, hi=1) => Math.max(lo, Math.min(hi, v))
const linear = (v:number) => v<=.04045?v/12.92:((v+.055)/1.055)**2.4
const srgb = (v:number) => v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055
/** Range is measured in perceptual sRGB luminance; exposure is applied in linear light. */
export function tonalRangeWeight(luminance:number, range:TonalRange) {
 const y=clamp(luminance)
 return range==='shadows'?clamp((.65-y)/.5):range==='highlights'?clamp((y-.35)/.5):clamp(1-Math.abs(y-.5)/.5)
}
/** Include previous processing layers and their source lineage so later strokes accumulate. */
export function tonalSourceIds(layers:Layer[], selectedId:string):string[] {
 const ids=new Set<string>();const visit=(id:string)=>{if(ids.has(id))return;const layer=layers.find(l=>l.id===id);if(!layer||!layer.visible)return;ids.add(id);layer.repairSourceIds?.forEach(visit)};visit(selectedId);return [...ids]
}
/** Each sampled dab accumulates exposure; alpha and the input pixels are preserved. */
export function tonalBrushPixels(image:PixelImage, points:SelectionPoint[], options:TonalBrushOptions, mask?:Uint8Array):PixelImage {
 if(!Number.isInteger(image.width)||!Number.isInteger(image.height)||image.width<1||image.height<1||image.data.length!==image.width*image.height*4)throw new Error('色调画笔图像尺寸无效')
 if(![options.size,options.hardness,options.flow,options.exposure,...points.flatMap(p=>[p.x,p.y])].every(Number.isFinite)||options.size<=0||options.size>2048)throw new Error('色调画笔参数无效')
 if(mask&&mask.length!==image.width*image.height)throw new Error('色调画笔选区尺寸无效')
 const check=()=>{if(options.signal?.aborted)throw new DOMException('操作已取消','AbortError')};check()
 const data=new Uint8ClampedArray(image.data)
 // Keep a float buffer across dabs: low flow must accumulate without rounding away exposure.
 const channels=Float64Array.from(image.data,(v,i)=>i%4===3?v:linear(v/255))
 const radius=Math.max(.5,options.size/2),hardness=clamp(options.hardness/100)
 const dab=(x:number,y:number)=>{
  check()
  for(let py=Math.max(0,Math.floor(y-radius));py<=Math.min(image.height-1,Math.ceil(y+radius));py++)for(let px=Math.max(0,Math.floor(x-radius));px<=Math.min(image.width-1,Math.ceil(x+radius));px++){
   const d=Math.hypot(px+.5-x,py+.5-y)/radius;if(d>=1)continue
   const i=(py*image.width+px)*4;if(!data[i+3])continue
   const fall=d<=hardness?1:(1-d)/Math.max(.0001,1-hardness)
   const lum=.2126*srgb(channels[i])+.7152*srgb(channels[i+1])+.0722*srgb(channels[i+2])
   const amount=clamp(options.exposure/100)*clamp(options.flow/100)*fall*tonalRangeWeight(lum,options.range)*(mask?mask[i/4]/255:1)
   const gain=2**(amount*(options.mode==='dodge'?1:-1))
   const peak=Math.max(channels[i],channels[i+1],channels[i+2])
   const scale=options.protectTones&&gain>1?gain/(1+peak*(gain-1)):gain
   for(let c=0;c<3;c++)channels[i+c]=clamp(channels[i+c]*scale)
  }
 }
 const ps=points.map(p=>({x:p.x/100*image.width,y:p.y/100*image.height}))
 if(ps.length)dab(ps[0].x,ps[0].y)
 for(let i=1;i<ps.length;i++){
  const a=ps[i-1],b=ps[i],distance=Math.hypot(b.x-a.x,b.y-a.y);if(!distance)continue
  const steps=Math.ceil(distance/Math.max(.5,radius/4));for(let j=1;j<=steps;j++)dab(a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps)
 }
 for(let i=0;i<data.length;i++)if(i%4!==3&&data[i-i%4+3])data[i]=Math.round(srgb(channels[i])*255)
 return {width:image.width,height:image.height,data}
}
