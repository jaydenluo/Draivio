import { officialModel } from '../account/cloudModels'
import { PortraitRecipeWorkspace } from '../ai/recipes/PortraitRecipeWorkspace'
import { PosterRecipeWorkspace } from '../ai/recipes/PosterRecipeWorkspace'
import { requestRemotePlan,type PlanningReference } from '../ai/planning/remotePlanner'
import { assistantModels,selectedAssistant } from '../ai/providers/modelCapabilities'
import { RecipeBatchWorkspace } from '../ai/batch/RecipeBatchWorkspace'
import { ProductRecipeWorkspace } from '../ai/recipes/ProductRecipeWorkspace'
import { DoubleExposureWorkspace } from '../ai/recipes/DoubleExposureWorkspace'
import { OcrWorkspace } from '../ai/vision/OcrWorkspace'
import { RecipeWorkspace } from '../ai/recipes/RecipeWorkspace'
import { RelightWorkspace } from '../ai/workflows/RelightWorkspace'
import { planConversation,recordConversationRun,undoConversationRun } from '../ai/conversation/session'
import { imageSupportsMaskedEdit } from './imageEditCapabilities'
import { type PlannerPlan } from '../ai/planning/planner'
import { PlanExecutor } from '../ai/execution/executor'
import { createEditPreview, executePreviewStep, previewCanCommit, rebuildEditPreview, type EditPreviewCandidate } from '../ai/execution/preview'
import { createRunState, type RunState } from '../ai/execution/runState'
import { EditPreview } from '../ai/ui/EditPreview'
import { EditRunSummary } from '../ai/ui/EditRunSummary'
import { GenerationProgress, useImageGeneration } from './ImageGeneration'
import { getRuntimeConnections } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { ComposerPopover } from './ComposerPopover'
import { generationCounts } from './composerPreferences'
import { useComposerDrag } from './useComposerDrag'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ModelGuide } from './ModelGuide'
import { OutputFormatPicker } from './OutputFormatPicker'
import { outputFormatLabel } from './outputFormats'
import { useEditor, type ComposerParameter } from '../state/editor'
import { ModelSourcePicker } from './ModelSourcePicker'
import { getModelsForSource, getSourceById, isSourceUsable, useServiceSources } from './modelSources'
import { aiManualToolCoverage } from '../ai/tools/toolCoverage'

type PopoverParameter = Exclude<ComposerParameter, 'ratio'>
const PROMPT_MIN_HEIGHT = 26

const parameterOptions: Record<Exclude<PopoverParameter, 'size'>, string[]> = {
  model: ['Image Pro', 'Image Fast', 'Image Detail'],
  count: generationCounts,
  strength: ['强度 48%', '强度 72%', '强度 24%'],
}

export function AIComposer() {
  const { state, dispatch, documentId } = useEditor()
  const composerDrag = useComposerDrag(state.composerPlacement === 'floating')
  const promptTransaction = { onEditStart: () => undefined, onEditEnd: () => undefined, onEditCancel: () => undefined }
  useServiceSources()
  const { start } = useImageGeneration()
  const connection = getRuntimeConnections().find(item => item.id === state.composerSourceId)
  const sizeByService = connection && !resolveGenerationOptions(connection, state.composerParameters.model).sendSize
  const source = getSourceById(state.composerSourceId)
  const sourceUsable = isSourceUsable(state.composerSourceId, state.composerParameters.model)
  const selectedModel = getModelsForSource(state.composerSourceId).find((model) => model.displayName === state.composerParameters.model)
  const maskSupported = state.composerMode !== 'edit' || !!connection && imageSupportsMaskedEdit(connection, selectedModel?.code ?? '')
  const supportsStrength = selectedModel?.supportsStrength === true
  const [openParameter, setOpenParameter] = useState<PopoverParameter | null>(null)
  const [parameterAnchor, setParameterAnchor] = useState<HTMLElement | null>(null)
  const closeParameter = useCallback(() => setOpenParameter(null), [])
  const [guideOpen, setGuideOpen] = useState(false)
  const closeGuide = useCallback(() => setGuideOpen(false), [])
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
    const height = Math.min(Math.max(input.scrollHeight, PROMPT_MIN_HEIGHT), 220)
    input.style.height = `${height}px`
    input.style.overflowY = input.scrollHeight > 220 ? 'auto' : 'hidden'
  }, [state.composerMinimized])
  useLayoutEffect(() => { resizePrompt() }, [resizePrompt, state.prompt])
  const [sentenceEdit, setSentenceEdit] = useState(false)
  const [scope, setScope] = useState('selected')
  const [planningMode,setPlanningMode] = useState('local')
  const [assistantKey,setAssistantKey] = useState('')
  const [reference,setReference] = useState<PlanningReference|null>(null)
  const [planning,setPlanning] = useState(false)
  const referenceEpoch=useRef(0)
  const assistants=assistantModels(getRuntimeConnections())
  const assistant=assistants.find(m=>`${m.sourceId}:${m.model}`===assistantKey)??selectedAssistant(getRuntimeConnections())??assistants[0]
  const [plan, setPlan] = useState<PlannerPlan | null>(null)
  const [candidate, setCandidate] = useState<EditPreviewCandidate | null>(null)
  const [run, setRun] = useState<RunState | null>(null)
  const plannedBase = useRef<{ state: typeof state; documentId: string } | null>(null)
  const active = useRef<AbortController | null>(null)
  const latest = useRef({ state, documentId })
  latest.current = { state, documentId }
  const abandon = useCallback(() => {
    active.current?.abort()
    active.current = null
    setPlanning(false)
    setPlan(null)
    setCandidate(null)
    setRun(null)
  }, [])
  useEffect(() => { abandon(); referenceEpoch.current++; setReference(null); return () => { active.current?.abort(); referenceEpoch.current++ } }, [documentId, state.composerMode, state.composerMinimized, abandon])
  const execute = async () => {
    if (!sentenceEdit) { start(); return }
    if (active.current) return
    setCandidate(null)
    setRun(null)
    if (/^\s*(?:撤销刚才|撤销上次|撤销本次编辑)[。！!]?\s*$/.test(state.prompt)) { undoLastRun(); return }
    const scopeIds = scope === 'document' ? state.layers.map(layer => layer.id) : state.selectedLayerIds?.length ? state.selectedLayerIds : [state.selectedLayerId]
    plannedBase.current = { state, documentId }
    if(planningMode==='local') { setPlan(planConversation(state, documentId, state.prompt, scopeIds)); return }
    const provider=assistant&&getRuntimeConnections().find(c=>c.id===assistant.sourceId)
    if(!provider||!assistant){setRun({...createRunState('model-unavailable',[]),status:'blocked',error:'请在服务设置中配置文本推理模型与密钥'});return}
    if(!window.confirm(`将文档图层信息${reference?'和所选参考图':''}发送到「${provider.name}」的 ${assistant.model} 进行规划，可能由供应商计费。是否继续？`))return
    const controller=new AbortController();active.current=controller;setPlanning(true)
    const base=state,id=documentId
    try{
      const result=await requestRemotePlan(provider,assistant.model,base,id,state.prompt,scopeIds,{signal:controller.signal,reference:reference??undefined})
      if(active.current!==controller||controller.signal.aborted)return
      if(latest.current.documentId!==id||latest.current.state!==base)throw new Error('文档已更改，请重新进行模型规划')
      const current=getRuntimeConnections().find(c=>c.id===provider.id)
      if(!current||!current.enabled||current.baseUrl!==provider.baseUrl||current.apiKey!==provider.apiKey||current.protocol!==provider.protocol||!current.models.includes(assistant.model))throw new Error('模型配置已更改，请重新规划')
      setPlan(result)
    }catch(error){if(active.current===controller&&!controller.signal.aborted)setRun({...createRunState('model-plan-failed',[]),status:'failed',error:error instanceof Error?error.message:'模型规划失败'})}
    finally{if(active.current===controller){active.current=null;setPlanning(false)}}
  }
  const confirmPlan = async () => {
    if (!plan || active.current || !plan.steps.length || plan.clarifications.length || plan.warnings.length) return
    if (plannedBase.current?.state !== state || plannedBase.current.documentId !== documentId) { setPlan(null); setRun({ ...createRunState('stale-plan', []), status: 'blocked', error: '文档已更改，请重新预览计划' }); return }
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
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && (!sentenceEdit || event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      execute()
    }
  }
  const toggleMode = () => {
    abandon()
    setSentenceEdit(false)
    setOpenParameter(null)
    dispatch({ type: 'set-composer-mode', mode: state.composerMode === 'edit' ? 'generate' : 'edit' })
  }
  const minimize = () => {
    abandon()
    setOpenParameter(null)
    dispatch({ type: 'set-composer-minimized', minimized: true })
  }
  const chooseParameter = (parameter: ComposerParameter, value: string) => {
    dispatch({ type: 'set-composer-parameter', parameter, value })
    setOpenParameter(null)
  }
  const addReference = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    abandon();const ticket=++referenceEpoch.current;setReference(null)
    if(!file)return
    if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>8*1024*1024){setRun({...createRunState('reference-invalid',[]),status:'blocked',error:'参考图仅支持8MB内PNG、JPEG或WebP'});return}
    const reader=new FileReader()
    reader.onload=()=>{if(referenceEpoch.current===ticket)setReference({source:String(reader.result),name:file.name})}
    reader.onerror=()=>{if(referenceEpoch.current===ticket)setRun({...createRunState('reference-failed',[]),status:'failed',error:'参考图读取失败'})}
    reader.readAsDataURL(file)
  }
  const mode = state.composerMode
  const activeParameterName = openParameter ? state.composerParameters[openParameter] : ''
  const parameterNames: Record<ComposerParameter, string> = { model: '模型', size: '比例与分辨率', ratio: '比例', count: '数量', strength: '变化强度' }
  const parameters = (['model', 'size', 'count', ...(mode === 'edit' && supportsStrength ? ['strength'] : [])] as PopoverParameter[])
  const manualToolNames = Object.entries(aiManualToolCoverage).filter(([, tool]) => tool.kind !== 'unsupported').map(([name]) => name).join(',')

  return <section ref={composerDrag.ref} style={composerDrag.style} className={`ai-composer ${state.composerMinimized ? 'is-minimized' : ''}`} data-dragging={composerDrag.dragging} data-placement={state.composerPlacement} aria-label="AI 操作" role="region" data-ai-manual-tools={manualToolNames}>
    {!state.composerMinimized ? <div className="composer-bar" {...composerDrag.handlers} title={state.composerPlacement === 'floating' ? '拖动以移动 AI 对话框，靠近底部自动吸附' : undefined}><div className="composer-bar-title"><button type="button" aria-pressed={sentenceEdit} onClick={() => { abandon(); setSentenceEdit(value => !value); promptInput.current?.focus() }}>一句话编辑</button><button className="mode-button" aria-label={mode === 'edit' ? '切换到生成新内容' : '切换到修改当前图'} onClick={toggleMode}><span className="mode-dot" />{mode === 'edit' ? '修改' : '生成新内容'}</button></div><div className="composer-layout-actions"><button type="button" className="composer-guide-button" title="模型与参数指南" aria-label="查看模型与参数指南" aria-haspopup="dialog" onClick={() => { setOpenParameter(null); setGuideOpen(true) }}>模型指南</button><button className="composer-control" aria-label={state.composerPlacement === 'floating' ? '移到右侧' : '悬浮到画布底部'} onClick={() => dispatch({ type: 'set-composer-placement', placement: state.composerPlacement === 'floating' ? 'right' : 'floating' })}>{state.composerPlacement === 'floating' ? '↗' : '↙'}</button><button className="composer-control" aria-label={state.composerMinimized ? '展开 AI 对话框' : '最小化 AI 对话框'} onClick={() => state.composerMinimized ? dispatch({ type: 'set-composer-minimized', minimized: false }) : minimize()}>{state.composerMinimized ? '＋' : '−'}</button></div></div> : null}
    <div className="composer-input-row">
      <textarea ref={promptInput} onFocus={() => { if (state.composerMinimized) dispatch({ type: 'set-composer-minimized', minimized: false }); promptTransaction.onEditStart() }} onBlur={promptTransaction.onEditEnd} onKeyDown={handlePromptKeyDown} aria-label="AI 操作" placeholder={mode === 'edit' ? '描述你想修改的内容' : '描述你想要的画面'} value={state.prompt} onChange={(event) => { abandon(); resizePrompt(event.currentTarget); dispatch({ type: 'set-prompt', prompt: event.target.value }) }} />
      {state.composerMinimized ? <button className="execute-button" aria-label={state.isGenerating ? '执行中…' : '执行 AI 操作'} onClick={execute} disabled={planning || state.isGenerating || (!sentenceEdit && (!sourceUsable || !maskSupported))}>{planning ? '规划中…' : state.isGenerating ? '执行中…' : '➜'}</button> : null}
    </div>
    {!state.composerMinimized ? <>
      <div aria-label="AI 作用范围">{state.composerMode === 'edit' && !sentenceEdit ? <small>{state.selectionVisible ? '作用范围：当前选区（保留选区外像素）' : '作用范围：整个画布'} · 空提示移除，有提示替换{!maskSupported ? ' · 此模型未声明蒙版编辑能力，请选择支持的模型' : ''}</small> : null}</div><div className="composer-footer"><div className="composer-tools"><button className="composer-icon" disabled={!sentenceEdit||planningMode!=='model'} title={!sentenceEdit||planningMode!=='model' ? '请在一句话编辑中选择模型推理，以显式上传参考图' : undefined} aria-label="添加参考图" onClick={() => referenceInput.current?.click()}>＋</button><input ref={referenceInput} className="sr-only" type="file" accept="image/*" aria-label="选择参考图" onChange={addReference} />{parameters.map((parameter) => <button key={parameter} className={`parameter-chip${parameter === 'model' ? ' parameter-chip--model' : ''}`}  aria-label={`选择${parameterNames[parameter]}`} title={parameter === 'model' ? `${state.composerParameters.model} · ${source?.summary ?? '来源不可用'}` : parameter === 'strength' ? '演示参数，并非所有模型支持，详见模型指南' : undefined} aria-haspopup="dialog" aria-expanded={openParameter === parameter} aria-controls={parameter === 'size' ? 'output-format-popover' : undefined} onClick={(event) => { setParameterAnchor(event.currentTarget); setOpenParameter((value) => value === parameter ? null : parameter) }}>{parameter === 'model' ? <span><strong>{state.composerParameters.model}</strong></span> : <>{parameter === 'size' && sizeByService ? '尺寸由服务决定' : parameter === 'size' ? outputFormatLabel(state.composerParameters.ratio, state.composerParameters.size) : state.composerParameters[parameter]}</>}</button>)}</div><div className="composer-submit">{source?.billingMode === 'provider' ? <span className="composer-cost" title={source.billingLabel}>供应商计费</span> : null}<button className="execute-button" aria-label={state.isGenerating ? '执行中…' : '执行 AI 操作'} onClick={execute} disabled={planning || state.isGenerating || (!sentenceEdit && (!sourceUsable || !maskSupported))}>{planning ? '规划中…' : state.isGenerating ? '执行中…' : '➜'}</button></div></div>
      {openParameter && parameterAnchor ? <ComposerPopover anchor={parameterAnchor} width={openParameter === 'size' ? 340 : openParameter === 'model' ? 360 : 160} preferBelow={state.composerPlacement === 'right'} onClose={closeParameter}>{String(openParameter) === 'size' ? <OutputFormatPicker ratio={state.composerParameters.ratio} size={state.composerParameters.size} onClose={() => setOpenParameter(null)} onChoose={(ratio, size) => { dispatch({ type: 'set-output-format', ratio, size }); setOpenParameter(null) }} /> : String(openParameter) === 'model' ? <ModelSourcePicker compact onClose={closeParameter} sourceId={state.composerSourceId} modelCode={selectedModel?.code ?? ''} onSourceChange={(sourceId, nextModelCode) => { dispatch({ type: 'set-composer-source', sourceId }); dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(sourceId).find(model => model.code === nextModelCode)?.displayName ?? '' }) }} onModelChange={nextModelCode => dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(state.composerSourceId).find(model => model.code === nextModelCode)?.displayName ?? state.composerParameters.model })} /> : openParameter ? <div className="parameter-popover" role="dialog" aria-label="其他参数"><strong>{`调整${parameterNames[openParameter]}`}</strong>{parameterOptions[openParameter as Exclude<PopoverParameter, 'size'>].map((option) => <button key={option} className={option === activeParameterName ? 'selected' : ''} onClick={() => chooseParameter(openParameter, option)}>{option}</button>)}</div> : null}</ComposerPopover> : null}
    </> : null}
    {sentenceEdit && !state.composerMinimized ? <div className="sentence-edit-controls"><label>规划方式<select aria-label="规划方式" value={planningMode} onChange={e=>{abandon();setPlanningMode(e.target.value)}}><option value="local">离线规则（不调用模型）</option><option value="model">模型推理（发送文档上下文）</option></select></label>{planningMode==='model'?<label>推理模型<select aria-label="推理模型" value={assistant?`${assistant.sourceId}:${assistant.model}`:''} onChange={e=>{abandon();setAssistantKey(e.target.value)}}>{!assistants.length?<option value="">请先配置推理模型</option>:null}{assistants.map(m=><option key={`${m.sourceId}:${m.model}`} value={`${m.sourceId}:${m.model}`}>{m.label}{m.vision?' · 视觉':''}</option>)}</select></label>:null}<label>编辑范围<select aria-label="一句话编辑范围" value={scope} onChange={event => { abandon(); setScope(event.target.value) }}><option value="selected">选中图层</option><option value="document">整个文档</option></select></label><small>局部像素选区不会限制图层变换；Ctrl / ⌘ Enter 预览计划</small></div> : null}
    {reference&&sentenceEdit?<div><small>参考图：{reference.name} · 仅用于模型规划，按确认上传</small><button type="button" onClick={()=>{abandon();referenceEpoch.current++;setReference(null)}}>移除参考图</button></div>:null}
    {planning?<div role="status">正在请求模型规划…<button type="button" onClick={abandon}>取消模型规划</button></div>:null}
    {plan ? <section aria-label="编辑计划预览"><strong>更改内容</strong><p>{plan.explanation}</p><ol>{plan.steps.map(step => <li key={step.id}>{({ move: '移动', scale: '缩放', rotate: '旋转', flip: '翻转', opacity: '调整不透明度', visibility: '调整可见性', blend: '调整混合模式', rename: '重命名', duplicate: '复制', delete: '删除', lock: '调整锁定', reorder: '调整顺序', group: '分组', align: '对齐', distribute: '等距分布', filter: '智能滤镜', adjustment: '调整颜色与效果' })[step.tool]} · {state.layers.filter(layer => layer.id === step.args.layerId || (Array.isArray(step.args.layerIds) && step.args.layerIds.includes(layer.id))).map(layer => layer.name).join('、')}{step.tool === 'move' ? `（水平 ${step.args.dx}、垂直 ${step.args.dy} 像素）` : step.tool === 'rotate' ? `（${step.args.degrees} 度）` : null}</li>)}</ol>{[...plan.clarifications, ...plan.warnings].map(message => <p key={message} role="alert">{message}</p>)}<button type="button" disabled={!plan.steps.length || !!plan.clarifications.length || !!plan.warnings.length} onClick={confirmPlan}>确认执行计划</button><button type="button" onClick={abandon}>取消计划</button></section> : null}
    {candidate ? <EditPreview candidate={candidate} stale={!previewCanCommit(candidate, state, documentId)} onTune={(stepId, key, value) => { try { setCandidate(rebuildEditPreview(candidate, stepId, key, value)) } catch (error) { setRun(current => ({ ...(current ?? createRunState(candidate.id, candidate.steps)), status: 'failed', error: error instanceof Error ? error.message : '参数无效' })) } }} onAdopt={adoptPreview} onDiscard={abandon}/> : null}
    {sentenceEdit ? <EditRunSummary state={run} runs={(state.conversationRuns ?? []).filter(item => item.documentId === documentId)} onCancel={cancelRun} onUndo={undoLastRun}/> : null}
    {!state.composerMinimized ? <><RecipeWorkspace /><PosterRecipeWorkspace /><PortraitRecipeWorkspace /><RecipeBatchWorkspace /><ProductRecipeWorkspace /><DoubleExposureWorkspace /><RelightWorkspace /><OcrWorkspace /></> : null}
    <GenerationProgress />
    {guideOpen ? <ModelGuide onClose={closeGuide} /> : null}
  </section>
}
