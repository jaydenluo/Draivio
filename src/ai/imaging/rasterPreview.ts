import type {RasterWorkerRequest} from '../../engine/raster/rasterWorker'
import type {RasterLayerInput} from '../../engine/raster/composite'
import {disposeRaster,processRaster,processingLimit,type ProcessingResult} from './processingScheduler'
const abort=(signal:AbortSignal)=>{if(signal.aborted)throw new DOMException('预览已取消','AbortError')}
function pause(signal:AbortSignal,ms=0){return new Promise<void>((resolve,reject)=>{
 const cancelled=()=>{clearTimeout(timer);signal.removeEventListener('abort',cancelled);reject(new DOMException('预览已取消','AbortError'))}
 const timer=setTimeout(()=>{signal.removeEventListener('abort',cancelled);resolve()},ms)
 signal.addEventListener('abort',cancelled,{once:true});if(signal.aborted)cancelled()
})}
async function downsample(request:RasterWorkerRequest,maxDimension:number,signal:AbortSignal):Promise<RasterWorkerRequest>{
 const scale=Math.min(1,maxDimension/Math.max(request.width,request.height))
 if(scale===1)return request
 const width=Math.max(1,Math.round(request.width*scale)),height=Math.max(1,Math.round(request.height*scale)),layers:RasterLayerInput[]=[]
 try {
  for(const layer of request.layers){
   const image={width,height,data:new Uint8ClampedArray(width*height*4)},mask=layer.mask?new Uint8Array(width*height):undefined
   layers.push({...layer,image,mask})
   for(let y=0;y<height;y++){
    if(y%16===0){await pause(signal);abort(signal)}
    for(let x=0;x<width;x++){
     const source=Math.min(request.height-1,Math.floor(y/scale))*request.width+Math.min(request.width-1,Math.floor(x/scale)),target=y*width+x
     for(let c=0;c<4;c++)image.data[target*4+c]=layer.image.data[source*4+c]
     if(mask)mask[target]=layer.mask![source]
    }
   }
  }
  return {width,height,layers}
 }catch(error){for(const layer of layers){disposeRaster(layer.image);layer.mask?.fill(0)}throw error}
}
/** One owned, bounded preview slot. Callers pass document ID + content and
 * parameter revision; never reuse a key after mutating source pixels. Returned
 * images are borrowed until the next run/dispose, not document originals. */
export class RasterPreviewQueue {
 private current?:AbortController
 private cached?:{key:string;result:ProcessingResult}
 get retainedBytes(){return this.cached?.result.image.data.byteLength??0}
 cancel(){this.current?.abort();this.current=undefined}
 dispose(){this.cancel();if(this.cached)disposeRaster(this.cached.result.image);this.cached=undefined}
 async run(request:RasterWorkerRequest,options:{revisionKey:string;maxDimension?:number;debounceMs?:number}):Promise<ProcessingResult&{cacheHit:boolean}>{
  this.cancel()
  const limit=processingLimit(request.width,request.height),maxDimension=options.maxDimension??2048,debounceMs=options.debounceMs??30
  if(!limit.allowed)throw new Error(limit.reason)
  if(!options.revisionKey||!Number.isInteger(maxDimension)||maxDimension<1||maxDimension>2048||!Number.isFinite(debounceMs)||debounceMs<0||debounceMs>1000)throw new Error('预览参数无效')
  const key=`${options.revisionKey}:${request.width}:${request.height}:${maxDimension}`
  if(this.cached?.key===key)return {...this.cached.result,cacheHit:true}
  if(this.cached)disposeRaster(this.cached.result.image);this.cached=undefined
  // Validate dimensions/masks before sampling without a full-size allocation.
  for(const layer of request.layers)if(layer.image.width!==request.width||layer.image.height!==request.height||layer.image.data.length!==request.width*request.height*4||(layer.mask&&layer.mask.length!==request.width*request.height))throw new Error('预览像素尺寸无效')
  const started=performance.now(),controller=new AbortController();this.current=controller
  let sampled:RasterWorkerRequest|undefined
  try{
   await pause(controller.signal,debounceMs)
   sampled=await downsample(request,maxDimension,controller.signal);abort(controller.signal)
   const result=await processRaster(sampled,{signal:controller.signal})
   if(this.current!==controller||controller.signal.aborted){disposeRaster(result.image);abort(controller.signal);throw new DOMException('预览已过期','AbortError')}
   result.elapsedMs=performance.now()-started
   if(sampled!==request)result.peakBytes+=request.layers.reduce((n,layer)=>n+layer.image.data.byteLength+(layer.mask?.byteLength??0),0)
   this.cached={key,result};return {...result,cacheHit:false}
  }finally{
   if(sampled&&sampled!==request)for(const layer of sampled.layers){disposeRaster(layer.image);layer.mask?.fill(0)}
   if(this.current===controller)this.current=undefined
  }
 }
}
