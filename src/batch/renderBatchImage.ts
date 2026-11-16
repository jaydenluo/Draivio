import { applyPresetMode } from '../adjustments/presets'
import { applyLayerAdjustments } from '../imaging/layerAdjustments'
import { neutralAdjustments } from '../state/editor'
import { applyBatchPreset, normalizeRecipe, resizeGeometry, watermarkRect, type BatchRecipe } from './batchProcessor'
import { imageHeaderSize } from './batchIO'
export type DecodedBatchImage={image:CanvasImageSource;width:number;height:number;release:()=>void}
export type BatchRenderDependencies={decode?:(blob:Blob)=>Promise<DecodedBatchImage>;createCanvas?:()=>HTMLCanvasElement}
async function decode(blob:Blob):Promise<DecodedBatchImage>{
  if(blob.size>32*1024*1024)throw new Error('输入文件超过 32MB')
  imageHeaderSize(new Uint8Array(await blob.arrayBuffer()))
  const url=URL.createObjectURL(blob),image=new Image()
  try{await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('图片解码失败，文件可能损坏'));image.src=url});return {image,width:image.naturalWidth,height:image.naturalHeight,release:()=>{image.src='';URL.revokeObjectURL(url)}}}catch(e){URL.revokeObjectURL(url);throw e}
}
/** Preview and final export call this exact pipeline and encoder at full requested dimensions. */
export async function renderBatchImage(source:Blob,recipe:BatchRecipe,deps:BatchRenderDependencies={}){
 const r=normalizeRecipe(recipe),decoded=await(deps.decode??decode)(source),canvas=(deps.createCanvas??(()=>document.createElement('canvas')))()
 let watermark:DecodedBatchImage|undefined
 try{const g=resizeGeometry(decoded.width,decoded.height,r);canvas.width=g.width;canvas.height=g.height;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('当前环境不支持图片处理')
  ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high'
  // PNG / WebP retain transparency. JPEG explicitly composites onto white.
  if(r.format==='jpeg'){ctx.fillStyle='#ffffff';ctx.fillRect(0,0,g.width,g.height)}
  ctx.drawImage(decoded.image,g.sx,g.sy,g.sw,g.sh,g.dx,g.dy,g.dw,g.dh)
  if(r.adjustmentPreset){const data=ctx.getImageData(0,0,g.width,g.height);data.data.set(applyLayerAdjustments(data.data,g.width,g.height,applyPresetMode(neutralAdjustments,r.adjustmentPreset,'replace')));ctx.putImageData(data,0,0)}
  if(r.preset!=='none'){const data=ctx.getImageData(0,0,g.width,g.height);data.data.set(applyBatchPreset(data.data,r.preset));ctx.putImageData(data,0,0)}
  const w=r.watermark
  if(w.kind!=='none'){
   ctx.save();ctx.globalAlpha=w.opacity
   if(w.kind==='text'){
    const fontSize=Math.max(1,Math.round(Math.min(g.width,g.height)*w.scale*0.35));ctx.font=`${fontSize}px sans-serif`;ctx.textBaseline='top';ctx.fillStyle=w.color
    const maxWidth=Math.max(1,g.width-2*Math.min(w.margin,g.width/3)),textWidth=Math.min(maxWidth,ctx.measureText(w.text).width),textHeight=Math.min(fontSize,g.height)
    const rect=watermarkRect(g.width,g.height,textWidth,textHeight,w.position,w.margin);ctx.fillText(w.text,rect.x,rect.y,rect.width)
   }else{
    const comma=w.image.indexOf(','),binary=atob(w.image.slice(comma+1)),bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));const header=imageHeaderSize(bytes);if(header.width*header.height>1_000_000)throw new Error('水印图片超过 1MP')
    watermark=await(deps.decode??decode)(new Blob([bytes]));const scale=Math.min(g.width*w.scale/watermark.width,(g.height-Math.min(w.margin*2,g.height/2))/watermark.height),ww=Math.max(1,watermark.width*scale),wh=Math.max(1,watermark.height*scale),rect=watermarkRect(g.width,g.height,ww,wh,w.position,w.margin);ctx.drawImage(watermark.image,rect.x,rect.y,rect.width,rect.height)
   }ctx.restore()
  }
  const mime=`image/${r.format}`,blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.type===mime?resolve(blob):reject(new Error('当前环境不支持所选输出格式，请改用 PNG')),mime,r.quality))
  return {blob,width:g.width,height:g.height}
 }finally{decoded.release();watermark?.release();canvas.width=canvas.height=0}
}
