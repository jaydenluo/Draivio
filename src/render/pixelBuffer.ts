/** High precision pixel storage independent of browser Canvas/ImageData. */
export type PixelFormat = 'rgba8' | 'rgba16' | 'rgba32f'
export type CodecCapability = { format: PixelFormat; read: boolean; write: boolean; reason?: string }
export const HIGH_PRECISION_CAPABILITIES: readonly CodecCapability[] = [
  { format: 'rgba8', read: true, write: true },
  { format: 'rgba16', read: false, write: false, reason: 'PNG/TIFF high-bit codecs are not bundled in the browser runtime' },
  { format: 'rgba32f', read: false, write: false, reason: 'OpenEXR codec is not bundled in the browser runtime' },
]
export type PixelBuffer = { width: number; height: number; format: PixelFormat; data: Uint8Array | Uint16Array | Float32Array }
const channels = 4
function assertSize(width:number,height:number){if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1)throw new Error('像素尺寸无效')}
function lengthFor(width:number,height:number){return width*height*channels}
export function createPixelBuffer(width:number,height:number,format:PixelFormat,data?:ArrayLike<number>):PixelBuffer{
 assertSize(width,height); const length=lengthFor(width,height); let values: PixelBuffer['data']
 if(format==='rgba8') values=data===undefined?new Uint8Array(length):new Uint8Array(data); else if(format==='rgba16') values=data===undefined?new Uint16Array(length):new Uint16Array(data); else if(format==='rgba32f') values=data===undefined?new Float32Array(length):new Float32Array(data); else throw new Error('不支持的像素格式')
 if(values.length!==length)throw new Error('像素长度与尺寸不匹配')
 return {width,height,format,data:values}
}
export function clonePixelBuffer(buffer:PixelBuffer):PixelBuffer{return createPixelBuffer(buffer.width,buffer.height,buffer.format,buffer.data)}
export function readNormalized(buffer:PixelBuffer,index:number):[number,number,number,number]{
 if(!Number.isSafeInteger(index)||index<0||index>=buffer.width*buffer.height)throw new Error('像素索引无效')
 const i=index*4,d=buffer.data
 if(buffer.format==='rgba8')return [d[i]/255,d[i+1]/255,d[i+2]/255,d[i+3]/255]
 if(buffer.format==='rgba16')return [d[i]/65535,d[i+1]/65535,d[i+2]/65535,d[i+3]/65535]
 return [d[i],d[i+1],d[i+2],d[i+3]]
}
export function writeNormalized(buffer:PixelBuffer,index:number,rgba:readonly number[]):void{
 if(rgba.length!==4)throw new Error('RGBA通道无效'); const i=index*4,d=buffer.data
 if(buffer.format==='rgba8') for(let c=0;c<4;c++)d[i+c]=Math.round(Math.max(0,Math.min(1,rgba[c]))*255)
 else if(buffer.format==='rgba16') for(let c=0;c<4;c++)d[i+c]=Math.round(Math.max(0,Math.min(1,rgba[c]))*65535)
 else for(let c=0;c<4;c++)d[i+c]=rgba[c]
}
export function convertPixelBuffer(source:PixelBuffer,targetFormat:PixelFormat,options:{dither?:boolean;seed?:number;signal?:AbortSignal}={}):PixelBuffer{
 const out=createPixelBuffer(source.width,source.height,targetFormat), seed=options.seed??0x9e3779b9
 let state=seed>>>0
 const random=()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/0x100000000}
 for(let p=0;p<source.width*source.height;p++){if(options.signal?.aborted)throw new DOMException('转换已取消','AbortError');const rgba=readNormalized(source,p);if(options.dither&&targetFormat!=='rgba32f'){const quantum=targetFormat==='rgba8'?1/255:1/65535;for(let c=0;c<4;c++)rgba[c]+=((random()-.5)*quantum)}writeNormalized(out,p,rgba)}
 return out
}
export function enforceBudget(width:number,height:number,format:PixelFormat,maxBytes=512*1024*1024):void{
 assertSize(width,height);const bytes=format==='rgba8'?1:format==='rgba16'?2:4;const total=width*height*4*bytes;if(total>maxBytes)throw new Error(`高精度缓冲超出预算：${total} bytes`)
}
export function capabilityFor(format:PixelFormat):CodecCapability{return HIGH_PRECISION_CAPABILITIES.find(c=>c.format===format)!}
