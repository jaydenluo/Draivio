import { requestRemotePlan } from '../ai/planning/remotePlanner'
import { EDIT_SELECTION_EVENT } from './composerEvents'
import { useAssistantModel } from './useAssistantModel'
import { message } from '../ui/message'
import { planConversation,recordConversationRun,undoConversationRun } from '../ai/conversation/session'
import { imageSupportsMaskedEdit } from './imageEditCapabilities'
import { type PlannerPlan } from '../ai/planning/planner'
import { PlanExecutor } from '../ai/execution/executor'
import { createEditPreview, executePreviewStep, previewCanCommit, rebuildEditPreview, type EditPreviewCandidate } from '../ai/execution/preview'
import { createRunState, type RunState } from '../ai/execution/runState'
import { EditPreview } from '../ai/ui/EditPreview'
import { EditRunSummary } from '../ai/ui/EditRunSummary'
import { useImageGeneration, type SmartRecord } from './ImageGeneration'
import { getRuntimeConnections } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { ComposerPopover } from './ComposerPopover'
import { generationCounts } from './composerPreferences'
import { OutputFormatPicker } from './OutputFormatPicker'
import { outputFormatLabel } from './outputFormats'
import { ModelSourcePicker } from './ModelSourcePicker'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { useComposerDrag } from './useComposerDrag'
import { useCallback, useEffect, useLayoutEffect, useId, useRef, useState } from 'react'
import { ModelGuide } from './ModelGuide'
import { useEditor, type ComposerParameter, type EditorState } from '../state/editor'
import { getModelsForSource, getSourceById, isSourceUsable, useServiceSources } from './modelSources'
import { aiManualToolCoverage } from '../ai/tools/toolCoverage'
import { inferAIIntent } from '../ai/planning/intentRouter'
import { clipboardImage } from './composerImage'
import { useComposerDraft } from './ComposerDraft'
import './composerScope.css'
import { ComposerHistory } from './ComposerHistory'
import { ImageEditTargetControl } from './ImageEditTargetControl'
import { AutoIntentTrial } from './AutoIntentTrial'
import type { SemanticIntent } from '../ai/planning/semanticIntent'

type PopoverParameter = Exclude<ComposerParameter, 'ratio'> | 'assistant'
const PROMPT_MIN_HEIGHT = 26
const parameterOptions: Record<Exclude<PopoverParameter, 'size' | 'assistant'>, string[]> = {
  model: ['Image Pro', 'Image Fast', 'Image Detail'],
  count: generationCounts,
  strength: ['强度 48%', '强度 72%', '强度 24%'],
}

function planCoversScope(plan: PlannerPlan, scopeIds: readonly string[]) {
  const covered = new Set(plan.steps.flatMap(step => [
    ...(typeof step.args.layerId === 'string' ? [step.args.layerId] : []),
    ...(Array.isArray(step.args.layerIds) ? step.args.layerIds as string[] : []),
  ]))
  return scopeIds.every(id => covered.has(id))
}

function planningBaseMatches(base:EditorState|undefined,current:EditorState){
  // Only our non-undoable consumption of the submitted prompt may differ.
  return !!base&&(base===current||current.prompt===''&&Object.keys(base).length===Object.keys(current).length&&Object.keys(base).every(key=>key==='prompt'||base[key as keyof EditorState]===current[key as keyof EditorState]))
}

export function AIComposer() {
  const { state, dispatch, documentId } = useEditor()
  const composerDrag = useComposerDrag(state.composerPlacement === 'floating')
  const promptTransaction = { onEditStart: () => undefined, onEditEnd: () => undefined, onEditCancel: () => undefined }
  useServiceSources()
  const { start, cancel: cancelGeneration, saveSmartRecord, closeSmartRecord } = useImageGeneration()
  const connection = getRuntimeConnections().find(item => item.id === state.composerSourceId)
  const sizeByService = connection && !resolveGenerationOptions(connection, state.composerParameters.model).sendSize
  const source = getSourceById(state.composerSourceId)
  const [openParameter, setOpenParameter] = useState<PopoverParameter | null>(null)
  const [parameterAnchor, setParameterAnchor] = useState<HTMLElement | null>(null)
  const closeParameter = useCallback(() => setOpenParameter(null), [])
  const sourceUsable = isSourceUsable(state.composerSourceId, state.composerParameters.model)
  const selectedModel = getModelsForSource(state.composerSourceId).find((model) => model.displayName === state.composerParameters.model)
  const [guideOpen, setGuideOpen] = useState(false)
  const closeGuide = useCallback(() => setGuideOpen(false), [])
  const sendHintId = useId()
  const referenceInput = useRef<HTMLInputElement>(null)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const resizePrompt = useCallback((element?: HTMLTextAreaElement) => {
    const input = element ?? promptInput.current
    if (!input) return
    if (state.composerMinimized) {
      input.style.height = `${PROMPT_MIN_HEIGHT}px`
      input.style.overflowY = 'hidden'
      return
    }
    input.style.height = 'auto'
    const limit = Number.parseInt(getComputedStyle(input).getPropertyValue('--composer-prompt-limit'), 10) || 220
    const height = Math.min(Math.max(input.scrollHeight, PROMPT_MIN_HEIGHT), limit)
    input.style.height = `${height}px`
    input.style.overflowY = input.scrollHeight > limit ? 'auto' : 'hidden'
  }, [state.composerMinimized])
  useLayoutEffect(() => { resizePrompt() }, [resizePrompt, state.prompt])
  const composerRef = composerDrag.ref
  useLayoutEffect(() => {
    const composer = composerRef.current
    if (!composer) return
    let width = composer.clientWidth
    const resize = () => {
      if (width !== composer.clientWidth) {
        width = composer.clientWidth
        if (parameterAnchor && !parameterAnchor.getClientRects().length) closeParameter()
      }
      resizePrompt()
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      if (width !== composer.clientWidth) resize()
    })
    observer?.observe(composer)
    window.addEventListener('resize', resize)
    return () => { observer?.disconnect(); window.removeEventListener('resize', resize) }
  }, [composerRef, parameterAnchor, closeParameter, resizePrompt])
  const { reference, imageError, readingImage, manualMode, setManualMode, preferMode, editTarget,setEditTarget, addImage, removeImage } = useComposerDraft()
  const sentenceEdit = manualMode === 'smart'
  const autoIntent = manualMode === 'auto'
  const [intentTrigger,setIntentTrigger]=useState(0)
  const [intentCancel,setIntentCancel]=useState(0)
  const [understanding,setUnderstanding]=useState(false)
  const [acceptedIntent,setAcceptedIntent]=useState<SemanticIntent|null>(null)
  const applyIntent=(intent:SemanticIntent)=>{
    if(intent.targetIds.length)dispatch({type:'select-layers',ids:intent.targetIds})
    setEditTarget(intent.target)
    setAcceptedIntent(intent)
  }
  useEffect(()=>{if(acceptedIntent){setAcceptedIntent(null);void execute(acceptedIntent)}},[acceptedIntent])
  useEffect(()=>{setAcceptedIntent(null)},[documentId])
  const maskSupported = manualMode !== 'edit' || editTarget==='upload'&&!!reference || !!connection && imageSupportsMaskedEdit(connection, selectedModel?.code ?? '')
  const [smartPrompt,setSmartPrompt] = useState<SmartRecord|null>(null)
  const smartPromptRef = useRef(smartPrompt); smartPromptRef.current=smartPrompt
  const [planning,setPlanning] = useState(false)
  const assistantModel = useAssistantModel()
  const assistant = assistantModel.selected
  const chooseAssistant = (sourceId: string, model: string) => {
    try { assistantModel.choose({ sourceId, model }); closeParameter() }
    catch (error) { message.error(error instanceof Error ? error.message : '推理模型保存失败') }
  }
  const [plan, setPlan] = useState<PlannerPlan | null>(null)
  const [candidate, setCandidate] = useState<EditPreviewCandidate | null>(null)
  const [run, setRun] = useState<RunState | null>(null)
  useEffect(()=>{
    if(!smartPrompt)return
    const status = planning?'正在规划':candidate?'待采用':plan?'待确认':run?.status==='running'?'执行中':run?.status==='committed'?'已完成':run?.status==='failed'?'执行失败':run?.status==='blocked'?'已阻塞':run?.status==='cancelled'?'已取消':'已结束'
    saveSmartRecord({...smartPrompt,status,error:run?.error,summary:plan?.explanation??(run&&Object.keys(run.steps).length?`已处理 ${Object.keys(run.steps).length} 个步骤`:undefined)})
  },[smartPrompt,planning,candidate,plan,run,saveSmartRecord])
  const plannedBase = useRef<{ state: typeof state; documentId: string } | null>(null)
  const active = useRef<AbortController | null>(null)
  const latest = useRef({ state, documentId })
  latest.current = { state, documentId }
  const abandon = useCallback(() => {
    if(smartPromptRef.current)closeSmartRecord(smartPromptRef.current.id)
    active.current?.abort()
    active.current = null
    setPlanning(false)
    setPlan(null)
    setCandidate(null)
    setRun(null)
    setSmartPrompt(null)
  }, [closeSmartRecord])
  useEffect(() => { abandon(); return () => { active.current?.abort() } }, [documentId, abandon])
  useEffect(() => { abandon() }, [assistant?.sourceId, assistant?.model, abandon])
  useEffect(() => { abandon(); setOpenParameter(null) }, [state.composerMode, state.composerMinimized, abandon])
  const execute = async (semantic?:SemanticIntent) => {
    if (readingImage || understanding || planning || state.isGenerating) return
    if(autoIntent&&!semantic){setIntentTrigger(value=>value+1);return}
    const inferred = inferAIIntent(state.prompt, {
      selectionVisible: state.selectionVisible,
      selectedLayerId: state.selectedLayerId,
      selectedLayerIds: state.selectedLayerIds,
      layers: state.layers,
    })
    const intent = semantic ? {...inferred,kind:semantic.kind as 'generate'|'image-edit'|'smart-plan',scopeIds:semantic.target==='document'?state.layers.map(layer=>layer.id):semantic.targetIds,confidence:'high' as const} : manualMode === 'smart' || sentenceEdit
      ? { ...inferred, kind: 'smart-plan' as const }
      : manualMode === 'edit'
        ? { ...inferred, kind: 'image-edit' as const }
        : { ...inferred, kind: 'generate' as const }
    if (intent.kind !== 'smart-plan') {
      const nextMode = intent.kind === 'image-edit' ? 'edit' : 'generate'
      if (state.composerMode !== nextMode) dispatch({ type: 'set-composer-mode', mode: nextMode })
      if(semantic)start(nextMode, reference ?? undefined,semantic.target,semantic.imageParameters??{})
      else start(nextMode,reference??undefined,editTarget)
      return
    }
    if (active.current) return
    const submitted:SmartRecord={id:crypto.randomUUID(),documentId,prompt:state.prompt,createdAt:new Date().toISOString(),attachment:reference??undefined,status:'正在检查'}
    setSmartPrompt(submitted);saveSmartRecord(submitted)
    setCandidate(null)
    setRun(null)
    if (/^\s*(?:撤销刚才|撤销上次|撤销本次编辑)[。！!]?\s*$/.test(state.prompt)) { undoLastRun(); dispatch({type:'clear-submitted-prompt',prompt:state.prompt}); return }
    dispatch({type:'clear-submitted-prompt',prompt:submitted.prompt})
    const scopeIds = intent.scopeIds
    plannedBase.current = { state, documentId }
    const localPlan = planConversation(state, documentId, state.prompt, scopeIds)
    if (intent.confidence === 'low') { setPlan({ ...localPlan, clarifications: [...new Set([...localPlan.clarifications, intent.reason])] }); return }
    const localRejected = localPlan.warnings.some(message => message.includes('已拒绝'))
    const localComplete = localPlan.steps.length && !localPlan.clarifications.length && !localPlan.warnings.length && planCoversScope(localPlan,scopeIds)
    if (localRejected || (semantic ? scopeIds.length === 1 && localComplete : localPlan.steps.length || localPlan.clarifications.length)) { setPlan(localPlan); return }
    const selectedPlanner=assistant
    const provider=selectedPlanner&&getRuntimeConnections().find(c=>c.id===selectedPlanner.sourceId)
    if(!provider||!selectedPlanner){setRun({...createRunState('model-unavailable',[]),status:'blocked',error:'请在服务设置中配置文本推理模型与密钥'});return}
    const plannerModel=selectedPlanner.model
    if(!semantic&&!window.confirm(`将文档图层信息${reference?'和所选参考图':''}发送到「${provider.name}」的 ${plannerModel} 进行规划，可能由供应商计费。是否继续？`))return
    const controller=new AbortController();active.current=controller;setPlanning(true)
    const base=state,id=documentId
    try{
      const result=await requestRemotePlan(provider,plannerModel,base,id,state.prompt,scopeIds,{signal:controller.signal,reference:semantic?undefined:reference??undefined})
      if(active.current!==controller||controller.signal.aborted)return
      if(latest.current.documentId!==id||!planningBaseMatches(base,latest.current.state))throw new Error('文档已更改，请重新进行模型规划')
      const current=getRuntimeConnections().find(c=>c.id===provider.id)
      if(!current||!current.enabled||current.baseUrl!==provider.baseUrl||current.apiKey!==provider.apiKey||current.protocol!==provider.protocol||!current.models.includes(plannerModel))throw new Error('模型配置已更改，请重新规划')
      if(semantic&&result.steps.length&&!result.clarifications.length&&!result.warnings.length&&!planCoversScope(result,scopeIds))throw new Error('计划未覆盖全部已确认对象，请明确每个对象的操作后重试')
      setPlan(result)
    }catch(error){if(active.current===controller&&!controller.signal.aborted)setRun({...createRunState('model-plan-failed',[]),status:'failed',error:error instanceof Error?error.message:'模型规划失败'})}
    finally{if(active.current===controller){active.current=null;setPlanning(false)}}
  }
  const confirmPlan = async () => {
    if (!plan || active.current || !plan.steps.length || plan.clarifications.length || plan.warnings.length) return
    if (!planningBaseMatches(plannedBase.current?.state,state) || plannedBase.current?.documentId !== documentId) { setPlan(null); setRun({ ...createRunState('stale-plan', []), status: 'blocked', error: '文档已更改，请重新预览计划' }); return }
    const controller = new AbortController()
    active.current = controller
    const base = state, id = documentId
    const scopeIds = [...new Set(plan.steps.flatMap(step => [...(typeof step.args.layerId === 'string' ? [step.args.layerId] : []), ...(Array.isArray(step.args.layerIds) ? step.args.layerIds as string[] : [])]))]
    let draft = structuredClone(base)
    setPlan(null)
    const executor = new PlanExecutor(async step => {
      if (controller.signal.aborted) throw new Error('已取消')
      draft = executePreviewStep(draft, step, scopeIds)
      return { tool: step.tool, targetIds: scopeIds, changed: draft.layers !== base.layers }
    })
    const result = await executor.run(plan.steps, { authorized: true, signal: controller.signal, onState: next => { if (active.current === controller) setRun(next.status === 'committed' ? { ...next, status: 'preview' } : next) } })
    if (active.current !== controller || controller.signal.aborted) return
    active.current = null
    if (latest.current.documentId !== id || latest.current.state !== base) { setRun({ ...result.state, status: 'blocked', error: '文档已更改，请重新预览' }); return }
    if (result.state.status === 'committed') setCandidate(createEditPreview(base, id, plan.steps, scopeIds, draft))
  }
  const cancelRun = () => {
    active.current?.abort()
    active.current = null
    setRun(current => ({ ...(current ?? createRunState('cancelled', [])), status: 'cancelled' }))
  }
  const adoptPreview = () => {
    if (!candidate || !previewCanCommit(candidate, latest.current.state, latest.current.documentId)) return
    // Consume synchronously so repeated clicks cannot apply the same draft twice.
    const adopted = candidate
    let recorded: typeof state
    try { recorded = recordConversationRun(adopted.base, adopted.document, documentId, run?.runId ?? adopted.id, adopted.steps) }
    catch (error) { setRun({ ...createRunState(adopted.id, adopted.steps), status: 'blocked', error: error instanceof Error ? error.message : '无法记录操作' }); return }
    latest.current = { ...latest.current, state: recorded }
    setCandidate(null)
    dispatch({ type: 'apply-edit-plan', document: recorded })
    setRun(current => ({ ...(current ?? createRunState(adopted.id, adopted.steps)), status: 'committed' }))
    promptInput.current?.focus()
  }
  const undoLastRun = () => {
    try {
      const result = undoConversationRun(latest.current.state, latest.current.documentId)
      dispatch({ type: 'apply-conversation-undo', document: result.state })
      setPlan(null); setCandidate(null)
      setRun({ ...createRunState('conversation-undo', []), status: 'committed', error: result.warnings.length ? result.warnings.join('；') : undefined })
      promptInput.current?.focus()
    } catch (error) { setRun({ ...createRunState('conversation-undo', []), status: 'blocked', error: error instanceof Error ? error.message : '无法撤销 AI 操作' }) }
  }
  const handlePromptKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      promptTransaction.onEditCancel()
      event.currentTarget.blur()
      return
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      execute()
    }
  }
  const selectAutoMode = () => {
    if (!autoIntent) {
      abandon()
      preferMode('auto')
      closeParameter()
    }
    promptInput.current?.focus()
  }
  const selectSmartMode = () => {
    abandon()
    setOpenParameter(null)
    preferMode('smart')
    promptInput.current?.focus()
  }
  const selectImageMode = (nextMode: 'edit' | 'generate') => {
    abandon()
    setOpenParameter(null)
    preferMode(nextMode)
    dispatch({ type: 'set-composer-mode', mode: nextMode })
    promptInput.current?.focus()
  }
  useEffect(() => {
    const editSelection = () => {
        abandon()
      setOpenParameter(null)
      setManualMode('edit')
      dispatch({type:'set-composer-mode',mode:'edit'})
      dispatch({type:'set-composer-minimized',minimized:false})
      promptInput.current?.focus()
    }
    window.addEventListener(EDIT_SELECTION_EVENT,editSelection)
    return () => window.removeEventListener(EDIT_SELECTION_EVENT,editSelection)
  }, [abandon,dispatch,setManualMode])
  const minimize = () => {
    abandon()
    setOpenParameter(null)
    dispatch({ type: 'set-composer-minimized', minimized: true })
  }
  const chooseParameter = (parameter: ComposerParameter, value: string) => {
    dispatch({ type: 'set-composer-parameter', parameter, value })
    setOpenParameter(null)
  }
  const addReferenceFile = async (file?: File) => {
    if (!file) return
    abandon()
    await addImage(file)
  }
  const addReference = (event: React.ChangeEvent<HTMLInputElement>) => { const file = event.target.files?.[0]; event.target.value = ''; addReferenceFile(file) }
  const handlePromptPaste = (event: React.ClipboardEvent<HTMLElement>) => {
    const file = clipboardImage(event.clipboardData)
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void addReferenceFile(file)
  }
  const mode = manualMode === 'edit' || manualMode === 'generate' ? manualMode : state.composerMode
  const visibleMode = autoIntent ? 'auto' : sentenceEdit ? 'smart' : mode
  const smartMode = autoIntent || sentenceEdit
  const activeParameterName = openParameter && openParameter !== 'assistant' ? state.composerParameters[openParameter] : ''
  const parameterNames: Record<ComposerParameter | 'assistant', string> = { assistant: '推理模型', model: '模型', size: '比例与分辨率', ratio: '比例', count: '数量', strength: '变化强度' }
  const imageParameters: PopoverParameter[] = ['model', 'size', 'count', ...(mode === 'edit' && selectedModel?.supportsStrength ? ['strength' as const] : [])]
  const parameters: PopoverParameter[] = autoIntent ? ['assistant', ...imageParameters] : smartMode ? ['assistant'] : imageParameters
  const executing = understanding || planning || state.isGenerating || run?.status === 'running'
  const stopCurrentTask = () => {
    if(understanding){setIntentCancel(value=>value+1);return}
    if (planning) { active.current?.abort(); active.current=null; setPlanning(false); setRun({...createRunState('cancelled',[]),status:'cancelled'}) }
    else if (run?.status === 'running') cancelRun()
    else cancelGeneration()
  }
  const sendDisabledReason = executing ? '' : readingImage ? '正在读取图片，请稍候' : !smartMode && !sourceUsable ? '请先登录云端，或配置可用的 API 模型' : !smartMode && !maskSupported ? '此模型未声明蒙版编辑能力，请选择支持的模型' : ''
  const sendControl = <span className="composer-send-control" tabIndex={sendDisabledReason ? 0 : undefined} aria-describedby={sendDisabledReason ? sendHintId : undefined} data-disabled-reason={sendDisabledReason || undefined} data-busy={executing}>
    <button type="button" className={`execute-button${executing ? ' execute-button--stop' : ''}`} aria-label={executing ? '停止当前任务' : '执行 AI 操作'} title={executing ? '停止当前任务' : undefined} aria-describedby={sendDisabledReason ? sendHintId : undefined} onClick={executing ? stopCurrentTask : ()=>void execute()} disabled={!!sendDisabledReason}>{executing ? <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="1.5" fill="currentColor" /></svg> : '➜'}</button>
    {sendDisabledReason ? <span id={sendHintId} className="sr-only">{sendDisabledReason}</span> : null}
  </span>
  const imageButton = <button type="button" className="composer-image-button" aria-label="添加图片" title="上传图片文件（也可粘贴）" onClick={() => referenceInput.current?.click()}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-9"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 3-3 5 5M19 2v6M16 5h6"/></svg><span>上传图片</span></button>
  const manualToolNames = Object.entries(aiManualToolCoverage).filter(([, tool]) => tool.kind !== 'unsupported').map(([name]) => name).join(',')

  return <section ref={composerDrag.ref} onPaste={handlePromptPaste} style={composerDrag.style} className={`ai-composer ${state.composerMinimized ? 'is-minimized' : ''}${autoIntent ? ' is-auto-intent' : ''}`} data-dragging={composerDrag.dragging} data-placement={state.composerPlacement} aria-label="AI 操作" role="region" data-ai-manual-tools={manualToolNames}>
    {!state.composerMinimized ? <div className="composer-bar" {...composerDrag.handlers} title={state.composerPlacement === 'floating' ? '拖动以移动 AI 对话框，靠近底部自动吸附' : undefined}><div className="composer-bar-title composer-mode-tabs" role="tablist" aria-label="AI 快捷操作"><button type="button" className={mode === 'generate' && !sentenceEdit && !autoIntent ? 'is-active' : ''} aria-pressed={mode === 'generate' && !sentenceEdit && !autoIntent} aria-label="生成图片" onClick={() => selectImageMode('generate')}>生成图片</button><button type="button" className={mode === 'edit' && !sentenceEdit && !autoIntent ? 'is-active' : ''} aria-pressed={mode === 'edit' && !sentenceEdit && !autoIntent} aria-label="修改图片" onClick={() => selectImageMode('edit')}>修改图片</button><button type="button" className={sentenceEdit && !autoIntent ? 'is-active' : ''} aria-pressed={sentenceEdit && !autoIntent} aria-label="编辑画布" title="对齐图层、移动文字和调整图层属性" onClick={selectSmartMode}>编辑画布</button><button type="button" className={autoIntent ? 'is-active' : ''} aria-pressed={autoIntent} aria-label="自动理解" title="自动理解要求，确认后执行" onClick={selectAutoMode}>自动理解</button></div>
      <select className="composer-compact-control" aria-label="AI 操作模式" value={visibleMode} onChange={event => {
        const next = event.currentTarget.value
        if (next === 'auto') selectAutoMode()
        else if (next === 'smart') selectSmartMode()
        else if (next === 'generate' || next === 'edit') selectImageMode(next)
      }}>
        <option value="generate">生成图片</option><option value="edit">修改图片</option>
        <option value="smart">编辑画布</option><option value="auto">自动理解</option>
      </select>
      <div className="composer-layout-actions"><button type="button" className="composer-guide-button" title="模型与参数指南" aria-label="查看模型与参数指南" aria-haspopup="dialog" onClick={() => setGuideOpen(true)}>模型指南</button><button className="composer-control" aria-label={state.composerPlacement === 'floating' ? '移到右侧' : '悬浮到画布底部'} onClick={() => dispatch({ type: 'set-composer-placement', placement: state.composerPlacement === 'floating' ? 'right' : 'floating' })}>{state.composerPlacement === 'floating' ? '↗' : '↙'}</button><button className="composer-control" aria-label={state.composerMinimized ? '展开 AI 对话框' : '最小化 AI 对话框'} onClick={() => state.composerMinimized ? dispatch({ type: 'set-composer-minimized', minimized: false }) : minimize()}>{state.composerMinimized ? '＋' : '−'}</button></div></div> : null}
    <ComposerHistory activeSmartId={smartPrompt?.id}>
      {smartPrompt && (planning || plan || candidate || run) ? <article className="composer-history-task" aria-label="智能操作记录"><header><strong>编辑画布</strong></header><p className="composer-history-prompt">{smartPrompt.prompt}</p>
    {planning?<div role="status">正在请求模型规划…<button type="button" onClick={abandon}>取消模型规划</button></div>:null}
    {plan ? <section aria-label="编辑计划预览"><strong>更改内容</strong><p>{plan.explanation}</p><ol>{plan.steps.map(step => <li key={step.id}>{({ move: '移动', scale: '缩放', rotate: '旋转', flip: '翻转', opacity: '调整不透明度', visibility: '调整可见性', blend: '调整混合模式', rename: '重命名', duplicate: '复制', delete: '删除', lock: '调整锁定', reorder: '调整顺序', group: '分组', align: '对齐', distribute: '等距分布', filter: '智能滤镜', adjustment: '调整颜色与效果' })[step.tool]} · {state.layers.filter(layer => layer.id === step.args.layerId || (Array.isArray(step.args.layerIds) && step.args.layerIds.includes(layer.id))).map(layer => layer.name).join('、')}{step.tool === 'move' ? `（水平 ${step.args.dx}、垂直 ${step.args.dy} 像素）` : step.tool === 'rotate' ? `（${step.args.degrees} 度）` : null}</li>)}</ol>{[...plan.clarifications, ...plan.warnings].map(message => <p key={message} role="alert">{message}</p>)}<button type="button" disabled={!plan.steps.length || !!plan.clarifications.length || !!plan.warnings.length} onClick={confirmPlan}>确认执行计划</button><button type="button" onClick={abandon}>取消计划</button></section> : null}
    {candidate ? <EditPreview candidate={candidate} stale={!previewCanCommit(candidate, state, documentId)} onTune={(stepId, key, value) => { try { setCandidate(rebuildEditPreview(candidate, stepId, key, value)) } catch (error) { setRun(current => ({ ...(current ?? createRunState(candidate.id, candidate.steps)), status: 'failed', error: error instanceof Error ? error.message : '参数无效' })) } }} onAdopt={adoptPreview} onDiscard={abandon}/> : null}
    {(run || smartMode && (state.conversationRuns ?? []).some(item => item.documentId === documentId)) ? <EditRunSummary state={run} runs={(state.conversationRuns ?? []).filter(item => item.documentId === documentId)} onCancel={cancelRun} onUndo={undoLastRun}/> : null}
      </article> : !smartPrompt && smartMode && (state.conversationRuns??[]).some(item=>item.documentId===documentId) ? <article className="composer-history-task" aria-label="已采用的智能操作"><EditRunSummary state={null} runs={(state.conversationRuns??[]).filter(item=>item.documentId===documentId)} onUndo={undoLastRun}/></article> : null}
    </ComposerHistory>
    <AutoIntentTrial enabled={autoIntent} trigger={intentTrigger} cancelTrigger={intentCancel} upload={reference} readingImage={readingImage} onBusy={setUnderstanding} onApply={applyIntent} model={assistant} minimized={state.composerMinimized}/>
    <input ref={referenceInput} className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label="选择图片" onChange={addReference} />
    {reference ? <div className="composer-attachments"><div className="composer-attachment" title={reference.name}><img src={reference.source} alt={`已添加图片 ${reference.name}`} /><span className="composer-attachment-role">{!smartMode && mode==='edit' && editTarget==='upload' ? '修改原图' : '参考图'}</span><button type="button" aria-label="移除图片" onClick={() => { abandon(); removeImage() }}>×</button></div></div> : null}
    {mode==='edit'&&!smartMode&&!state.composerMinimized?<ImageEditTargetControl value={editTarget} onChange={setEditTarget} uploadedImage={reference?.source}/>:null}
    <div className="composer-input-row">
      {state.composerMinimized ? imageButton : null}
      <textarea ref={promptInput} onFocus={() => { if (state.composerMinimized) dispatch({ type: 'set-composer-minimized', minimized: false }); promptTransaction.onEditStart() }} onBlur={promptTransaction.onEditEnd} onKeyDown={handlePromptKeyDown} aria-label="AI 操作" placeholder="输入你的要求" value={state.prompt} onChange={(event) => { abandon(); resizePrompt(event.currentTarget); dispatch({ type: 'set-prompt', prompt: event.target.value }) }} />
      {state.composerMinimized ? sendControl : null}
    </div>
    {!state.composerMinimized ? <>
      <div className="composer-footer"><div className="composer-tools">{imageButton}{parameters.map(parameter => {
        const modelParameter = parameter === 'model' || parameter === 'assistant'
        const label = parameter === 'assistant' ? assistantModel.label : state.composerParameters.model
        const summary = parameter === 'assistant' ? assistantModel.source?.summary : source?.summary
        return <button key={parameter} className={`parameter-chip${modelParameter ? ' parameter-chip--model' : ''}`} aria-label={`选择${parameterNames[parameter]}`} title={modelParameter ? `${parameterNames[parameter]}：${label} · ${summary ?? '来源不可用'}` : parameter === 'strength' ? '演示参数，并非所有模型支持，详见模型指南' : undefined} aria-haspopup="dialog" aria-expanded={openParameter === parameter} aria-controls={parameter === 'size' ? 'output-format-popover' : undefined} onClick={event => { setParameterAnchor(event.currentTarget); setOpenParameter(value => value === parameter ? null : parameter) }}>
          {modelParameter ? <span><strong>{autoIntent ? `${parameter === 'assistant' ? '推理' : '图片'} · ` : ''}{label}</strong></span> : <>{parameter === 'size' && sizeByService ? '尺寸由服务决定' : parameter === 'size' ? outputFormatLabel(state.composerParameters.ratio, state.composerParameters.size) : state.composerParameters[parameter]}</>}
        </button>
      })}
      <select className="composer-compact-control" aria-label="AI 参数" value="" onChange={event => {
        const parameter = event.currentTarget.value as PopoverParameter
        if (!parameters.includes(parameter)) return
        setParameterAnchor(event.currentTarget)
        setOpenParameter(parameter)
      }}>
        <option value="" disabled>参数</option>
        {parameters.map(parameter => <option key={parameter} value={parameter}>
          {parameter === 'model' ? '图片模型' : parameterNames[parameter]}
        </option>)}
      </select></div><div className="composer-submit">{!smartMode && source?.billingMode === 'provider' ? <span className="composer-cost" title={source.billingLabel}>供应商计费</span> : null}{sendControl}</div></div>
      {openParameter && parameterAnchor ? <ComposerPopover anchor={parameterAnchor} width={openParameter === 'size' ? 340 : openParameter === 'model' || openParameter === 'assistant' ? 360 : 160} preferBelow={state.composerPlacement === 'right'} onClose={closeParameter}>{openParameter === 'size' ? <OutputFormatPicker ratio={state.composerParameters.ratio} size={state.composerParameters.size} onClose={() => setOpenParameter(null)} onChoose={(ratio, size) => { dispatch({ type: 'set-output-format', ratio, size }); setOpenParameter(null) }} /> : openParameter === 'assistant' ? <ModelSourcePicker compact kind="text" onClose={closeParameter} sourceId={assistant?.sourceId ?? ''} modelCode={assistant?.model ?? ''} onSourceChange={chooseAssistant} onModelChange={model => assistant && chooseAssistant(assistant.sourceId, model)} /> : openParameter === 'model' ? <ModelSourcePicker compact onClose={closeParameter} sourceId={state.composerSourceId} modelCode={selectedModel?.code ?? ''} onSourceChange={(sourceId, nextModelCode) => { dispatch({ type: 'set-composer-source', sourceId }); dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(sourceId).find(model => model.code === nextModelCode)?.displayName ?? '' }) }} onModelChange={nextModelCode => dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(state.composerSourceId).find(model => model.code === nextModelCode)?.displayName ?? state.composerParameters.model })} /> : openParameter ? <div className="parameter-popover" role="dialog" aria-label="其他参数"><DialogTitlebar title={`调整${parameterNames[openParameter]}`} onClose={closeParameter} />{parameterOptions[openParameter as Exclude<PopoverParameter, 'size' | 'assistant'>].map((option) => <button key={option} className={option === activeParameterName ? 'selected' : ''} onClick={() => chooseParameter(openParameter, option)}>{option}</button>)}</div> : null}</ComposerPopover> : null}
    </> : null}
    {imageError ? <p className="composer-image-error" role="alert">{imageError}</p> : null}
    {guideOpen ? <ModelGuide onClose={closeGuide} /> : null}
  </section>
}
