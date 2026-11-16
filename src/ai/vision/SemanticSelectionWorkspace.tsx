import { useEffect,useRef,useState } from 'react'
import { useEditor, type EditorState } from '../../state/editor'
import { contentRevision } from '../context/editorContext'
import { effectiveLayerState } from '../../state/layerHierarchy'
import { layerWorldPixelMatrix } from '../../canvas/layerWorldMatrix'
import { rasterizeSvgPixels,imageToPng } from '../../canvas/rasterTools'
import { maskDefinitions } from '../../canvas/SelectionOverlay'
import { invertMatrix, type AffineMatrix } from '../../canvas/layerCoordinates'
import { mapTargetMask,maskSelection,type TargetMapping } from '../tools/selectionTools'
import { requestSegmentation,resolveTarget,type Segmentation } from './targetResolver'
import type { Selection } from '../../canvas/selectionGeometry'
import { FloatingSurface } from '../../ui/FloatingSurface'
export const SEMANTIC_SELECTION_EVENT='draivio:semantic-selection'
const storageKey='draivio-semantic-endpoint-v1'
type Session={documentId:string;layerId:string;revision:string;mapping:TargetMapping;image:string;result:Segmentation}
export async function captureSemanticInput(state:EditorState,signal:AbortSignal){
 const layer=state.layers.find(l=>l.id===state.selectedLayerId)
 if(!layer?.source||layer.source==='fixture'||layer.kind==='group'||layer.smartObject||layer.documentSpace)throw new Error('请选择具有真实图像资源的普通图层；文档空间处理层请先栅格化后分析')
 const effective=effectiveLayerState(state.layers,layer.id);if(!effective.visible||effective.locked)throw new Error('目标或祖先图层不可见或已锁定')
 const sourceWidth=layer.contentWidth??state.documentWidth,sourceHeight=layer.contentHeight??state.documentHeight,scale=Math.min(1,1024/Math.max(sourceWidth,sourceHeight))
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${sourceWidth} ${sourceHeight}`);svg.setAttribute('width',String(Math.max(1,Math.round(sourceWidth*scale))));svg.setAttribute('height',String(Math.max(1,Math.round(sourceHeight*scale))))
 const image=document.createElementNS(svg.namespaceURI,'image');image.setAttribute('href',layer.source);image.setAttribute('width',String(sourceWidth));image.setAttribute('height',String(sourceHeight));image.setAttribute('preserveAspectRatio','none');svg.append(image)
 const input=await rasterizeSvgPixels(svg,signal)
 return {image:imageToPng(input),mapping:{analysisWidth:input.width,analysisHeight:input.height,sourceWidth,sourceHeight,documentWidth:state.documentWidth,documentHeight:state.documentHeight,matrix:layerWorldPixelMatrix(state.layers,layer.id,state.documentWidth,state.documentHeight)} satisfies TargetMapping}
}
export function SemanticSelectionWorkspace(){
 const {state,dispatch,documentId}=useEditor(),latest=useRef({state,documentId});latest.current={state,documentId}
 const [open,setOpen]=useState(false),[endpoint,setEndpoint]=useState(()=>localStorage.getItem(storageKey)??''),[target,setTarget]=useState<'subject'|'background'|'object'>('subject'),[query,setQuery]=useState(''),[feather,setFeather]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState(''),[session,setSession]=useState<Session|null>(null),[choice,setChoice]=useState(''),[selection,setSelection]=useState<Selection|null>(null)
 const controller=useRef<AbortController|null>(null)
 const cancel=()=>{controller.current?.abort();controller.current=null;setBusy(false);setSession(null);setSelection(null);setChoice('')}
 const close=()=>{cancel();setOpen(false)}
 useEffect(()=>{const show=()=>{cancel();setError('');setOpen(true)};window.addEventListener(SEMANTIC_SELECTION_EVENT,show);return()=>{window.removeEventListener(SEMANTIC_SELECTION_EVENT,show);controller.current?.abort()}},[])
 useEffect(()=>{cancel()},[documentId,state.selectedLayerId])
 const stale=(s:Session)=>latest.current.documentId!==s.documentId||latest.current.state.selectedLayerId!==s.layerId||contentRevision(latest.current.state)!==s.revision
 const choose=(s:Session,id:string,f=feather)=>{try{if(stale(s))throw new Error('文档或目标已更改，请重新分析');const r=resolveTarget(s.result,id);if(r.kind!=='resolved')throw new Error('请明确点选候选');const alpha=mapTargetMask(r.candidate,{...s.mapping,analysisWidth:s.result.width,analysisHeight:s.result.height,background:target==='background',feather:f});setSelection(maskSelection(alpha,s.mapping.documentWidth,s.mapping.documentHeight));setChoice(id);setError('')}catch(e){setSelection(null);setError(e instanceof Error?e.message:'蒙版映射失败')}}
 const analyze=async()=>{cancel();setError('');if(!endpoint.trim()){setError('未配置语义分割服务；当前没有可用的本地语义推理引擎');return}const c=new AbortController();controller.current=c;setBusy(true);const basis=latest.current;try{const input=await captureSemanticInput(basis.state,c.signal);const result=await requestSegmentation({endpoint,image:input.image,target,query,signal:c.signal});if(c.signal.aborted)return;const s:Session={...input,result,documentId:basis.documentId,layerId:basis.state.selectedLayerId,revision:contentRevision(basis.state)};if(stale(s))throw new Error('文档或目标已更改，分割结果已放弃');setSession(s);const resolved=resolveTarget(result);if(resolved.kind==='resolved')choose(s,resolved.candidate.id)}catch(e){if(!c.signal.aborted){setError(e instanceof Error?e.message:'语义分割失败');setSession(null);setSelection(null)}}finally{if(controller.current===c){controller.current=null;setBusy(false)}}}
 const apply=(asMask:boolean)=>{
  if(!session||!selection)return
  try{
   if(stale(session))throw new Error('文档或目标已更改，过期蒙版未写入')
   const eff=effectiveLayerState(state.layers,session.layerId)
   if(!eff.visible||eff.locked)throw new Error('目标已隐藏或锁定')
   if(asMask){
    const [a,b,c,d,e,f]=session.mapping.matrix
    // Convert full physical layer world coordinates to document/local percentages.
    const localToDocument:AffineMatrix=[a*session.mapping.sourceWidth/state.documentWidth,b*session.mapping.sourceWidth/state.documentHeight,c*session.mapping.sourceHeight/state.documentWidth,d*session.mapping.sourceHeight/state.documentHeight,e/state.documentWidth*100,f/state.documentHeight*100]
    const local:Selection={...selection,path:{type:'affine',source:selection.path,matrix:invertMatrix(localToDocument)},rect:{x:0,y:0,width:100,height:100}}
    dispatch({type:'commit-mask',mask:{selection:local,strokes:[],inverted:false,applied:true}})
   }else dispatch({type:'commit-selection',selection})
   close()
  }catch(e){setError(e instanceof Error?e.message:'应用失败')}
 }

 if(!open)return null
 const resolution=session?resolveTarget(session.result):null
 return <FloatingSurface title="语义目标与蒙版" onClose={close} role="dialog" aria-label="语义目标与蒙版" style={{position:'absolute',top:48,left:24,width:360,zIndex:40,padding:12,maxHeight:'80%',overflow:'auto'}}><p>分析当前图层原始图像。主体、背景或指定物体由分割服务推理，确认前不会修改文档。</p><label>分割服务地址<input aria-label="分割服务地址" value={endpoint} disabled={busy} placeholder="http://127.0.0.1:8766/segment" onChange={e=>{cancel();setEndpoint(e.target.value);localStorage.setItem(storageKey,e.target.value)}}/></label><button type="button" disabled={busy} onClick={()=>{cancel();setEndpoint('http://127.0.0.1:8766/segment');localStorage.setItem(storageKey,'http://127.0.0.1:8766/segment')}}>使用本机 U2Netp</button><small>本机需先启动 scripts/semantic/gateway.py；U2Netp 仅支持主体/背景。指定物体需要实例分割服务。</small><label>语义目标<select aria-label="语义目标" value={target} disabled={busy} onChange={e=>{cancel();setTarget(e.target.value as typeof target)}}><option value="subject">主体</option><option value="background">背景</option><option value="object">指定物体</option></select></label>{target==='object'?<label>物体描述<input aria-label="物体描述" disabled={busy} value={query} onChange={e=>{cancel();setQuery(e.target.value)}} placeholder="例如：衣服"/></label>:null}<button type="button" disabled={busy} onClick={()=>void analyze()}>{busy?'正在分割…':'分析目标'}</button>{busy?<button type="button" onClick={cancel}>取消分割</button>:null}{error?<p role="alert">{error}</p>:null}{resolution?.kind==='choose'?<p>{resolution.reason}</p>:null}{session?<div role="group" aria-label="对象候选">{session.result.candidates.map(c=><button type="button" key={c.id} aria-pressed={choice===c.id} onClick={()=>choose(session,c.id)}>{c.label} · {c.id} · {Math.round(c.confidence*100)}%</button>)}</div>:null}<label>边缘羽化<input aria-label="边缘羽化" type="number" min={0} max={64} value={feather} disabled={busy} onChange={e=>{const value=Number(e.target.value);setFeather(value);if(session&&choice)choose(session,choice,value)}}/>px</label>{selection?<svg aria-label="语义蒙版预览" viewBox="0 0 100 100" width="100%" height="180" style={{background:'#343434'}}><defs>{maskDefinitions(selection.path,'semantic-preview')}</defs><rect width="100" height="100" fill="#40d8c0" mask="url(#semantic-preview)"/></svg>:null}<footer><button type="button" disabled={!selection||busy} onClick={()=>apply(false)}>应用为选区</button><button type="button" disabled={!selection||busy} onClick={()=>apply(true)}>应用为图层蒙版</button><button type="button" onClick={close}>取消</button></footer></FloatingSurface>
}
