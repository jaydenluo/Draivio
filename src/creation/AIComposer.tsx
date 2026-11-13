import { useCallback, useRef, useState } from 'react'
import { ModelGuide } from './ModelGuide'
import { OutputFormatPicker } from './OutputFormatPicker'
import { outputFormatLabel } from './outputFormats'
import { useEditor, type ComposerParameter } from '../state/editor'
import { ModelSourcePicker } from './ModelSourcePicker'
import { getModelsForSource } from './modelSources'

type PopoverParameter = Exclude<ComposerParameter, 'ratio'>

const parameterOptions: Record<Exclude<PopoverParameter, 'size'>, string[]> = {
  model: ['Image Pro', 'Image Fast', 'Image Detail'],
  count: ['1 张', '2 张', '3 张', '4 张', '6 张', '8 张'],
  strength: ['强度 48%', '强度 72%', '强度 24%'],
}

export function AIComposer() {
  const { state, dispatch } = useEditor()
  const [openParameter, setOpenParameter] = useState<PopoverParameter | null>(null)
  const [guideOpen, setGuideOpen] = useState(false)
  const closeGuide = useCallback(() => setGuideOpen(false), [])
  const referenceInput = useRef<HTMLInputElement>(null)
  const execute = () => {
    if (state.isGenerating) return
    const request = {
      mode: state.composerMode, prompt: state.prompt, sourceLayerId: state.selectedLayerId,
      selection: state.selectionVisible ? structuredClone(state.selection) : null,
      parameters: { ...state.composerParameters },
      sourceId: state.composerSourceId,
      modelCode: getModelsForSource(state.composerSourceId).find((model) => model.displayName === state.composerParameters.model)?.code,
    }
    dispatch({ type: 'set-generating', value: true })
    window.setTimeout(() => {
      dispatch({ type: 'complete-ai-operation', id: `generated-${crypto.randomUUID()}`, request })
    }, 900)
  }
  const toggleMode = () => {
    setOpenParameter(null)
    dispatch({ type: 'set-composer-mode', mode: state.composerMode === 'edit' ? 'generate' : 'edit' })
  }
  const minimize = () => {
    setOpenParameter(null)
    dispatch({ type: 'set-composer-minimized', minimized: true })
  }
  const chooseParameter = (parameter: ComposerParameter, value: string) => {
    dispatch({ type: 'set-composer-parameter', parameter, value })
    setOpenParameter(null)
  }
  const addReference = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) dispatch({ type: 'set-notice', message: `已添加参考图：${file.name}` })
    event.target.value = ''
  }
  const mode = state.composerMode
  const activeParameterName = openParameter ? state.composerParameters[openParameter] : ''
  const parameterNames: Record<ComposerParameter, string> = { model: '模型', size: '比例与分辨率', ratio: '比例', count: '数量', strength: '变化强度' }
  const parameters = (['model', 'size', 'count', ...(mode === 'edit' ? ['strength'] : [])] as PopoverParameter[])

  return <section className={`ai-composer ${state.composerMinimized ? 'is-minimized' : ''}`} data-placement={state.composerPlacement} aria-label="AI 操作" role="region">
    <div className="composer-bar"><div className="composer-bar-title"><button className="mode-button" aria-label={mode === 'edit' ? '切换到生成新内容' : '切换到修改当前图'} onClick={toggleMode}><span className="mode-dot" />{mode === 'edit' ? '修改当前图' : '生成新内容'}⌄</button><small>{state.composerPlacement === 'floating' ? '画布底部' : '右侧面板'}</small></div><div className="composer-layout-actions"><button type="button" className="composer-guide-button" title="模型与参数指南" aria-label="查看模型与参数指南" aria-haspopup="dialog" onClick={() => { setOpenParameter(null); setGuideOpen(true) }}>模型指南</button><button className="composer-control" aria-label={state.composerPlacement === 'floating' ? '移到右侧' : '悬浮到画布底部'} onClick={() => dispatch({ type: 'set-composer-placement', placement: state.composerPlacement === 'floating' ? 'right' : 'floating' })}>{state.composerPlacement === 'floating' ? '↗' : '↙'}</button><button className="composer-control" aria-label={state.composerMinimized ? '展开 AI 对话框' : '最小化 AI 对话框'} onClick={() => state.composerMinimized ? dispatch({ type: 'set-composer-minimized', minimized: false }) : minimize()}>{state.composerMinimized ? '＋' : '−'}</button></div></div>
    {!state.composerMinimized ? <>
      <textarea aria-label="AI 操作" placeholder={mode === 'edit' ? '描述你想修改的内容' : '描述你想要的画面'} value={state.prompt} onChange={(event) => dispatch({ type: 'set-prompt', prompt: event.target.value })} />
      <div className="composer-footer"><div className="composer-tools"><button className="composer-icon" aria-label="添加参考图" onClick={() => referenceInput.current?.click()}>＋</button><input ref={referenceInput} className="sr-only" type="file" accept="image/*" aria-label="选择参考图" onChange={addReference} />{parameters.map((parameter) => <button key={parameter} className="parameter-chip" aria-label={`选择${parameterNames[parameter]}`} title={parameter === 'strength' ? '演示参数，并非所有模型支持，详见模型指南' : undefined} aria-haspopup="dialog" aria-expanded={openParameter === parameter} aria-controls={parameter === 'size' ? 'output-format-popover' : undefined} onClick={() => setOpenParameter((value) => value === parameter ? null : parameter)}>{parameter === 'size' ? outputFormatLabel(state.composerParameters.ratio, state.composerParameters.size) : state.composerParameters[parameter]}⌄</button>)}</div><div className="composer-submit"><span className="composer-cost">预计 12 积分</span><button className="execute-button" aria-label={state.isGenerating ? '执行中…' : '执行 AI 操作'} onClick={execute} disabled={state.isGenerating}>{state.isGenerating ? '执行中…' : '➜'}</button></div></div>
      {String(openParameter) === 'size' ? <OutputFormatPicker ratio={state.composerParameters.ratio} size={state.composerParameters.size} onClose={() => setOpenParameter(null)} onChoose={(ratio, size) => { dispatch({ type: 'set-output-format', ratio, size }); setOpenParameter(null) }} /> : String(openParameter) === 'model' ? <div className="parameter-popover model-source-composer-popover" role="dialog" aria-label="模型参数"><strong>模型参数</strong><ModelSourcePicker initialOpen="model" sourceId={state.composerSourceId} modelCode={getModelsForSource(state.composerSourceId).find((model) => model.displayName === state.composerParameters.model)?.code ?? ''} onSourceChange={(sourceId, nextModelCode) => { dispatch({ type: 'set-composer-source', sourceId }); dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(sourceId).find((model) => model.code === nextModelCode)?.displayName ?? '' }) }} onModelChange={(nextModelCode) => dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(state.composerSourceId).find((model) => model.code === nextModelCode)?.displayName ?? state.composerParameters.model })} /></div> : openParameter ? <div className="parameter-popover" role="dialog" aria-label="其他参数"><strong>{`调整${parameterNames[openParameter]}`}</strong>{parameterOptions[openParameter as Exclude<PopoverParameter, 'size'>].map((option) => <button key={option} className={option === activeParameterName ? 'selected' : ''} onClick={() => chooseParameter(openParameter, option)}>{option}</button>)}</div> : null}
    </> : <span className="composer-minimized-hint">点击 ＋ 继续描述</span>}
    {guideOpen ? <ModelGuide onClose={closeGuide} /> : null}
  </section>
}
