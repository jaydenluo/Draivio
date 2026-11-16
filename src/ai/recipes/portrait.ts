import type {Selection,SelectionPoint} from '../../canvas/selectionGeometry'
import type {PixelImage} from '../../canvas/rasterTools'
import {rasterizeSelectionMask} from '../../canvas/selectionRaster'
import {validateFilterSelection} from '../../filters/selection'
import {applyDenoise} from '../../filters/denoise'
import {healPixels} from '../../retouch/cloneHeal'
import {yieldProcessing} from '../imaging/processingScheduler'
export type PortraitMasks={confirmed:boolean;person:Selection;skin:Selection;eyes:Selection;protect?:Selection}
export type PortraitSettings={denoise:number;heal:number;skinTone:number;eyes:number;blemishes:SelectionPoint[]}
export type PortraitStage={name:string;image:PixelImage;selection:Selection}
export const defaultPortraitSettings=():PortraitSettings=>({denoise:20,heal:20,skinTone:0,eyes:4,blemishes:[]})
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('人像精修已取消，原图未改变','AbortError')}
export function validatePortraitSettings(s:PortraitSettings){
 if(!s||Object.keys(s).some(k=>!['denoise','heal','skinTone','eyes','blemishes'].includes(k)))throw new Error('人像参数无效')
 for(const [key,min,max] of [['denoise',0,35],['heal',0,50],['skinTone',-10,10],['eyes',0,10]] as const)if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw new Error(`人像参数 ${key} 超出自然精修范围`)
 if(!Array.isArray(s.blemishes)||s.blemishes.length>32||s.blemishes.some(p=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>100||p.y>100))throw new Error('请明确指定最多32个本地瑕疵点')
}
function rectangleOnly(path:Selection['path']):boolean{
 if(path.type==='shape')return path.kind==='rectangle'
 if(path.type==='affine'||path.type==='transform')return rectangleOnly(path.source)
 return false
}
export function portraitMaskPixels(m:PortraitMasks,width:number,height:number){
 if(m.confirmed!==true)throw new Error('请明确确认目标人物及皮肤、眼部和保护分区；不自动代选人物')
 const mask=(s:Selection)=>rasterizeSelectionMask(validateFilterSelection(s),width,height)
 for(const key of ['person','skin','eyes'] as const){const s=validateFilterSelection(m[key]);if(rectangleOnly(s.path))throw new Error('请使用精确自由选区或分区蒙版，矩形不能作为人物或五官确认')}
 const person=mask(m.person),skin=mask(m.skin),eyes=mask(m.eyes),protect=m.protect?mask(m.protect):new Uint8Array(width*height)
 if(!person.some(v=>v))throw new Error('目标人物蒙版为空')
 for(const [name,values] of [['皮肤',skin],['眼部',eyes]] as const){
  if(!values.some(v=>v))throw new Error(`${name}蒙版为空`)
  // Reject wrong-person/disjoint masks rather than silently clipping all work.
  for(let i=0;i<values.length;i++)if(values[i]>0&&person[i]===0)throw new Error(`${name}分区超出目标人物，请重新确认`)
 }
 for(let i=0;i<person.length;i++){
  // Any protected coverage is an absolute exclusion (glasses/beard/text).
  if(protect[i]){skin[i]=0;eyes[i]=0;continue}
  skin[i]=Math.min(skin[i],person[i])*(1-eyes[i]/255)
  eyes[i]=Math.min(eyes[i],person[i])
 }
 return {person,skin,eyes,protect}
}
/** Fixed-coordinate, local deterministic effects. Never generates pixels,
 * guesses a person/blemish, changes alpha, resizes or warps facial geometry. */
export async function processPortrait(image:PixelImage,masks:PortraitMasks,settings:PortraitSettings,options:{signal?:AbortSignal}={}){
 check(options.signal);validatePortraitSettings(settings)
 if(!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||image.width*image.height>4_194_304||image.data.length!==image.width*image.height*4)throw new Error('人像精修支持最多2048²像素；请先创建RGB8工作副本')
 const coverage=portraitMaskPixels(masks,image.width,image.height)
 let current:PixelImage={...image,data:image.data.slice()}
 const stages:PortraitStage[]=[]
 const blend=async(name:string,candidate:PixelImage,mask:Uint8Array,selection:Selection)=>{
  const data=current.data.slice()
  for(let y=0;y<image.height;y++){
   if(y%16===0)await yieldProcessing(options.signal)
   for(let x=0;x<image.width;x++){const i=y*image.width+x,a=mask[i]/255;if(!a||!image.data[i*4+3])continue;for(let c=0;c<3;c++)data[i*4+c]=current.data[i*4+c]*(1-a)+candidate.data[i*4+c]*a}
  }
  check(options.signal);current={...image,data};stages.push({name,image:current,selection:structuredClone(selection)})
 }
 if(settings.heal&&settings.blemishes.length){
  for(const point of settings.blemishes){const i=Math.min(image.height-1,Math.floor(point.y/100*image.height))*image.width+Math.min(image.width-1,Math.floor(point.x/100*image.width));if(!coverage.skin[i]||coverage.protect[i])throw new Error('瑕疵点必须位于确认皮肤分区且不在保护区域')}
  const candidate=healPixels(current,settings.blemishes,{size:Math.min(12,Math.max(2,image.width/150)),opacity:settings.heal,signal:options.signal})
  await blend('局部瑕疵修复 · 手工点',candidate,coverage.skin,masks.skin)
 }
 if(settings.denoise){
  const data=await applyDenoise(current.data,image.width,image.height,{radius:1,amount:settings.denoise/100,threshold:12},{signal:options.signal})
  await blend('皮肤保纹理降噪',{...image,data},coverage.skin,masks.skin)
 }
 if(settings.skinTone){const candidate={...image,data:current.data.slice()};for(let i=0;i<candidate.data.length;i+=4){candidate.data[i]+=settings.skinTone*.35;candidate.data[i+2]-=settings.skinTone*.2}await blend('肤色轻调',candidate,coverage.skin,masks.skin)}
 if(settings.eyes){const candidate={...image,data:current.data.slice()};for(let i=0;i<candidate.data.length;i+=4)for(let c=0;c<3;c++)candidate.data[i+c]+=settings.eyes*.6;await blend('眼部轻微提亮',candidate,coverage.eyes,masks.eyes)}
 check(options.signal)
 return {image:current,stages,generated:false as const,geometryChanged:false as const}
}
