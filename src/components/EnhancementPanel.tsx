import { RestorationPanel } from '../ai/tools/RestorationPanel'
import { EnhancementWindow } from './EnhancementWindow'
import { useEffect, useState } from 'react'
import { getModel, formatBytes, type ModelId } from '../models/modelCatalog'
import { modelApi } from '../models/modelApi'
import { useEditor } from '../state/editor'
import type { ModelState } from '../models/modelManager'
import './enhancement-panel.css'

type Kind = 'cutout' | 'upscale'
type Props = { kind: Kind; onRun: (kind: Kind) => void; onManage: (kind: Kind) => void }

const modelFor = (kind: Kind): ModelId => kind === 'cutout' ? 'u2net' : 'realesrgan-x4plus'

export function EnhancementPanel(props: Props) {
  return props.kind === 'upscale' ? <RestorationPanel /> : <LegacyEnhancementPanel {...props} />
}

function LegacyEnhancementPanel({ kind, onRun, onManage }: Props) {
  const { state, dispatch } = useEditor()
  const [models, setModels] = useState<ModelState | null>(null)
  const [scale, setScale] = useState<'2' | '4'>('2')
  const modelId = modelFor(kind)
  const model = getModel(modelId)
  const record = models?.[modelId]
  useEffect(() => { void modelApi.getState().then(setModels) }, [kind])
  useEffect(() => { let stop: (() => void) | undefined; void modelApi.onProgress((progress) => setModels((current) => current ? { ...current, [progress.modelId]: { ...current[progress.modelId], status: 'downloading', downloadedBytes: progress.downloadedBytes, totalBytes: progress.totalBytes } } : current)).then((unlisten) => { stop = unlisten }); return () => stop?.() }, [])
  const installed = record?.status === 'installed'
  const downloading = record?.status === 'downloading' || record?.status === 'queued'
  const progress = record?.totalBytes ? Math.round(record.downloadedBytes / record.totalBytes * 100) : 0
  return <EnhancementWindow title={kind === 'cutout' ? '扣图' : '超分'} onClose={() => dispatch({ type: 'select-tool', tool: 'select' })}><section className="enhancement-panel" aria-label={`${kind === 'cutout' ? '扣图' : '超分'}工具面板`}>
    <div className="enhancement-panel-heading"><span className="enhancement-eyebrow">当前图层 · {state.layers.find((layer) => layer.id === state.selectedLayerId)?.name ?? '未选择'}</span><span className="enhancement-badge">{installed ? '模型已就绪' : '需要模型'}</span></div>
    <small className="enhancement-drag-hint">拖动标题栏移动</small>
    <p className="enhancement-description">{kind === 'cutout' ? '移除主体四周的背景，保留主体边缘并生成透明图层。' : '放大当前图层，保留原图并生成新的放大结果。'}</p>
    {kind === 'cutout' ? <div className="enhancement-preview-row"><div className="enhancement-preview checkerboard"><span className="preview-subject" /></div><span>透明背景</span></div> : <label className="enhancement-field"><span>放大倍数</span><select value={scale} onChange={(event) => setScale(event.currentTarget.value as '2' | '4')}><option value="2">2x · 推荐</option><option value="4">4x · 更大文件</option></select></label>}
    <div className="enhancement-model"><div><strong>{model.name}</strong><small>{formatBytes(model.sizeBytes)} · {model.description}</small></div><button type="button" onClick={() => onManage(kind)}>{installed ? '更换模型' : '安装模型'}</button></div>
    {downloading ? <div className="enhancement-download"><div className="enhancement-progress"><span style={{ width: `${progress}%` }} /></div><small>后台下载中 {progress}%</small></div> : null}
    <div className="enhancement-actions"><button type="button" className="secondary" onClick={() => onManage(kind)}>模型管理</button><button type="button" className="primary" disabled={!installed} onClick={() => onRun(kind)}>开始{kind === 'cutout' ? '扣图' : `超分 ${scale}x`}</button></div>
  </section></EnhancementWindow>
}
