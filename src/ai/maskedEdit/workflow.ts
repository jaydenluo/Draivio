import type { EditorState } from '../../state/editor'
import { compositeMaskedResult } from './pixels'
import { maskedResult } from '../compositing/maskedResult'
import { effectiveLayerState } from '../../state/layerHierarchy'
import { captureEditorContext } from '../context/editorContext'
import { contextPreviewSvg, rasterizePreview } from '../context/editorPreview'
import { rasterizeSelectionMask } from '../../canvas/selectionRaster'
import { cropForMask, cropPixels, encodeEndpointMask, type MaskSemantics, type PixelCrop } from './pixels'
import type { PixelImage } from '../../canvas/rasterTools'
export type MaskedEditProvenance = { batchId: string; operation: 'remove'|'replace'; width:number; height:number; crop:PixelCrop; semantics:MaskSemantics; source:{source:string}; target:{source:string}; protectedLayerIds?:string[]; mask:{source:string}; raw?:{source:string}; replacement?:{source:string} }
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
export async function prepareMaskedEdit(state:EditorState,documentId:string,semantics:MaskSemantics,io:MaskedEditIO=browserIO){
 // Layer validation catches inherited locks. Full physical document rendering bakes rotated/nested transforms once.
 captureEditorContext(state,documentId,'layer')
 const width=state.documentWidth,height=state.documentHeight
 if(width*height>16777216)throw new Error('画布超出蒙版编辑预算（最多 1600 万像素）')
 const context=captureEditorContext(state,documentId,'document')
 const full={...context,preview:{width,height,scale:1}}
 const source=await io.render(contextPreviewSvg(state,full),width,height)
 const targetContext={...captureEditorContext(state,documentId,'layer'),pixelBounds:full.pixelBounds,preview:full.preview}
 const target=await io.render(contextPreviewSvg({...state,documentBackground:'transparent'},targetContext),width,height)
 const mask=state.selectionVisible?rasterizeSelectionMask(state.selection,width,height):new Uint8Array(width*height).fill(255)
 const protectedLayerIds=state.layers.filter(layer=>effectiveLayerState(state.layers,layer.id).visible && (effectiveLayerState(state.layers,layer.id).locked||layer.kind==='text'||state.canvasTexts.some(text=>text.layerId===layer.id))).map(layer=>layer.id)
 for(const id of protectedLayerIds){const protectedContext={...full,scope:'layer' as const,targetLayerId:id};const protection=await io.decode(await io.render(contextPreviewSvg(state,protectedContext),width,height));if(protection.width!==width||protection.height!==height)throw new Error('保护图层渲染尺寸不符');for(let i=0;i<mask.length;i++)if(protection.data[i*4+3])mask[i]=0}
 const crop=cropForMask(mask,width,height)
 const pixels=await io.decode(source)
 const maskImage=encodeEndpointMask(mask,width,height,semantics)
 const provenance:MaskedEditProvenance={batchId:crypto.randomUUID(),protectedLayerIds,operation:state.prompt.trim()?'replace':'remove',width,height,crop,semantics,source:{source},target:{source:target},mask:{source:io.encode(maskImage)}}
 return {context,provenance,mask,reference:io.encode(cropPixels(pixels,crop)),endpointMask:io.encode(cropPixels(maskImage,crop)),pixels,targetPixels:await io.decode(target)}
}
export async function finishMaskedEdit(prepared:Awaited<ReturnType<typeof prepareMaskedEdit>>,raw:string,io:MaskedEditIO=browserIO,strictSize=false){
 const generated=await io.decode(raw)
 const result= strictSize ? maskedResult(prepared.pixels,generated,prepared.mask,prepared.provenance.crop) : compositeMaskedResult(prepared.pixels,generated,prepared.mask,prepared.provenance.crop)
 const protectedResult= strictSize ? maskedResult(prepared.targetPixels,generated,prepared.mask,prepared.provenance.crop) : compositeMaskedResult(prepared.targetPixels,generated,prepared.mask,prepared.provenance.crop)
 return {source:io.encode(result),thumbnail:io.encode(result),provenance:{...prepared.provenance,raw:{source:raw},replacement:{source:io.encode(protectedResult)}}}
}
