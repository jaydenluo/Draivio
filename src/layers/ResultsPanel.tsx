import {createPortal} from 'react-dom'
import {useEffect,useRef,useState} from 'react'
import {Checkbox} from '../ui/Checkbox'
import {PanelHeader} from '../ui/dock/PanelHeader'
import {FloatingSurface} from '../ui/FloatingSurface'
import {useEditor,type AIResult} from '../state/editor'
import {useResultDelivery} from '../creation/ResultDelivery'
import {resultArchive,type ArchivedResult} from '../creation/resultArchive'
import {ResultCardIcon} from './ResultCardIcon'
import {message} from '../ui/message'
import './ResultsPanel.css'

export function ResultsPanel(){
 const {state,dispatch}=useEditor(),delivery=useResultDelivery()
 const [scope,setScope]=useState<'current'|'library'>('current'),[filter,setFilter]=useState('all'),[limit,setLimit]=useState(24)
 const [library,setLibrary]=useState<ArchivedResult[]>([]),[loading,setLoading]=useState(false),[error,setError]=useState(''),[refresh,setRefresh]=useState(0)
 const [compareIds,setCompareIds]=useState<string[]>([]),[previewIds,setPreviewIds]=useState<string[]>([])
 const surface=useRef<HTMLDivElement>(null)
 const alive=useRef(true),pending=useRef(new Set<string>())
 const [busy,setBusy]=useState<string[]>([])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 const runImageAction=async(result:AIResult,action:(image:AIResult)=>void|Promise<unknown>)=>{
  if(pending.current.has(result.id))return
  pending.current.add(result.id);setBusy([...pending.current])
  try{
   const source=result.source??await resultArchive.load(result.id)
   if(alive.current)await action({...result,source})
  }catch(error){if(alive.current)message.error(error instanceof Error?error.message:'无法读取图片，请重试')}
  finally{pending.current.delete(result.id);if(alive.current)setBusy([...pending.current])}
 }
 useEffect(()=>{const reload=()=>setRefresh(v=>v+1);window.addEventListener('draivio:result-library-changed',reload);return()=>window.removeEventListener('draivio:result-library-changed',reload)},[])
 useEffect(()=>{
  if(scope!=='library')return
  let cancelled=false;setLoading(true);setError('')
  void resultArchive.list().then(values=>{if(!cancelled)setLibrary(values)}).catch(()=>{if(!cancelled)setError('本地作品库读取失败，请重试')}).finally(()=>{if(!cancelled)setLoading(false)})
  return()=>{cancelled=true}
 },[scope,refresh])
 useEffect(()=>{
  if(!previewIds.length)return
  const previous=document.activeElement as HTMLElement|null;surface.current?.focus()
  return()=>{if(previous?.isConnected)previous.focus()}
 },[previewIds.length])
 const selected=compareIds.filter(id=>state.aiResults.some(r=>r.id===id&&r.status==='success'&&r.source))
 const all:AIResult[]=scope==='library'?library:state.aiResults
 const filtered=all.filter(r=>filter==='all'||filter==='favorite'&&r.favorite||filter==='adopted'&&r.adopted||filter==='unused'&&!r.adopted)
 const results=filtered.slice(0,limit)
 const selectScope=(next:typeof scope)=>{setScope(next);setLimit(24);setFilter('all')}
 return <section className="inspector-panel results-panel" role="region" aria-label="AI 结果">
  <PanelHeader title="AI 结果"><small className="panel-header-caption">{filtered.length} 张</small></PanelHeader>
  <div className="result-library-tabs" role="tablist" aria-label="图片来源"><button role="tab" aria-selected={scope==='current'} onClick={()=>selectScope('current')}>当前作品</button><button role="tab" aria-selected={scope==='library'} onClick={()=>selectScope('library')}>本地作品库</button></div>
  <div className="results-toolbar">{scope==='current'?<button disabled={selected.length<2} onClick={()=>setPreviewIds(selected)}>比较 {selected.length}/4</button>:<span className="result-library-hint">原图仅保存在本机</span>}<select aria-label="筛选 AI 结果" value={filter} onChange={e=>{setFilter(e.target.value);setLimit(24)}}><option value="all">全部图片</option><option value="favorite">已收藏</option><option value="adopted">已采用</option><option value="unused">未采用</option></select></div>
  {state.aiRecovery&&scope==='current'?<p role="status">上次 {state.aiRecovery.model||'AI'} 任务已中断，远端结果未知。已下载结果可离线编辑；请先检查供应商记录，不会自动重发。</p>:null}
  {error?<p role="alert">{error} <button onClick={()=>setRefresh(v=>v+1)}>重试</button></p>:null}
  {loading&&!library.length?<p className="inspector-empty" role="status">正在读取本地图片…</p>:null}
  {results.length?<div className="result-grid">{results.map(result=>{
   const unavailable=result.status!=='success'||scope==='current'&&!result.source,working=busy.includes(result.id)
   return <article className={`result-card result-${result.status}`} key={result.id}>
   <button className="result-preview" aria-label={`${scope==='library'?'预览本地图片':'预览结果'} ${result.id}`} disabled={unavailable} onClick={()=>scope==='library'?void delivery.openArchived(result as ArchivedResult):delivery.open(result.id)}>
    {(scope==='current'?result.source||result.thumbnail:result.thumbnail)?<img loading="lazy" decoding="async" src={scope==='current'?result.source||result.thumbnail:result.thumbnail} alt=""/>:<span className="result-placeholder">{result.status==='error'?'生成失败':result.status==='loading'?'生成中…':'点击查看原图'}</span>}
   </button>
   <div className="result-card-caption"><strong title={result.prompt||'无生成描述'}>{result.prompt||'无生成描述'}</strong>{result.adopted?<span className="result-adopted-mark" role="img" aria-label="已采用" title="已采用"><ResultCardIcon kind="adopted"/></span>:null}</div>
   {result.error?<p className="error-text">{result.error}</p>:null}
   <div className="result-card-actions" role="group" aria-label={`图片操作 ${result.id}`} aria-busy={working}>
    {scope==='current'?<label className="result-compare" title={selected.includes(result.id)?'取消比较':'加入比较（最多 4 张）'}><Checkbox aria-label={`比较结果 ${result.id}`} checked={selected.includes(result.id)} disabled={unavailable||!selected.includes(result.id)&&selected.length>=4} onChange={e=>setCompareIds(e.target.checked?[...selected,result.id].slice(0,4):selected.filter(id=>id!==result.id))}/></label>:null}
    <button title="继续修改" aria-label={`继续修改结果 ${result.id}`} disabled={unavailable||working} onClick={()=>void runImageAction(result,image=>delivery.continueEditing(image))}><ResultCardIcon kind="edit"/></button>
    <button title="另存原图" aria-label={`另存结果 ${result.id}`} disabled={unavailable||working} onClick={()=>void runImageAction(result,async image=>{if(await resultArchive.export(image))message.success('已请求保存图片')})}><ResultCardIcon kind="save"/></button>
    {scope==='current'?<><button className="result-favorite" title={result.favorite?'取消收藏':'收藏'} aria-label={`${result.favorite?'取消收藏':'收藏'}结果 ${result.id}`} aria-pressed={result.favorite} disabled={unavailable} onClick={()=>dispatch({type:'toggle-ai-result-favorite',id:result.id})}><ResultCardIcon kind="favorite"/></button><button className="result-remove" title={result.source?'移除当前记录，原图仍保存在本地作品库；可撤销':'移除当前记录；可撤销'} aria-label={`移除结果记录 ${result.id}`} disabled={working||!!result.source&&delivery.storage[result.id]!=='saved'} onClick={()=>{dispatch({type:'delete-ai-result',id:result.id});message.info(result.source?'记录已移除，原图仍在本地作品库':'记录已移除，可撤销')}}><ResultCardIcon kind="remove"/></button></>:null}
   </div>
  </article>})}</div>:!loading&&!error?<p className="inspector-empty">{scope==='library'?'生成后的原图会自动保存在本机，关闭作品后仍可在这里找回。':'生成后点击图片，在画布中预览、保存或继续修改。'}</p>:null}
  {filtered.length>limit?<button className="result-load-more" onClick={()=>setLimit(v=>v+24)}>显示更多图片</button>:null}
  {previewIds.length?createPortal(<div className="result-preview-modal" role="dialog" aria-modal="true" aria-label="AI 结果对比" onClick={()=>setPreviewIds([])}><FloatingSurface surfaceRef={surface} tabIndex={-1} title="AI 结果对比" onClose={()=>setPreviewIds([])} closeLabel="关闭预览" onClick={e=>e.stopPropagation()}>{previewIds.map(id=>{const item=state.aiResults.find(r=>r.id===id);return item?<figure key={id}><figcaption>{item.model} · {item.size}</figcaption><img src={item.source||item.thumbnail} alt="AI 结果合成预览"/><button onClick={()=>{setPreviewIds([]);delivery.open(id)}}>在画布中查看</button></figure>:null})}</FloatingSurface></div>,document.body):null}
 </section>
}
