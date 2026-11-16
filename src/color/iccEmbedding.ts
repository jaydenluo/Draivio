import { makeProfile, type IccProfile } from './iccPipeline'
const enc=new TextEncoder()
function join(...parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length}return out}
function crc32(b:Uint8Array){let c=0xffffffff;for(const x of b){c^=x;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0)}return (c^0xffffffff)>>>0}
function pngChunk(type:string,data:Uint8Array){const body=join(enc.encode(type),data),out=new Uint8Array(data.length+12),v=new DataView(out.buffer);v.setUint32(0,data.length);out.set(body,4);v.setUint32(out.length-4,crc32(body));return out}
/** Inserts real ICC container metadata; refuses unsupported/malformed encoded images. */
export async function embedProfile(source:Uint8Array,profile:IccProfile,format:'png'|'jpeg'|'webp'):Promise<Uint8Array>{
 const p=makeProfile(profile.id,profile.bytes,profile.source)
 if(format==='png'){
  if(source.length<33||source[0]!==137||new TextDecoder().decode(source.slice(1,4))!=='PNG')throw new Error('PNG 编码无效')
  const stream=new ReadableStream<BufferSource>({ start(controller) { controller.enqueue(new Uint8Array(p.bytes)); controller.close() } }).pipeThrough(new CompressionStream('deflate'));const compressed=new Uint8Array(await new Response(stream).arrayBuffer())
  const chunks:Uint8Array[]=[source.slice(0,8)];let off=8,inserted=false
  while(off+12<=source.length){const size=new DataView(source.buffer,source.byteOffset+off,4).getUint32(0),end=off+12+size;if(end>source.length)throw new Error('PNG 数据损坏');const type=new TextDecoder().decode(source.slice(off+4,off+8));if(!['iCCP','sRGB','gAMA','cHRM'].includes(type))chunks.push(source.slice(off,end));if(type==='IHDR'){chunks.push(pngChunk('iCCP',join(enc.encode('Draivio RGB'),new Uint8Array([0,0]),compressed)));inserted=true}off=end}if(!inserted)throw new Error('PNG 缺少 IHDR');return join(...chunks)
 }
 if(format==='jpeg'){
  if(source[0]!==255||source[1]!==216)throw new Error('JPEG 编码无效');const chunks=[source.slice(0,2)],max=65519,count=Math.ceil(p.bytes.length/max);for(let i=0;i<count;i++){const data=join(enc.encode('ICC_PROFILE\0'),new Uint8Array([i+1,count]),p.bytes.slice(i*max,(i+1)*max)),header=new Uint8Array([255,226,0,0]);new DataView(header.buffer).setUint16(2,data.length+2);chunks.push(header,data)}let off=2;while(off+4<=source.length&&source[off]===255&&![218,217].includes(source[off+1])){const n=(source[off+2]<<8)|source[off+3];if(n<2||off+n+2>source.length)throw new Error('JPEG 数据损坏');if(!(source[off+1]===226&&new TextDecoder().decode(source.slice(off+4,off+16))==='ICC_PROFILE\0'))chunks.push(source.slice(off,off+n+2));off+=n+2}chunks.push(source.slice(off));return join(...chunks)
 }
 if(source.length<12||new TextDecoder().decode(source.slice(0,4))!=='RIFF'||new TextDecoder().decode(source.slice(8,12))!=='WEBP')throw new Error('WebP 编码无效')
 const chunks:Uint8Array[]=[];let off=12,hasVp8x=false
 while(off+8<=source.length){const n=new DataView(source.buffer,source.byteOffset+off+4,4).getUint32(0,true),end=off+8+n+(n%2);if(end>source.length)throw new Error('WebP 数据损坏');const type=new TextDecoder().decode(source.slice(off,off+4));if(type!=='ICCP'){const c=source.slice(off,end);if(type==='VP8X'){c[8]|=0x20;hasVp8x=true}chunks.push(c)}off=end}
 if(!hasVp8x){const image=chunks.find(c=>['VP8 ','VP8L'].includes(new TextDecoder().decode(c.slice(0,4))));if(!image)throw new Error('WebP 缺少图像');let w=0,h=0;const type=new TextDecoder().decode(image.slice(0,4));if(type==='VP8L'){const bits=new DataView(image.buffer,image.byteOffset+9,4).getUint32(0,true);w=(bits&0x3fff)+1;h=((bits>>>14)&0x3fff)+1}else{w=(image[14]|image[15]<<8)&0x3fff;h=(image[16]|image[17]<<8)&0x3fff}if(!w||!h)throw new Error('WebP 尺寸无效');const x=new Uint8Array(18);x.set(enc.encode('VP8X'));new DataView(x.buffer).setUint32(4,10,true);x[8]=0x20|(type==='VP8L'?0x10:0);for(let i=0;i<3;i++){x[12+i]=(w-1)>>(i*8)&255;x[15+i]=(h-1)>>(i*8)&255}chunks.unshift(x)}
 const icc=new Uint8Array(8+p.bytes.length+(p.bytes.length%2));icc.set(enc.encode('ICCP'));new DataView(icc.buffer).setUint32(4,p.bytes.length,true);icc.set(p.bytes,8);chunks.splice(1,0,icc);const out=join(source.slice(0,12),...chunks);new DataView(out.buffer).setUint32(4,out.length-8,true);return out
}
