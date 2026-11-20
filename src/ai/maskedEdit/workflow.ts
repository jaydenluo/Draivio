import {endpointFrame,type EndpointFrame} from './endpointMapping'
import type { EditorState } from '../../state/editor'
import { compositeMaskedResult } from './pixels'
import { maskedResult } from '../compositing/maskedResult'
import { effectiveLayerState } from '../../state/layerHierarchy'
import { captureEditorContext } from '../context/editorContext'
import { contextPreviewSvg, rasterizePreview } from '../context/editorPreview'
import { rasterizeSelectionMask } from '../../canvas/selectionRaster'
import { cropForMask, cropPixels, encodeEndpointMask, type MaskSemantics, type PixelCrop } from './pixels'
import type { PixelImage } from '../../canvas/rasterTools'
import { editTargetIds, type ImageEditTarget } from '../../creation/imageEditTarget'
export type MaskedEditProvenance = { endpointFrame?:EndpointFrame; batchId: string; operation: 'remove'|'replace'; width:number; height:number; crop:PixelCrop; semantics:MaskSemantics; source:{source:string}; target:{source:string}; protectedLayerIds?:string[]; mask:{source:string}; raw?:{source:string}; replacement?:{source:string} }
export async function decodePixels(source:string):Promise<PixelImage>{
 const image=new Image();image.crossOrigin='anonymous'
 await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('无法解码生成图片'));image.src=source})
 if(!image.naturalWidth||!image.naturalHeight||image.naturalWidth*image.naturalHeight>16777216)throw new Error('生成图片尺寸超出蒙版编辑预算（最多 1600 万像素）')
 const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法读取像素');ctx.drawImage(image,0,0)
 return {width:canvas.width,height:canvas.height,data:ctx.getImageData(0,0,canvas.width,canvas.height).data}
}
export function encodePixels(image:PixelImage):string {
 const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height
 const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法编码像素');ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data),image.width,image.height),0,0);return canvas.toDataURL('image/png')
}
export type MaskedEditIO={render:typeof rasterizePreview;decode:typeof decodePixels;encode:typeof encodePixels}
const browserIO:MaskedEditIO={render:rasterizePreview,decode:decodePixels,encode:encodePixels}
export async function prepareMaskedEdit(state:EditorState,documentId:string,semantics:MaskSemantics,io:MaskedEditIO=browserIO,editTarget?:Exclude<ImageEditTarget,'auto'|'upload'>){
 // Layer validation catches inherited locks. Full physical document rendering bakes rotated/nested transforms once.
 if (!editTarget || editTarget === 'object') captureEditorContext(state,documentId,'layer')
 const width=state.documentWidth,height=state.documentHeight
 if(width*height>16777216)throw new Error('画布超出蒙版编辑预算（最多 1600 万像素）')
 const context=captureEditorContext(state,documentId,'document')
 const full={...context,preview:{width,height,scale:1}}
 const source=await io.render(contextPreviewSvg(state,full),width,height)
 const targetContext={...(!editTarget||editTarget==='object'?captureEditorContext(state,documentId,'layer'):context),pixelBounds:full.pixelBounds,preview:full.preview}
 const target=await io.render(contextPreviewSvg({...state,documentBackground:'transparent'},targetContext),width,height)
 const mask=(editTarget==='selection'||!editTarget&&state.selectionVisible)?rasterizeSelectionMask(state.selection,width,height):new Uint8Array(width*height).fill(editTarget==='object'?0:255)
 const chosen = editTarget==='object' ? editTargetIds(state) : []
 if(editTarget==='selection'&&!state.selectionVisible)throw new Error('请先建立有效选区')
 if(editTarget==='object'){
  if(!chosen.length)throw new Error('请先选择修改对象')
  for(const id of chosen){
   if(effectiveLayerState(state.layers,id).locked)throw new Error('目标图层或所属组已锁定，请先解锁')
   const objectContext={...full,scope:'layer' as const,targetLayerId:id}
   const object=await io.decode(await io.render(contextPreviewSvg({...state,documentBackground:'transparent'},objectContext),width,height))
   for(let i=0;i<mask.length;i++)mask[i]=Math.max(mask[i],object.data[i*4+3])
  }
 }
 const explicitlyTargeted=(id:string)=>chosen.includes(id)||chosen.some(parent=>{let layer=state.layers.find(l=>l.id===id);const seen=new Set<string>();while(layer?.groupId&&!seen.has(layer.groupId)){if(layer.groupId===parent)return true;seen.add(layer.groupId);layer=state.layers.find(l=>l.id===layer!.groupId)}return false})
 const protectedLayerIds=state.layers.filter(layer=>effectiveLayerState(state.layers,layer.id).visible && (effectiveLayerState(state.layers,layer.id).locked||!explicitlyTargeted(layer.id)&&(layer.kind==='text'||state.canvasTexts.some(text=>text.layerId===layer.id)))).map(layer=>layer.id)
 for(const id of protectedLayerIds){const protectedContext={...full,scope:'layer' as const,targetLayerId:id};const protection=await io.decode(await io.render(contextPreviewSvg(state,protectedContext),width,height));if(protection.width!==width||protection.height!==height)throw new Error('保护图层渲染尺寸不符');for(let i=0;i<mask.length;i++)if(protection.data[i*4+3])mask[i]=0}
 const crop=cropForMask(mask,width,height)
 const pixels=await io.decode(source)
 const maskImage=encodeEndpointMask(mask,width,height,semantics)
 const provenance:MaskedEditProvenance={batchId:crypto.randomUUID(),protectedLayerIds,operation:state.prompt.trim()?'replace':'remove',width,height,crop,semantics,source:{source},target:{source:target},mask:{source:io.encode(maskImage)}}
 return {context,provenance,mask,reference:io.encode(cropPixels(pixels,crop)),endpointMask:io.encode(cropPixels(maskImage,crop)),pixels,targetPixels:await io.decode(target)}
}
/** Keep the API's fixed canvas separate from document coordinates. Padding is protected by the endpoint mask. */
export async function fitMaskedEditToEndpoint(prepared:Awaited<ReturnType<typeof prepareMaskedEdit>>,size:{width:number;height:number},io:MaskedEditIO=browserIO){
 const frame=endpointFrame(prepared.provenance.crop,size),c=frame.content
 const render=(source:string,mask=false)=>io.render(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${frame.width}" height="${frame.height}">${mask&&prepared.provenance.semantics==='transparent-edit'?`<path fill="white" fill-rule="evenodd" d="M0 0H${frame.width}V${frame.height}H0Z M${c.x} ${c.y}h${c.width}v${c.height}h-${c.width}Z"/>`:`<rect width="100%" height="100%" fill="${mask?'black':'white'}"/>`}<image xlink:href="${source}" x="${c.x}" y="${c.y}" width="${c.width}" height="${c.height}" preserveAspectRatio="none"/></svg>`,frame.width,frame.height)
 return {...prepared,reference:await render(prepared.reference),endpointMask:await render(prepared.endpointMask,true),provenance:{...prepared.provenance,endpointFrame:frame}}
}
export class MaskedEditMappingError extends Error {
 constructor(message:string,public original:string){super(message)}
}
export async function finishMaskedEdit(prepared:Awaited<ReturnType<typeof prepareMaskedEdit>>,raw:string,io:MaskedEditIO=browserIO,strictSize=false){
 let generated=await io.decode(raw)
 const original=raw.startsWith('data:image/')?raw:io.encode(generated)
 try{
 const frame=prepared.provenance.endpointFrame
 if(frame){
  if(generated.width*frame.height!==generated.height*frame.width)throw new Error(`生成结果比例不符：端点需要 ${frame.width} × ${frame.height}，实际返回 ${generated.width} × ${generated.height}`)
  const c=frame.content,crop=prepared.provenance.crop
  const aligned=await io.render(`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${crop.width}" height="${crop.height}" viewBox="${c.x} ${c.y} ${c.width} ${c.height}"><image xlink:href="${io.encode(generated)}" width="${frame.width}" height="${frame.height}" preserveAspectRatio="none"/></svg>`,crop.width,crop.height)
  generated=await io.decode(aligned)
 }
 const result= strictSize ? maskedResult(prepared.pixels,generated,prepared.mask,prepared.provenance.crop) : compositeMaskedResult(prepared.pixels,generated,prepared.mask,prepared.provenance.crop)
 const protectedResult= strictSize ? maskedResult(prepared.targetPixels,generated,prepared.mask,prepared.provenance.crop) : compositeMaskedResult(prepared.targetPixels,generated,prepared.mask,prepared.provenance.crop)
 return {source:io.encode(result),thumbnail:io.encode(result),provenance:{...prepared.provenance,raw:{source:original},replacement:{source:io.encode(protectedResult)}}}
 }catch(error){throw new MaskedEditMappingError(error instanceof Error?error.message:'局部结果合成失败',original)}
}
