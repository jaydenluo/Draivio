import {resultDimensions} from './resultImage'
import {endpointSize} from '../ai/maskedEdit/endpointMapping'
import { prepareChatImageTask, type ImageOverrides } from './chatImageParameters'
import { cloudAccount } from '../account/cloudAccount'
import { negotiateGenerativeRoute } from '../ai/tools/generativeTools'
import { quoteCloudImages } from '../account/cloudBilling'
import { createGenerationPlan } from '../ai/execution/generationJobs'
import { createGenerativeBatch } from '../ai/tools/generativeTools'
import { imageCapabilitiesFor, imageSupports, maskedEditCapability } from './imageEditCapabilities'
import { resolveImageEditTarget, type ImageEditTarget } from './imageEditTarget'
import { prepareMaskedEdit, finishMaskedEdit, fitMaskedEditToEndpoint, MaskedEditMappingError } from '../ai/maskedEdit/workflow'
import { captureRenderedEditorContext } from '../ai/context/editorPreview'
import { captureEditorContext, contextCanCommit } from '../ai/context/editorContext'
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode } from 'react'
import type { AIOperation, ComposerMode, EditorAction, EditorState } from '../state/editor'
import { getRuntimeConnections, getModelsForSource, isSourceUsable } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { ImageRequestError, imagePayload, imageEditPayload } from './openaiImages'
import type { ImageBatch, BatchSnapshot } from './imageBatch'
import { message, type MessageHandle } from '../ui/message'
import { aiManualToolCoverage } from '../ai/tools/toolCoverage'

export type ImageAttachment = { source: string; name: string }
export type GenerationRecord = { id: string; documentId: string; prompt: string; mode: ComposerMode; attachment?: ImageAttachment; model: string; createdAt: string; preparing: boolean; error?: string; snapshot?: BatchSnapshot; masked?: boolean }
export type SmartRecord = { id:string; documentId:string; prompt:string; createdAt:string; attachment?:ImageAttachment; status:string; error?:string; summary?:string }
type TaskHandle = { batch: ImageBatch; documentId: string; masked: boolean; refresh: () => Promise<void>; prepare: (unknown: boolean) => Promise<boolean>; cancel: () => void }
type GenerationContextValue = { smartRecords:SmartRecord[]; saveSmartRecord:(record:SmartRecord)=>void; closeSmartRecord:(id:string)=>void; records: GenerationRecord[]; masked: boolean; snapshot: BatchSnapshot | null; start: (mode?: ComposerMode, attachment?: ImageAttachment, target?: ImageEditTarget, overrides?: ImageOverrides) => void; cancel: () => void; retry: (unknown?: boolean, recordId?: string) => void }
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
  const [smartRecords, setSmartRecords] = useState<SmartRecord[]>([])
  const saveSmartRecord = useCallback((record:SmartRecord) => setSmartRecords(items=>items.some(item=>item.id===record.id)?items.map(item=>item.id===record.id?record:item):[...items,record]),[])
  const closeSmartRecord = useCallback((id:string)=>setSmartRecords(items=>items.map(item=>item.id===id&&['正在检查','正在规划','待确认','待采用','执行中'].includes(item.status)?{...item,status:item.status==='执行中'||item.status==='正在规划'?'已取消':'已收起'}:item)),[])
  const [records, setRecords] = useState<GenerationRecord[]>([])
  const handles = useRef(new Map<string, TaskHandle>())
  const subscriptions = useRef<Array<() => void>>([])
  const updateRecord = (id: string, patch: Partial<GenerationRecord>) => setRecords(items => items.map(item => item.id === id ? {...item, ...patch} : item))
  const pendingRecord = useRef<string|null>(null)
  const preparing = useRef(false)
  const prepareEpoch = useRef(0)
  const batchDocument = useRef<string | null>(null)
  const prepareRetry = useRef<((unknown:boolean)=>Promise<boolean>) | null>(null)
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
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.cancel(); subscriptions.current.forEach(unsubscribe => unsubscribe()); feedback.current?.close(); if (demoTimer.current) clearTimeout(demoTimer.current) } }, [])
  useEffect(() => {
    if (batchDocument.current && batchDocument.current !== documentId) { active.current?.cancel(); prepareEpoch.current++; preparing.current=false; batchDocument.current=null; refreshContext.current=null; prepareRetry.current=null; cancelMasked.current?.(); active.current=null; setBatch(null); dispatch({type:'set-generating',value:false}); if(demoTimer.current){clearTimeout(demoTimer.current);demoTimer.current=null} }
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
        else if (!succeeded && result.items.every(item => item.status === 'failed')) feedback.current?.error(`${summary}，查看任务记录了解原因`)
        else feedback.current?.warning(`${summary}，${errors ? '查看任务记录了解原因' : '已停止排队，可手动补齐'}`)
      }
    } catch { if (mounted.current) feedback.current?.error('生成任务中断，请检查供应商记录后再决定是否重试') }
    finally { feedback.current = null; if (mounted.current && active.current===target) dispatch({ type: 'set-generating', value: false }) }
  }
  const start = async (mode: ComposerMode = state.composerMode, attachment?: ImageAttachment, target:ImageEditTarget='auto', overrides?:ImageOverrides) => {
    if (preparing.current || state.isGenerating || active.current?.getSnapshot().running || demoTimer.current) return
    let task:ReturnType<typeof prepareChatImageTask>|undefined
    let parameterError=''
    if(overrides!==undefined){
      try{task=prepareChatImageTask(state,mode,target,overrides,!!attachment)}catch(error){parameterError=error instanceof Error?error.message:'图片参数无效'}
    }
    const parameters=task?.parameters??{...state.composerParameters}
    const sourceIdForTask=task?.sourceId??state.composerSourceId
    const recordId = crypto.randomUUID()
    pendingRecord.current=recordId
    setRecords(items => [...items, {id:recordId,documentId,prompt:state.prompt,mode,attachment,model:parameters.model,createdAt:new Date().toISOString(),preparing:true}])
    const reject = (text: string) => { updateRecord(recordId,{preparing:false,error:text}); if(pendingRecord.current!==recordId)return; pendingRecord.current=null;preparing.current=false;dispatch({type:'set-generating',value:false});notice('请求未发送，请查看任务记录') }
    if(parameterError)return reject(parameterError)
    if (state.colorModel === 'cmyk') return reject('AI 接口仅支持 RGB；请先在文档模式中显式创建 RGB 工作副本，CMYK 源通道将保留')
    if (!isSourceUsable(sourceIdForTask, parameters.model)) return reject('请先配置服务来源和模型')
    const model = getModelsForSource(sourceIdForTask).find(item => item.displayName === parameters.model)?.code ?? ''
    const connection = getRuntimeConnections().find(item => item.id === sourceIdForTask)
    if (attachment && (!connection || !imageSupports(imageCapabilitiesFor(connection, model), 'reference'))) return reject('此模型不支持参考图片，请更换模型后重试')
    if (attachment && connection?.id === 'draivio-cloud') return reject('云端暂不支持参考图片，请选择支持参考图的 API 模型')
    const cloudSession=cloudAccount.getSessionVersion()
    const editTarget=resolveImageEditTarget(state,target)
    const uploadTarget=mode==='edit'&&editTarget==='upload'
    if(uploadTarget&&!attachment)return reject('请先上传需要修改的图片')
    const maskedCapability = mode === 'edit' && !uploadTarget && connection ? maskedEditCapability(connection, model) : null
    if(mode === 'edit' && !uploadTarget && !maskedCapability) return reject('该模型不支持已验证的蒙版编辑；请选择支持蒙版的模型，不会退回整图生成')
    if (!connection) return reject('服务来源不可用')
    if (!['openai_compatible', 'volcengine'].includes(connection.protocol)) return reject('该协议尚未接入真实生图')
    if (mode !== 'edit' && !state.prompt.trim()) return reject('请先填写图片描述')
    const options = {...resolveGenerationOptions(connection, model),...(task?.quality?{quality:task.quality}:{})}
    let endpointRequestSize=task?state.composerParameters.size:parameters.size
    let prepared: Awaited<ReturnType<typeof prepareMaskedEdit>> | undefined
    let cancelled = false
    const preparation = ++prepareEpoch.current
    batchDocument.current = documentId
    let context
    try { context = captureEditorContext(state, documentId, mode === 'edit' && !uploadTarget && editTarget==='selection' ? 'selection' : 'document') }
    catch (error) { return reject(error instanceof Error ? error.message : '无法读取文档上下文') }
    let request: AIOperation = { context, mode, intent: attachment ? 'reference' : mode === 'edit' ? 'edit' : 'generate', prompt: state.prompt, sourceLayerId: state.selectedLayerId,
      selection: mode==='edit'&&!uploadTarget&&editTarget==='selection' ? structuredClone(state.selection) : null,
      parameters: { ...parameters }, sourceId: sourceIdForTask, modelCode: model,
      ...(attachment ? { reference: { source: attachment.source, thumbnail: attachment.source, layerId: 'attachment' } } : {}) }
    preparing.current = true
    dispatch({type:'clear-submitted-prompt',prompt:request.prompt})
    dispatch({type:'set-generating',value:true})
    try {
      if(mode === 'edit' && maskedCapability){ prepared=await prepareMaskedEdit(state,documentId,maskedCapability.semantics,undefined,editTarget as 'selection'|'object'|'document'); const size=endpointSize(options.sendSize?endpointRequestSize:'auto',imageCapabilitiesFor(connection,model).sizes,prepared.provenance.crop);if(size){prepared=await fitMaskedEditToEndpoint(prepared,size);endpointRequestSize=`${size.width}x${size.height}`}context=prepared.context; request={...request,maskedEdit:prepared.provenance} }
      else context = await captureRenderedEditorContext(state,documentId,context.scope)
      if (preparation!==prepareEpoch.current || !mounted.current || latestDocument.current!==documentId || !contextCanCommit(latest.current,context)) throw new Error('文档已更改，预览已过期，请重新执行')
      request = {...request, context, ...(mode === 'edit' && !attachment && context.preview.dataUrl ? { reference: { source: context.preview.dataUrl, thumbnail: context.preview.dataUrl, layerId: state.selectedLayerId } } : {})}
    } catch(error) { return reject(error instanceof Error ? error.message : '无法生成上下文预览') }
    const count = Math.min(8, Math.max(1, Number.parseInt(request.parameters.count, 10) || 1))
    const capabilitiesSignature=JSON.stringify(imageCapabilitiesFor(connection,model))
    const sourceId = connection.id, baseUrl = connection.baseUrl, protocol = connection.protocol
    const plan = createGenerationPlan({model, sourceName:connection.name, count, strategy:options.multiImage, concurrency:options.concurrency, pricing:connection.imagePricing?.[model], upload:mode==='edit'||!!attachment})
    plan.id = recordId
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
        if(preparation!==prepareEpoch.current||!mounted.current||latestDocument.current!==documentId||!request.context||!contextCanCommit(latest.current,request.context))return reject('任务已取消或文档已更改，请重新生成')
      } catch(error){return reject(error instanceof Error?error.message:'云端报价失败')}
      finally {if(pendingRecord.current===recordId)preparing.current=false}
    }
    if(preparation!==prepareEpoch.current||!mounted.current||latestDocument.current!==documentId)return reject('任务已取消或文档已切换，未提交请求')
    if(!request.context||!contextCanCommit(latest.current,request.context))return reject('文档已更改，请重新生成')
    const next = createGenerativeBatch(count, options.multiImage, options.concurrency, async (requestedCount, attempt) => {
      // Re-read credentials for retry without putting them in task or editor state.
      if(!attempt.isCurrent() || cancelled || !mounted.current || latestDocument.current!==documentId)throw new ImageRequestError('任务已取消或文档已切换，未提交请求',false)
      if(!request.context || !contextCanCommit(latest.current,request.context))throw new ImageRequestError('文档内容已更改，未提交请求',false)
      if(sourceId==='draivio-cloud'&&cloudAccount.getSessionVersion()!==cloudSession)throw new ImageRequestError('云端账号已更改，未提交请求',false)
      const current = getRuntimeConnections().find(item => item.id === sourceId)
      if (!current?.enabled || !current.models.includes(model)) throw new ImageRequestError('来源已停用、删除或模型不可用', false)
      if (current.baseUrl !== baseUrl || current.protocol !== protocol) throw new ImageRequestError('来源接口已更改，请新建生成任务', false)
      if(JSON.stringify(imageCapabilitiesFor(current,model))!==capabilitiesSignature)throw new ImageRequestError('模型图片能力已更改，请创建新任务',false)
      const common={...(sourceId==='draivio-cloud'?{expectedCloudSession:cloudSession}:{}),model,prompt:request.prompt,count:requestedCount,size:prepared?endpointRequestSize:request.parameters.size,options,parameters:{strength:task?.overrides.strength??Number.parseFloat(request.parameters.strength.replace(/[^\d.]/g,''))/100}}
      const operation=prepared?(request.prompt.trim()?'fill':'remove'):attachment?'reference':'generate'
      let route:ReturnType<typeof negotiateGenerativeRoute>
      try{route=negotiateGenerativeRoute(current,{...common,...(prepared?{reference:prepared.reference,mask:prepared.endpointMask}:attachment?{reference:attachment.source}:{})},operation)}catch(error){throw new ImageRequestError(error instanceof Error?error.message:'图片参数无效，未发送请求',false)}
      const payload=(operation==='generate'?imagePayload:imageEditPayload)({...common,capabilities:route.capabilities,...(route.size?{size:route.size}:{}),...(operation!=='generate'?{reference:'record-only'}:{})})
      request={...request,generationMetadata:{defaults:{...(task?.defaults??state.composerParameters)},resolved:{...parameters},overrides:{...(task?.overrides??{})},operation,sent:{...(typeof payload.size==='string'?{size:payload.size}:{}),...(typeof payload.quality==='string'?{quality:payload.quality}:{}),...(typeof payload.strength==='number'?{strength:payload.strength}:{}),...(payload.n!==undefined?{n:payload.n}:{})}}}
      const images=prepared
        ? (await aiManualToolCoverage.reference.execute(current,{...common,operation:request.prompt.trim()?'fill':'remove',reference:prepared.reference,...(attachment?{additionalReference:attachment.source}:{}),mask:{source:prepared.endpointMask,semantics:prepared.provenance.semantics},signal:attempt.signal}))
        : attachment
          ? (await aiManualToolCoverage.reference.execute(current,{...common,operation:'reference',reference:attachment.source,signal:attempt.signal}))
          : (await aiManualToolCoverage.generate.execute(current,{...common,operation:'generate',signal:attempt.signal}))
      if(!prepared)return images
      return images
    }, async (image, index, attempt) => {
      if (prepared) {
        if (!attempt.isCurrent() || cancelled || !mounted.current || latestDocument.current!==documentId) throw new ImageRequestError('已取消或文档已更改，结果未写入',false)
        const captured=prepared
        let finished:Awaited<ReturnType<typeof finishMaskedEdit>>
        try{finished=await finishMaskedEdit(captured,image,undefined,true)}catch(error){
          if(!attempt.isCurrent()||cancelled||!mounted.current||latestDocument.current!==documentId||!contextCanCommit(latest.current,captured.context))throw new ImageRequestError('文档已更改或任务已取消，结果未写入',false)
          const originalImage=error instanceof MaskedEditMappingError?error.original:image
          let dimensions:ReturnType<typeof resultDimensions>|undefined
          try{dimensions=resultDimensions(originalImage)}catch{/* Invalid image data cannot be presented as a saved original. */}
          if(dimensions){
            const recoveryRequest={...request,mode:'generate' as const,intent:'generate' as const,selection:null,maskedEdit:undefined,generationJob:{batchId:attempt.batchId,jobId:attempt.jobId,attemptId:attempt.attemptId}}
            dispatch({type:'add-ai-result',result:{id:`returned-${attempt.jobId}`,source:originalImage,thumbnail:originalImage,prompt:request.prompt,model,provider:sourceId,size:`${dimensions.width} × ${dimensions.height}`,createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,error:'局部修改未合成，当前预览为模型返回的完整原图。',generationMetadata:request.generationMetadata,request:recoveryRequest}})
          }
          throw new ImageRequestError(`图片已返回，但未能应用修改：${error instanceof Error?error.message:'本地合成失败'}；${dimensions?'完整原图已保留在 AI 结果':'原图无法解码'}，重新请求可能另行计费`,false)
        }
        if (!attempt.isCurrent() || cancelled || !mounted.current || latestDocument.current!==documentId) throw new ImageRequestError('文档内容已更改，结果未写入',false)
        dispatch({type:'add-ai-result',result:{id:`masked-${attempt.jobId}`,source:finished.source,thumbnail:finished.thumbnail,prompt:request.prompt,model,provider:sourceId,size:`${captured.provenance.width} × ${captured.provenance.height}`,createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,generationMetadata:request.generationMetadata,request:{...request,maskedEdit:finished.provenance,generationJob:{batchId:attempt.batchId,jobId:attempt.jobId,attemptId:attempt.attemptId}}}})
        return
      }
      if (mounted.current) { if (!attempt.isCurrent() || cancelled || latestDocument.current!==documentId) throw new ImageRequestError('任务已取消，结果未接收',false); dispatch({ type: 'append-ai-result', id: `generated-${attempt.jobId}`, request: {...request,generationJob:{batchId:attempt.batchId,jobId:attempt.jobId,attemptId:attempt.attemptId}}, image, index }) }
    }, plan)
    prepareRetry.current = async (includeUnknown) => {
      const current=getRuntimeConnections().find(item=>item.id===sourceId),retryCount=next.retryIndices(includeUnknown).length
      if(!retryCount)return false
      const retryPlan=createGenerationPlan({model,sourceName:current?.name??connection.name,count:retryCount,strategy:options.multiImage,concurrency:options.concurrency,pricing:current?.imagePricing?.[model],retryUnknown:includeUnknown,upload:mode==='edit'||!!attachment})
      const retryEpoch=prepareEpoch.current
      await quotePlan(retryPlan)
      if(retryEpoch!==prepareEpoch.current||active.current!==next||!mounted.current||latestDocument.current!==documentId)return false
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
    pendingRecord.current=null
    preparing.current=false
    cancelMasked.current=()=>{cancelled=true}
    setMasked(!!prepared)
    handles.current.set(recordId,{batch:next,documentId,masked:!!prepared,refresh:refreshContext.current,prepare:prepareRetry.current,cancel:cancelMasked.current})
    updateRecord(recordId,{preparing:false,masked:!!prepared,snapshot:next.getSnapshot()})
    subscriptions.current.push(next.subscribe(() => { if(mounted.current)updateRecord(recordId,{snapshot:next.getSnapshot(),error:undefined}) }))
    active.current = next; setBatch(next)
    void run(next)
  }
  const retry = async (unknown = false, recordId?: string) => {
    if (preparing.current || state.isGenerating || active.current?.getSnapshot().running) return
    if(recordId){
      const handle=handles.current.get(recordId)
      if(!handle||handle.documentId!==latestDocument.current)return
      active.current=handle.batch;setBatch(handle.batch);setMasked(handle.masked)
      refreshContext.current=handle.refresh;prepareRetry.current=handle.prepare;cancelMasked.current=handle.cancel
      batchDocument.current=handle.documentId
    }
    if(!active.current)return
    const target=active.current
    const retryEpoch=++prepareEpoch.current
    preparing.current=true
    dispatch({type:'set-generating',value:true})
    try {
      await refreshContext.current?.()
      if(retryEpoch!==prepareEpoch.current||active.current!==target)return
      if(!await prepareRetry.current?.(unknown)||retryEpoch!==prepareEpoch.current)return
      void run(target, true, unknown)
    } catch(error) {
      if(retryEpoch===prepareEpoch.current){const text=error instanceof Error ? error.message : '无法刷新上下文，请重新执行';updateRecord(target.getSnapshot().id,{error:text});notice(text)}
    } finally {
      if(retryEpoch===prepareEpoch.current){preparing.current=false;if(!target.getSnapshot().running)dispatch({type:'set-generating',value:false})}
    }
  }
  return <GenerationContext.Provider value={{ smartRecords:smartRecords.filter(item=>item.documentId===documentId), saveSmartRecord, closeSmartRecord, records:records.filter(item=>item.documentId===documentId), snapshot, masked, start, retry, cancel: () => {prepareEpoch.current++;preparing.current=false;if(pendingRecord.current){updateRecord(pendingRecord.current,{preparing:false,error:'已取消，未提交请求'});pendingRecord.current=null}dispatch({type:'set-generating',value:false});cancelMasked.current?.();active.current?.cancel();if(demoTimer.current){clearTimeout(demoTimer.current);demoTimer.current=null;dispatch({type:'set-generating',value:false})}} }}>{children}</GenerationContext.Provider>
}
export function useImageGeneration() {
  const value = useContext(GenerationContext)
  if (!value) throw new Error('useImageGeneration requires EditorProvider')
  return value
}

export function GenerationProgress({record}: {record?: GenerationRecord} = {}) {
  const generation = useImageGeneration()
  const snapshot = record?.snapshot ?? (!record ? generation.snapshot : null)
  const masked = record?.masked ?? generation.masked
  const {cancel} = generation
  const retry = (unknown = false) => generation.retry(unknown,record?.id)
  const busy = !!generation.snapshot?.running
  const [detailsOpen,setDetailsOpen] = useState(false)
  const [confirmUnknown, setConfirmUnknown] = useState(false)
  useEffect(() => { setConfirmUnknown(false) }, [snapshot])
  if (!snapshot) return record?.error ? <p className="generation-error" role="alert">{record.error}</p> : record?.preparing ? <div role="status">正在准备请求…</div> : null
  const count = (status: string) => snapshot.items.filter(item => item.status === status).length
  const failed = count('failed') + count('missing')
  const cancelled = count('cancelled')
  const unknown = count('unknown')
  const messages = [...new Set(snapshot.items.flatMap(item => item.message ? [item.message] : []))]
  return <div className="generation-progress" role="region" aria-label="生成进度">
    {snapshot.plan?<small>模型 {snapshot.plan.model} · {snapshot.plan.requestCount} 次请求 · {snapshot.plan.cost.known?`预计 ${Number(snapshot.plan.cost.amount.toFixed(6))} ${snapshot.plan.cost.currency}`:'费用未知'}</small>:null}
    <div role="status">已完成 {count('succeeded')}/{snapshot.items.length}{snapshot.running ? ` · 生成中 ${count('running')} · 排队 ${count('queued')}` : ''}{failed ? ` · 待补齐 ${failed}` : ''}{cancelled ? ` · 已取消 ${cancelled}` : ''}{unknown ? ` · 结果未知 ${unknown}` : ''}</div>
    <div className="generation-actions">{snapshot.running ? <button onClick={cancel} >{masked ? '取消编辑' : '取消生成'}</button> : <>{failed ? <button disabled={busy} onClick={() => retry()}>重试失败 / 补齐</button> : null}{unknown ? <button disabled={busy} onClick={() => confirmUnknown ? retry(true) : setConfirmUnknown(true)}>{confirmUnknown ? '确认重新生成（可能重复计费）' : '处理未知结果'}</button> : null}</>}</div>
    {record?.error ? <p className="generation-error" role="alert">{record.error}</p> : null}
    {record && messages.length ? <p className="generation-error" role="alert">{messages[0]}</p> : null}
    {messages.length ? record ? <details onToggle={event=>setDetailsOpen(event.currentTarget.open)}><summary>查看详情</summary>{detailsOpen?<ul>{messages.map(text=><li key={text}>{text}</li>)}</ul>:null}</details> : <button onClick={() => message.warning(messages.join('；'), { key: 'generation-details' })}>查看原因</button> : null}
    {failed && !snapshot.running ? <small>手动补齐会重新请求，可能另行计费。</small> : null}
    {snapshot.running ? <small>{masked ? '取消后不会写入编辑结果；已提交请求仍可能计费。' : '取消后停止排队并隔离迟到结果；已提交请求仍可能计费。'}</small> : null}
  </div>
}
