import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor } from '../state/editor'
import type { GuideSettings } from '../document/guides'
import { ViewSettingsWindow } from './ViewSettingsWindow'
import './guideControls.css'

/** Compact view commands; coordinate editing lives in a separate draggable window. */
export function GuideControls({ disabled = false }: { disabled?: boolean }) {
  const { state, dispatch } = useEditor()
  const [open, setOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const focusLast = useRef(false)
  const menuId = useId()
  const settings = state.guideSettings
  const close = (focus = false) => { setOpen(false); if (focus) trigger.current?.focus() }
  const patch = (value: Partial<Omit<GuideSettings, 'guides'>>) => dispatch({ type: 'update-guide-settings', action: { type: 'settings', patch: value } })
  const add = (axis: 'x' | 'y') => {
    if (!settings.guidesVisible) patch({ guidesVisible: true })
    dispatch({ type: 'update-guide-settings', action: { type: 'add', guide: { id: crypto.randomUUID(), axis, position: (axis === 'x' ? state.documentWidth : state.documentHeight) / 2, locked: false } } })
  }
  useLayoutEffect(() => {
    if (!open) return
    const rect = trigger.current?.getBoundingClientRect()
    const surface = menu.current
    if (!rect || !surface) return
    const width = surface.offsetWidth || 224
    const height = surface.offsetHeight || 252
    const top = rect.top - height - 6
    setPosition({
      left: Math.max(8, Math.min(rect.right - width, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(top >= 8 ? top : rect.bottom + 6, window.innerHeight - height - 8)),
    })
    const items = surface.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    items[focusLast.current ? items.length - 1 : 0]?.focus()
  }, [open])
  useEffect(() => {
    if (!open) return
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) close()
    }
    const dismiss = () => close()
    document.addEventListener('pointerdown', outside)
    window.addEventListener('resize', dismiss)
    window.addEventListener('blur', dismiss)
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('resize', dismiss); window.removeEventListener('blur', dismiss) }
  }, [open])
  useEffect(() => { if (disabled) { setOpen(false); setSettingsOpen(false) } }, [disabled])

  const toggles = [
    { label: '标尺', checked: settings.rulersVisible, action: () => patch({ rulersVisible: !settings.rulersVisible }) },
    { label: '显示参考线', checked: settings.guidesVisible, action: () => patch({ guidesVisible: !settings.guidesVisible }) },
    { label: '显示网格', checked: settings.grid.enabled, action: () => patch({ grid: { ...settings.grid, enabled: !settings.grid.enabled } }) },
    { label: '吸附', checked: settings.snapEnabled, action: () => patch({ snapEnabled: !settings.snapEnabled }) },
  ]
  return <>
    <button ref={trigger} type="button" className="canvas-view-trigger" aria-label="视图" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} onClick={() => { focusLast.current = false; setOpen(!open) }} onKeyDown={event => {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); focusLast.current = event.key === 'ArrowUp'; setOpen(true) }
    }}>视图<svg viewBox="0 0 12 12" aria-hidden="true" className={open ? 'is-open' : ''}><path d="m3 4.5 3 3 3-3" /></svg></button>
    {open && !disabled ? createPortal(<div ref={menu} id={menuId} role="menu" aria-label="画布视图" className="canvas-view-menu" style={position} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return }
      if (event.key === 'Tab') { close(true); return }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
      event.preventDefault(); event.stopPropagation()
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
      const index = items.indexOf(document.activeElement as HTMLButtonElement)
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
    }}>
      {toggles.map(item => <button key={item.label} type="button" role="menuitemcheckbox" aria-checked={item.checked} onClick={() => { close(true); item.action() }}><span className="canvas-view-menu-mark" aria-hidden="true">{item.checked ? '✓' : ''}</span>{item.label}</button>)}
      <div role="separator" />
      <button type="button" role="menuitem" onClick={() => { close(true); add('x') }}><span className="canvas-view-menu-mark" aria-hidden="true">＋</span>新增垂直参考线</button>
      <button type="button" role="menuitem" onClick={() => { close(true); add('y') }}><span className="canvas-view-menu-mark" aria-hidden="true">＋</span>新增水平参考线</button>
      <div role="separator" />
      <button type="button" role="menuitem" onClick={() => { close(); setSettingsOpen(true) }}><span className="canvas-view-menu-mark" aria-hidden="true" />参考线与网格设置…</button>
    </div>, document.body) : null}
    {settingsOpen && !disabled ? <ViewSettingsWindow anchor={trigger} onClose={() => setSettingsOpen(false)} /> : null}
  </>
}
