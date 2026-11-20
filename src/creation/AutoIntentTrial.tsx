import { useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/editor'
import { contentRevision } from '../ai/context/editorContext'
import { understandIntent, type SemanticIntent } from '../ai/planning/semanticIntent'
import type { ComposerImage } from './composerImage'
import { getRuntimeConnections } from './modelSources'
import { prepareChatImageTask } from './chatImageParameters'
import { getModelsForSource } from './modelSources'
import { resolveImageEditTarget } from './imageEditTarget'
import { EditRangeHighlight, editTargetLabel } from './ImageEditTargetControl'
import { inferAIIntent } from '../ai/planning/intentRouter'
import { assistantModels, type AssistantSelection } from '../ai/providers/modelCapabilities'

type Props = {
  enabled: boolean
  trigger: number
  cancelTrigger: number
  upload: ComposerImage | null
  readingImage: boolean
  onBusy: (busy: boolean) => void
  onApply: (intent: SemanticIntent) => void
  model: AssistantSelection | undefined
  minimized: boolean
}

const intentConnections = () => getRuntimeConnections().filter(c => assistantModels([c]).length && ['openai_compatible', 'volcengine'].includes(c.protocol))
const connectionSignature = () => JSON.stringify(intentConnections().map(c => [c.id, c.apiKey, c.baseUrl, c.protocol, c.models, c.modelCapabilities]))
const imageConnectionSignature = () => JSON.stringify(getRuntimeConnections().map(c=>[c.id,c.enabled,c.models,c.baseUrl,c.protocol,c.apiKey,c.generation,c.modelGeneration,c.imageCapabilities,c.modelCapabilities]))

export function AutoIntentTrial({ enabled, trigger, cancelTrigger, upload, readingImage, onBusy, onApply, model, minimized }: Props) {
  const { state, documentId } = useEditor()
  const connections = intentConnections()
  const selection = model ? JSON.stringify({ sourceId: model.sourceId, model: model.model }) : ''
  const [result, setResult] = useState<{ intent: SemanticIntent; binding: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const providerSignature = JSON.stringify(connections.map(c => [c.id, c.apiKey, c.baseUrl, c.protocol, c.models, c.modelCapabilities]))
  const imageSignature = imageConnectionSignature()
  const binding = JSON.stringify([documentId, enabled ? contentRevision(state) : '', state.prompt, state.composerSourceId, state.composerParameters, state.selectedLayerId, state.selectedLayerIds, state.selectionVisible, state.selection, upload?.source, upload?.name, readingImage, selection, enabled, providerSignature, imageSignature])
  const latest = useRef({ state, model, binding, enabled, hasUpload: !!upload })
  latest.current = { state, model, binding, enabled, hasUpload: !!upload }
  useEffect(() => {
    controller.current?.abort()
    controller.current = null
    setBusy(false)
    onBusy(false)
    setResult(null)
    setError('')
  }, [binding, cancelTrigger])
  useEffect(() => () => { controller.current?.abort(); onBusy(false) }, [])
  useEffect(() => {
    if (!latest.current.enabled || !trigger) return
    const current = latest.current
    if (!current.state.prompt.trim()) { setError('请先输入你的要求'); return }
    const chosen = current.model
    if (!chosen) {
      const inferred = inferAIIntent(current.state.prompt, current.state)
      const target = inferred.kind === 'generate' ? 'document' : inferred.kind === 'image-edit'
        ? resolveImageEditTarget(current.state, 'auto') : inferred.scopeIds.length ? 'object' : 'document'
      // Without a reasoning model, ambiguous prompts can always use the explicit modes.
      const ambiguous = inferred.confidence === 'low' || /上传|附件|参考图|再来|上一个|然后|同时|分别/.test(current.state.prompt)
      const intent: SemanticIntent = ambiguous
        ? { kind: 'clarify', target: 'auto', targetIds: [], summary: '', question: '你想生成图片、修改图片，还是编辑画布？可点击对应模式，或选择推理模型后再试。' }
        : { kind: inferred.kind, target, targetIds: target === 'object' ? inferred.scopeIds : [], summary: inferred.reason, question: '' }
      setResult({ intent, binding: current.binding })
      return
    }
    const provider = getRuntimeConnections().find(c => c.id === chosen.sourceId && assistantModels([c]).some(item => item.model === chosen.model) && ['openai_compatible', 'volcengine'].includes(c.protocol))
    if (!provider) { setError('推理模型不可用，请重新选择'); return }
    const request = new AbortController()
    controller.current = request
    setBusy(true)
    onBusy(true)
    setResult(null)
    setError('')
    void understandIntent(provider, chosen.model, current.state.prompt, {
      selectionVisible: current.state.selectionVisible,
      selectedLayerId: current.state.selectedLayerId,
      selectedLayerIds: current.state.selectedLayerIds,
      layers: current.state.layers.map(l => ({ id: l.id, name: l.name, className: l.className, locked: l.locked, visible: l.visible })),
    }, current.hasUpload, request.signal, {
      ...current.state.composerParameters, sourceId:current.state.composerSourceId,
      availableModels:getRuntimeConnections().filter(c=>c.enabled).map(c=>({sourceId:c.id,name:c.name,models:getModelsForSource(c.id).map(m=>({code:m.code,name:m.displayName}))})),
    }).then(intent => {
      if (!request.signal.aborted && latest.current.binding === current.binding) setResult({ intent, binding: current.binding })
    }).catch(reason => {
      if (!request.signal.aborted && latest.current.binding === current.binding) setError(reason instanceof Error ? reason.message : '理解失败')
    }).finally(() => {
      if (controller.current === request) { controller.current = null; setBusy(false); onBusy(false) }
    })
  }, [trigger])
  const validResult = !busy && result?.binding === binding ? result.intent : null
  let task:ReturnType<typeof prepareChatImageTask>|undefined
  let parameterError=''
  if(validResult&&(validResult.kind==='generate'||validResult.kind==='image-edit')){
    try{task=prepareChatImageTask(state,validResult.kind==='generate'?'generate':'edit',validResult.target,validResult.imageParameters??{},!!upload)}
    catch(reason){parameterError=reason instanceof Error?reason.message:'图片参数无效'}
  }
  const scopedState = validResult?.target === 'object' && validResult.targetIds.length
    ? { ...state, selectedLayerId: validResult.targetIds[0], selectedLayerIds: validResult.targetIds } : state
  const target = validResult ? resolveImageEditTarget(scopedState, validResult.target) : 'document'
  const scopeLabel = !validResult || validResult.kind === 'generate' ? '新图片'
    : target === 'object' ? editTargetLabel(scopedState, target).replace(/^修改/, '')
      : target === 'selection' ? '当前选区' : target === 'upload' ? '上传原图' : '整个画布'
  const action = validResult?.kind === 'generate' ? '生成图片' : validResult?.kind === 'image-edit' ? '修改图片' : '编辑画布'
  const [showRange, setShowRange] = useState(false)
  useEffect(() => { setShowRange(false) }, [binding, result])
  return <div className="composer-auto-intent" hidden={minimized || !enabled || !(busy || error || validResult)}>
    {busy ? <span role="status">正在理解你的要求…</span> : null}
    {error ? <p role="alert">{error}</p> : null}
    {validResult ? <div className="composer-intent-result" aria-label="意图理解结果">
      {validResult.kind === 'mixed' || validResult.kind === 'clarify' ? <p>{validResult.question}</p> : <>
        <div className="composer-intent-line">
          <strong title={validResult.summary}>{action} · {scopeLabel}</strong>
          {validResult.kind === 'image-edit' && target !== 'upload' ? <button type="button" aria-label="预览修改范围"
            aria-pressed={showRange} onClick={() => setShowRange(value => !value)}>预览范围</button> : null}
          <button type="button" disabled={!!parameterError} onClick={() => {
            if (latest.current.binding !== result?.binding) return
            if (connectionSignature() !== providerSignature || imageConnectionSignature() !== imageSignature) {
              setResult(null); setError('模型配置已更改，请重新理解'); return
            }
            onApply(validResult)
            setResult(null)
          }}>按此理解继续</button>
        </div>
        {validResult.kind === 'image-edit' ? <EditRangeHighlight target={target} enabled={showRange && !minimized}
          state={scopedState} documentId={documentId} /> : null}
        {task ? <details className="composer-intent-parameters">
          <summary>{Object.keys(task.overrides).length ? '已按指令调整本次参数' : '查看本次图片参数'}</summary>
          <p aria-label="本次图片参数">{task.parameters.model} · {task.parameters.ratio} · {task.parameters.size}
            {!task.sendSize ? '（尺寸由服务决定）' : ''} · {task.parameters.count}
            {task.overrides.strength !== undefined ? ` · ${task.parameters.strength}` : ''}
            {task.quality ? ` · 质量 ${task.quality}` : ''}</p>
        </details> : null}
        {parameterError ? <p role="alert">{parameterError}</p> : null}
      </>}
    </div> : null}
  </div>
}
