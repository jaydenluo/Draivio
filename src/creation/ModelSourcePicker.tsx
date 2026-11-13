import { useState } from 'react'
import { getModelsForSource, getSourceById, modelSources, type ModelSourceId } from './modelSources'

type Props = {
  sourceId: ModelSourceId
  modelCode: string
  initialOpen?: 'source' | 'model' | null
  onSourceChange: (sourceId: ModelSourceId, modelCode: string) => void
  onModelChange: (modelCode: string) => void
}

export function ModelSourcePicker({ sourceId, modelCode, initialOpen = null, onSourceChange, onModelChange }: Props) {
  const [open, setOpen] = useState<'source' | 'model' | null>(initialOpen)
  const source = getSourceById(sourceId) ?? modelSources[0]
  const model = getModelsForSource(source.id).find((item) => item.code === modelCode) ?? source.models[0]

  return <div className="model-source-picker">
    <div className="model-source-fields">
      <div className="model-source-field">
        <span className="field-label">服务来源</span>
        <button className="model-source-button" aria-label={`服务来源：${source.summary}`} aria-expanded={open === 'source'} onClick={() => setOpen(open === 'source' ? null : 'source')}>
          <span><strong>{source.summary}</strong><small>{source.billingLabel}</small></span><span aria-hidden="true">⌄</span>
        </button>
        {open === 'source' ? <div className="model-source-popover" role="dialog" aria-label="选择服务来源">
          {modelSources.map((item) => <button key={item.id} className={item.id === source.id ? 'selected' : ''} onClick={() => { onSourceChange(item.id, item.models[0].code); setOpen(null) }}>
            <span><strong>{item.providerName}</strong><small>{item.protocolLabel ? `${item.protocolLabel} · ` : ''}{item.billingLabel}</small></span>
          </button>)}
        </div> : null}
      </div>
      <div className="model-source-field">
        <span className="field-label">模型</span>
        <button className="model-source-button model-button" aria-label={`模型：${model.displayName}`} aria-expanded={open === 'model'} onClick={() => setOpen(open === 'model' ? null : 'model')}>
          <span><strong>{model.displayName}</strong><small>{source.protocolLabel ?? 'Draivio 模型服务'}</small></span><span aria-hidden="true">⌄</span>
        </button>
        {open === 'model' ? <div className="model-source-popover" role="dialog" aria-label="选择模型">
          {source.models.map((item) => <button key={item.code} className={item.code === model.code ? 'selected' : ''} onClick={() => { onModelChange(item.code); setOpen(null) }}>{item.displayName}</button>)}
        </div> : null}
      </div>
    </div>
  </div>
}
