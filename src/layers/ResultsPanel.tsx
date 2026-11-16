import './ResultsPanel.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useEditor, type AIResult } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
import { CanvasFixtureContent } from '../canvas/CanvasFixture'

function ResultImage({ result, full = false }: { result: AIResult; full?: boolean }) {
  const { dispatch } = useEditor()
  const [fallback, setFallback] = useState(false)
  const source = full || fallback ? result.source : result.thumbnail ?? result.source
  if (!source || result.status === 'error') return <span className="result-placeholder">{result.status === 'error' ? '图像不可用' : '暂无图像'}</span>
  return <img src={source} alt={full ? 'AI 结果大图' : ''} onError={() => {
    if (!full && !fallback && result.source && result.source !== source) setFallback(true)
    else dispatch({ type: 'fail-ai-result-image', id: result.id })
  }} />
}

export function ResultsPanel() {
  const { state, dispatch } = useEditor()
  const [filter, setFilter] = useState('all')
  const [previewIds, setPreviewIds] = useState<string[]>([])
  const [compareIds, setCompareIds] = useState<string[]>([])
  const closeRef = useRef<HTMLButtonElement>(null)
  const results = useMemo(() => state.aiResults.filter(result => filter === 'all' || filter === 'adopted' && result.adopted || filter === 'unused' && !result.adopted || filter === 'recent' && !!state.currentAiBatchId && result.batchId === state.currentAiBatchId), [state.aiResults, state.currentAiBatchId, filter])
  const comparableIds = compareIds.filter(id => state.aiResults.some(result => result.id === id && result.status === 'success' && result.source))
  const previews = previewIds.flatMap(id => state.aiResults.find(result => result.id === id) ?? [])
  useEffect(() => {
    if (!previewIds.length) return
    const prior = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setPreviewIds([]) }
    window.addEventListener('keydown', escape)
    return () => { window.removeEventListener('keydown', escape); prior?.focus() }
  }, [previewIds])
  const selected = state.layers.find(layer => layer.id === state.selectedLayerId)
  const replaceDisabled = !selected || !!selected.children?.length || effectiveLayerState(state.layers, state.selectedLayerId).locked
  const originalSources = [...new Set(previews.flatMap(result => {
    return [result.request?.sourceImage, ...(result.adoptions ?? []).map(item => item.originalLayer?.source)].filter((source): source is string => !!source)
  }))]
  return <section className="inspector-panel results-panel" role="region" aria-label="AI 结果">
    <div className="panel-heading"><h2>AI 结果</h2><small>{results.length} 个结果</small></div>
    <div className="results-toolbar">
      <button disabled={comparableIds.length < 2} onClick={() => setPreviewIds(comparableIds)}>比较 {comparableIds.length}/4</button>
      <select aria-label="筛选 AI 结果" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">全部</option><option value="recent">本次生成</option><option value="adopted">已采用</option><option value="unused">未采用</option></select>
    </div>
    {results.length ? <div className="result-grid">{results.map(result => <article className={`result-card result-${result.status}`} key={result.id}>
      <button className="result-preview" aria-label={`预览结果 ${result.id}`} onClick={() => setPreviewIds([result.id])}><ResultImage result={result}/></button>
      <span>{result.adopted ? '已采用' : '候选'} · {state.aiResults.indexOf(result) + 1}</span>
      <label className="result-compare"><input type="checkbox" disabled={result.status !== 'success' || !result.source || !comparableIds.includes(result.id) && comparableIds.length >= 4} checked={comparableIds.includes(result.id)} onChange={event => setCompareIds(event.target.checked ? [...comparableIds, result.id] : comparableIds.filter(id => id !== result.id))} />比较</label>
      <strong>{result.model}</strong><small>{result.size} · {result.provider}</small><p title={result.prompt}>{result.prompt || '无提示词'}</p>
      <details><summary>生成参数</summary>{result.request ? <dl>{Object.entries(result.request.parameters).map(([key, value]) => <div key={key}><dt>{({ model: '模型', size: '尺寸', ratio: '比例', count: '数量', strength: '强度' } as Record<string, string>)[key] ?? key}</dt><dd>{value}</dd></div>)}</dl> : <p>未记录完整参数</p>}</details>
      {result.error ? <small className="error-text">{result.error}</small> : null}
      <div className="result-actions">
        <button disabled={result.status !== 'success' || !result.source} onClick={() => dispatch({ type: 'adopt-ai-result-as-layer', id: result.id })}>新增图层</button>
        <button disabled={result.status !== 'success' || !result.source || replaceDisabled} title={replaceDisabled ? '请选择未锁定的图片图层' : undefined} onClick={() => dispatch({ type: 'replace-layer-with-ai-result', targetId: state.selectedLayerId, resultId: result.id })}>替换当前</button>
        <button disabled={!result.request} onClick={() => dispatch({ type: 'continue-ai-result', id: result.id })}>继续编辑</button>
        <button onClick={() => dispatch({ type: 'toggle-ai-result-favorite', id: result.id })}>{result.favorite ? '取消收藏' : '收藏'}</button>
        <button onClick={() => dispatch({ type: 'delete-ai-result', id: result.id })}>删除</button>
      </div>
    </article>)}</div> : <p className="inspector-empty">{filter === 'recent' ? '本次生成暂无可用候选，请查看生成进度或失败原因。' : '暂无符合筛选的 AI 结果。生成结果先保存在这里，确认后再加入图层。'}</p>}
    {previews.length ? <div className="result-preview-modal" role="dialog" aria-modal="true" aria-label={previews.length > 1 ? 'AI 结果比较' : 'AI 结果预览'} onClick={() => setPreviewIds([])}>
      <div onClick={event => event.stopPropagation()}><button ref={closeRef} aria-label="关闭预览" onClick={() => setPreviewIds([])}>关闭</button>
        {originalSources.map((source, index) => <figure key={`original-${index}`}><>{source === 'fixture' ? <svg viewBox="0 0 500 625" role="img" aria-label="生成来源原图"><CanvasFixtureContent/></svg> : <img src={source} alt="生成来源原图"/>}</><figcaption>原图</figcaption></figure>)}
        {previews.map(result => <figure key={result.id}><ResultImage result={result} full/><figcaption>{result.model} · {result.size}<button disabled={result.status !== 'success' || !result.source} aria-label={`采用结果 ${result.id}`} onClick={() => { dispatch({ type: 'adopt-ai-result-as-layer', id: result.id }); setPreviewIds([]) }}>选为胜出版本并新增图层</button></figcaption></figure>)}
      </div>
    </div> : null}
  </section>
}
