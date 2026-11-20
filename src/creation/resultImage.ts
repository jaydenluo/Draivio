import {imageHeaderSize} from '../batch/batchIO'
import {dimensionError} from '../document/documentGeometry'

export function resultImageData(source:string){
 const match=/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=\r\n]+)$/.exec(source)
 if(!match||source.length>90*1024*1024)throw new Error('结果尚未下载为可用的本地图片')
 let binary:string
 try{binary=atob(match[2])}catch{throw new Error('图片数据损坏')}
 const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0))
 const png=bytes.length>=8&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v)
 const jpeg=bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255
 const webp=bytes.length>=12&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP'
 if(!(match[1]==='image/png'?png:match[1]==='image/jpeg'?jpeg:webp))throw new Error('图片格式与内容不一致')
 if(bytes.length>64*1024*1024)throw new Error('图片超过本地保存的 64MB 限制')
 return {bytes,mime:match[1],extension:match[1]==='image/jpeg'?'jpg':match[1].split('/')[1]}
}
export function resultDimensions(source:string){
 const {bytes}=resultImageData(source),size=imageHeaderSize(bytes,32*1024*1024),error=dimensionError(size.width,size.height)
 if(error)throw new Error(error)
 return size
}
export async function copyResultImage(source:string){
 if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')throw new Error('当前环境不支持复制图片，请使用保存图片')
 const data=resultImageData(source)
 let blob=new Blob([data.bytes],{type:data.mime})
 if(data.mime!=='image/png'){
  const {width,height}=resultDimensions(source)
  const image=new Image();image.src=source;await image.decode()
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('无法转换剪贴板图片')
  ctx.drawImage(image,0,0)
  blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('图片复制失败')),'image/png'))
 }
 await navigator.clipboard.write([new ClipboardItem({'image/png':blob})])
}

export function resultSizeLabel(source:string,fallback:string){
 try{const size=resultDimensions(source);return `${size.width} × ${size.height}`}catch{return fallback}
}
