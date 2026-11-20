import { useRef, useState } from 'react'
import { LayerVisibilityIcon } from '../components/LayerIcons'
import { smartFilterNames, type SmartFilterChain } from '../render/filterPipeline'
import { useEditor, type Layer } from '../state/editor'
import { LayerMenu, type LayerMenuItem } from './LayerMenu'
import { useSmartFilterEditor } from './SmartFilterEditor'
import { filterAddItems, filterAddUnavailableReason, filterScopeLabel, filterSummary, filterUnavailableReason, type AddableFilter } from './smartFilterControls'
import './smart-filters.css'

type Menu = { trigger: HTMLButtonElement } & ({ kind: 'add' | 'scope' } | { kind: 'filter'; filterId: string })
const dragType = 'application/x-draivio-smart-filter'

export function SmartFilters({ layer, id }: { layer: Layer; id: string }) {
  const { state, dispatch } = useEditor()
  const { open } = useSmartFilterEditor()
  const [menu, setMenu] = useState<Menu | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const dragged = useRef<string | null>(null)
  const chain = layer.smartFilters
  const reason = filterUnavailableReason(state, layer)
  const addReason = filterAddUnavailableReason(state, layer)
  if (!chain?.items.length || layer.children || layer.kind === 'adjustment') return null
  const items = chain.items
  const scopeLabel = filterScopeLabel(chain)
  const commit = (next: SmartFilterChain) => dispatch({ type: 'set-smart-filters', id: layer.id, chain: next, expectedLayer: layer })
  const move = (source: string, destination: string) => {
    const from = items.findIndex(item => item.id === source)
    const to = items.findIndex(item => item.id === destination)
    if (reason || from < 0 || to < 0 || from === to) return
    const reordered = [...items]
    reordered.splice(to, 0, reordered.splice(from, 1)[0])
    commit({ ...chain, items: reordered })
  }
  const finishDrag = () => { dragged.current = null; setDropId(null) }
  const menuIndex = menu?.kind === 'filter' ? items.findIndex(item => item.id === menu.filterId) : -1
  const scopeItems: LayerMenuItem[] = [
    { id: 'full-layer', label: '全图层', disabled: !!reason || scopeLabel === '全图层' },
    { id: 'local-scope', label: '设置局部范围…', disabled: !!reason },
  ]
  const menuItems: LayerMenuItem[] = menu?.kind === 'scope' ? scopeItems : menu?.kind === 'add' ? filterAddItems() : [
    { id: 'up', label: '上移', disabled: !!reason || menuIndex === 0 },
    { id: 'down', label: '下移', disabled: !!reason || menuIndex === items.length - 1 },
    { id: 'delete', label: '删除滤镜', danger: true, section: 'delete', disabled: !!reason },
  ]
  const menuAction = (id: string) => {
    if (menu?.kind === 'scope' && !reason) {
      if (id === 'local-scope') open(layer.id, menu.trigger, { scope: true })
      if (id === 'full-layer') commit({ ...chain, selection: undefined, mask: chain.mask && { ...chain.mask, enabled: false } })
      return
    }
    if (id.startsWith('filter-add:') && menu?.kind === 'add' && !addReason) {
      open(layer.id, menu.trigger, { kind: id.slice('filter-add:'.length) as AddableFilter })
      return
    }
    if (menuIndex < 0 || reason) return
    const selected = items[menuIndex]
    if (id === 'delete') commit({ ...chain, items: items.filter(item => item.id !== selected.id) })
    if (id === 'up' && menuIndex > 0) move(selected.id, items[menuIndex - 1].id)
    if (id === 'down' && menuIndex + 1 < items.length) move(selected.id, items[menuIndex + 1].id)
  }
  const rect = menu?.trigger.getBoundingClientRect()
  return <div id={id} className="smart-filters"
    onKeyDown={event => {
      if (!(event.target as Element).closest('[role="menu"]') && ['ArrowUp', 'ArrowDown'].includes(event.key)) event.stopPropagation()
    }}>
    <div className="smart-filter-heading">
      <span className="smart-filter-heading-label">智能滤镜</span>
      <button type="button" className="smart-filter-scope" aria-label={`作用范围：${scopeLabel}`}
        aria-haspopup="menu" aria-expanded={menu?.kind === 'scope'} title={reason ?? `作用范围：${scopeLabel}`}
        disabled={!!reason} onClick={event => setMenu(menu?.kind === 'scope' ? null : { kind: 'scope', trigger: event.currentTarget })}
        onKeyDown={event => {
          if (event.key !== 'ArrowDown') return
          event.preventDefault()
          setMenu({ kind: 'scope', trigger: event.currentTarget })
        }}>
        <span>{scopeLabel}</span>
      </button>
      <button type="button" className="smart-filter-icon" aria-label="添加智能滤镜" aria-haspopup="menu"
        aria-expanded={menu?.kind === 'add'} title={addReason ?? '添加智能滤镜'} disabled={!!addReason}
        onClick={event => setMenu(menu?.kind === 'add' ? null : { kind: 'add', trigger: event.currentTarget })}>＋</button>
    </div>
    <ol className="smart-filter-list" aria-label={`${layer.name}的智能滤镜`}>
        {items.map(filter => {
          const name = smartFilterNames[filter.kind]
          const summary = filterSummary(filter)
          const label = `${filter.enabled ? '停用' : '启用'}${name}`
          return <li key={filter.id} className={`${filter.enabled ? '' : 'is-off'}${dropId === filter.id ? ' is-drop-target' : ''}`}
            draggable={!reason} onDragStart={event => {
              event.stopPropagation()
              if (reason) { event.preventDefault(); return }
              dragged.current = filter.id
              if (event.dataTransfer) { event.dataTransfer.setData(dragType, filter.id); event.dataTransfer.effectAllowed = 'move' }
            }}
            onDragOver={event => {
              if (!dragged.current || dragged.current === filter.id || reason) return
              event.preventDefault()
              event.stopPropagation()
              setDropId(filter.id)
            }}
            onDragEnd={finishDrag} onDrop={event => {
              if (!dragged.current) return
              event.preventDefault()
              event.stopPropagation()
              move(dragged.current, filter.id)
              finishDrag()
            }}>
            <button type="button" className="smart-filter-icon" aria-label={label} title={reason ?? label} disabled={!!reason}
              onClick={() => commit({ ...chain, items: items.map(item => item.id === filter.id ? { ...item, enabled: !item.enabled } : item) })}>
              <LayerVisibilityIcon visible={filter.enabled} />
            </button>
            <button type="button" className="smart-filter-name" aria-label={`编辑${name}`} title={reason ?? `编辑${name}`}
              disabled={!!reason} onClick={event => open(layer.id, event.currentTarget, { filterId: filter.id })}>
              <span>{name}</span>{summary ? <small>{summary}</small> : null}
            </button>
            <button type="button" className="smart-filter-icon" aria-label={`${name}更多操作`} aria-haspopup="menu"
              aria-expanded={menu?.kind === 'filter' && menu.filterId === filter.id} title={reason ?? '更多操作'} disabled={!!reason}
              onClick={event => setMenu(menu?.kind === 'filter' && menu.filterId === filter.id ? null : { kind: 'filter', trigger: event.currentTarget, filterId: filter.id })}>⋯</button>
          </li>
        })}
      </ol>
    {menu && rect ? <LayerMenu x={menu.kind === 'scope' ? rect.left : rect.right - 218} y={rect.bottom + 4} trigger={menu.trigger}
      label={{ add: '添加智能滤镜', filter: '滤镜操作', scope: '作用范围' }[menu.kind]} items={menuItems}
      className={menu.kind === 'scope' ? 'smart-filter-scope-menu' : ''} onClose={() => setMenu(null)} onAction={menuAction}
      showSectionLabels={menu.kind === 'add'} /> : null}
  </div>
}
