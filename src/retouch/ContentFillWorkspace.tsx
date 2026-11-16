import { useEffect, useRef, useState } from 'react'
import type { PixelImage } from '../canvas/rasterTools'
import { imageToPng } from '../canvas/rasterTools'
import { FloatingSurface } from '../ui/FloatingSurface'
import { brushMask, contentFill, type FillMetadata } from './contentFill'
export const CONTENT_FILL_EVENT = 'draivio:content-fill'
export type FillResult = { image: PixelImage; metadata: FillMetadata; sampling: 'automatic' | 'manual' }
function maskPath(mask:Uint8Array,w:number,h:number){const p:string[]=[];for(let y=0;y<h;y++){let start=-1;for(let x=0;x<=w;x++){const hit=x<w&&mask[y*w+x]>0;if(hit&&start<0)start=x;if(!hit&&start>=0){p.push(`M${start} ${y}h${x-start}v1H${start}Z`);start=-1}}}return p.join('')}
/** Temporary pixels and masks remain outside document/history until explicit confirmation. */
export function ContentFillWorkspace({ image, source, initialTarget, onConfirm, onCancel }: { image:PixelImage; source:string; initialTarget:Uint8Array; onConfirm:(result:FillResult)=>void; onCancel:()=>void }) {
 const [target,setTarget]=useState(initialTarget),[donors,setDonors]=useState<Uint8Array|null>(null),[protect,setProtect]=useState<Uint8Array>(new Uint8Array(initialTarget.length))
 const [paint,setPaint]=useState<'target'|'donors'|'protect'>('target'),[size,setSize]=useState(20),[busy,setBusy]=useState(false),[result,setResult]=useState<FillResult|null>(null),[preview,setPreview]=useState(''),[compare,setCompare]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(0)
 const [rect,setRect]=useState({x:25,y:25,width:25,height:25}),stroke=useRef<{x:number;y:number}[]|null>(null),abort=useRef<AbortController|null>(null),revision=useRef(0)
 const cancelRun=()=>{abort.current?.abort();abort.current=null;revision.current++;setBusy(false)}
 useEffect(()=>()=>{abort.current?.abort();revision.current++},[])
 const invalidate=()=>{cancelRun();setResult(null);setPreview('');setError('')}
 const change=(mask:Uint8Array)=>{invalidate();if(paint==='target')setTarget(mask);else if(paint==='donors')setDonors(mask);else setProtect(mask)}
 const current=()=>paint==='target'?target:paint==='donors'?(donors??new Uint8Array(target.length)):protect
 const applyStroke=(points:{x:number;y:number}[])=>{const m=brushMask(image.width,image.height,points,size),next=current().slice();for(let i=0;i<m.length;i++)if(m[i])next[i]=255;change(next)}
 const point=(e:React.PointerEvent<SVGSVGElement>)=>{const r=e.currentTarget.getBoundingClientRect();return {x:Math.max(0,Math.min(100,(e.clientX-r.left)/(r.width||image.width)*100)),y:Math.max(0,Math.min(100,(e.clientY-r.top)/(r.height||image.height)*100))}}
 const run=async()=>{invalidate();const controller=new AbortController();abort.current=controller;const token=revision.current;setBusy(true);setProgress(0);try{const value=await contentFill(image,{target,donors:donors??undefined,protect,signal:controller.signal,onProgress:setProgress});if(controller.signal.aborted||token!==revision.current)return;const url=imageToPng(value.image);setResult({...value,sampling:donors?'manual':'automatic'});setPreview(url)}catch(e){if(token===revision.current)setError(e instanceof Error?e.message:'本地补洞失败')}finally{if(token===revision.current)setBusy(false)}}
 const effectiveTarget=target.filter((v,i)=>v&&!protect[i]).length
 const donorMask=Uint8Array.from(target,(_,i)=>(donors?donors[i]>0:!target[i])&&!target[i]&&!protect[i]&&image.data[i*4+3]>0?255:0)
 return <FloatingSurface role="dialog" title="内容识别填充 · 本地" aria-label="内容识别填充工作区" onClose={()=>{cancelRun();onCancel()}} className="content-fill-workspace">
  <p>本地邻域纹理补洞，不使用生成式模型。红色待填、绿色采样、蓝色保护。拖动画笔或输入矩形范围；确认前原图不变。</p>
  <label>绘制区域<select aria-label="补洞绘制区域" value={paint} onChange={e=>setPaint(e.target.value as typeof paint)}><option value="target">待填区域</option><option value="donors">手动采样区域</option><option value="protect">保护区域</option></select></label>
  <label>画笔直径<input aria-label="补洞画笔直径" type="number" min={1} max={500} value={size} onChange={e=>setSize(Math.max(1,Math.min(500,Number(e.target.value)||1)))}/></label>
  <button onClick={()=>{invalidate();setDonors(null)}}>自动采样</button><button onClick={()=>change(new Uint8Array(target.length))}>清空当前覆盖</button>
  <fieldset><legend>矩形覆盖（百分比）</legend>{(['x','y','width','height'] as const).map(k=><label key={k}>{k}<input aria-label={`补洞矩形 ${k}`} type="number" min={0} max={100} value={rect[k]} onChange={e=>setRect({...rect,[k]:Math.max(0,Math.min(100,Number(e.target.value)||0))})}/></label>)}<button onClick={()=>{const m=current().slice();for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if((x+.5)/image.width*100>=rect.x&&(x+.5)/image.width*100<rect.x+rect.width&&(y+.5)/image.height*100>=rect.y&&(y+.5)/image.height*100<rect.y+rect.height)m[y*image.width+x]=255;change(m)}}>添加矩形覆盖</button></fieldset>
  <svg aria-label="补洞区域预览" viewBox={`0 0 ${image.width} ${image.height}`} style={{display:'block',width:'100%',maxWidth:640,maxHeight:400,touchAction:'none',background:'#333'}} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture?.(e.pointerId);stroke.current=[point(e)];applyStroke(stroke.current)}} onPointerMove={e=>{if(stroke.current){stroke.current.push(point(e));applyStroke(stroke.current)}}} onPointerUp={()=>{stroke.current=null}} onPointerCancel={()=>{stroke.current=null}}><image href={preview&&!compare?preview:source} width={image.width} height={image.height}/>{!result||compare?<g opacity={.35}><path data-fill-overlay="sample" d={maskPath(donorMask,image.width,image.height)} fill="#2cf080"/><path data-fill-overlay="target" d={maskPath(target,image.width,image.height)} fill="#ff4858"/><path data-fill-overlay="protect" d={maskPath(protect,image.width,image.height)} fill="#468cff"/></g>:null}</svg>
  <output aria-label="补洞覆盖统计">待填 {effectiveTarget} · 可采样 {donorMask.filter(Boolean).length} · 保护 {protect.filter(Boolean).length}</output>
  {error?<p role="alert">{error}</p>:null}{busy?<p role="status">正在本地补洞 {Math.round(progress*100)}%</p>:null}
  <button onClick={()=>void run()} disabled={busy||!effectiveTarget}>预览补洞</button>{busy?<button onClick={()=>{cancelRun();setError('补洞已取消，未写入文档')}}>停止计算</button>:null}
  <button disabled={!result} aria-pressed={compare} onClick={()=>setCompare(!compare)}>比较原图</button>
  <button disabled={!result||busy} onClick={()=>{if(result)onConfirm(result)}}>确认补洞</button><button onClick={()=>{cancelRun();onCancel()}}>取消补洞</button>
 </FloatingSurface>
}
