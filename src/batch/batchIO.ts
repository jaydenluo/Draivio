import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'
import { MAX_BATCH_PIXELS, MAX_BATCH_FILES, type BatchInput } from './batchProcessor'
export type BrowserDirectory={name:string;getFileHandle:(name:string,options?:{create?:boolean})=>Promise<{createWritable:()=>Promise<{write:(data:Blob)=>Promise<void>;close:()=>Promise<void>;abort:()=>Promise<void>}>}>}
export type BatchDirectory={name:string;token?:string;handle?:BrowserDirectory}
export async function chooseBatchInputs(folder:boolean):Promise<BatchInput[]|null> {
  if(isTauri())return invokeCommand<BatchInput[]|null>('batch_pick_inputs',{folder})
  return new Promise(resolve=>{const input=document.createElement('input');input.type='file';input.multiple=true;input.accept='image/png,image/jpeg,image/webp';if(folder)input.setAttribute('webkitdirectory','');input.onchange=()=>resolve(Array.from(input.files??[]).filter(f=>/\.(png|jpe?g|webp)$/i.test(f.name)).slice(0,MAX_BATCH_FILES+1).map((file,index)=>({id:`${index}-${file.name}`,name:file.webkitRelativePath||file.name,file})));input.addEventListener('cancel',()=>resolve(null));input.click()})
}
export async function chooseBatchDirectory():Promise<BatchDirectory|null> {
  if(isTauri())return invokeCommand<BatchDirectory|null>('batch_pick_output')
  const picker=(window as unknown as {showDirectoryPicker?: (options:{mode:string})=>Promise<BrowserDirectory>}).showDirectoryPicker
  if(!picker)throw new Error('当前浏览器不支持目录写入，请使用桌面应用或支持目录访问的浏览器')
  try{const handle=await picker({mode:'readwrite'});return {name:handle.name,handle}}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return null;throw new Error('目录访问被拒绝，请重新选择')}
}
export async function readBatchInput(input:BatchInput):Promise<Blob>{if(input.file){if(input.file.size>32*1024*1024)throw new Error('输入文件超过 32MB');return input.file}if(!input.token)throw new Error('输入已失效');const bytes=await invokeCommand<number[]>('batch_read_input',{token:input.token});return new Blob([new Uint8Array(bytes)])}
export async function saveUniqueBrowserOutput(dir:BrowserDirectory,name:string,blob:Blob){
  if(/[\\/\x00-\x1f]/.test(name)||name.startsWith('.'))throw new Error('输出名称无效')
  const dot=name.lastIndexOf('.'),stem=name.slice(0,dot),ext=name.slice(dot)
  for(let n=1;n<=10000;n++){const candidate=n===1?name:`${stem}-${n}${ext}`;try{await dir.getFileHandle(candidate);continue}catch(e){if(!(e instanceof DOMException)||e.name!=='NotFoundError')throw e}
    const handle=await dir.getFileHandle(candidate,{create:true}),stream=await handle.createWritable();try{await stream.write(blob);await stream.close()}catch(e){try{await stream.abort()}catch{/* original reason */}throw e}return `${dir.name}/${candidate}`}
  throw new Error('输出名称冲突过多')
}
export async function writeBatchOutput(dir:BatchDirectory,name:string,blob:Blob){if(dir.token)return invokeCommand<string>('batch_write_output',{token:dir.token,name,bytes:Array.from(new Uint8Array(await blob.arrayBuffer()))});if(dir.handle)return saveUniqueBrowserOutput(dir.handle,name,blob);throw new Error('请重新选择输出目录')}
/** Parse codec headers before a browser decoder may allocate a large bitmap. */
export function imageHeaderSize(bytes:Uint8Array){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let width=0,height=0
  const ascii=(offset:number,size:number)=>String.fromCharCode(...bytes.subarray(offset,offset+size))
  if(bytes.length>=24&&ascii(1,3)==='PNG'){width=view.getUint32(16);height=view.getUint32(20)}
  else if(bytes.length>=30&&ascii(0,4)==='RIFF'&&ascii(8,4)==='WEBP'){
    const kind=ascii(12,4)
    if(kind==='VP8X'){width=1+bytes[24]+(bytes[25]<<8)+(bytes[26]<<16);height=1+bytes[27]+(bytes[28]<<8)+(bytes[29]<<16)}
    else if(kind==='VP8 '){width=view.getUint16(26,true)&0x3fff;height=view.getUint16(28,true)&0x3fff}
    else if(kind==='VP8L'){const bits=view.getUint32(21,true);width=(bits&0x3fff)+1;height=((bits>>>14)&0x3fff)+1}
  }else if(bytes[0]===255&&bytes[1]===216){let offset=2;while(offset+4<bytes.length){if(bytes[offset]!==255)break;const marker=bytes[offset+1];if(marker===217||marker===218)break;if(marker===216||marker===1||marker>=208&&marker<=215){offset+=2;continue}const length=view.getUint16(offset+2);if(length<2||offset+2+length>bytes.length)break;if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)&&length>=7){height=view.getUint16(offset+5);width=view.getUint16(offset+7);break}offset+=2+length}}
  if(!width||!height)throw new Error('文件损坏或格式不支持（PNG、JPEG、WebP）')
  if(width*height>MAX_BATCH_PIXELS)throw new Error('输入图片超过 8MP，请先缩小')
  return {width,height}
}
