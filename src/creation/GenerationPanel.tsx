import { GenerationProgress, useImageGeneration } from './ImageGeneration'
import { generationCounts } from './composerPreferences'
import { outputFormats } from './outputFormats'
import { getConnections } from './modelSources'
import { resolveGenerationOptions } from './generationOptions'
import { useDocumentTransaction, useEditor } from '../state/editor'
import { useState } from 'react'
import { ModelSourcePicker } from './ModelSourcePicker'
import { getModelsForSource, getSourceById, isSourceUsable, useServiceSources } from './modelSources'

export function GenerationPanel() {
  const { state, dispatch } = useEditor()
  const promptTransaction = useDocumentTransaction('修改提示词')
  useServiceSources()
  const { start } = useImageGeneration()
  const connection = getConnections().find(item => item.id === state.composerSourceId)
  const sizeByService = connection && !resolveGenerationOptions(connection, state.composerParameters.model).sendSize
  const sourceUsable = isSourceUsable(state.composerSourceId, state.composerParameters.model)
  const [operation, setOperation] = useState('文生图')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const generate = () => start(operation === '文生图' ? 'generate' : 'edit')
  const source = getSourceById(state.composerSourceId)
  const modelCode = getModelsForSource(state.composerSourceId).find((model) => model.displayName === state.composerParameters.model)?.code ?? getModelsForSource(state.composerSourceId)[0]?.code ?? ''
  return <div className="inspector-panel"><div className="panel-heading"><h2>生成图片</h2><small>{source?.providerName ?? '服务来源'} · {state.composerParameters.model}</small></div><div className="operation-row">{['文生图', '草图', '图生图'].map((item) => <button key={item} className={`operation ${operation === item ? 'active' : ''}`} onClick={() => setOperation(item)}>{item}</button>)}</div><label htmlFor="prompt">描述你想要的画面</label><textarea onFocus={promptTransaction.onEditStart} onBlur={promptTransaction.onEditEnd} onKeyDown={(event) => { if (event.key === 'Escape') { event.preventDefault(); promptTransaction.onEditCancel(); event.currentTarget.blur() } }} id="prompt" value={state.prompt} onChange={(event) => dispatch({ type: 'set-prompt', prompt: event.target.value })} /><ModelSourcePicker sourceId={state.composerSourceId} modelCode={modelCode} onSourceChange={(sourceId, nextModelCode) => { dispatch({ type: 'set-composer-source', sourceId }); dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(sourceId).find((model) => model.code === nextModelCode)?.displayName ?? '' }) }} onModelChange={(nextModelCode) => dispatch({ type: 'set-composer-parameter', parameter: 'model', value: getModelsForSource(state.composerSourceId).find((model) => model.code === nextModelCode)?.displayName ?? state.composerParameters.model })} /><div className="field-grid"><Field label="尺寸"><select aria-label="生成尺寸" disabled={!!sizeByService} value={sizeByService ? 'service' : state.composerParameters.size} onChange={event => { const format = outputFormats.find(item => (item.sizes as readonly string[]).includes(event.target.value)); dispatch({ type: 'set-output-format', ratio: format?.ratio ?? 'auto', size: event.target.value }) }}>{sizeByService ? <option value="service">由服务决定</option> : <><option value="auto">自动</option>{[...new Set(outputFormats.flatMap(item => [...item.sizes]))].map(size => <option key={size}>{size}</option>)}</>}</select></Field><Field label="数量"><select aria-label="生成数量" value={state.composerParameters.count} onChange={event => dispatch({ type: 'set-composer-parameter', parameter: 'count', value: event.target.value })}>{generationCounts.map(count => <option key={count}>{count}</option>)}</select></Field></div><div className="field-grid"><Field label="风格"><select defaultValue="自动"><option>自动</option><option>摄影</option><option>插画</option></select></Field><div /></div>{advancedOpen ? <div className="advanced-settings"><label htmlFor="seed">随机种子</label><input id="seed" defaultValue="自动" /><label htmlFor="steps">细节强度</label><input id="steps" type="range" min="1" max="10" defaultValue="6" /></div> : null}<GenerationProgress /><div className="cost-row"><span>{source?.billingMode === 'credits' ? '预计消耗' : '费用说明'}</span><b>{source?.billingMode === 'credits' ? '12 积分' : source?.billingLabel}</b></div><button className="primary-button" onClick={generate} disabled={state.isGenerating || !sourceUsable}>{state.isGenerating ? '生成中…' : '生成图片'}</button><button className="secondary-button" onClick={() => setAdvancedOpen((open) => !open)}>更多设置　{advancedOpen ? '⌃' : '⌄'}</button></div>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label>{label}</label>{children}</div> }
