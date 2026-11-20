import { createPortal } from 'react-dom'
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type ComponentType, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { PanelHeaderTarget } from './PanelHeader'
import { movePanel, resizePair, restoreLayout, type DockGroup, type DockTarget } from './dockLayout'
import './dockWorkspace.css'

export type DockPanelDefinition = { id: string; title: string; component: ComponentType }
type Gesture = { panel: string; x: number; y: number; moved: boolean; pointerId?: number }
type Resize = { first: string; second: string; y: number; firstHeight: number; secondHeight: number; firstWeight: number; secondWeight: number; pointerId?: number }
const HEADER_HEIGHT = 32

/** Registered panel bodies keep one stable portal host even when regrouped. */
export function DockWorkspace({ panels, storageKey, selectedPanel, activationKey, onSelect }: {
  panels: DockPanelDefinition[]; storageKey?: string; selectedPanel?: string; activationKey?: number; onSelect?: (id: string) => void
}) {
  const [groups, setGroups] = useState<DockGroup[]>(() => {
    let saved: unknown
    try { saved = storageKey ? JSON.parse(localStorage.getItem(storageKey) ?? 'null') : null } catch { /* Use registered defaults. */ }
    const layout = restoreLayout(saved, panels.map(panel => panel.id))
    if (!saved && selectedPanel) for (const group of layout) if (group.tabs.includes(selectedPanel)) group.active = selectedPanel
    return layout
  })
  const currentGroups = useRef(groups); currentGroups.current = groups
  const definitions = useRef(panels); definitions.current = panels
  const groupElements = useRef(new Map<string, HTMLElement>())
  const bodySlots = useRef(new Map<string, HTMLDivElement>())
  const hosts = useRef(new Map<string, HTMLDivElement>())
  const headerHosts = useRef(new Map<string, HTMLDivElement>())
  const headerSlots = useRef(new Map<string, HTMLDivElement>())
  for (const panel of panels) if (!hosts.current.has(panel.id)) {
    const host = document.createElement('div'); host.className = 'dock-panel-host'; host.dataset.panelId = panel.id
    hosts.current.set(panel.id, host)
    const header = document.createElement('div'); header.className = 'dock-panel-header-tools'; header.dataset.panelHeader = panel.id
    headerHosts.current.set(panel.id, header)
  }
  const gesture = useRef<Gesture | null>(null), resize = useRef<Resize | null>(null)
  const suppressClick = useRef(false)
  const [preview, setPreview] = useState<{ panel: string; x: number; y: number } | null>(null)
  const [target, setTarget] = useState<DockTarget | null>(null)
  const [resizing, setResizing] = useState(false)
  const root = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    for (const [id, host] of hosts.current) if (!panels.some(panel => panel.id === id)) { host.remove(); hosts.current.delete(id); headerHosts.current.get(id)?.remove(); headerHosts.current.delete(id) }
    for (const group of groups) for (const id of group.tabs) {
      const host = hosts.current.get(id), slot = bodySlots.current.get(group.id)
      if (host && slot) {
        if (host.parentElement !== slot) slot.append(host)
        host.hidden = group.collapsed || id !== group.active
      }
      const header = headerHosts.current.get(id), headerSlot = headerSlots.current.get(group.id)
      if (header && headerSlot) {
        if (header.parentElement !== headerSlot) headerSlot.append(header)
        header.hidden = id !== group.active
      }
    }
  }, [groups, panels])
  useEffect(() => {
    if (storageKey) try { localStorage.setItem(storageKey, JSON.stringify(groups)) } catch { /* Layout still works for this session. */ }
  }, [groups, storageKey])
  const previousSelection = useRef({ panel: selectedPanel, key: activationKey })
  useEffect(() => {
    if (previousSelection.current.panel === selectedPanel && previousSelection.current.key === activationKey) return
    previousSelection.current = { panel: selectedPanel, key: activationKey }
    if (!selectedPanel) return
    setGroups(value => value.map(group => group.tabs.includes(selectedPanel) ? { ...group, active: selectedPanel, collapsed: false } : group))
  }, [selectedPanel, activationKey])
  const panelIds = panels.map(panel => panel.id).join('|')
  useEffect(() => { setGroups(value => restoreLayout(value, definitions.current.map(panel => panel.id))) }, [panelIds])

  const hitTarget = (x: number, y: number): DockTarget | null => {
    for (const group of currentGroups.current) {
      const element = groupElements.current.get(group.id), rect = element?.getBoundingClientRect()
      if (!rect || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) continue
      const edge = Math.min(56, rect.height * .23)
      const placement = y < rect.top + edge ? 'before' : y > rect.bottom - edge ? 'after' : 'merge'
      const tab = document.elementFromPoint?.(x, y)?.closest<HTMLElement>('[data-dock-tab]')
      // A tab label is always a merge target, even near a group's upper edge.
      return { groupId: group.id, placement: tab ? 'merge' : placement, beforeTab: tab?.dataset.dockTab }
    }
    return null
  }
  const applyResize = (drag: Resize, delta: number) => {
    const [a, b] = resizePair(drag.firstHeight, drag.secondHeight, delta, 110)
    const total = drag.firstWeight + drag.secondWeight
    const bodyTotal = Math.max(1, a + b - HEADER_HEIGHT * 2)
    setGroups(value => value.map(group => group.id === drag.first ? { ...group, weight: total * Math.max(1, a - HEADER_HEIGHT) / bodyTotal } : group.id === drag.second ? { ...group, weight: total * Math.max(1, b - HEADER_HEIGHT) / bodyTotal } : group))
  }
  useEffect(() => {
    const matching = (event: MouseEvent | PointerEvent, id?: number) => id === undefined ? !event.type.startsWith('pointer') : 'pointerId' in event && event.pointerId === id
    const move = (event: MouseEvent | PointerEvent) => {
      const size = resize.current
      if (size && matching(event, size.pointerId)) { event.preventDefault(); applyResize(size, event.clientY - size.y); return }
      const drag = gesture.current
      if (!drag || !matching(event, drag.pointerId)) return
      if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return
      drag.moved = true; suppressClick.current = true
      event.preventDefault()
      setPreview({ panel: drag.panel, x: event.clientX, y: event.clientY })
      setTarget(hitTarget(event.clientX, event.clientY))
    }
    const finish = (event: MouseEvent | PointerEvent) => {
      if (resize.current && matching(event, resize.current.pointerId)) { resize.current = null; setResizing(false) }
      const drag = gesture.current
      if (!drag || !matching(event, drag.pointerId)) return
      gesture.current = null; setPreview(null); setTarget(null)
      // Ignore the native click immediately following pointer-up, not the next deliberate click.
      setTimeout(() => { suppressClick.current = false }, 0)
      if (!drag.moved || event.type === 'pointercancel') return
      const destination = hitTarget(event.clientX, event.clientY)
      if (destination) setGroups(value => movePanel(value, drag.panel, destination.groupId, destination.placement, destination.beforeTab))
    }
    const cancel = () => { gesture.current = null; resize.current = null; setPreview(null); setTarget(null); setResizing(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    document.addEventListener('pointermove', move, { passive: false }); document.addEventListener('mousemove', move, { passive: false })
    document.addEventListener('pointerup', finish); document.addEventListener('mouseup', finish); document.addEventListener('pointercancel', finish)
    document.addEventListener('keydown', key); window.addEventListener('blur', cancel)
    return () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('mousemove', move)
      document.removeEventListener('pointerup', finish); document.removeEventListener('mouseup', finish); document.removeEventListener('pointercancel', finish)
      document.removeEventListener('keydown', key); window.removeEventListener('blur', cancel)
    }
  }, [])
  const start = (panel: string, event: ReactPointerEvent | ReactMouseEvent) => {
    if (event.button !== 0 || gesture.current || resize.current) return
    event.preventDefault()
    suppressClick.current = false
    gesture.current = { panel, x: event.clientX, y: event.clientY, moved: false, pointerId: 'pointerId' in event ? event.pointerId : undefined }
    if ('pointerId' in event) event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const select = (groupId: string, panel: string) => {
    if (suppressClick.current) { suppressClick.current = false; return }
    setGroups(value => value.map(group => group.id === groupId ? { ...group, active: panel, collapsed: group.active === panel ? !group.collapsed : false } : group))
    if (currentGroups.current.find(group => group.id === groupId)?.active !== panel) onSelect?.(panel)
  }
  const startResize = (first: DockGroup, second: DockGroup, event: ReactPointerEvent | ReactMouseEvent) => {
    if (event.button !== 0 || resize.current || gesture.current) return
    event.preventDefault()
    resize.current = { first: first.id, second: second.id, y: event.clientY, firstHeight: groupElements.current.get(first.id)?.getBoundingClientRect().height ?? 200, secondHeight: groupElements.current.get(second.id)?.getBoundingClientRect().height ?? 200, firstWeight: first.weight, secondWeight: second.weight, pointerId: 'pointerId' in event ? event.pointerId : undefined }
    setResizing(true)
  }
  const title = (id: string) => panels.find(panel => panel.id === id)?.title ?? id
  const startHeader = (panel: string, event: ReactPointerEvent | ReactMouseEvent) => {
    if ((event.target as Element).closest('button,input,select,textarea,a,[role="button"],[contenteditable="true"]')) return
    start(panel, event)
  }
  return <div ref={root} className={`dock-workspace${preview ? ' is-dragging' : ''}${resizing ? ' is-resizing-panels' : ''}`} style={{'--dock-header-height': `${HEADER_HEIGHT}px`} as CSSProperties} aria-label="面板工作区">
    {groups.map((group, index) => <Fragment key={group.id}>
      {index > 0 ? <div className="dock-splitter" role="separator" aria-label={`调整${title(groups[index - 1].active)}与${title(group.active)}面板高度`} aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(100 * groups[index - 1].weight / (groups[index - 1].weight + group.weight))} aria-disabled={groups[index - 1].collapsed || group.collapsed} tabIndex={0}
        onPointerDown={event => { if (!groups[index - 1].collapsed && !group.collapsed) startResize(groups[index - 1], group, event) }}
        onMouseDown={event => { if (!groups[index - 1].collapsed && !group.collapsed) startResize(groups[index - 1], group, event) }}
        onKeyDown={event => {
          if (!['ArrowUp', 'ArrowDown'].includes(event.key) || groups[index - 1].collapsed || group.collapsed) return
          event.preventDefault()
          applyResize({ first: groups[index - 1].id, second: group.id, y: 0, firstHeight: groupElements.current.get(groups[index - 1].id)?.getBoundingClientRect().height ?? 200, secondHeight: groupElements.current.get(group.id)?.getBoundingClientRect().height ?? 200, firstWeight: groups[index - 1].weight, secondWeight: group.weight }, event.key === 'ArrowDown' ? 20 : -20)
        }} /> : null}
      <section ref={element => { if (element) groupElements.current.set(group.id, element); else groupElements.current.delete(group.id) }} className={`dock-group${group.tabs.length === 1 ? ' is-single' : ''}${group.collapsed ? ' is-collapsed' : ''}`} style={{ flexGrow: group.collapsed ? 0 : group.weight / groups.reduce((sum, item) => sum + (item.collapsed ? 0 : item.weight), 0) }} aria-label={`${group.tabs.map(title).join(' / ')}面板组`} data-dock-group={group.id}>
        <div className="dock-header" onPointerDown={event => startHeader(group.active, event)} onMouseDown={event => startHeader(group.active, event)}>
        <nav className="dock-tabs inspector-tabs" aria-label="操作面板标签">
          {group.tabs.map(id => <button type="button" key={id} data-dock-tab={id} title="拖动：上下边缘排序，中间合并；点击折叠或展开" className={`property-tab${group.active === id ? ' active' : ''}`} aria-selected={group.active === id} aria-expanded={group.active === id && !group.collapsed} onPointerDown={event => start(id, event)} onMouseDown={event => start(id, event)} onClick={() => select(group.id, id)}>{title(id)}</button>)}
        </nav>
        <div className="dock-header-context" ref={element => { if (element) headerSlots.current.set(group.id, element); else headerSlots.current.delete(group.id) }} />
        </div>
        <div className="dock-group-body" ref={element => { if (element) bodySlots.current.set(group.id, element); else bodySlots.current.delete(group.id) }} hidden={group.collapsed} />
        {target?.groupId === group.id ? <div className={`dock-drop-indicator dock-drop-${target.placement}`} aria-hidden="true"><span>{target.placement === 'merge' ? '合并为标签组' : target.placement === 'before' ? '放到上方' : '放到下方'}</span></div> : null}
      </section>
    </Fragment>)}
    {panels.map(({id, component: Panel}) => createPortal(<PanelHeaderTarget.Provider value={{host:headerHosts.current.get(id)!,startDrag:event=>startHeader(id,event),reveal:()=>setGroups(value=>value.map(group=>group.tabs.includes(id)&&group.collapsed?{...group,collapsed:false}:group))}}><div className="inspector-panel-content"><Panel /></div></PanelHeaderTarget.Provider>, hosts.current.get(id)!, id))}
    {preview ? createPortal(<div className="inspector-drag-preview" data-testid="inspector-drag-preview" aria-hidden="true" style={{ left: Math.max(8, Math.min(preview.x + 16, window.innerWidth - 228)), top: Math.max(8, Math.min(preview.y + 16, window.innerHeight - 124)) }}><div className="inspector-drag-preview-title"><span>⠿</span>{title(preview.panel)}</div><div className="inspector-drag-preview-body"><span /><span /><span /></div></div>, document.body) : null}
  </div>
}
