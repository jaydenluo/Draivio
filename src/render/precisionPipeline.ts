import { createCurveSampler, type CurvesSettings } from '../adjustments/curves'
import { clonePixelBuffer, createPixelBuffer, enforceBudget, readNormalized, writeNormalized, type PixelBuffer, type PixelFormat } from './pixelBuffer'

export type PrecisionProcessOptions = {
  exposureEV?: number; curves?: CurvesSettings; mask?: Float32Array
  signal?: AbortSignal; yieldRows?: number; yieldControl?: () => Promise<void>; maxBytes?: number
}
export function precisionMemoryEstimate(width: number, height: number, format: PixelFormat, maxBytes = 512 * 1024 * 1024) {
  enforceBudget(width,height,format,maxBytes)
  const sourceBytes = width * height * 4 * (format === 'rgba8' ? 1 : format === 'rgba16' ? 2 : 4)
  const peakBytes = sourceBytes * 16
  if (peakBytes > maxBytes) throw new Error(`高精度处理超出预算：${peakBytes} bytes；请降低预览分辨率或分块处理，原始资源保留`)
  return {sourceBytes, outputBytes: sourceBytes, estimatedPeakBytes: peakBytes, maxBytes}
}
function curve(points: CurvesSettings['rgb']) {
  const sample = createCurveSampler(points)
  if (points.every(p => p.x === p.y)) return (x: number) => x
  return (value: number) => {
    if (value < 0) return points[0].y + value * (points[1].y-points[0].y)/(points[1].x-points[0].x)
    if (value > 1) {const a=points.at(-2)!, b=points.at(-1)!;return b.y+(value-1)*(b.y-a.y)/(b.x-a.x)}
    return sample(value)
  }
}
function cancelled(signal?: AbortSignal) { if (signal?.aborted) throw new DOMException('高精度处理已取消','AbortError') }

export async function convertPrecision(source: PixelBuffer, target: PixelFormat, options: Pick<PrecisionProcessOptions,'signal'|'yieldRows'|'yieldControl'|'maxBytes'> & {dither?:boolean;seed?:number} = {}): Promise<PixelBuffer> {
  cancelled(options.signal)
  const maxBytes=options.maxBytes??512*1024*1024
  enforceBudget(source.width,source.height,target,maxBytes)
  const bytes=16*Math.max(source.data.byteLength,source.width*source.height*4*(target==='rgba8'?1:target==='rgba16'?2:4))
  if(bytes>maxBytes)throw new Error(`位深转换超出预算：${bytes} bytes`)
  const out=createPixelBuffer(source.width,source.height,target),rows=Math.max(1,options.yieldRows??32)
  const yieldControl=options.yieldControl??(()=>new Promise<void>(resolve=>setTimeout(resolve,0)))
  let seed=(options.seed??1)>>>0
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
  const quantum=target==='rgba8'?1/255:1/65535
  for(let y=0;y<source.height;y++){
    cancelled(options.signal)
    for(let x=0;x<source.width;x++){
      const i=y*source.width+x,rgba=readNormalized(source,i)
      if(options.dither&&target!=='rgba32f')for(let c=0;c<3;c++)rgba[c]+=(random()-.5)*quantum
      writeNormalized(out,i,rgba)
    }
    if((y+1)%rows===0)await yieldControl()
  }
  cancelled(options.signal)
  return out
}

/** Source and output remain typed; only display preview is converted to8bit elsewhere.
 * Curves use normalized scene-linear anchors and linear HDR endpoint extrapolation. */
export async function processPrecision(source: PixelBuffer, options: PrecisionProcessOptions = {}): Promise<PixelBuffer> {
  cancelled(options.signal)
  precisionMemoryEstimate(source.width,source.height,source.format,options.maxBytes)
  const ev=options.exposureEV??0
  if (!Number.isFinite(ev)||ev < -16||ev > 16) throw new Error('高精度曝光范围为 -16–16 EV')
  if (options.mask && (options.mask.length !== source.width*source.height || options.mask.some(v=>!Number.isFinite(v)||v<0||v>1))) throw new Error('高精度蒙版长度或取值无效')
  const master=options.curves?curve(options.curves.rgb):(v:number)=>v
  const samplers=options.curves?(['r','g','b'] as const).map(c=>curve(options.curves![c])):Array.from({length:3},()=> (v:number)=>v)
  const output=clonePixelBuffer(source),gain=2**ev,yieldRows=Math.max(1,Math.floor(options.yieldRows??32))
  const yieldControl=options.yieldControl??(()=>new Promise<void>(resolve=>setTimeout(resolve,0)))
  for(let y=0;y<source.height;y++) {
    cancelled(options.signal)
    for(let x=0;x<source.width;x++) {
      const i=y*source.width+x, rgba=readNormalized(source,i), weight=options.mask?.[i]??1
      const result=rgba.map((v,c)=>c===3?v:v+(samplers[c](master(v*gain))-v)*weight)
      if(result.some(v=>!Number.isFinite(v)))throw new Error('高精度处理产生非有限值，源资源已保留')
      writeNormalized(output,i,result)
    }
    if((y+1)%yieldRows===0)await yieldControl()
  }
  cancelled(options.signal)
  return output
}

export function compositePrecision(base: PixelBuffer, top: PixelBuffer, mode: 'normal'|'multiply'|'screen'='normal', opacity=1, mask?: Float32Array): PixelBuffer {
  if(base.width!==top.width||base.height!==top.height||base.format!==top.format)throw new Error('高精度合成尺寸与格式须一致')
  if(!Number.isFinite(opacity)||opacity<0||opacity>1||mask&&(mask.length!==base.width*base.height||mask.some(v=>!Number.isFinite(v)||v<0||v>1)))throw new Error('高精度合成透明度或蒙版无效')
  if(!['normal','multiply','screen'].includes(mode))throw new Error('该混合模式尚未支持高精度处理')
  precisionMemoryEstimate(base.width,base.height,base.format)
  const out=clonePixelBuffer(base)
  for(let i=0;i<base.width*base.height;i++) {
    const b=readNormalized(base,i),t=readNormalized(top,i), ab=Math.max(0,Math.min(1,b[3])), at=Math.max(0,Math.min(1,t[3]))*opacity*(mask?.[i]??1), alpha=at+ab*(1-at)
    const rgba=b.map((v,c)=>{
      if(c===3)return alpha
      const blend=mode==='multiply'?v*t[c]:mode==='screen'?1-(1-v)*(1-t[c]):t[c]
      return alpha?((1-at)*ab*v+(1-ab)*at*t[c]+ab*at*blend)/alpha:0
    })
    writeNormalized(out,i,rgba)
  }
  return out
}
