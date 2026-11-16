import type { IccProfile, RenderingIntent } from './iccPipeline'
import { checksum } from './iccPipeline'
const base64Bytes=(bytes:Uint8Array)=>{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result)}
const fromBase64=(text:string)=>Uint8Array.from(atob(text),x=>x.charCodeAt(0))

export type SoftProofProfile = IccProfile & { colorSpace?: 'RGB' | 'CMYK' }
export function makeSoftProofProfile(bytes: Uint8Array, name='目标印刷 ICC'): SoftProofProfile {
 if(bytes.length<132 || new TextDecoder().decode(bytes.slice(36,40))!=='acsp') throw new Error('目标 ICC 配置文件无效')
 const space=new TextDecoder().decode(bytes.slice(16,20)); if(space!=='CMYK' && space!=='RGB ') throw new Error('目标 ICC 必须是 CMYK 或 RGB 配置文件')
 return { id:'custom', name, bytes:new Uint8Array(bytes), source:'user', checksum:checksum(bytes), colorSpace:space==='CMYK'?'CMYK':'RGB' } as SoftProofProfile
}
export type SoftProofSettings = {
  enabled: boolean
  targetProfile?: SoftProofProfile
  renderingIntent: RenderingIntent
  blackPointCompensation: boolean
  simulatePaperWhite: boolean
  simulateBlackInk: boolean
  totalInkLimit: number
}
export type SoftProofReport = { profileName: string; profileChecksum: string; renderingIntent: RenderingIntent; totalInkPercent: number; maxInkPercent: number; outOfGamutPixels: number; pixels: number; warning: string | null }
export const defaultSoftProofSettings = (): SoftProofSettings => ({ enabled:false, renderingIntent:'relative-colorimetric', blackPointCompensation:true, simulatePaperWhite:false, simulateBlackInk:false, totalInkLimit:3 })
export function validateSoftProofSettings(value: unknown): asserts value is SoftProofSettings {
  if (!value || typeof value !== 'object') throw new Error('软打样设置无效')
  const s=value as SoftProofSettings
  if (typeof s.enabled!=='boolean' || !['perceptual','relative-colorimetric','saturation','absolute-colorimetric'].includes(s.renderingIntent)) throw new Error('软打样渲染意图无效')
  if (typeof s.blackPointCompensation!=='boolean'||typeof s.simulatePaperWhite!=='boolean'||typeof s.simulateBlackInk!=='boolean'||!Number.isFinite(s.totalInkLimit)||s.totalInkLimit<=0||s.totalInkLimit>4) throw new Error('软打样参数无效')
  if (s.targetProfile) { const p=s.targetProfile; makeSoftProofProfile(p.bytes,p.name); if (p.checksum!==checksum(p.bytes)) throw new Error('软打样 ICC 校验和不匹配') }
}
export function analyzeCmyk(data: Uint8Array, profile: IccProfile, totalInkLimit: number): SoftProofReport {
  if (data.length%4!==0) throw new Error('CMYK 样本长度无效')
  let max=0,sum=0,out=0
  for(let i=0;i<data.length;i+=4){const ink=(data[i]+data[i+1]+data[i+2]+data[i+3])/255;sum+=ink;max=Math.max(max,ink);if(ink>totalInkLimit)out++}
  return {profileName:profile.name,profileChecksum:profile.checksum,renderingIntent:'relative-colorimetric',totalInkPercent:data.length?sum/(data.length/4)*100:0,maxInkPercent:max*100,outOfGamutPixels:out,pixels:data.length/4,warning:out?`${out} 个像素超过目标 profile 总墨量 ${(totalInkLimit*100).toFixed(0)}%`:null}
}
export async function renderSoftProof(rgba: Uint8ClampedArray,width:number,height:number,sourceProfile:IccProfile,targetProfile:SoftProofProfile,settings:Pick<SoftProofSettings,'renderingIntent'|'blackPointCompensation'|'simulatePaperWhite'|'simulateBlackInk'|'totalInkLimit'>):Promise<{rgba:Uint8ClampedArray;cmyk:Uint8Array;report:SoftProofReport}> {
  const { cmykBackend } = await import('./cmykRaster')
  const result=await cmykBackend({operation:'convert',width,height,data:base64Bytes(new Uint8Array(rgba)),profile:base64Bytes(targetProfile.bytes),sourceProfile:base64Bytes(sourceProfile.bytes),renderingIntent:settings.renderingIntent,blackPointCompensation:settings.blackPointCompensation,simulatePaperWhite:settings.simulatePaperWhite,simulateBlackInk:settings.simulateBlackInk,totalInkLimit:settings.totalInkLimit})
  const cmyk=fromBase64(result.data), report=analyzeCmyk(cmyk,targetProfile,settings.totalInkLimit)
  report.renderingIntent=settings.renderingIntent
  return {rgba:new Uint8ClampedArray(fromBase64(result.rgb)),cmyk,report}
}
