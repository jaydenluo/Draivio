import {createPortal} from 'react-dom'
import {useEffect,useRef,useState} from 'react'
import {useEditor} from '../state/editor'
import {useDocumentWorkspace} from '../document/DocumentWorkspaceProvider'
import {resultAdoption,useResultDelivery} from './ResultDelivery'
import {resultArchive} from './resultArchive'
import {copyResultImage,resultSizeLabel} from './resultImage'
import {message} from '../ui/message'
import {isTauri} from '@tauri-apps/api/core'
import './resultStage.css'

export function ResultStage(){
 const delivery=useResultDelivery(),{state,dispatch,documentId}=useEditor(),{openResultDocument}=useDocumentWorkspace()
 const {preview,items,storage}=delivery
 const found=items.find(r=>r.id===preview?.activeId),result=found&&preview?.archived?{...found,request:undefined}:found,index=preview?.ids.indexOf(preview.activeId)??0
 const imageRef=useRef<HTMLImageElement>(null),root=useRef<HTMLElement>(null),[fitScale,setFitScale]=useState(1),[scale,setScale]=useState(1),[offset,setOffset]=useState({x:0,y:0}),[more,setMore]=useState<{x:number;y:number}|null>(null),[busy,setBusy]=useState(false)
 const pinch=useRef<{distance:number;scale:number}|null>(null)
 const drag=useRef<{id:number;x:number;y:number;offset:typeof offset}|null>(null)
 useEffect(()=>{setScale(1);setOffset({x:0,y:0});setMore(null);drag.current=null;pinch.current=null;if(preview)root.current?.focus({preventScroll:true})},[preview?.activeId])
 useEffect(()=>{
  const image=imageRef.current;if(!image)return
  const measure=()=>{if(image.naturalWidth&&image.clientWidth)setFitScale(image.clientWidth/image.naturalWidth)}
  measure();image.addEventListener('load',measure)
  const observer=typeof ResizeObserver==='undefined'?null:new ResizeObserver(measure);observer?.observe(image)
  return()=>{image.removeEventListener('load',measure);observer?.disconnect()}
 },[preview?.activeId])
 if(!preview||!result)return delivery.readyIds.length?<button className="result-ready" onClick={()=>delivery.open(delivery.readyIds[0])}>{delivery.readyIds.length} 张图片已就绪 <span>查看 →</span></button>:null
 const decision=resultAdoption(result,state,documentId),status=storage[result.id]
 const run=async(fn:()=>Promise<unknown>,success?:string)=>{if(busy)return;setBusy(true);try{const value=await fn();if(success&&value!==false)message.success(success)}catch(error){message.error(error instanceof Error?error.message:'操作失败，请重试')}finally{setBusy(false)}}
 const switchBy=(delta:number)=>delivery.select(preview.ids[(index+delta+preview.ids.length)%preview.ids.length])
 return <section ref={root} className="result-stage" aria-label="生成结果预览" tabIndex={-1} onKeyDown={event=>{
  if((event.target as Element).closest('input,textarea,select')||event.metaKey||event.ctrlKey||event.altKey||document.querySelector('[aria-modal="true"]'))return
  if(['ArrowLeft','ArrowRight','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();if(event.key==='Escape'){if(more)setMore(null);else delivery.close()}else switchBy(event.key==='ArrowLeft'?-1:1)}
 }} onPointerDown={event=>event.stopPropagation()} onTouchStart={event=>event.stopPropagation()} onTouchMove={event=>event.stopPropagation()} onTouchEnd={event=>event.stopPropagation()} onContextMenu={event=>{event.preventDefault();event.stopPropagation()}}>
  <header><div><span className="result-stage-dot"/>结果预览 <small>{index+1} / {preview.ids.length}</small></div><button type="button" onClick={delivery.close} aria-label="返回作品">返回作品 <span aria-hidden="true">×</span></button></header>
  <div className="result-stage-view" onTouchStart={event=>{if(event.touches.length===2){drag.current=null;pinch.current={distance:Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY),scale}}}} onTouchMove={event=>{if(pinch.current&&event.touches.length===2){event.preventDefault();const d=Math.hypot(event.touches[0].clientX-event.touches[1].clientX,event.touches[0].clientY-event.touches[1].clientY);setScale(Math.min(8,Math.max(.25,pinch.current.scale*d/Math.max(1,pinch.current.distance))))}}} onTouchEnd={()=>{pinch.current=null;drag.current=null}} onTouchCancel={()=>{pinch.current=null;drag.current=null}} onWheel={event=>{event.preventDefault();event.stopPropagation();if(event.ctrlKey||event.metaKey)setScale(v=>Math.min(8,Math.max(.25,v*Math.exp(-event.deltaY*.003))));else setOffset(v=>({x:v.x-event.deltaX,y:v.y-event.deltaY}))}} onPointerDown={event=>{
   if(event.button!==0||pinch.current)return;event.preventDefault();event.currentTarget.setPointerCapture?.(event.pointerId);drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,offset}
  }} onPointerMove={event=>{const value=drag.current;if(value?.id===event.pointerId)setOffset({x:value.offset.x+event.clientX-value.x,y:value.offset.y+event.clientY-value.y})}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}} onDoubleClick={()=>{setScale(1);setOffset({x:0,y:0})}}>
   <img ref={imageRef} key={result.id} src={result.source} alt="生成结果大图" draggable={false} style={{transform:`translate(${offset.x}px,${offset.y}px) scale(${scale})`}}/>
   <div className="result-stage-zoom" onPointerDown={event=>event.stopPropagation()}><button aria-label="缩小结果" onClick={()=>setScale(v=>Math.max(.25,v/1.2))}>−</button><span>{Math.round(scale*fitScale*100)}%</span><button aria-label="放大结果" onClick={()=>setScale(v=>Math.min(8,v*1.2))}>＋</button><button onClick={()=>{setScale(1);setOffset({x:0,y:0})}}>适应</button></div>
  </div>
  <footer>
   {preview.ids.length>1?<div className="result-stage-strip" aria-label="本批候选图片"><button aria-label="上一张结果" onClick={()=>switchBy(-1)}>‹</button>{preview.ids.map((id,i)=>{const item=items.find(r=>r.id===id);return item?<button key={id} aria-label={`查看候选图 ${i+1}`} aria-pressed={id===result.id} onClick={()=>delivery.select(id)}><img src={item.thumbnail||item.source} alt=""/></button>:null})}<button aria-label="下一张结果" onClick={()=>switchBy(1)}>›</button></div>:null}
   <div className="result-stage-bottom"><span className={`result-storage-status is-${status}`} role="status">{status==='saved'?'已保存在本地':status==='error'?'本地保存失败，图片仍可使用':'正在保存到本地…'}{status==='error'?<button disabled={busy} onClick={()=>void delivery.saveLocal(result)}>重试保存</button>:null}</span><div className="result-stage-actions">
    <div className="result-more"><button aria-label="更多结果操作" aria-expanded={!!more} onClick={event=>{const rect=event.currentTarget.getBoundingClientRect();setMore(more?null:{x:Math.max(8,Math.min(rect.right-180,window.innerWidth-188)),y:Math.max(8,rect.top-8)})}}>•••</button>{more?createPortal(<div className="result-stage-menu-root"><button className="result-menu-dismiss" aria-label="收起结果菜单" onClick={()=>setMore(null)}/><div className="result-more-menu" role="menu" aria-label="结果操作" style={{left:more.x,top:more.y,transform:'translateY(-100%)'}} onKeyDown={event=>{if(event.key==='Escape'){event.stopPropagation();setMore(null);root.current?.focus()}}}>
     <button role="menuitem" disabled={busy} onClick={()=>{setMore(null);void run(()=>copyResultImage(result.source!),'已复制图片')}}>复制图片</button><button role="menuitem" onClick={()=>{setMore(null);if(openResultDocument(result))delivery.close()}}>打开为新文档</button>{!preview.archived&&state.aiResults.some(r=>r.id===result.id)&&!result.request?.outpaint&&decision.action?.type!=='adopt-ai-result-as-layer'&&result.request?.mode!=='generate'?<button role="menuitem" disabled={state.isGenerating} onClick={()=>{setMore(null);delivery.adopt(result,true)}}>添加到当前作品</button>:null}{isTauri()?<button role="menuitem" disabled={status!=='saved'||busy} onClick={()=>{setMore(null);void run(()=>resultArchive.reveal(result.id))}}>打开所在文件夹</button>:null}
     {!preview.archived&&state.aiResults.some(r=>r.id===result.id)?<button role="menuitem" disabled={status!=='saved'||busy} title="仅移除当前作品里的记录，本地原图保留；可撤销" onClick={()=>{setMore(null);dispatch({type:'delete-ai-result',id:result.id});delivery.close();message.info('记录已移除，原图仍在本地作品库')}}>从当前作品移除记录</button>:null}
    </div></div>,document.body):null}</div>
    <button disabled={busy} onClick={()=>delivery.continueEditing(result)}>继续修改</button><button disabled={busy} onClick={()=>void run(()=>resultArchive.export(result),isTauri()?'图片已保存':'已请求保存图片')}>另存图片</button><button className="result-adopt" disabled={!!decision.disabled||busy} title={decision.disabled||(result.request?.maskedEdit ? '将局部结果应用为合成图层，保留原图层' : undefined)} onClick={()=>delivery.adopt(result)}>{decision.label}</button>
   </div></div>
   {result.error?<p className="result-stage-note" role="status">{result.error}</p>:null}
   {decision.disabled?<p className="result-stage-note">{decision.disabled}</p>:null}
   <details className="result-stage-details"><summary>图片详情</summary><p>{result.model} · 实际图片 {result.source?resultSizeLabel(result.source,'未能读取尺寸'):'未能读取尺寸'}</p>{result.generationMetadata?<><p>聊天框设置：{result.generationMetadata.defaults.size} · {result.generationMetadata.defaults.count}</p><p>本次请求：{result.generationMetadata.resolved.size} · {result.generationMetadata.resolved.count}{Object.keys(result.generationMetadata.overrides).length?'（含本次文字覆盖）':''}</p><p>发送尺寸：{result.generationMetadata.sent.size??'未发送，由服务决定'}{result.generationMetadata.sent.quality?` · 质量 ${result.generationMetadata.sent.quality}`:''}{result.generationMetadata.sent.strength!==undefined?` · 强度 ${result.generationMetadata.sent.strength}`:''}</p></>:<p>本次请求参数：未记录</p>}<p>{result.prompt||'无提示词'}</p>{result.request?.maskedEdit?<details><summary>查看完整原始结果与蒙版</summary>{result.request.maskedEdit.raw?<img src={result.request.maskedEdit.raw.source} alt="完整原始结果"/>:null}<img src={result.request.maskedEdit.mask.source} alt="提交蒙版"/><img src={result.request.maskedEdit.source.source} alt="生成前原图"/></details>:null}{result.request?.outpaint?<details><summary>查看扩图源图、分块与蒙版</summary><img src={result.request.outpaint.source.source} alt="扩图前原图"/>{result.request.outpaint.tiles.map((tile,i)=><figure key={i}><img src={tile.mask.source} alt={`扩图蒙版 ${i+1}`}/><img src={tile.raw.source} alt={`扩图原始返回 ${i+1}`}/></figure>)}</details>:null}</details>
  </footer>
 </section>
}
