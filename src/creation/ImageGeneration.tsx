import { cloudAccount } from '../account/cloudAccount'
import { negotiateGenerativeRoute } from '../ai/tools/generativeTools'
import { quoteCloudImages } from '../account/cloudBilling'
import { createGenerationPlan, confirmGenerationPlan } from '../ai/execution/generationJobs'
import { createGenerativeBatch } from '../ai/tools/generativeTools'
import { maskedEditCapability } from './imageEditCapabilities'
import { prepareMaskedEdit, finishMaskedEdit } from '../ai/maskedEdit/workflow'
import { captureRenderedEditorContext } from '../ai/context/editorPreview'
import { captureEditorContext, contextCanCommit } from '../ai/context/editorContext'
import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode } from 'react'
import type { AIOperation, ComposerMode, EditorAction, EditorState } from '../state/editor'
import { getRuntimeConnections, getModelsForSource, isSourceUsable } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { ImageRequestError, imagePayload } from './openaiImages'
import type { ImageBatch, BatchSnapshot } from './imageBatch'
import { message, type MessageHandle } from '../ui/message'
import { aiManualToolCoverage } from '../ai/tools/toolCoverage'

type GenerationContextValue = { masked: boolean; snapshot: BatchSnapshot | null; start: (mode?: ComposerMode) => void; cancel: () => void; retry: (unknown?: boolean) => void }
const GenerationContext = createContext<GenerationContextValue | null>(null)
const emptySubscribe = () => () => {}
const emptySnapshot = () => null
export function requestUploadConsent(mode: ComposerMode, sourceName: string): boolean {
  if (mode !== 'edit') return true
  if (typeof window === 'undefined' || typeof window.confirm !== 'function') return false
  return window.confirm(`本次编辑会把当前文档内容上传到“${sourceName}”。是否继续？`)
}

export function ImageGenerationProvider({ state, documentId, dispatch, children }: { state: EditorState; documentId: string; dispatch: Dispatch<EditorAction>; children: ReactNode }) {
  const latest = useRef(state); latest.current = state
  const latestDocument = useRef(documentId); latestDocument.current=documentId
  const preparing = useRef(false)
  const prepareEpoch = useRef(0)
  const batchDocument = useRef<string | null>(null)
  const retryConsent = useRef<((unknown:boolean)=>Promise<boolean>) | null>(null)
  const refreshContext = useRef<(() => Promise<void>) | null>(null)
  const [batch, setBatch] = useState<ImageBatch | null>(null)
  const active = useRef<ImageBatch | null>(null)
  const cancelMasked = useRef<(() => void) | null>(null)
  const [masked, setMasked] = useState(false)
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const messageKey = useId()
  const feedback = useRef<MessageHandle | null>(null)
  const snapshot = useSyncExternalStore(batch?.subscribe ?? emptySubscribe, batch?.getSnapshot ?? emptySnapshot)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.cancel(); feedback.current?.close(); if (demoTimer.current) clearTimeout(demoTimer.current) } }, [])
  useEffect(() => {
    if (batchDocument.current && batchDocument.current !== documentId) { active.current?.cancel(); prepareEpoch.current++; preparing.current=false; batchDocument.current=null; refreshContext.current=null; retryConsent.current=null; cancelMasked.current?.(); active.current=null; setBatch(null); dispatch({type:'set-generating',value:false}); if(demoTimer.current){clearTimeout(demoTimer.current);demoTimer.current=null} }
  }, [documentId,dispatch])
  const notice = (text: string) => { message.warning(text, { key: messageKey }) }
  const run = async (target: ImageBatch, retry = false, unknown = false) => {
    dispatch({ type: 'set-generating', value: true })
    feedback.current = message.loading(retry ? '正在补齐图片…' : '正在生成图片…', { key: messageKey })
    try {
      if (retry) await target.retry(unknown); else await target.run()
      if (mounted.current && active.current===target) {
        const result = target.getSnapshot()
        const succeeded = result.items.filter(item => item.status === 'succeeded').length
        const summary = `已生成 ${succeeded}/${result.items.length} 张`
        const errors = [...new Set(result.items.flatMap(item => item.message ? [item.message] : []))].join('；')
        if (succeeded === result.items.length) feedback.current?.success(summary)
        else if (!succeeded && result.items.every(item => item.status === 'failed')) feedback.current?.error(`${summary}；${errors}`)
        else feedback.current?.warning(`${summary}；${errors || '已停止排队，可手动补齐'}`)
      }
    } catch { if (mounted.current) feedback.current?.error('生成任务中断，请检查供应商记录后再决定是否重试') }
    finally { feedback.current = null; if (mounted.current && active.current===target) dispatch({ type: 'set-generating', value: false }) }
  }
  const start = async (mode: ComposerMode = state.composerMode) => {
    if (state.colorModel === 'cmyk') return notice('AI 接口仅支持 RGB；请先在文档模式中显式创建 RGB 工作副本，CMYK 源通道将保留')
    if (preparing.current || state.isGenerating || active.current?.getSnapshot().running || demoTimer.current) return
    if (!isSourceUsable(state.composerSourceId, state.composerParameters.model)) return notice('请先配置服务来源和模型')
    const model = getModelsForSource(state.composerSourceId).find(item => item.displayName === state.composerParameters.model)?.code ?? ''
    const connection = getRuntimeConnections().find(item => item.id === state.composerSourceId)
    const cloudSession=cloudAccount.getSessionVersion()
    const maskedCapability = mode === 'edit' && connection ? maskedEditCapability(connection, model) : null
    if(mode === 'edit' && !maskedCapability) return notice('该模型不支持已验证的蒙版编辑；请选择支持蒙版的模型，不会退回整图生成')
    let prepared: Awaited<ReturnType<typeof prepareMaskedEdit>> | undefined
    let cancelled = false
    const preparation = ++prepareEpoch.current
    batchDocument.current = documentId
    let context
    try { context = captureEditorContext(state, documentId, mode === 'edit' ? state.selectionVisible ? 'selection' : 'document' : 'document') }
    catch (error) { return notice(error instanceof Error ? error.message : '无法读取文档上下文') }
    let request: AIOperation = { context, mode, intent: mode === 'edit' ? 'edit' : 'generate', prompt: state.prompt, sourceLayerId: state.selectedLayerId,
      selection: state.selectionVisible ? structuredClone(state.selection) : null,
      parameters: { ...state.composerParameters }, sourceId: state.composerSourceId, modelCode: model }
    preparing.current = true
    dispatch({type:'set-generating',value:true})
    try {
      if(mode === 'edit' && maskedCapability){ prepared=await prepareMaskedEdit(state,documentId,maskedCapability.semantics); context=prepared.context; request={...request,maskedEdit:prepared.provenance} }
      else context = await captureRenderedEditorContext(state,documentId,context.scope)
      if (preparation!==prepareEpoch.current || !mounted.current || latestDocument.current!==documentId || !contextCanCommit(latest.current,context)) throw new Error('文档已更改，预览已过期，请重新执行')
      request = {...request, context, ...(mode === 'edit' && context.preview.dataUrl ? { reference: { source: context.preview.dataUrl, thumbnail: context.preview.dataUrl, layerId: state.selectedLayerId } } : {})}
    } catch(error) { preparing.current=false; dispatch({type:'set-generating',value:false}); return notice(error instanceof Error ? error.message : '无法生成上下文预览') }
    preparing.current=false
    dispatch({type:'set-generating',value:false})
    if (!connection) return notice('服务来源不可用')
    if (!['openai_compatible', 'volcengine'].includes(connection.protocol)) return notice('该协议尚未接入真实生图')
    if (mode !== 'edit' && !request.prompt.trim()) return notice('请先填写图片描述')
    const options = resolveGenerationOptions(connection, model)
    const count = Math.min(8, Math.max(1, Number.parseInt(request.parameters.count, 10) || 1))
    const sourceId = connection.id, baseUrl = connection.baseUrl, protocol = connection.protocol
    const plan = createGenerationPlan({model, sourceName:connection.name, count, strategy:options.multiImage, concurrency:options.concurrency, pricing:connection.imagePricing?.[model], upload:mode==='edit'})
    const quotePlan=async(target:ReturnType<typeof createGenerationPlan>)=>{
      if(connection.id!=='draivio-cloud')return
      if(cloudAccount.getSessionVersion()!==cloudSession)throw new Error('云端账号已更改，请创建新任务')
      const input={model,prompt:request.prompt,count:target.imageCount,size:request.parameters.size,options}
      const route=negotiateGenerativeRoute(connection,input,'generate')
      const payload=imagePayload({...input,capabilities:route.capabilities,...(route.size?{size:route.size}:{})})
      const amount=await quoteCloudImages(payload,target.requestCount)
      if(cloudAccount.getSessionVersion()!==cloudSession)throw new Error('云端账号已更改，请创建新任务')
      target.cost={known:true,amount,currency:'积分',basis:'server-quote'}
    }
    if(connection.id==='draivio-cloud'){
      try {
        preparing.current=true
        await quotePlan(plan)
        if(preparation!==prepareEpoch.current||!mounted.current||latestDocument.current!==documentId||!request.context||!contextCanCommit(latest.current,request.context))return notice('任务已取消或文档已更改，请重新生成')
      } catch(error){return notice(error instanceof Error?error.message:'云端报价失败')}
      finally {preparing.current=false}
    }
    if (!confirmGenerationPlan(plan)) { dispatch({type:'set-generating',value:false}); return }
    const next = createGenerativeBatch(count, options.multiImage, options.concurrency, async (requestedCount, attempt) => {
      // Re-read credentials for retry without putting them in task or editor state.
      if(!attempt.isCurrent() || cancelled || !mounted.current || latestDocument.current!==documentId)throw new ImageRequestError('任务已取消或文档已切换，未提交请求',false)
      if(!request.context || !contextCanCommit(latest.current,request.context))throw new ImageRequestError('文档内容已更改，未提交请求',false)
      if(sourceId==='draivio-cloud'&&cloudAccount.getSessionVersion()!==cloudSession)throw new ImageRequestError('云端账号已更改，未提交请求',false)
      const current = getRuntimeConnections().find(item => item.id === sourceId)
      if (!current?.enabled || !current.models.includes(model)) throw new ImageRequestError('来源已停用、删除或模型不可用', false)
      if (current.baseUrl !== baseUrl || current.protocol !== protocol) throw new ImageRequestError('来源接口已更改，请新建生成任务', false)
      const common={...(sourceId==='draivio-cloud'?{expectedCloudSession:cloudSession}:{}),model,prompt:request.prompt,count:requestedCount,size:request.parameters.size,options,parameters:{strength:Number.parseInt(request.parameters.strength,10)/100}}
      const images=prepared?(await aiManualToolCoverage.reference.execute(current,{...common,operation:request.prompt.trim()?'fill':'remove',reference:prepared.reference,mask:{source:prepared.endpointMask,semantics:prepared.provenance.semantics},signal:attempt.signal})):(await aiManualToolCoverage.generate.execute(current,{...common,operation:'generate',signal:attempt.signal}))
      if(!prepared)return images
      return images
    }, async (image, index, attempt) => {
      if (prepared) {
        if (!attempt.isCurrent() || cancelled || !mounted.current || latestDocument.current!==documentId) throw new ImageRequestError('已取消或文档已更改，结果未写入',false)
        const captured=prepared,finished=await finishMaskedEdit(captured,image,undefined,true)
        if (!attempt.isCurrent() || cancelled || !mounted.current || latestDocument.current!==documentId || !contextCanCommit(latest.current,captured.context)) throw new ImageRequestError('文档内容已更改，结果未写入',false)
        dispatch({type:'add-ai-result',result:{id:`masked-${attempt.jobId}`,source:finished.source,thumbnail:finished.thumbnail,prompt:request.prompt,model,provider:sourceId,size:`${captured.provenance.width} × ${captured.provenance.height}`,createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,request:{...request,maskedEdit:finished.provenance,generationJob:{batchId:attempt.batchId,jobId:attempt.jobId,attemptId:attempt.attemptId}}}})
        return
      }
      if (mounted.current) { if (!attempt.isCurrent() || cancelled || latestDocument.current!==documentId || !request.context || !contextCanCommit(latest.current,request.context)) throw new ImageRequestError('文档内容已更改，结果未写入；请重试以重新捕获上下文',false); dispatch({ type: 'append-ai-result', id: `generated-${attempt.jobId}`, request: {...request,generationJob:{batchId:attempt.batchId,jobId:attempt.jobId,attemptId:attempt.attemptId}}, image, index }) }
    })
    next.setPlan(plan)
    retryConsent.current = async (includeUnknown) => {
      const current=getRuntimeConnections().find(item=>item.id===sourceId),retryCount=next.retryIndices(includeUnknown).length
      if(!retryCount)return false
      const retryPlan=createGenerationPlan({model,sourceName:current?.name??connection.name,count:retryCount,strategy:options.multiImage,concurrency:options.concurrency,pricing:current?.imagePricing?.[model],retryUnknown:includeUnknown,upload:mode==='edit'})
      const retryEpoch=prepareEpoch.current
      await quotePlan(retryPlan)
      if(retryEpoch!==prepareEpoch.current||active.current!==next||!mounted.current||latestDocument.current!==documentId)return false
      if(!confirmGenerationPlan(retryPlan))return false
      next.setPlan({...retryPlan,id:next.getSnapshot().id});cancelled=false;return true
    }
    refreshContext.current = async () => {
      if(latestDocument.current!==documentId)throw new Error('文档已切换，请创建新任务')
      if(prepared){if(!contextCanCommit(latest.current,prepared.context))throw new Error('文档已更改，请重新生成以捕获蒙版');cancelled=false;return}

      const current = latest.current
      const pinned = {...current,selectedLayerId:request.sourceLayerId,selection:request.selection??current.selection,selectionVisible:!!request.selection}
      const refreshed = await captureRenderedEditorContext(pinned,documentId,request.context?.scope??'document')
      if (latestDocument.current!==documentId || !contextCanCommit(latest.current,refreshed)) throw new Error('文档仍在变化，请稍后重试')
      request = {...request,context:refreshed}
    }
    cancelMasked.current=()=>{cancelled=true}
    setMasked(!!prepared)
    active.current = next; setBatch(next)
    void run(next)
  }
  const retry = async (unknown = false) => {
    if (preparing.current || !active.current || state.isGenerating || active.current.getSnapshot().running) return
    const target=active.current
    preparing.current=true
    try { await refreshContext.current?.(); if(active.current!==target || !await retryConsent.current?.(unknown))return; void run(target, true, unknown) } catch(error) { notice(error instanceof Error ? error.message : '无法刷新上下文，请重新执行') } finally {preparing.current=false}
  }
  return <GenerationContext.Provider value={{ snapshot, masked, start, retry, cancel: () => {prepareEpoch.current++;cancelMasked.current?.();active.current?.cancel();if(demoTimer.current){clearTimeout(demoTimer.current);demoTimer.current=null;dispatch({type:'set-generating',value:false})}} }}>{children}</GenerationContext.Provider>
}
export function useImageGeneration() {
  const value = useContext(GenerationContext)
  if (!value) throw new Error('useImageGeneration requires EditorProvider')
  return value
}

export function GenerationProgress() {
  const { snapshot, cancel, retry, masked } = useImageGeneration()
  const [confirmUnknown, setConfirmUnknown] = useState(false)
  useEffect(() => { setConfirmUnknown(false) }, [snapshot])
  if (!snapshot) return null
  const count = (status: string) => snapshot.items.filter(item => item.status === status).length
  const failed = count('failed') + count('missing')
  const cancelled = count('cancelled')
  const unknown = count('unknown')
  const messages = [...new Set(snapshot.items.flatMap(item => item.message ? [item.message] : []))]
  return <div className="generation-progress" role="region" aria-label="生成进度">
    {snapshot.plan?<small>模型 {snapshot.plan.model} · {snapshot.plan.requestCount} 次请求 · {snapshot.plan.cost.known?`预计 ${Number(snapshot.plan.cost.amount.toFixed(6))} ${snapshot.plan.cost.currency}`:'费用未知'}</small>:null}
    <div role="status">已完成 {count('succeeded')}/{snapshot.items.length}{snapshot.running ? ` · 生成中 ${count('running')} · 排队 ${count('queued')}` : ''}{failed ? ` · 待补齐 ${failed}` : ''}{cancelled ? ` · 已取消 ${cancelled}` : ''}{unknown ? ` · 结果未知 ${unknown}` : ''}</div>
    <div className="generation-actions">{snapshot.running ? <button onClick={cancel} >{masked ? '取消编辑' : '取消生成'}</button> : <>{failed ? <button onClick={() => retry()}>重试失败 / 补齐</button> : null}{unknown ? <button onClick={() => confirmUnknown ? retry(true) : setConfirmUnknown(true)}>{confirmUnknown ? '确认重新生成（可能重复计费）' : '处理未知结果'}</button> : null}</>}</div>
    {messages.length ? <button onClick={() => message.warning(messages.join('；'), { key: 'generation-details' })}>查看原因</button> : null}
    {failed && !snapshot.running ? <small>手动补齐会重新请求，可能另行计费。</small> : null}
    {snapshot.running ? <small>{masked ? '取消后不会写入编辑结果；已提交请求仍可能计费。' : '取消后停止排队并隔离迟到结果；已提交请求仍可能计费。'}</small> : null}
  </div>
}
