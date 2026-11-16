import {makeProfile,profileForInput} from './iccPipeline'
const text=(b:Uint8Array)=>new TextDecoder().decode(b)
/** Read actual standardized container ICC payloads before browser decoding. */
export async function extractImageProfile(bytes:Uint8Array){
 let profile:Uint8Array|undefined
 if(bytes[0]===137&&text(bytes.slice(1,4))==='PNG'){
  for(let off=8;off+12<=bytes.length;){const n=new DataView(bytes.buffer,bytes.byteOffset+off,4).getUint32(0);if(off+n+12>bytes.length)throw new Error('PNG 数据损坏');if(text(bytes.slice(off+4,off+8))==='iCCP'){const d=bytes.slice(off+8,off+8+n),z=d.indexOf(0);if(z<1||d[z+1]!==0)throw new Error('PNG ICC 数据损坏');const stream=new Response(d.slice(z+2)).body!.pipeThrough(new DecompressionStream('deflate'));const reader=stream.getReader();const parts:Uint8Array[]=[];let size=0;while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>4*1024*1024){await reader.cancel();throw new Error('ICC 配置文件过大')}parts.push(r.value)}profile=new Uint8Array(size);let at=0;for(const p of parts){profile.set(p,at);at+=p.length}break}off+=n+12}
 }else if(bytes[0]===255&&bytes[1]===216){const parts=new Map<number,Uint8Array>();let count=0;for(let off=2;off+4<=bytes.length;){if(bytes[off]!==255)break;const marker=bytes[off+1];if(marker===218||marker===217)break;const n=(bytes[off+2]<<8)|bytes[off+3];if(n<2||off+2+n>bytes.length)throw new Error('JPEG 数据损坏');const d=bytes.slice(off+4,off+2+n);if(marker===226&&text(d.slice(0,12))==='ICC_PROFILE\0'){count=d[13];parts.set(d[12],d.slice(14))}off+=n+2}if(count){if(parts.size!==count)throw new Error('JPEG ICC 分段不完整');const size=[...parts.values()].reduce((a,b)=>a+b.length,0);if(size>4*1024*1024)throw new Error('ICC 配置文件过大');profile=new Uint8Array(size);let at=0;for(let i=1;i<=count;i++){const p=parts.get(i);if(!p)throw new Error('JPEG ICC 分段无效');profile.set(p,at);at+=p.length}}}
 else if(text(bytes.slice(0,4))==='RIFF'&&text(bytes.slice(8,12))==='WEBP'){for(let off=12;off+8<=bytes.length;){const n=new DataView(bytes.buffer,bytes.byteOffset+off+4,4).getUint32(0,true);if(off+8+n>bytes.length)throw new Error('WebP 数据损坏');if(text(bytes.slice(off,off+4))==='ICCP'){profile=bytes.slice(off+8,off+8+n);break}off+=8+n+n%2}}
 return profile?{profile:makeProfile('custom',profile,'embedded')}:profileForInput()
}

export type ImportProfilePolicy = 'preserve' | 'assign'
/** Assignment changes the profile tag, preserving encoded channel numbers; preserve uses the original tag. */
export async function prepareImageProfile(bytes:Uint8Array, mime:string, documentProfile:import('./iccPipeline').IccProfile, policy:ImportProfilePolicy){
 let result:Awaited<ReturnType<typeof extractImageProfile>>, warning:string|undefined
 try{result=await extractImageProfile(bytes);warning=result.warning}catch(e){result=profileForInput();warning=`${e instanceof Error?e.message:'ICC 无效'}；已回退 sRGB`}
 const profile=policy==='assign'?documentProfile:result.profile
 const format=mime==='image/png'?'png':mime==='image/jpeg'?'jpeg':mime==='image/webp'?'webp':null
 // Keep the original profile in the source and let browser image decoding perform the sole display conversion.
 // Missing/invalid profiles get an explicit fallback tag; assignment replaces the tag without changing samples.
 const rewrite=policy==='assign'||!!warning
 if(rewrite&&!format&&policy==='assign')throw new Error('指定配置文件目前支持 PNG、JPEG、WebP；请选择保留嵌入配置文件')
 const output=rewrite&&format?await (await import('./iccEmbedding')).embedProfile(bytes,profile,format):bytes
 let binary='';for(let i=0;i<output.length;i+=32768)binary+=String.fromCharCode(...output.subarray(i,i+32768))
 return {source:`data:${mime};base64,${btoa(binary)}`,profile,warning}
}
