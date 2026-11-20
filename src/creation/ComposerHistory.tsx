import { useLayoutEffect, useId, useRef, useState, type ReactNode } from 'react'
import { useEditor } from '../state/editor'
import { GenerationProgress, useImageGeneration, type GenerationRecord, type SmartRecord } from './ImageGeneration'
import './composerHistory.css'
import {useResultDelivery} from './ResultDelivery'
import { useComposerDraft } from './ComposerDraft'

export function ComposerHistory({children, activeSmartId}: {children?: ReactNode; activeSmartId?: string}) {
  const {records, smartRecords} = useImageGeneration()
  const delivery=useResultDelivery()
  const {state, dispatch} = useEditor()
  const {setManualMode} = useComposerDraft()
  const entries: Array<{kind:'image';record:GenerationRecord}|{kind:'smart';record:SmartRecord}> = [...records.map(record=>({kind:'image' as const,record})),...smartRecords.map(record=>({kind:'smart' as const,record}))].sort((a,b)=>a.record.createdAt.localeCompare(b.record.createdAt))
  const [collapsed, setCollapsed] = useState(false)
  const listId = useId()
  const scroll = useRef<HTMLDivElement>(null)
  const pinned = useRef(true)
  const newest = entries.at(-1)?.record.id ?? ''
  useLayoutEffect(() => { pinned.current=true; setCollapsed(false) }, [newest, activeSmartId])
  useLayoutEffect(() => {
    const list = scroll.current
    if (list && !collapsed && pinned.current) list.scrollTop = list.scrollHeight
  }, [records, smartRecords, children, collapsed])
  if ((!entries.length && !children) || state.composerMinimized) return null
  return <section className="composer-history" aria-label="AI 任务记录">
    <button type="button" className="composer-history-toggle" aria-label={collapsed?'展开任务记录':'收起任务记录'} aria-expanded={!collapsed} aria-controls={listId} onClick={()=>{pinned.current=true;setCollapsed(value=>!value)}}>
      <span>任务记录{entries.length ? ` · ${entries.length}` : ''}</span><span aria-hidden="true">{collapsed?'⌄':'⌃'}</span>
    </button>
    {!collapsed ? <div ref={scroll} id={listId} className="composer-history-scroll" onScroll={event=>{const node=event.currentTarget;pinned.current=node.scrollHeight-node.scrollTop-node.clientHeight<24}}>
      {entries.map(entry=>{
        if(entry.kind==='smart'){
          const record=entry.record
          if(record.id===activeSmartId&&children)return <div key={record.id}>{children}</div>
          return <article key={record.id} className="composer-history-task" aria-label="智能操作记录"><header><strong>编辑画布</strong><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time><span>{record.status}</span></header><p className="composer-history-prompt">{record.prompt}</p>{record.attachment?<figure className="composer-history-reference"><img src={record.attachment.source} alt={`参考图 ${record.attachment.name}`}/><figcaption>{record.attachment.name}</figcaption></figure>:null}{record.error?<p className="generation-error" role="alert">{record.error}</p>:null}{record.summary?<p>{record.summary}</p>:null}<button type="button" className="composer-history-reuse" onClick={()=>{setManualMode('smart');dispatch({type:'set-prompt',prompt:record.prompt})}}>复用提示词</button></article>
        }
        const record=entry.record
        const results = state.aiResults.filter(result=>result.request?.generationJob?.batchId===record.id).slice().reverse()
        const snapshot = record.snapshot
        const complete = snapshot?.items.filter(item=>item.status==='succeeded').length ?? 0
        const status = record.preparing ? '准备中' : snapshot?.running ? '生成中' : record.error ? '请求失败' : snapshot?.items.every(item=>item.status==='succeeded') ? '已完成' : complete ? '部分完成' : snapshot?.items.some(item=>item.status==='failed'||item.status==='missing') ? '生成失败' : '已停止'
        return <article className="composer-history-task" key={record.id} aria-label={`${record.mode==='edit'?'修改图片':'生成图片'}：${record.prompt || '无提示词'}`}>
          <header><strong>{record.mode==='edit'?'修改图片':'生成图片'}</strong><time dateTime={record.createdAt}>{new Date(record.createdAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time><span className={record.error||status==='生成失败'?'is-error':''}>{status}</span></header>
          <p className="composer-history-prompt">{record.prompt || '无提示词'}</p>
          {record.attachment ? <figure className="composer-history-reference"><img src={record.attachment.source} alt={`参考图 ${record.attachment.name}`}/><figcaption>{record.attachment.name}</figcaption></figure> : null}
          <GenerationProgress record={record}/>
          {results.length ? <div className="composer-history-results">{results.map((result,index)=><button type="button" key={result.id} title="在画布中预览" aria-label={`预览生成图片 ${index+1}`} onClick={()=>delivery.open(result.id,results.map(item=>item.id))}><img src={result.thumbnail||result.source} alt={`生成结果 ${index+1}`}/></button>)}</div> : null}
          <button type="button" className="composer-history-reuse" onClick={()=>{setManualMode(record.mode);dispatch({type:'set-prompt',prompt:record.prompt});dispatch({type:'set-composer-mode',mode:record.mode})}}>复用提示词</button>
        </article>
      })}
      {!activeSmartId ? children : null}
    </div> : null}
  </section>
}
