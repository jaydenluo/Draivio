import { dimensionError } from '../document/documentGeometry'
import type { ImageAssetMetadata, ImageAssetResource } from './imageAssetTypes'

// Temporary legacy-source compatibility budget, not a native engine limit.
export const IMPORT_COMPATIBILITY_BYTES = 16 * 1024 * 1024
export function imageMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' {
  if ([137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)) return 'image/png'
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg'
  const ascii=(start:number,end:number)=>String.fromCharCode(...bytes.subarray(start,end))
  if (bytes.length>=12 && ascii(0,4)==='RIFF' && ascii(8,12)==='WEBP') return 'image/webp'
  throw new Error('浏览器兼容导入仅支持实际 PNG、JPEG、WebP 文件；TIFF 请使用桌面原生选择')
}
export function readImportFile(file: File, signal: AbortSignal): Promise<Uint8Array> {
  if (file.size>IMPORT_COMPATIBILITY_BYTES) return Promise.reject(new Error('浏览器兼容导入上限为 16 MiB；请使用桌面原生预览，大图编辑尚未就绪'))
  return new Promise((resolve,reject)=>{
    const reader=new FileReader()
    const abort=()=>{reader.abort();reject(new DOMException('导入已取消','AbortError'))}
    const cleanup=()=>signal.removeEventListener('abort',abort)
    reader.onload=()=>{cleanup();signal.aborted?reject(new DOMException('导入已取消','AbortError')):resolve(new Uint8Array(reader.result as ArrayBuffer))}
    reader.onerror=()=>{cleanup();reject(new Error('图片读取失败'))}
    reader.onabort=()=>{cleanup();reject(new DOMException('导入已取消','AbortError'))}
    if(signal.aborted){abort();return}
    signal.addEventListener('abort',abort,{once:true});reader.readAsArrayBuffer(file)
  })
}
export function nativeEditingError(metadata: ImageAssetMetadata): string | null {
  const swap=metadata.orientation>=5&&metadata.orientation<=8
  return dimensionError(swap?metadata.height:metadata.width,swap?metadata.width:metadata.height)
    ?? (![1,2,3,4].includes(metadata.bands) || !metadata.editingSupported || metadata.sampleType!=='u8' || metadata.pages!==1 || metadata.format==='tiff' ? '此原件当前仅可预览；高精度 / TIFF 编辑与项目持久化尚未就绪' : null)
}
/** Read original encoded bytes only; protocol bounds each response to 256 KiB. */
export async function readNativeOriginal(resource: ImageAssetResource, signal: AbortSignal): Promise<Uint8Array> {
  if(resource.role!=='original'||resource.coordinateSpace!=='source'||!Number.isSafeInteger(resource.bytes)||resource.bytes<1||resource.bytes>IMPORT_COMPATIBILITY_BYTES) throw new Error('原件已保留；当前 16 MiB 兼容编辑预算不足，大图编辑与项目持久化尚未就绪')
  const result=new Uint8Array(resource.bytes), chunk=256*1024
  for(let start=0;start<result.length;start+=chunk){
    signal.throwIfAborted()
    const end=Math.min(start+chunk,result.length)-1
    const response=await fetch(resource.resourceUrl,{headers:{Range:`bytes=${start}-${end}`},signal})
    if(response.status!==206||response.headers.get('Content-Range')!==`bytes ${start}-${end}/${result.length}`){await response.body?.cancel();throw new Error('原件分段读取响应无效')}
    const reader=response.body?.getReader();if(!reader)throw new Error('原件读取失败')
    let offset=start
    try {for(;;){signal.throwIfAborted();const part=await reader.read();if(part.done)break;if(offset+part.value.length>end+1)throw new Error('原件分段超出预算');result.set(part.value,offset);offset+=part.value.length}if(offset!==end+1)throw new Error('原件分段不完整')}
    finally{await reader.cancel()}
  }
  return result
}
