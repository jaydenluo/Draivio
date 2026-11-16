import { createPortal } from 'react-dom'
import { useEffect,useMemo,useRef,useState } from 'react'
import { useEditor } from '../../state/editor'
import { FloatingSurface } from '../../ui/FloatingSurface'
import { expansionFromAnchor,expansionFromEdges,tilePlan,type Edges } from './geometry'
import { generateOutpaint } from './workflow'
import { maskedEditCapability } from '../../creation/imageEditCapabilities'
import { getConnections,getModelsForSource } from '../../creation/modelSources'
import { resolveGenerationOptions } from '../../creation/generationOptions'
import { aiManualToolCoverage } from '../tools/toolCoverage'
import { captureEditorContext,contextCanCommit } from '../context/editorContext'
import { contextPreviewSvg } from '../context/editorPreview'
import type { DocumentAnchor } from '../../document/documentGeometry'
const anchors:DocumentAnchor[]=['top-left','top','top-right','left','center','right','bottom-left','bottom','bottom-right']
const labels=['左上','上','右上','左','中心','右','左下','下','右下']
export function OutpaintButton(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>生成扩展</button>{open?createPortal(<OutpaintDialog onClose={()=>setOpen(false)}/>,document.body):null}</>}
export function OutpaintDialog({onClose}:{onClose:()=>void}){
 const {state,dispatch,documentId}=useEditor(),latest=useRef({state,documentId});latest.current={state,documentId}
 const margin=Math.max(1,Math.round(Math.min(state.documentWidth,state.documentHeight)*.15))
 const [edges,setEdges]=useState<Edges>({left:margin,right:margin,top:margin,bottom:margin}),[anchor,setAnchor]=useState<DocumentAnchor>('center'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progress,setProgress]=useState(''),[approved,setApproved]=useState(false)
 const abort=useRef<AbortController|null>(null),mounted=useRef(true),drag=useRef<{edge:string;clientX:number;clientY:number;scaleX:number;scaleY:number;edges:Edges}|null>(null)
 useEffect(()=>()=>{mounted.current=false;abort.current?.abort();dispatch({type:'set-generating',value:false})},[dispatch])
 const connection=getConnections().find(c=>c.id===state.composerSourceId),model=getModelsForSource(state.composerSourceId).find(m=>m.displayName===state.composerParameters.model)?.code??'',capability=connection?maskedEditCapability(connection,model):null
 const limit=capability?.maxDimension??1024,overlap=Math.min(32,Math.floor(limit/8))
 useEffect(()=>{setApproved(false)},[state.composerSourceId,model,limit,state.documentWidth,state.documentHeight])
 let expansion:ReturnType<typeof expansionFromEdges>|undefined,plan:ReturnType<typeof tilePlan>=[],validation=''
 try{expansion=expansionFromEdges(state.documentWidth,state.documentHeight,edges);plan=tilePlan(expansion,limit,overlap)}catch(e){validation=e instanceof Error?e.message:'扩展范围无效'}
 let locked=false;try{captureEditorContext(state,documentId,'layer')}catch{locked=true}
 const source=useMemo(()=>{try{const c=captureEditorContext(state,documentId,'document');return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(contextPreviewSvg(state,c))}`}catch{return ''}},[state,documentId])
 const invalidate=()=>{setApproved(false);setError('')}
 const chooseSize=(width:number,height:number,nextAnchor=anchor)=>{try{const e=expansionFromAnchor(state.documentWidth,state.documentHeight,width,height,nextAnchor);setEdges({left:e.x,right:e.width-e.originalWidth-e.x,top:e.y,bottom:e.height-e.originalHeight-e.y});setAnchor(nextAnchor);invalidate()}catch(e){setError(e instanceof Error?e.message:'尺寸无效')}}
 const cancel=()=>{abort.current?.abort();setBusy(false);dispatch({type:'set-generating',value:false});onClose()}
 const run=async()=>{
  if(!expansion||!capability||!connection||!approved||busy||locked)return
  const captured=state,e=expansion,currentId=documentId,controller=new AbortController();abort.current=controller;setBusy(true);setError('');setProgress(`0/${plan.length}`);dispatch({type:'set-generating',value:true})
  try{
   const result=await generateOutpaint(captured,currentId,e,capability.semantics,async(reference,mask,prompt)=>{
    if(controller.signal.aborted)throw new Error('已取消扩图')
    const current=getConnections().find(c=>c.id===connection.id)
    if(!current?.enabled||current.baseUrl!==connection.baseUrl||current.protocol!==connection.protocol||!current.models.includes(model))throw new Error('来源配置已改变，请重新确认扩图')
    const images=await aiManualToolCoverage.outpaint.execute(current,{operation:'outpaint',model,prompt:prompt.trim()||'Extend the image naturally into the masked exterior. Preserve the existing scene.',count:1,size:'auto',options:{...resolveGenerationOptions(current,model),multiImage:'single',sendSize:false},reference,mask:{source:mask,semantics:capability.semantics}})
    if(!images[0])throw new Error('服务未返回扩图图片，未采用任何修改')
    return images[0]
   },{limit,overlap,signal:controller.signal,onProgress:(done,total)=>{if(mounted.current)setProgress(`${done}/${total}`)}})
   if(controller.signal.aborted||!mounted.current)return
   if(latest.current.documentId!==currentId||!result.request?.context||!contextCanCommit(latest.current.state,result.request.context))throw new Error('画布或内容已改变，扩图结果已丢弃，请重新生成')
   dispatch({type:'add-ai-result',result});dispatch({type:'select-tab',tab:'results'});setProgress(`已生成候选 · ${plan.length} 次调用完成，请到 AI 结果预览并采用`)
  }catch(e){if(mounted.current)setError(controller.signal.aborted?'扩图已取消，原画布未改变':e instanceof Error?e.message:'扩图失败，原画布未改变')}
  finally{if(mounted.current){setBusy(false);dispatch({type:'set-generating',value:false});setApproved(false)}}
 }
 return <FloatingSurface role="dialog" aria-label="生成扩展" title="生成扩展" onClose={cancel} style={{width:600,maxWidth:'95vw',maxHeight:'90vh',overflow:'auto'}}>
  <p>原图保持原始像素。拖动蓝色边框调整四边，或输入最终尺寸；确认调用数量后才上传并请求模型。</p>
  <fieldset disabled={busy}><legend>扩展范围</legend><label>最终宽度<input aria-label="扩图最终宽度" type="number" min={state.documentWidth} max={16384} value={expansion?.width??state.documentWidth+edges.left+edges.right} onChange={e=>chooseSize(Number(e.target.value),expansion?.height??state.documentHeight)}/></label><label>最终高度<input aria-label="扩图最终高度" type="number" min={state.documentHeight} max={16384} value={expansion?.height??state.documentHeight+edges.top+edges.bottom} onChange={e=>chooseSize(expansion?.width??state.documentWidth,Number(e.target.value))}/></label>
  <label>常用比例<select aria-label="扩图常用比例" defaultValue="free" onChange={e=>{if(e.target.value==='free')return;const [a,b]=e.target.value.split(':').map(Number),ratio=a/b;let width=Math.max(state.documentWidth+2,expansion?.width??state.documentWidth),height=Math.ceil(width/ratio);if(height<state.documentHeight){height=state.documentHeight;width=Math.ceil(height*ratio)}chooseSize(width,height)}}><option value="free">自由</option>{['1:1','4:3','3:4','16:9','9:16'].map(r=><option key={r}>{r}</option>)}</select></label>
  <label>原图锚点<select aria-label="扩图原图锚点" value={anchor} onChange={e=>chooseSize(expansion?.width??state.documentWidth,expansion?.height??state.documentHeight,e.target.value as DocumentAnchor)}>{anchors.map((a,i)=><option key={a} value={a}>{labels[i]}</option>)}</select></label>
  {(['left','right','top','bottom'] as const).map((edge,i)=><label key={edge}>{['左边距','右边距','上边距','下边距'][i]}<input aria-label={`扩图${['左','右','上','下'][i]}边距`} type="number" min={0} max={16384} value={edges[edge]} onChange={e=>{setEdges({...edges,[edge]:Math.max(0,Math.round(Number(e.target.value)||0))});invalidate()}}/></label>)}</fieldset>
  {expansion?<svg aria-label="扩图拖拽预览" viewBox={`-12 -12 ${expansion.width+24} ${expansion.height+24}`} style={{width:'100%',height:260,background:'#222',touchAction:'none'}} onPointerMove={e=>{const d=drag.current;if(!d||busy)return;const dx=Math.round((e.clientX-d.clientX)*d.scaleX),dy=Math.round((e.clientY-d.clientY)*d.scaleY),next={...d.edges};if(d.edge.includes('left'))next.left=Math.max(0,d.edges.left-dx);if(d.edge.includes('right'))next.right=Math.max(0,d.edges.right+dx);if(d.edge.includes('top'))next.top=Math.max(0,d.edges.top-dy);if(d.edge.includes('bottom'))next.bottom=Math.max(0,d.edges.bottom+dy);setEdges(next);invalidate()}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>
   <rect width={expansion.width} height={expansion.height} fill="#345"/><image href={source} x={expansion.x} y={expansion.y} width={state.documentWidth} height={state.documentHeight}/><rect x={expansion.x} y={expansion.y} width={state.documentWidth} height={state.documentHeight} stroke="#fff" fill="none"/>
   {plan.map((t,i)=><rect key={i} x={t.x} y={t.y} width={t.width} height={t.height} fill="none" stroke="#9ac" strokeDasharray="4 4"/>)}
   {(['left','right','top','bottom','right-bottom'] as const).map(edge=><rect key={edge} data-outpaint-edge={edge} aria-label={`拖动扩图${edge}`} x={edge.includes('right')?expansion!.width-5:edge==='top'||edge==='bottom'?expansion!.width/2-5:-5} y={edge.includes('bottom')?expansion!.height-5:edge==='left'||edge==='right'?expansion!.height/2-5:-5} width={10} height={10} fill="#53b8ff" style={{cursor:'nwse-resize'}} onPointerDown={e=>{if(busy)return;const svg=e.currentTarget.ownerSVGElement!,r=svg.getBoundingClientRect();svg.setPointerCapture?.(e.pointerId);drag.current={edge,clientX:e.clientX,clientY:e.clientY,scaleX:(expansion!.width+24)/(r.width||expansion!.width+24),scaleY:(expansion!.height+24)/(r.height||expansion!.height+24),edges:{...edges}}}}/>)}</svg>:null}
  <output aria-label="扩图调用计划">最终 {expansion?.width??'—'} × {expansion?.height??'—'} px · 原图偏移 {expansion?.x??0}, {expansion?.y??0} · 端点上限 {limit}px · 重叠 {overlap}px · 预计 {plan.length} 次调用</output>
  {!capability?<p role="alert">当前模型没有已验证的蒙版编辑能力，请在 AI 输入框选择支持蒙版的模型。</p>:null}{locked?<p role="alert">目标或所属组已锁定，请先解锁。</p>:null}{validation||error?<p role="alert">{error||validation}</p>:null}
  <label><input type="checkbox" aria-label="确认扩图上传与调用数" disabled={busy||!capability||!!validation} checked={approved} onChange={e=>setApproved(e.target.checked)}/>确认上传原图，并提交上述 {plan.length} 次可能计费的编辑请求；失败或重试不会自动增加请求。</label>
  <button onClick={()=>void run()} disabled={!approved||!capability||locked||!!validation||busy||state.isGenerating}>生成扩图候选</button><button onClick={cancel}>{busy?'停止扩图':'取消扩图'}</button>{progress?<p role="status">{progress}</p>:null}
 </FloatingSurface>
}
