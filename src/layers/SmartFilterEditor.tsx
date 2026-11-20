import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NumericScrubber } from '../components/NumericScrubber'
import { executeEditorCommand } from '../commands/editorCommands'
import { localSelection } from '../ai/tools/adjustmentTools'
import { duotoneDefaults } from '../filters/tone'
import { activeSmartFilters, smartFilterNames, validateSmartFilters, type SmartFilter, type SmartFilterChain } from '../render/filterPipeline'
import { effectiveLayerState } from '../state/layerHierarchy'
import { useEditor, type Layer } from '../state/editor'
import { AnchoredWindow } from '../ui/AnchoredWindow'
import { Checkbox } from '../ui/Checkbox'
import { createInteractiveFilter, filterAddUnavailableReason, filterParameters, filterScopeLabel, filterUnavailableReason, type AddableFilter } from './smartFilterControls'
import './smart-filters.css'

type EditorTarget = { kind: AddableFilter } | { filterId: string } | { scope: true }
type FilterPreview = { layerId: string; chain: SmartFilterChain }
type Session = {
  layer: Layer
  chain: SmartFilterChain
  original: SmartFilterChain
  undoStack: ReturnType<typeof useEditor>['state']['undoStack']
  sourceRevision?: number
  filterId?: string
  adding: boolean
}
type Reveal = { layerId: string; focus: boolean }
const Context = createContext<{
  open: (layerId: string, anchor: HTMLElement, target: EditorTarget) => void
  preview: FilterPreview | null
  reveal: Reveal | null
  locate: (layerId: string) => void
} | null>(null)

export function useSmartFilterEditor() {
  const context = useContext(Context)
  if (!context) throw new Error('Smart filter editor requires EditorProvider')
  return context
}

export function SmartFilterEditorProvider({ active, children }: { active: boolean; children: ReactNode }) {
  const { state, dispatch } = useEditor()
  const [session, setSession] = useState<Session | null>(null)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const [comparing, setComparing] = useState(false)
  const [scopeError, setScopeError] = useState('')
  const anchor = useRef<HTMLElement | null>(null)
  const applying = useRef(false)
  const close = useCallback(() => {
    setSession(null)
    setComparing(false)
    setScopeError('')
  }, [])
  useEffect(() => {
    if (!active) {
      close()
      setReveal(null)
    }
  }, [active, close])
  useEffect(() => {
    if (!session || !active) return
    const release = () => setComparing(false)
    window.addEventListener('blur', release)
    return () => window.removeEventListener('blur', release)
  }, [!!session, active])

  const originalLayer = session && state.layers.find(layer => layer.id === session.layer.id)
  const reason = session && filterUnavailableReason(state, originalLayer || undefined)
  const sourceRevision = originalLayer && originalLayer.smartObject
    ? state.smartObjectSources[originalLayer.smartObject.sourceId]?.revision : undefined
  const stale = !!session && (session.layer !== originalLayer || session.undoStack !== state.undoStack || session.sourceRevision !== sourceRevision)
  const selected = session?.chain.items.find(item => item.id === session.filterId)
  const canChooseInitialScope = !!session && session.adding && !session.original.items.length && state.selectionVisible
  const valid = useMemo(() => {
    if (!session) return null
    try { return { chain: validateSmartFilters(session.chain), error: '' } }
    catch (error) { return { chain: null, error: error instanceof Error ? error.message : '滤镜参数无效' } }
  }, [session])
  const preview = useMemo(() => {
    if (!active || !session || stale || reason || !valid?.chain) return null
    const chain = selected ? {
      ...valid.chain,
      items: valid.chain.items.map(item => item.id === selected.id ? { ...item, enabled: !comparing } : item),
    } : valid.chain
    const original = session.original
    const sameScope = session.chain.mask === original.mask && session.chain.selection === original.selection
    // Compare by effective steps so opening neutral defaults does not create a second scene.
    if ((sameScope || (!chain.mask?.enabled && !original.mask?.enabled && !chain.selection && !original.selection)) &&
        JSON.stringify(activeSmartFilters(chain)) === JSON.stringify(activeSmartFilters(original))) return null
    return { layerId: session.layer.id, chain }
  }, [active, session, stale, reason, valid, selected, comparing])

  const open = (layerId: string, from: HTMLElement, target: EditorTarget) => {
    if (session) return
    const layer = state.layers.find(item => item.id === layerId)
    const unavailable = 'kind' in target ? filterAddUnavailableReason(state, layer) : filterUnavailableReason(state, layer)
    if (!layer || unavailable) return
    const original = layer.smartFilters ?? { items: [] }
    let chain = original
    let filterId: string | undefined
    if ('kind' in target) {
      filterId = `filter-${crypto.randomUUID()}`
      chain = { ...original, items: [...original.items, createInteractiveFilter(target.kind, filterId)] }
      if (!original.items.length && state.selectionVisible) {
        try { chain = { ...chain, selection: localSelection(state, layer.id) } }
        catch (error) { setScopeError(error instanceof Error ? error.message : '无法使用当前选区') }
      }
    } else if ('filterId' in target) {
      filterId = target.filterId
      if (!chain.items.some(item => item.id === filterId)) return
    }
    anchor.current = from
    applying.current = false
    setSession({
      layer, chain, original, filterId, adding: 'kind' in target, undoStack: state.undoStack,
      sourceRevision: layer.smartObject ? state.smartObjectSources[layer.smartObject.sourceId]?.revision : undefined,
    })
  }

  const patchChain = (update: (chain: SmartFilterChain) => SmartFilterChain) => {
    setSession(current => current ? { ...current, chain: update(current.chain) } : null)
    setScopeError('')
  }
  const patchFilter = (patch: Partial<SmartFilter>) =>
    patchChain(chain => ({ ...chain, items: chain.items.map(item => item.id === selected?.id ? { ...item, ...patch } : item) }))

  const captureSelection = () => {
    if (!session) return
    try {
      const selection = localSelection(state, session.layer.id)
      patchChain(chain => ({ ...chain, selection }))
    } catch (error) {
      setScopeError(error instanceof Error ? error.message : '无法使用当前选区')
    }
  }

  const apply = () => {
    if (!session || !valid?.chain || stale || reason || scopeError || applying.current) return
    applying.current = true
    dispatch({
      type: 'set-smart-filters', id: session.layer.id, chain: valid.chain,
      expectedLayer: session.layer, expectedSourceRevision: session.sourceRevision,
    })
    if (session.adding) setReveal({ layerId: session.layer.id, focus: false })
    close()
  }
  const locate = (layerId: string) => {
    dispatch({ type: 'reveal-layer-in-inspector', id: layerId })
    executeEditorCommand('layers', state, dispatch)
    setReveal({ layerId, focus: true })
  }
  const title = selected ? smartFilterNames[selected.kind] : '智能滤镜作用范围'
  const hidden = !!session && !effectiveLayerState(state.layers, session.layer.id).visible
  const error = stale ? '文档或源内容已更改，请重新打开滤镜。' : reason || scopeError || valid?.error
  const neutral = selected && valid?.chain && !activeSmartFilters({ items: [{ ...selected, enabled: true }] }).length
  return <Context.Provider value={{ open, preview, reveal, locate }}>
    {children}
    {active && session ? <AnchoredWindow anchor={anchor} title={title} onClose={close} width={340} placement="above" className="smart-filter-dialog">
      <div className="smart-filter-window-body">
        {selected ? <>
          <p className="smart-filter-target" title={session.layer.name}>{session.layer.name} · <span>作用范围：{canChooseInitialScope && session.chain.selection ? '当前选区' : filterScopeLabel(session.chain)}</span></p>
          {canChooseInitialScope ? <label className="smart-filter-check"><Checkbox checked={!!session.chain.selection} disabled={stale || !!reason}
            onChange={event => event.currentTarget.checked ? captureSelection() : patchChain(chain => ({ ...chain, selection: undefined }))} />仅处理当前选区</label> : null}
          <FilterParameters filter={selected} disabled={stale || !!reason} onChange={patchFilter} />
        </> : <FilterScope chain={session.chain} disabled={stale || !!reason} canCapture={state.selectionVisible} onChange={patchChain} onCapture={captureSelection} />}
        {error ? <p className="smart-filter-feedback" role="alert">{error}</p> :
          hidden ? <p className="smart-filter-feedback">图层已隐藏，显示后可查看效果。</p> :
          neutral ? <p className="smart-filter-feedback">{selected.kind === 'denoise' && !selected.threshold
            ? '阈值为 0 时保留原像素。调高阈值后可预览降噪效果。' : '当前参数会保留原像素。调整参数即可预览效果。'}</p> :
          selected && !selected.enabled ? <p className="smart-filter-feedback">此滤镜已停用，当前显示临时效果。</p> : null}
      </div>
      <footer className="smart-filter-footer">
        {selected ? <button type="button" className="smart-filter-compare" aria-pressed={comparing} disabled={stale || !!reason || !valid?.chain || hidden}
          onPointerDown={event => {
            if (event.button !== 0) return
            event.currentTarget.setPointerCapture?.(event.pointerId)
            setComparing(true)
          }}
          onPointerUp={() => setComparing(false)} onPointerCancel={() => setComparing(false)}
          onLostPointerCapture={() => setComparing(false)} onBlur={() => setComparing(false)}
          onKeyDown={event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setComparing(true) }
          }}
          onKeyUp={event => {
            if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); setComparing(false) }
          }}>按住对比</button> : null}
        <button type="button" onClick={close}>取消</button>
        <button type="button" className="smart-filter-apply" disabled={!!error || !valid?.chain} onClick={apply}>应用</button>
      </footer>
    </AnchoredWindow> : null}
  </Context.Provider>
}

function FilterParameters({ filter, disabled, onChange }: { filter: SmartFilter; disabled: boolean; onChange: (patch: Partial<SmartFilter>) => void }) {
  const settings = filterParameters[filter.kind]
  if (filter.kind === 'color' && filter.adjustments) {
    const adjustments = filter.adjustments
    const controls = [
      { key: 'exposureEV', label: '曝光 EV', max: 8, step: .1 },
      { key: 'brightness', label: '亮度', max: 100 },
      { key: 'contrast', label: '对比度', max: 100 },
      { key: 'saturation', label: '饱和度', max: 100 },
      { key: 'temperature', label: '色温', max: 100 },
      { key: 'tint', label: '色调', max: 100 },
      { key: 'shadows', label: '阴影', max: 100 },
      { key: 'highlights', label: '高光', max: 100 },
    ] as const
    return <div className="smart-filter-params">{controls.map(({ key, label, max, ...options }) =>
      <FilterNumber key={key} label={label} min={-max} max={max} step={'step' in options ? options.step : 1}
        value={adjustments[key] ?? 0} disabled={disabled} onChange={value => onChange({ adjustments: { ...adjustments, [key]: value } })} />)}</div>
  }
  return <div className="smart-filter-params">{settings.map(({ key, scale, defaultValue, ...control }) =>
    <FilterNumber key={key} {...control} value={(filter[key] ?? defaultValue ?? 0) * (scale ?? 1)} disabled={disabled}
      onChange={value => onChange({ [key]: value / (scale ?? 1) })} />)}
    {filter.kind === 'duotone' ? <div className="smart-filter-colors">
      <label>阴影色<input type="color" value={filter.shadowColor ?? duotoneDefaults.shadowColor} disabled={disabled}
        onChange={event => onChange({ shadowColor: event.currentTarget.value })} /></label>
      <label>高光色<input type="color" value={filter.highlightColor ?? duotoneDefaults.highlightColor} disabled={disabled}
        onChange={event => onChange({ highlightColor: event.currentTarget.value })} /></label>
    </div> : null}
  </div>
}

function FilterNumber({ label, min, max, step = 1, unit, slider = true, value, disabled, onChange }: {
  label: string; min: number; max: number; step?: number; unit?: string; slider?: boolean;
  value: number; disabled: boolean; onChange: (value: number) => void
}) {
  const update = (next: number) => {
    // Clamp again after snapping for fractional rectangle bounds.
    onChange(Math.max(min, Math.min(max, Number((Math.round(next / step) * step).toFixed(4)))))
  }
  return <div className="smart-filter-number">
    <span>{label}</span>
    {slider ? <input type="range" aria-label={`${label}滑杆`} min={min} max={max} step={step} value={value}
      disabled={disabled || min === max} onChange={event => update(event.currentTarget.valueAsNumber)} /> : <span />}
    <NumericScrubber label={label} value={value} min={min} max={max} step={step} unit={unit} disabled={disabled} onChange={update} />
  </div>
}

function FilterScope({ chain, canCapture, disabled, onChange, onCapture }: {
  chain: SmartFilterChain; canCapture: boolean; disabled: boolean; onChange: (update: (chain: SmartFilterChain) => SmartFilterChain) => void; onCapture: () => void
}) {
  const mask = chain.mask ?? { enabled: false, inverted: false, rect: { x: 0, y: 0, width: 100, height: 100 } }
  const rect = mask.rect
  const controls = [
    { key: 'x', label: '水平位置', max: 100 },
    { key: 'y', label: '垂直位置', max: 100 },
    { key: 'width', label: '宽度', max: 100 - rect.x },
    { key: 'height', label: '高度', max: 100 - rect.y },
  ] as const
  return <>
    <p className="smart-filter-feedback">作用于此图层的整组智能滤镜。</p>
    <div className="smart-filter-scope-selection">
      <span>{chain.selection ? '已使用选区快照' : '选区'}</span>
      <button type="button" disabled={disabled || !canCapture} title={canCapture ? undefined : '请先在画布上建立选区'} onClick={onCapture}>使用当前选区</button>
      {chain.selection ? <button type="button" disabled={disabled} onClick={() => onChange(current => ({ ...current, selection: undefined }))}>清除选区</button> : null}
    </div>
    <label className="smart-filter-check"><Checkbox checked={mask.enabled} disabled={disabled} onChange={event => {
      const enabled = event.currentTarget.checked
      onChange(current => ({ ...current, mask: { ...mask, enabled } }))
    }} />矩形蒙版</label>
    {mask.enabled ? <>
      <div className="smart-filter-params">{controls.map(({ key, label, max }) => <FilterNumber
        key={key} label={label} min={0} max={max} step={.1} unit="%" value={rect[key]} disabled={disabled}
        onChange={value => {
          const next = { ...rect, [key]: value }
          if (key === 'x') next.width = Math.min(rect.width, 100 - value)
          if (key === 'y') next.height = Math.min(rect.height, 100 - value)
          onChange(current => ({ ...current, mask: { ...mask, rect: next } }))
        }} />)}</div>
      <label className="smart-filter-check"><Checkbox checked={mask.inverted} disabled={disabled} onChange={event => {
        const inverted = event.currentTarget.checked
        onChange(current => ({ ...current, mask: { ...mask, inverted } }))
      }} />反向</label>
    </> : null}
  </>
}
