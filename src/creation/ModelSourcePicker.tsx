import { DialogTitlebar } from '../ui/DialogTitlebar'
import { ComposerPopover } from './ComposerPopover'
import { useEffect, useRef, useState } from 'react'
import { cloudAccount } from '../account/cloudAccount'
import { useCloudAccount } from '../account/useCloudAccount'
import { OFFICIAL_CLOUD_ID } from '../account/cloudModels'
import { useServiceSources, type ModelSource, type ModelSourceId } from './modelSources'
import { openServiceSettings } from './ServiceSourceSettings'
import '../styles/model-picker.css'

export const MODEL_PICKER_HEIGHT = 440

type PickerGroup = ModelSource & { key: string; label: string }

function cloudGroupLabel(publisher?: string) {
  switch (publisher?.toLowerCase()) {
    case 'openai': return 'OpenAI · 云端'
    case 'anthropic':
    case 'claude': return 'Claude · 云端'
    default: return publisher ? `${publisher} · 云端` : 'Draivio 云端'
  }
}

type Props = {
  sourceId: ModelSourceId
  modelCode: string
  compact?: boolean
  kind?: 'image' | 'text'
  onClose?: () => void
  onSourceChange: (sourceId: ModelSourceId, modelCode: string) => void
  onModelChange: (modelCode: string) => void
}

export function ModelSourcePicker({ sourceId, modelCode, compact = false, kind = 'image', onClose, onSourceChange, onModelChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [collapsedSources, setCollapsedSources] = useState<Set<ModelSourceId>>(() => new Set())
  const [collapsedSearchSources, setCollapsedSearchSources] = useState<Set<ModelSourceId>>(() => new Set())
  const [catalogStatus, setCatalogStatus] = useState<'loading' | 'failed' | 'idle'>('idle')
  const input = useRef<HTMLInputElement>(null)
  const { sources } = useServiceSources(kind)
  const title = kind === 'text' ? '选择推理模型' : '选择模型'
  const source = sources.find(item => item.id === sourceId)
  const selected = source?.models.find(item => item.code === modelCode)
  const expanded = compact || open
  const { authenticated, models: catalog } = useCloudAccount()
  const session = cloudAccount.getSessionVersion()
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (expanded) input.current?.focus() }, [expanded])
  useEffect(() => {
    if (!expanded || !authenticated) {
      setCatalogStatus('idle')
      return
    }

    let visible = true
    setCatalogStatus('loading')
    void cloudAccount.refreshModels().then(
      () => { if (visible) setCatalogStatus('idle') },
      () => { if (visible) setCatalogStatus('failed') },
    )
    return () => { visible = false }
  }, [expanded, authenticated, session])
  const term = search.trim().toLowerCase()
  const cloudSource = sources.find(item => item.id === OFFICIAL_CLOUD_ID)
  const showCloudStatus = authenticated && !term && !cloudSource?.models.length
  const cloudModels = catalog.filter(model => model.modality === kind)
  const modelPurpose = kind === 'text' ? '推理' : '图片'
  const emptyCloudMessage = cloudModels.length > 0 && cloudModels.every(model => model.availability?.reason === 'NO_AVAILABLE_SUPPLIER')
    ? `云端${modelPurpose}模型暂无可用供应商线路`
    : `云端暂无可用${modelPurpose}模型`
  const collapsed = term ? collapsedSearchSources : collapsedSources
  const toggleSource = (id: ModelSourceId) => {
    const setCollapsed = term ? setCollapsedSearchSources : setCollapsedSources
    setCollapsed(previous => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  const publishers = new Map(catalog.map(model => [model.code, model.publisher]))
  const cloudGroups = new Map<string, PickerGroup>()
  if (cloudSource?.enabled) {
    for (const model of cloudSource.models) {
      const publisher = publishers.get(model.code)
      const label = cloudGroupLabel(publisher)
      if (!`${model.displayName} ${model.code} ${label} ${publisher ?? ''} ${cloudSource.summary}`.toLowerCase().includes(term)) continue
      const key = `cloud:${label.toLowerCase()}`
      let group = cloudGroups.get(key)
      if (!group) {
        group = { ...cloudSource, key, label, models: [] }
        cloudGroups.set(key, group)
      }
      group.models.push(model)
    }
  }
  const customGroups = sources.filter(item => item.id !== OFFICIAL_CLOUD_ID && item.enabled !== false).map(item => ({
    ...item,
    key: `custom:${item.id}`,
    label: item.summary,
    models: item.models.filter(model => `${model.displayName} ${model.code} ${item.summary}`.toLowerCase().includes(term)),
  })).filter(item => item.models.length)
  const groups = [...cloudGroups.values(), ...customGroups]
  const close = () => { setOpen(false); setSearch(''); onClose?.() }
  const choose = (nextSource: string, nextModel: string) => {
    if (nextSource === sourceId) onModelChange(nextModel)
    else onSourceChange(nextSource, nextModel)
    close()
  }
  const panel = <div className="model-picker-panel" role="dialog" aria-label={title} onKeyDown={event => {
      if (event.key === 'Escape' && !compact) { event.preventDefault(); event.stopPropagation(); close() }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        const options = [...event.currentTarget.querySelectorAll<HTMLElement>('input, button[data-model-option], button[data-model-group]')]
        const index = options.indexOf(document.activeElement as HTMLElement)
        if (index >= 0) { event.preventDefault(); options[Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus() }
      }
    }}>
      <DialogTitlebar title={title} onClose={close} />
      <input ref={input} type="search" className="model-picker-search" aria-label="搜索模型或服务来源" placeholder="搜索模型或服务来源…" value={search} onChange={event => {
        setSearch(event.target.value)
        setCollapsedSearchSources(new Set())
      }} />
      <div className="model-picker-results">
        {showCloudStatus && <section className="model-picker-group" aria-label="Draivio 云端">
          <div className="model-picker-group-heading"><span>Draivio 云端</span></div>
          <p className="model-picker-group-heading" role="status">{catalogStatus === 'loading' ? '正在检查云端模型…' : catalogStatus === 'failed' ? '云端模型刷新失败，重新打开可重试' : emptyCloudMessage}</p>
        </section>}
        {groups.map(group => <section className="model-picker-group" key={group.key} aria-label={group.label}>
          <button type="button" data-model-group className="model-picker-group-heading" aria-label={group.label} aria-expanded={!collapsed.has(group.key)} onClick={() => toggleSource(group.key)}>
            <span><i className="model-picker-chevron" aria-hidden="true" />{group.label}</span>
            <small>{group.billingMode === 'credits' ? '使用积分' : group.billingLabel}</small>
          </button>
          {!collapsed.has(group.key) && group.models.map(model => {
            const active = group.id === sourceId && model.code === modelCode
            return <button type="button" data-model-option key={model.code} className={`model-picker-option${active ? ' selected' : ''}`} aria-label={`${model.displayName} · ${group.label}`} aria-pressed={active} title={`${model.displayName} · ${group.label}`} onClick={() => choose(group.id, model.code)}><span className="model-picker-check" aria-hidden="true">{active ? '✓' : ''}</span><span>{model.displayName}</span></button>
          })}
        </section>)}
        {!groups.length && !showCloudStatus && catalogStatus === 'idle' ? <p className="model-picker-empty">{kind === 'text' && !term ? '暂无可用推理模型，请检查来源、密钥与模型用途' : '没有匹配的模型'}</p> : null}
        {authenticated && !showCloudStatus && catalogStatus === 'failed' ? <p className="model-picker-group-heading" role="status">云端模型刷新失败，重新打开可重试</p> : null}
      </div>
      <div className="model-picker-footer"><button type="button" onClick={() => { close(); openServiceSettings() }}>管理服务来源<span aria-hidden="true">↗</span></button></div>
    </div>
  return <div className={`model-source-picker${compact ? ' is-compact' : ''}`}>
    {!compact ? <button ref={trigger} className="model-picker-trigger" aria-label={`选择模型：${selected?.displayName ?? '请选择'} · ${source?.summary ?? '来源不可用'}`} aria-expanded={open} aria-haspopup="dialog" title={`${selected?.displayName ?? '请选择模型'} · ${source?.summary ?? '来源不可用'}`} onClick={() => { setOpen(!open); setSearch('') }}>
      <span><strong>{selected?.displayName ?? '请选择模型'}</strong><small>{source?.summary ?? '来源未配置、已停用或已删除'}</small></span><span aria-hidden="true">⌄</span>
    </button> : null}
    {expanded ? compact ? panel : trigger.current ? <ComposerPopover anchor={trigger.current} width={360} fixedHeight={MODEL_PICKER_HEIGHT} preferBelow onClose={close}>{panel}</ComposerPopover> : null : null}
  </div>
}
