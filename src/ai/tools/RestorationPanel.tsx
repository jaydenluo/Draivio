import { useEffect,useRef,useState } from 'react'
import { useEditor } from '../../state/editor'
import { contentRevision } from '../context/editorContext'
import { requestRestorationTile,restorationWarning } from './restorationTools'
import { DialogTitlebar } from '../../ui/DialogTitlebar'
import { useDraggableDialog } from '../../ui/useDraggableDialog'
import { message } from '../../ui/message'
import { aiManualToolCoverage } from './toolCoverage'
export function RestorationPanel(){
 const {state,dispatch,documentId}=useEditor(),latest=useRef({state,documentId});latest.current={state,documentId}
 const [endpoint,setEndpoint]=useState('http://127.0.0.1:8767/restore'),[scale,setScale]=useState<2|4>(2),[busy,setBusy]=useState(false),[progress,setProgress]=useState('')
 const root=useRef<HTMLElement>(null),draggable=useDraggableDialog(root,'restoration')
 const controller=useRef<AbortController|null>(null)
 const cancel=()=>{controller.current?.abort();controller.current=null;setBusy(false);setProgress('')}
 useEffect(()=>()=>controller.current?.abort(),[])
 useEffect(()=>{cancel()},[documentId,state.selectedLayerId])
 const run=async()=>{
  cancel();const c=new AbortController();controller.current=c;setBusy(true);const basis=latest.current,revision=contentRevision(basis.state)
  try{
   const result=await aiManualToolCoverage.restoration.execute(basis.state,basis.documentId,{scale,mode:'size',backend:'ESPCN'},(image,_tile,signal)=>requestRestorationTile({endpoint,model:'espcn',mode:'size',scale,image,signal}),{signal:c.signal,onProgress:(n,total)=>setProgress(`${n}/${total}`)})
   if(c.signal.aborted)return
   if(latest.current.documentId!==basis.documentId||contentRevision(latest.current.state)!==revision||latest.current.state.selectedLayerId!==basis.state.selectedLayerId)throw new Error('文档或目标已更改，增强结果已放弃')
   dispatch({type:'add-ai-result',result});dispatch({type:'select-tab',tab:'results'});message.success('增强候选已生成，原图保留；请检查后新增图层')
  }catch(e){if(!c.signal.aborted)message.error(e instanceof Error?e.message:'增强失败，原图未改变')}
  finally{if(controller.current===c){controller.current=null;setBusy(false)}}
 }
 return <section className="enhancement-panel" aria-label="超分工具面板" ref={root} onPointerDown={draggable.onPointerDown} style={{left:14,top:58,...draggable.style}}><DialogTitlebar title="超分" closeLabel="关闭超分窗口" onClose={()=>{cancel();dispatch({type:'select-tool',tool:'select'})}}/><p>当前图层 · {state.layers.find(l=>l.id===state.selectedLayerId)?.name??'未选择'}</p><p>本机 ESPCN 学习型尺寸增强 · CPU · 保留原图并生成独立候选。</p><label className="enhancement-field">放大倍数<select aria-label="放大倍数" disabled={busy} value={scale} onChange={e=>setScale(Number(e.target.value) as 2|4)}><option value={2}>2x</option><option value={4}>4x</option></select></label><label className="enhancement-field">本机增强服务<input aria-label="本机增强服务" disabled={busy} value={endpoint} onChange={e=>setEndpoint(e.target.value)}/></label><small>需先启动 scripts/restoration/gateway.py。ESPCN 不提供去模糊或生成式细节补全。</small><p>{restorationWarning('size')} 小字、人脸和重复纹理仍需对照原图检查；不代表还原真实信息。</p><div className="enhancement-actions"><button disabled={busy} onClick={()=>void run()}>开始超分 {scale}x</button>{busy?<button onClick={cancel}>取消增强</button>:null}<small aria-live="polite">{busy?`处理中 ${progress}`:''}</small></div></section>
}
