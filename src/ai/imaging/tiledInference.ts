import { yieldProcessing } from './processingScheduler'
import type { PixelImage } from '../../canvas/rasterTools'
export type InferenceTile = { x:number; y:number; width:number; height:number }
export type TileInference = (image:PixelImage,tile:InferenceTile,signal?:AbortSignal)=>Promise<PixelImage>
export type TiledOptions = { yield?:()=>Promise<void>; tileSize?:number; overlap?:number; maxBytes?:number; signal?:AbortSignal; onProgress?:(completed:number,total:number)=>void }
const cancelled=(signal?:AbortSignal)=>{if(signal?.aborted)throw new DOMException('增强已取消，原图未改变','AbortError')}
function valid(image:PixelImage){if(!Number.isSafeInteger(image.width)||!Number.isSafeInteger(image.height)||image.width<1||image.height<1||image.data.length!==image.width*image.height*4)throw new Error('图像像素尺寸无效')}
/** Serial inference limits peak backend memory; overlapping pixels blend in premultiplied alpha. */
export async function tiledInference(image:PixelImage,scale:2|4,infer:TileInference,options:TiledOptions={}):Promise<PixelImage>{
 valid(image);if(scale!==2&&scale!==4)throw new Error('仅支持 2 倍或 4 倍增强')
 const size=options.tileSize??256,overlap=options.overlap??16,step=size-overlap*2
 if(!Number.isInteger(size)||!Number.isInteger(overlap)||size<2||overlap<1||step<1)throw new Error('分块尺寸或重叠范围无效')
 const width=image.width*scale,height=image.height*scale,pixels=width*height
 if(width>16384||height>16384)throw new Error('增强后尺寸超过项目 16384 像素限制')
 if(Math.ceil(image.width/step)*Math.ceil(image.height/step)>4096)throw new Error('分块数量超过预算，请增大分块或减小图像')
 // output + premultiplied accumulators + weights + worst-case input/output tile.
 const bytes=pixels*24+image.data.byteLength+size*size*4*(1+scale*scale)
 if(!Number.isSafeInteger(bytes)||bytes>(options.maxBytes??256*1024*1024))throw new Error('增强所需内存超出预算，请减小图像或降低倍数；显存不足时请使用更小分块')
 cancelled(options.signal)
 const tiles:InferenceTile[]=[]
 for(let y=0;y<image.height;y+=step)for(let x=0;x<image.width;x+=step){const left=Math.max(0,x-overlap),top=Math.max(0,y-overlap);tiles.push({x:left,y:top,width:Math.min(image.width,x+step+overlap)-left,height:Math.min(image.height,y+step+overlap)-top})}
 const accum=new Float32Array(pixels*4),weights=new Float32Array(pixels)
 for(let n=0;n<tiles.length;n++){
  cancelled(options.signal);const tile=tiles[n],data=new Uint8ClampedArray(tile.width*tile.height*4)
  for(let y=0;y<tile.height;y++)data.set(image.data.subarray(((tile.y+y)*image.width+tile.x)*4,((tile.y+y)*image.width+tile.x+tile.width)*4),y*tile.width*4)
  const result=await infer({width:tile.width,height:tile.height,data},tile,options.signal);cancelled(options.signal);valid(result)
  if(result.width!==tile.width*scale||result.height!==tile.height*scale)throw new Error('增强后端返回尺寸错误，未生成候选')
  const feather=overlap*scale
  for(let y=0;y<result.height;y++){
   if(y%16===0)await yieldProcessing(options.signal,options.yield)
   for(let x=0;x<result.width;x++){
   const wx=Math.min(1,tile.x? (x+1)/feather:1,tile.x+tile.width<image.width?(result.width-x)/feather:1)
   const wy=Math.min(1,tile.y? (y+1)/feather:1,tile.y+tile.height<image.height?(result.height-y)/feather:1)
   const weight=wx*wy,i=(tile.y*scale+y)*width+tile.x*scale+x,j=(y*result.width+x)*4,alpha=result.data[j+3]/255
   weights[i]+=weight;accum[i*4+3]+=alpha*weight
   for(let c=0;c<3;c++)accum[i*4+c]+=result.data[j+c]*alpha*weight
  }
  }
  options.onProgress?.(n+1,tiles.length)
 }
 cancelled(options.signal);const data=new Uint8ClampedArray(pixels*4)
 for(let i=0;i<pixels;i++){if(i%(width*16)===0)await yieldProcessing(options.signal,options.yield);const alpha=accum[i*4+3];if(!weights[i])throw new Error('分块覆盖不完整');data[i*4+3]=alpha/weights[i]*255;for(let c=0;c<3;c++)data[i*4+c]=alpha?accum[i*4+c]/alpha:0}
 return {width,height,data}
}
