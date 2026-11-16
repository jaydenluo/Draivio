import type { EditorState, AIResult } from '../../state/editor'
import { captureEditorContext } from '../context/editorContext'
import { contextPreviewSvg, rasterizePreview } from '../context/editorPreview'
import { decodePixels, encodePixels, type MaskedEditIO } from '../maskedEdit/workflow'
import { cropPixels, encodeEndpointMask, compositeMaskedResult, type MaskSemantics, type PixelCrop } from '../maskedEdit/pixels'
import { expandedPixels, outpaintMask, tilePlan, type Expansion } from './geometry'
import type { PixelImage } from '../../canvas/rasterTools'
export type OutpaintTile={crop:PixelCrop;source:{source:string};mask:{source:string};raw:{source:string}}
export type OutpaintProvenance={expansion:Expansion;limit:number;overlap:number;calls:number;source:{source:string};tiles:OutpaintTile[];semantics:MaskSemantics}
export type OutpaintTransport=(reference:string,mask:string,prompt:string,tile:PixelCrop)=>Promise<string>
export const browserOutpaintIO:MaskedEditIO={render:rasterizePreview,decode:decodePixels,encode:encodePixels}
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('扩图已取消，原画布未改变','AbortError')}
export async function generateOutpaint(state:EditorState,documentId:string,expansion:Expansion,semantics:MaskSemantics,transport:OutpaintTransport,options:{limit?:number;overlap?:number;signal?:AbortSignal;onProgress?:(completed:number,total:number)=>void;io?:MaskedEditIO}={}):Promise<AIResult>{
 const io=options.io??browserOutpaintIO,limit=options.limit??1024,overlap=options.overlap??32,plan=tilePlan(expansion,limit,overlap)
 captureEditorContext(state,documentId,'layer')
 const context=captureEditorContext(state,documentId,'document')
 if(state.documentWidth!==expansion.originalWidth||state.documentHeight!==expansion.originalHeight)throw new Error('原始画布尺寸已改变')
 check(options.signal)
 const source=await io.render(contextPreviewSvg(state,{...context,preview:{width:state.documentWidth,height:state.documentHeight,scale:1}}),state.documentWidth,state.documentHeight)
 const original=await io.decode(source),mask=outpaintMask(expansion)
 let pixels=expandedPixels(original,expansion)
 const completed=new Uint8Array(mask.length),tiles:OutpaintTile[]=[]
 for(const crop of plan){
  check(options.signal)
  const tileMask=new Uint8Array(mask.length)
  for(let y=crop.y;y<crop.y+crop.height;y++)for(let x=crop.x;x<crop.x+crop.width;x++){const i=y*expansion.width+x;if(mask[i]){const edge=Math.min(x-crop.x+1,crop.x+crop.width-x,y-crop.y+1,crop.y+crop.height-y);tileMask[i]=completed[i]?Math.max(1,Math.min(255,Math.round(edge/overlap*255))):255}}
  const reference=io.encode(cropPixels(pixels,crop)),endpointMask=io.encode(cropPixels(encodeEndpointMask(tileMask,expansion.width,expansion.height,semantics),crop))
  const raw=await transport(reference,endpointMask,state.prompt,crop);check(options.signal)
  const generated=await io.decode(raw)
  pixels=compositeMaskedResult(pixels,generated,tileMask,crop)
  tileMask.forEach((v,i)=>{if(v)completed[i]=1})
  tiles.push({crop,source:{source:reference},mask:{source:endpointMask},raw:{source:raw}})
  options.onProgress?.(tiles.length,plan.length)
 }
 check(options.signal)
 // The initial source includes transparent pixels. Preserve all four channels exactly.
 for(let y=0;y<original.height;y++)pixels.data.set(original.data.subarray(y*original.width*4,(y+1)*original.width*4),((y+expansion.y)*expansion.width+expansion.x)*4)
 for(let i=0;i<mask.length;i++)if(mask[i]&&pixels.data[i*4+3]!==255)throw new Error('服务返回的扩展区域存在透明洞，未生成候选；请检查模型后重试')
 const image=io.encode(pixels),outpaint:OutpaintProvenance={expansion,limit,overlap,calls:plan.length,source:{source},tiles,semantics}
 return {id:`outpaint-${crypto.randomUUID()}`,source:image,thumbnail:image,prompt:state.prompt,model:state.composerParameters.model,provider:state.composerSourceId,size:`${expansion.width} × ${expansion.height}`,createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,request:{mode:'edit',intent:'edit',prompt:state.prompt,sourceLayerId:state.selectedLayerId,selection:null,parameters:{...state.composerParameters},context,outpaint}}
}
export function originalRegion(image:PixelImage,e:Expansion):PixelImage{return cropPixels(image,{x:e.x,y:e.y,width:e.originalWidth,height:e.originalHeight})}
