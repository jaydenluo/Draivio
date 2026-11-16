import { applyUnsharpMask } from '../filters/sharpen'
import { applyDenoise } from '../filters/denoise'
import { applyLayerAdjustments } from '../imaging/layerAdjustments'
import { validateAdjustmentSettings } from '../adjustments/validateAdjustments'
import type { LayerAdjustments } from '../state/editor'
import { validateFilterSelection } from '../filters/selection'
import { rasterizeSelectionMask } from '../canvas/selectionRaster'
import type { Selection } from '../canvas/selectionGeometry'
import { applyCommonFilter, type CommonKind } from '../filters/common'
import type { SelectionRect } from '../canvas/selectionGeometry'
export const MAX_FILTER_RADIUS = 64
export const MAX_SMART_FILTERS = 16
export const FILTER_RADIUS_REASON = '半径最多 64 个图层本地像素，以限制渲染内存和计算成本，保证交互性能。'
export type SmartFilterKind = 'gaussian' | 'sharpen' | 'highpass' | 'denoise' | 'color' | CommonKind
export type SmartFilter = { id: string; kind: SmartFilterKind; enabled: boolean; radius: number; amount: number; threshold?: number; angle?: number; size?: number; seed?: number; adjustments?: LayerAdjustments; selection?: Selection }
export type SmartFilterMask = { enabled: boolean; inverted: boolean; rect: SelectionRect }
export type SmartFilterChain = { items: SmartFilter[]; mask?: SmartFilterMask; selection?: Selection }
export const smartFilterNames: Record<SmartFilterKind, string> = { denoise: '保边降噪', color: '局部颜色调整', gaussian: '高斯模糊', sharpen: '锐化', highpass: '高反差保留', motion: '方向运动模糊', radial: '径向模糊', pixelate: '像素化', grain: '颗粒', vignette: '晕影' }
export function createSmartFilter(kind: SmartFilterKind, id: string): SmartFilter { return { id, kind, enabled: true, radius: 0, amount: 0, ...(kind==='sharpen'||kind==='denoise'?{threshold:0}:{}), ...(['motion','radial','pixelate','grain','vignette'].includes(kind)?{angle:0,size:1,seed:0}:{}) } }
function record(v: unknown): Record<string, unknown> { if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('智能滤镜结构无效'); return v as Record<string, unknown> }
function keys(v: Record<string, unknown>, fields: string[]) { if (Object.keys(v).some(k => !fields.includes(k))) throw new Error('智能滤镜包含未知字段') }
function numeric(v: unknown, lo: number, hi: number) { if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error('智能滤镜参数超出范围'); return v }
export function validateSmartFilters(value: unknown): SmartFilterChain {
 const c=record(value); keys(c,['items','mask','selection'])
 if (!Array.isArray(c.items) || c.items.length>MAX_SMART_FILTERS) throw new Error('智能滤镜链最多 16 步')
 const ids=new Set<string>()
 const integer=(v:unknown,lo:number,hi:number)=>{const n=numeric(v,lo,hi);if(!Number.isInteger(n))throw new Error('像素块尺寸与随机种子必须为整数');return n}
 const items=c.items.map(v=>{const f=record(v);keys(f,['id','kind','enabled','radius','amount','threshold','angle','size','seed','adjustments','selection']);if(typeof f.id!=='string'||!f.id||f.id.length>128||ids.has(f.id))throw new Error('智能滤镜 ID 缺失或重复');ids.add(f.id);if(!['gaussian','sharpen','highpass','motion','radial','pixelate','grain','vignette','color','denoise'].includes(f.kind as string)||typeof f.enabled!=='boolean')throw new Error('智能滤镜类型或开关无效');if(typeof f.radius==='number'&&f.radius>MAX_FILTER_RADIUS)throw new Error(FILTER_RADIUS_REASON);if(f.selection!==undefined&&!['color','sharpen','denoise'].includes(f.kind as string))throw new Error('此滤镜不支持单步选区');if(f.kind!=='color'&&f.adjustments!==undefined)throw new Error('仅颜色滤镜接受颜色参数');if(f.kind==='denoise'){numeric(f.radius,0,8);numeric(f.amount,0,1)}if(f.threshold!==undefined){if(!['sharpen','denoise'].includes(f.kind as string))throw new Error('此滤镜不接受阈值');numeric(f.threshold,0,f.kind==='denoise'?100:255)}if(f.kind==='color'&&f.adjustments===undefined)throw new Error('颜色滤镜缺少参数');return {...(f.kind==='color'?{adjustments:validateAdjustmentSettings(f.adjustments)}:{}),...(f.selection!==undefined?{selection:validateFilterSelection(f.selection)}:{}),...(f.threshold!==undefined?{threshold:numeric(f.threshold,0,f.kind==='denoise'?100:255)}:{}),id:f.id,kind:f.kind as SmartFilterKind,enabled:f.enabled,radius:numeric(f.radius,0,MAX_FILTER_RADIUS),amount:numeric(f.amount,0,['grain','vignette'].includes(f.kind as string)?1:5),...(f.angle!==undefined?{angle:numeric(f.angle,-360,360)}:{}),...(f.size!==undefined?{size:integer(f.size,1,64)}:{}),...(f.seed!==undefined?{seed:integer(f.seed,0,2147483647)}:{})}})
 let mask:SmartFilterMask|undefined
 if(c.mask!==undefined){const m=record(c.mask);keys(m,['enabled','inverted','rect']);if(typeof m.enabled!=='boolean'||typeof m.inverted!=='boolean')throw new Error('滤镜蒙版开关无效');const r=record(m.rect);keys(r,['x','y','width','height']);mask={enabled:m.enabled,inverted:m.inverted,rect:{x:numeric(r.x,0,100),y:numeric(r.y,0,100),width:numeric(r.width,0,100),height:numeric(r.height,0,100)}};if(mask.rect.x+mask.rect.width>100||mask.rect.y+mask.rect.height>100)throw new Error('滤镜蒙版必须位于图层本地 0–100% 范围')}
 return {items,...(mask?{mask}:{}),...(c.selection!==undefined?{selection:validateFilterSelection(c.selection)}:{})}
}
export function activeSmartFilters(chain?: SmartFilterChain): SmartFilter[] { return chain ? validateSmartFilters(chain).items.filter(f=>f.enabled&&(f.kind==='color'?true:f.kind==='grain'||f.kind==='vignette'?f.amount>0:f.kind==='pixelate'?(f.size??1)>1:f.radius>0&&(f.kind==='gaussian'||f.kind==='motion'||f.kind==='radial'||f.amount>0))) : [] }
// Keep the established SVG arithmetic path for the original Gaussian/USM/
// highpass chains. The newer denoiser and thresholded/local USM need the
// shared CPU implementation so preview and export can use the same pixels.
export function requiresCpuSmartFilters(chain?:SmartFilterChain):boolean {return !!chain?.selection||activeSmartFilters(chain).some(f=>['color','denoise','motion','radial','pixelate','grain','vignette'].includes(f.kind)||(f.kind==='sharpen'&&f.threshold!==undefined&&f.threshold!==0)||!!f.selection)}

export type FilterRenderOptions = { signal?: AbortSignal; yield?: () => Promise<void> }
const check=(signal?:AbortSignal)=>{if(signal?.aborted)throw new Error('智能滤镜渲染已取消')}
async function gaussian(p:Uint8ClampedArray,w:number,h:number,r:number,options:FilterRenderOptions):Promise<Uint8ClampedArray>{
 const reach=Math.ceil(r*3), weights=Array.from({length:reach*2+1},(_,i)=>Math.exp(-((i-reach)**2)/(2*r*r))),sum=weights.reduce((a,b)=>a+b,0);for(let i=0;i<weights.length;i++)weights[i]/=sum
 const horizontal=new Float32Array(p.length), result=new Uint8ClampedArray(p.length)
 const pause=async(y:number)=>{check(options.signal);if(y%16===0){await (options.yield?.()??new Promise<void>(resolve=>setTimeout(resolve,0)));check(options.signal)}}
 for(let y=0;y<h;y++){await pause(y);for(let x=0;x<w;x++)for(let d=-reach;d<=reach;d++){const sx=x+d;if(sx<0||sx>=w)continue;const src=(y*w+sx)*4,dst=(y*w+x)*4,k=weights[d+reach],alpha=p[src+3]/255;for(let c=0;c<3;c++)horizontal[dst+c]+=p[src+c]*alpha*k;horizontal[dst+3]+=p[src+3]*k}}
 for(let y=0;y<h;y++){await pause(y);for(let x=0;x<w;x++){const dst=(y*w+x)*4,acc=[0,0,0,0];for(let d=-reach;d<=reach;d++){const sy=y+d;if(sy<0||sy>=h)continue;const src=(sy*w+x)*4,k=weights[d+reach];for(let c=0;c<4;c++)acc[c]+=horizontal[src+c]*k}result[dst+3]=acc[3];for(let c=0;c<3;c++)result[dst+c]=acc[3]>0?acc[c]*255/acc[3]:0}}
 return result
}
/** CPU reference/offscreen backend. Input stays immutable; no partially computed output is returned. */
export async function applySmartFilters(p:Uint8ClampedArray,width:number,height:number,value:SmartFilterChain,options:FilterRenderOptions={}):Promise<Uint8ClampedArray>{
 const chain=validateSmartFilters(value);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width*height>16_777_216||p.length!==width*height*4)throw new Error('智能滤镜像素尺寸无效或超过 1600 万像素离屏限制')
 check(options.signal);let current:Uint8ClampedArray=p.slice()
 for(const f of activeSmartFilters(chain)){if(f.kind==='sharpen'||f.kind==='denoise'){const before=current;current=await(f.kind==='sharpen'?applyUnsharpMask:applyDenoise)(current,width,height,{radius:f.radius,amount:f.amount,threshold:f.threshold??0},options);if(f.selection){const mask=rasterizeSelectionMask(f.selection,width,height);for(let i=0;i<current.length;i+=4){const a=mask[i/4]/255;for(let c=0;c<3;c++)current[i+c]=before[i+c]*(1-a)+current[i+c]*a;current[i+3]=before[i+3]}}continue}if(f.kind==='color'){const before=current;current=applyLayerAdjustments(current,width,height,f.adjustments!);if(f.selection){const coverage=rasterizeSelectionMask(f.selection,width,height);for(let i=0;i<current.length;i+=4){const a=coverage[i/4]/255;for(let c=0;c<3;c++)current[i+c]=before[i+c]*(1-a)+current[i+c]*a;current[i+3]=before[i+3]}}continue}if(['motion','radial','pixelate','grain','vignette'].includes(f.kind)){current=await applyCommonFilter(current,width,height,{...f,kind:f.kind as CommonKind},options);continue}const blurred=await gaussian(current,width,height,f.radius,options);check(options.signal);if(f.kind==='gaussian')current=blurred;else {const next=current.slice();for(let i=0;i<next.length;i+=4)for(let c=0;c<3;c++)next[i+c]=(f.kind==='highpass'?127.5:current[i+c])+f.amount*(current[i+c]-blurred[i+c]);current=next}}
 const selectionMask=chain.selection?rasterizeSelectionMask(chain.selection,width,height):null
 const mask=chain.mask
 if(selectionMask||mask?.enabled){for(let y=0;y<height;y++){check(options.signal);for(let x=0;x<width;x++){let coverage=selectionMask?selectionMask[y*width+x]/255:1;if(mask?.enabled){const r=mask.rect,left=r.x/100*width,top=r.y/100*height,right=(r.x+r.width)/100*width,bottom=(r.y+r.height)/100*height;let area=Math.max(0,Math.min(x+1,right)-Math.max(x,left))*Math.max(0,Math.min(y+1,bottom)-Math.max(y,top));if(mask.inverted)area=1-area;coverage*=area}const i=(y*width+x)*4;if(coverage===0){current.set(p.subarray(i,i+4),i);continue}if(coverage===1)continue;const before=p[i+3]/255,after=current[i+3]/255,alpha=before*(1-coverage)+after*coverage;for(let c=0;c<3;c++)current[i+c]=alpha?((p[i+c]*before*(1-coverage)+current[i+c]*after*coverage)/alpha):0;current[i+3]=alpha*255}}}

 check(options.signal);return current
}
export function filterCacheKey(p:Uint8ClampedArray,w:number,h:number,chain:SmartFilterChain,sourceRevision=''):string {let hash=2166136261;for(const byte of p)hash=Math.imul(hash^byte,16777619);return `${sourceRevision}:${w}:${h}:${hash>>>0}:${JSON.stringify(validateSmartFilters(chain))}`}
/** A latest-only publisher. No cross-document/global result cache or source-image replacement. */
export class FilterRenderQueue {
 private current?:AbortController
 cancel(){this.current?.abort();this.current=undefined}
 async run(p:Uint8ClampedArray,w:number,h:number,chain:SmartFilterChain,publish:(pixels:Uint8ClampedArray)=>void):Promise<void>{this.cancel();const controller=new AbortController();this.current=controller;try{const result=await applySmartFilters(p,w,h,chain,{signal:controller.signal});if(this.current===controller&&!controller.signal.aborted)publish(result)}catch(error){if(!controller.signal.aborted)throw error}finally{if(this.current===controller)this.current=undefined}}
}
