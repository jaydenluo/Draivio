export type ColorProfileId = 'srgb' | 'display-p3' | 'custom'
export type RenderingIntent = 'perceptual' | 'relative-colorimetric' | 'saturation' | 'absolute-colorimetric'
export type IccProfile = { id: ColorProfileId; name: string; bytes: Uint8Array; source: 'embedded' | 'default' | 'user'; checksum: string }
export type ColorManagementSettings = { profile: IccProfile; renderingIntent: RenderingIntent }
const enc = new TextEncoder()
const matrices = { srgb: [[.4360747,.3850649,.1430804],[.2225045,.7168786,.0606169],[.0139322,.0971045,.7141733]], 'display-p3': [[.515102,.291965,.157153],[.241182,.692236,.0665819],[-.00104941,.0418818,.784378]] }
export function checksum(bytes: Uint8Array) { let h=2166136261; for(const b of bytes) h=Math.imul(h^b,16777619)>>>0; return h.toString(16).padStart(8,'0') }
export function makeProfile(id: ColorProfileId, bytes: Uint8Array, source: IccProfile['source'] = 'embedded'): IccProfile {
 if(bytes.length>4*1024*1024) throw new Error('ICC 配置文件过大（最大 4MB）')
 if(bytes.length<132) throw new Error('ICC 配置文件损坏或不完整')
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength), str=(n:number)=>new TextDecoder().decode(bytes.slice(n,n+4))
 if(str(36)!=='acsp'||str(16)!=='RGB '||str(20)!=='XYZ '||view.getUint32(0)!==bytes.length) throw new Error('不支持的 ICC 配置文件格式（仅 RGB/XYZ）')
 const count=view.getUint32(128); if(count>4096||132+count*12>bytes.length) throw new Error('ICC 标签表损坏')
 for(let i=0;i<count;i++){const at=132+i*12,off=view.getUint32(at+4),size=view.getUint32(at+8);if(off<132+count*12||off+size>bytes.length)throw new Error('ICC 标签范围无效')}
 return {id,name:id==='display-p3'?'Display P3':id==='srgb'?'sRGB':'自定义 RGB',bytes:new Uint8Array(bytes),source,checksum:checksum(bytes)}
}
/** ICC v4 matrix/TRC RGB profiles, D50 PCS with Bradford adapted primaries. */
export function defaultProfile(id: Exclude<ColorProfileId,'custom'>='srgb'): IccProfile {
 const tags: [string,Uint8Array][]=[]; const fixed=(v:DataView,n:number,x:number)=>v.setInt32(n,Math.round(x*65536))
 const xyz=(values:number[])=>{const b=new Uint8Array(20);b.set(enc.encode('XYZ '));const v=new DataView(b.buffer);values.forEach((x,i)=>fixed(v,8+i*4,x));return b}
 tags.push(['wtpt',xyz([.9642,1,.8249])]);const m=matrices[id]; for(let i=0;i<3;i++)tags.push([['rXYZ','gXYZ','bXYZ'][i],xyz(m.map(row=>row[i]))])
 const trc=new Uint8Array(40);trc.set(enc.encode('para'));const tv=new DataView(trc.buffer);tv.setUint16(8,4);[2.4,1/1.055,.055/1.055,1/12.92,.04045,0,0].forEach((x,i)=>fixed(tv,12+i*4,x));for(const key of ['rTRC','gTRC','bTRC'])tags.push([key,trc])
 const desc=new Uint8Array(40);desc.set(enc.encode('mluc'));const dv=new DataView(desc.buffer);dv.setUint32(8,1);dv.setUint32(12,12);desc.set(enc.encode('enUS'),16);dv.setUint32(20,12);dv.setUint32(24,28);for(let i=0;i<6;i++)dv.setUint16(28+i*2,'RGB v4'[i].charCodeAt(0));tags.push(['desc',desc]); tags.push(['cprt',desc])
 const b=new Uint8Array(132+tags.length*12+tags.reduce((n,t)=>n+t[1].length,0));const v=new DataView(b.buffer);v.setUint32(0,b.length);v.setUint32(8,0x04300000);b.set(enc.encode('mntrRGB XYZ '),12);v.setUint16(24,2026);v.setUint16(26,1);v.setUint16(28,1);b.set(enc.encode('acsp'),36);fixed(v,68,.9642);fixed(v,72,1);fixed(v,76,.8249);v.setUint32(128,tags.length);let off=132+tags.length*12;tags.forEach(([name,data],i)=>{b.set(enc.encode(name),132+i*12);v.setUint32(136+i*12,off);v.setUint32(140+i*12,data.length);b.set(data,off);off+=data.length});return makeProfile(id,b,'default')
}
export function normalizeColorManagement(value: unknown): ColorManagementSettings {
 if(value===undefined)return {profile:defaultProfile(),renderingIntent:'relative-colorimetric'}
 const s=value as ColorManagementSettings,p=s?.profile; if(!p||!['srgb','display-p3','custom'].includes(p.id)||!['perceptual','relative-colorimetric','saturation','absolute-colorimetric'].includes(s.renderingIntent))throw new Error('色彩管理设置无效')
 const raw=p.bytes as unknown; if(!(raw instanceof Uint8Array)&&(!Array.isArray(raw)||raw.some(n=>!Number.isInteger(n)||n<0||n>255)))throw new Error('ICC 字节数据无效')
 const profile=makeProfile(p.id,new Uint8Array(raw as number[]),p.source);if(profile.checksum!==p.checksum)throw new Error('ICC 校验和不匹配');return {profile,renderingIntent:s.renderingIntent}
}
export function profileForInput(bytes?: Uint8Array, fallback: Exclude<ColorProfileId,'custom'>='srgb') { if(!bytes?.length)return {profile:defaultProfile(fallback),warning:'未嵌入 ICC，已按默认色彩空间处理'}; return {profile:makeProfile('custom',bytes,'embedded')} }
function inverse(m:number[][]){const [a,b,c]=m[0],[d,e,f]=m[1],[g,h,i]=m[2],det=a*(e*i-f*h)-b*(d*i-f*g)+c*(d*h-e*g);return [[e*i-f*h,c*h-b*i,b*f-c*e],[f*g-d*i,a*i-c*g,c*d-a*f],[d*h-e*g,b*g-a*h,a*e-b*d]].map(r=>r.map(v=>v/det))}
export function convertRgb(rgb:[number,number,number], from:ColorProfileId, to:ColorProfileId):[number,number,number] { if(from===to)return rgb;if(from==='custom'||to==='custom')throw new Error('自定义 ICC 转换需要原生色彩引擎');const linear=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4}), xyz=matrices[from].map(r=>r.reduce((n,v,i)=>n+v*linear[i],0));return inverse(matrices[to]).map(r=>{const x=r.reduce((n,v,i)=>n+v*xyz[i],0);return Math.round(Math.min(1,Math.max(0,x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055))*255)}) as [number,number,number] }
export function processRgba(data:Uint8ClampedArray,width:number,height:number,from:ColorProfileId,to:ColorProfileId){if(data.length!==width*height*4)throw new Error('像素尺寸不匹配');if(from==='custom'||to==='custom')throw new Error('自定义 ICC 转换需要原生色彩引擎');const out=new Uint8ClampedArray(data);for(let i=0;i<width*height;i++){if(out[i*4+3]===0)continue;out.set(convertRgb([out[i*4],out[i*4+1],out[i*4+2]],from,to),i*4)}return out}

/** Custom profiles are transformed by the native ICC engine, never by profile-name approximation. */
export async function transformProfileRgba(data:Uint8ClampedArray,width:number,height:number,from:IccProfile,to:IccProfile,intent:RenderingIntent='relative-colorimetric') {
 if(data.length!==width*height*4)throw new Error('像素尺寸不匹配')
 makeProfile(from.id,from.bytes,from.source);makeProfile(to.id,to.bytes,to.source)
 if(from.id!=='custom'&&to.id!=='custom'&&intent!=='absolute-colorimetric')return processRgba(data,width,height,from.id,to.id)
 if(!(window as unknown as {__TAURI_INTERNALS__?:unknown}).__TAURI_INTERNALS__)throw new Error('自定义 ICC 和绝对色度转换需要桌面原生色彩引擎；浏览器可使用 sRGB / Display P3')
 const {invokeCommand}=await import('../lib/native')
 const out=await invokeCommand<number[]>('transform_rgba_icc',{pixels:Array.from(data),width,height,sourceProfile:Array.from(from.bytes),destinationProfile:Array.from(to.bytes),intent})
 return new Uint8ClampedArray(out)
}
