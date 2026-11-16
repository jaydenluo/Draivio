import { DialogTitlebar } from '../ui/DialogTitlebar'
import { useDraggableDialog } from '../ui/useDraggableDialog'
import { useEffect, useRef, useState } from 'react'
import { useServiceSources, type ModelSourceId } from './modelSources'
import { openServiceSettings } from './ServiceSourceSettings'
import '../styles/model-picker.css'

type Props = {
  sourceId: ModelSourceId
  modelCode: string
  compact?: boolean
  onClose?: () => void
  onSourceChange: (sourceId: ModelSourceId, modelCode: string) => void
  onModelChange: (modelCode: string) => void
}

export function ModelSourcePicker({ sourceId, modelCode, compact = false, onClose, onSourceChange, onModelChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const { sources } = useServiceSources()
  const source = sources.find(item => item.id === sourceId)
  const selected = source?.models.find(item => item.code === modelCode)
  const expanded = compact || open
  const panel = useRef<HTMLDivElement>(null)
  const draggable = useDraggableDialog(panel, expanded)
  useEffect(() => { if (expanded) input.current?.focus() }, [expanded])
  const term = search.trim().toLowerCase()
  const groups = sources.filter(item => item.enabled !== false && item.models.length).map(item => ({
    ...item,
    label: item.billingMode === 'credits' ? item.providerName : item.summary,
    models: item.models.filter(model => `${model.displayName} ${model.code} ${item.summary}`.toLowerCase().includes(term)),
  })).filter(item => item.models.length)
  const close = () => { setOpen(false); setSearch(''); onClose?.() }
  const choose = (nextSource: string, nextModel: string) => {
    if (nextSource === sourceId) onModelChange(nextModel)
    else onSourceChange(nextSource, nextModel)
    close()
  }
  return <div className={`model-source-picker${compact ? ' is-compact' : ''}`}>
    {!compact ? <button className="model-picker-trigger" aria-label={`选择模型：${selected?.displayName ?? '请选择'} · ${source?.summary ?? '来源不可用'}`} aria-expanded={open} aria-haspopup="dialog" title={`${selected?.displayName ?? '请选择模型'} · ${source?.summary ?? '来源不可用'}`} onClick={() => { setOpen(!open); setSearch('') }}>
      <span><strong>{selected?.displayName ?? '请选择模型'}</strong><small>{source?.summary ?? '来源未配置、已停用或已删除'}</small></span><span aria-hidden="true">⌄</span>
    </button> : null}
    {expanded ? <div ref={panel} style={draggable.style} onPointerDown={draggable.onPointerDown} className="model-picker-panel" role="dialog" aria-label="选择模型" onKeyDown={event => {
      if (event.key === 'Escape' && !compact) { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const options = [...event.currentTarget.querySelectorAll<HTMLElement>('input, button[data-model-option]')]
        const index = options.indexOf(document.activeElement as HTMLElement)
        if (index >= 0) { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus() }
      }
    }}>
      <DialogTitlebar title="选择模型" onClose={close} />
      <input ref={input} type="search" className="model-picker-search" aria-label="搜索模型或服务来源" placeholder="搜索模型或服务来源…" value={search} onChange={event => setSearch(event.target.value)} />
      <div className="model-picker-results">
        {groups.map(group => <section className="model-picker-group" key={group.id} aria-label={group.label}>
          <div className="model-picker-group-heading"><span>{group.label}</span><small>{group.billingMode === 'credits' ? '使用积分' : group.billingLabel}</small></div>
          {group.models.map(model => {
            const active = group.id === sourceId && model.code === modelCode
            return <button type="button" data-model-option key={model.code} className={`model-picker-option${active ? ' selected' : ''}`} aria-label={`${model.displayName} · ${group.label}`} aria-pressed={active} title={`${model.displayName} · ${group.label}`} onClick={() => choose(group.id, model.code)}><span className="model-picker-check" aria-hidden="true">{active ? '✓' : ''}</span><span>{model.displayName}</span></button>
          })}
        </section>)}
        {!groups.length ? <p className="model-picker-empty">没有匹配的模型</p> : null}
      </div>
      <div className="model-picker-footer"><button type="button" onClick={() => { close(); openServiceSettings() }}>管理服务来源<span aria-hidden="true">↗</span></button></div>
    </div> : null}
  </div>
}
