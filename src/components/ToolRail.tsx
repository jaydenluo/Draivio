import { useEffect, useRef, useState } from 'react'
import { TOOL_GROUPS, toolRegistry } from '../tools/toolRegistry'
import { useEditor, type Tool } from '../state/editor'
import type { ToolGroupDefinition } from '../tools/toolTypes'
import { ToolFlyout } from './ToolFlyout'
import { ToolIcon } from './ToolIcon'

const LONG_PRESS_MS = 250

export function ToolGroupEntry({ group, active, selectedToolId, expanded = false, onSelect, onOpen }: { group: ToolGroupDefinition; active: boolean; selectedToolId: Tool; expanded?: boolean; onSelect: (tool: Tool) => void; onOpen: (group: ToolGroupDefinition, anchor: HTMLElement) => void }) {
  const mainButtonRef = useRef<HTMLButtonElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressRef = useRef(false)
  const selectedDefinition = group.tools.find((definition) => definition.id === selectedToolId) ?? group.tools[0]
  const clearLongPress = () => { if (timerRef.current) clearTimeout(timerRef.current); timerRef.current = null }
  useEffect(() => { window.addEventListener('blur', clearLongPress); return () => { clearLongPress(); window.removeEventListener('blur', clearLongPress) } }, [])
  const handlePointerDown = (event: React.PointerEvent) => { longPressRef.current = false; clearLongPress(); if (event.button !== 0 || group.tools.length < 2) return; timerRef.current = setTimeout(() => { longPressRef.current = true; if (mainButtonRef.current) onOpen(group, mainButtonRef.current) }, LONG_PRESS_MS) }
  const handleClick = () => { clearLongPress(); if (longPressRef.current) { longPressRef.current = false; return }; onSelect(selectedDefinition.id) }
  return <div className={`tool-group-entry ${active ? 'active' : ''}`}>
    <button ref={mainButtonRef} type="button" className={`tool-group-button ${active ? 'active' : ''}`} aria-label={`工具组：${group.label}`} aria-pressed={active} onPointerDown={handlePointerDown} onPointerUp={clearLongPress} onPointerCancel={clearLongPress} onPointerLeave={clearLongPress} onClick={handleClick}><ToolIcon toolId={selectedDefinition.id} /><small>{group.label}</small></button>
    {group.tools.length > 1 ? <button type="button" className={`tool-group-menu-trigger ${expanded ? 'expanded' : ''}`} aria-label={`打开工具组菜单：${group.label}`} aria-haspopup="menu" aria-expanded={expanded} onClick={(event) => { event.stopPropagation(); onOpen(group, event.currentTarget) }}><span aria-hidden="true" /></button> : null}
  </div>
}

export function ToolRail() {
  const { state, dispatch } = useEditor()
  const activeGroup = toolRegistry[state.activeToolGroup] ?? TOOL_GROUPS[0]
  const [openGroupId, setOpenGroupId] = useState<typeof activeGroup.id | null>(null)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const railRef = useRef<HTMLElement>(null)
  const openFlyout = (group: ToolGroupDefinition, nextAnchor: HTMLElement) => { setOpenGroupId(group.id); setAnchor(nextAnchor) }
  const closeFlyout = (restoreFocus = false) => { if (restoreFocus) anchor?.focus(); setOpenGroupId(null); setAnchor(null) }
  const selectTool = (tool: Tool) => { closeFlyout(); dispatch({ type: 'select-tool', tool }) }
  useEffect(() => {
    if (!openGroupId) return
    const handlePointerDown = (event: PointerEvent) => { if (!railRef.current?.contains(event.target as Node)) closeFlyout() }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); closeFlyout(true) } }
    document.addEventListener('pointerdown', handlePointerDown); document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown) }
  }, [openGroupId])
  const openGroup = openGroupId ? toolRegistry[openGroupId] : null
  const openSelectedTool = openGroup ? state.recentToolByGroup[openGroup.id] ?? openGroup.defaultToolId : null
  return <aside ref={railRef} className="tool-rail" aria-label="画布工具">
    <div className="tool-group-rail" aria-label="工具组">{TOOL_GROUPS.map((group) => <ToolGroupEntry key={group.id} group={group} active={group.id === activeGroup.id} expanded={group.id === openGroupId} selectedToolId={state.recentToolByGroup[group.id] ?? group.defaultToolId} onSelect={selectTool} onOpen={openFlyout} />)}</div>
    {openGroup && openSelectedTool ? <ToolFlyout group={openGroup} selectedToolId={openSelectedTool} anchor={anchor} recentColors={state.recentColors} onColorSelect={(color) => dispatch({ type: 'set-brush-color', color })} onSelect={selectTool} onClose={() => closeFlyout(true)} /> : null}
  </aside>
}
