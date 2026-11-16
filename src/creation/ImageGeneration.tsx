import { createContext, useContext, useEffect, useId, useRef, useState, useSyncExternalStore, type Dispatch, type ReactNode } from 'react'
import type { AIOperation, ComposerMode, EditorAction, EditorState } from '../state/editor'
import { getConnections, getModelsForSource, isSourceUsable } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { generateOpenAIImages, ImageRequestError } from './openaiImages'
import { ImageBatch, type BatchSnapshot } from './imageBatch'
import { message, type MessageHandle } from '../ui/message'

type GenerationContextValue = { snapshot: BatchSnapshot | null; start: (mode?: ComposerMode) => void; cancel: () => void; retry: (unknown?: boolean) => void }
const GenerationContext = createContext<GenerationContextValue | null>(null)
const emptySubscribe = () => () => {}
const emptySnapshot = () => null

export function ImageGenerationProvider({ state, dispatch, children }: { state: EditorState; dispatch: Dispatch<EditorAction>; children: ReactNode }) {
  const [batch, setBatch] = useState<ImageBatch | null>(null)
  const active = useRef<ImageBatch | null>(null)
  const demoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)
  const sessionId = useRef(state.documentSessionId)
  sessionId.current = state.documentSessionId
  const documentId = useRef(state.documentId)
  documentId.current = state.documentId
  const messageKey = useId()
  const feedback = useRef<MessageHandle | null>(null)
  const snapshot = useSyncExternalStore(batch?.subscribe ?? emptySubscribe, batch?.getSnapshot ?? emptySnapshot)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.cancel(); feedback.current?.close(); if (demoTimer.current) clearTimeout(demoTimer.current) } }, [])
  useEffect(() => {
    active.current?.cancel(); active.current = null; setBatch(null)
    if (demoTimer.current) { clearTimeout(demoTimer.current); demoTimer.current = null }
    feedback.current?.close(); feedback.current = null
  }, [state.documentSessionId])
  const notice = (text: string) => { message.warning(text, { key: messageKey }) }
  const run = async (target: ImageBatch, retry = false, unknown = false) => {
    const expectedDocumentId = documentId.current
    const expectedDocumentSessionId = sessionId.current
    dispatch({ type: 'set-generating', value: true, expectedDocumentId, expectedDocumentSessionId })
    const currentFeedback = message.loading(retry ? '正在补齐图片…' : '正在生成图片…', { key: messageKey })
    feedback.current = currentFeedback
    try {
      if (retry) await target.retry(unknown); else await target.run()
      if (mounted.current && documentId.current === expectedDocumentId && sessionId.current === expectedDocumentSessionId) {
        const result = target.getSnapshot()
        const succeeded = result.items.filter(item => item.status === 'succeeded').length
        const summary = `已生成 ${succeeded}/${result.items.length} 张`
        const errors = [...new Set(result.items.flatMap(item => item.message ? [item.message] : []))].join('；')
        if (succeeded === result.items.length) currentFeedback.success(summary)
        else if (!succeeded && result.items.every(item => item.status === 'failed')) currentFeedback.error(`${summary}；${errors}`)
        else currentFeedback.warning(`${summary}；${errors || '已停止排队，可手动补齐'}`)
      }
    } catch { if (mounted.current && documentId.current === expectedDocumentId && sessionId.current === expectedDocumentSessionId) currentFeedback.error('生成任务中断，请检查供应商记录后再决定是否重试') }
    finally { if (feedback.current === currentFeedback) feedback.current = null; if (mounted.current && documentId.current === expectedDocumentId && sessionId.current === expectedDocumentSessionId) dispatch({ type: 'set-generating', value: false, expectedDocumentId, expectedDocumentSessionId }) }
  }
  const start = (mode: ComposerMode = state.composerMode) => {
    if (state.isGenerating || active.current?.getSnapshot().running || demoTimer.current) return
    if (!isSourceUsable(state.composerSourceId, state.composerParameters.model)) return notice('请先配置服务来源和模型')
    const model = getModelsForSource(state.composerSourceId).find(item => item.displayName === state.composerParameters.model)?.code ?? ''
    const expectedDocumentId = state.documentId
    const expectedDocumentSessionId = state.documentSessionId
    const batchId = `batch-${crypto.randomUUID()}`
    const source = state.layers.find(layer => layer.id === state.selectedLayerId)?.source
    const request: AIOperation = { batchId, sourceImage: source, mode, prompt: state.prompt, sourceLayerId: state.selectedLayerId,
      selection: state.selectionVisible ? structuredClone(state.selection) : null,
      parameters: { ...state.composerParameters }, sourceId: state.composerSourceId, modelCode: model }
    if (state.composerSourceId === 'draivio-cloud') {
      dispatch({ type: 'start-ai-batch', batchId })
      active.current = null; setBatch(null)
      dispatch({ type: 'set-generating', value: true })
      demoTimer.current = setTimeout(() => { demoTimer.current = null; if (mounted.current && documentId.current === expectedDocumentId && sessionId.current === expectedDocumentSessionId) dispatch({ type: 'complete-ai-operation', id: batchId, request, expectedDocumentId, expectedDocumentSessionId }) }, 900)
      return
    }
    const connection = getConnections().find(item => item.id === state.composerSourceId)
    if (!connection) return notice('服务来源不可用')
    if (!['openai_compatible', 'volcengine'].includes(connection.protocol)) return notice('该协议尚未接入真实生图')
    if (mode !== 'generate') return notice('当前真实接口仅支持文生图，请切换到生成新内容；图片编辑尚未接入')
    if (!request.prompt.trim()) return notice('请先填写图片描述')
    const options = resolveGenerationOptions(connection, model)
    const count = Math.min(8, Math.max(1, Number.parseInt(request.parameters.count, 10) || 1))
    const sourceId = connection.id, baseUrl = connection.baseUrl, protocol = connection.protocol
    dispatch({ type: 'start-ai-batch', batchId })
    const next = new ImageBatch(count, options.multiImage, options.concurrency, async requestedCount => {
      // Re-read credentials for retry without putting them in task or editor state.
      const current = getConnections().find(item => item.id === sourceId)
      if (!current?.enabled || !current.models.includes(model)) throw new ImageRequestError('来源已停用、删除或模型不可用', false)
      if (current.baseUrl !== baseUrl || current.protocol !== protocol) throw new ImageRequestError('来源接口已更改，请新建生成任务', false)
      return generateOpenAIImages(current, { model, prompt: request.prompt, count: requestedCount, size: request.parameters.size, options })
    }, (image, index) => {
      if (mounted.current && documentId.current === expectedDocumentId && sessionId.current === expectedDocumentSessionId) dispatch({ type: 'append-ai-result', id: `generated-${crypto.randomUUID()}`, request, image, index, expectedDocumentId, expectedDocumentSessionId })
    })
    active.current = next; setBatch(next)
    void run(next)
  }
  const retry = (unknown = false) => {
    if (!active.current || state.isGenerating || active.current.getSnapshot().running) return
    void run(active.current, true, unknown)
  }
  return <GenerationContext.Provider value={{ snapshot, start, retry, cancel: () => active.current?.cancel() }}>{children}</GenerationContext.Provider>
}
export function useImageGeneration() {
  const value = useContext(GenerationContext)
  if (!value) throw new Error('useImageGeneration requires EditorProvider')
  return value
}

export function GenerationProgress() {
  const { snapshot, cancel, retry } = useImageGeneration()
  const [confirmUnknown, setConfirmUnknown] = useState(false)
  useEffect(() => { setConfirmUnknown(false) }, [snapshot])
  if (!snapshot) return null
  const count = (status: string) => snapshot.items.filter(item => item.status === status).length
  const failed = count('failed') + count('missing') + count('cancelled')
  const unknown = count('unknown')
  const messages = [...new Set(snapshot.items.flatMap(item => item.message ? [item.message] : []))]
  return <div className="generation-progress" role="region" aria-label="生成进度">
    <div role="status">已完成 {count('succeeded')}/{snapshot.items.length}{snapshot.running ? ` · 生成中 ${count('running')} · 排队 ${count('queued')}` : ''}{failed ? ` · 待补齐 ${failed}` : ''}{unknown ? ` · 结果未知 ${unknown}` : ''}</div>
    <div className="generation-actions">{snapshot.running ? <button onClick={cancel} disabled={!count('queued')}>取消排队</button> : <>{failed ? <button onClick={() => retry()}>重试失败 / 补齐</button> : null}{unknown ? <button onClick={() => confirmUnknown ? retry(true) : setConfirmUnknown(true)}>{confirmUnknown ? '确认重新生成（可能重复计费）' : '处理未知结果'}</button> : null}</>}</div>
    {messages.length ? <button onClick={() => message.warning(messages.join('；'), { key: 'generation-details' })}>查看原因</button> : null}
    {failed && !snapshot.running ? <small>手动补齐会重新请求，可能另行计费。</small> : null}
    {snapshot.running ? <small>取消仅停止排队；已提交请求继续接收结果，可能计费。</small> : null}
  </div>
}
