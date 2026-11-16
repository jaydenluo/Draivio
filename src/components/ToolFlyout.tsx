import { useLayoutEffect, useRef, useState } from 'react'
import type { ToolGroupDefinition, ToolId } from '../tools/toolTypes'
import { ToolIcon } from './ToolIcon'

type ToolFlyoutProps = { group: ToolGroupDefinition; selectedToolId: ToolId; anchor: HTMLElement | null; onSelect: (toolId: ToolId) => void; onClose: () => void; recentColors?: string[]; onColorSelect?: (color: string) => void }

export function ToolFlyout({ group, selectedToolId, anchor, onSelect, onClose, recentColors = [], onColorSelect }: ToolFlyoutProps) {
  const flyoutRef = useRef<HTMLDivElement>(null)
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [placement, setPlacement] = useState<'right' | 'left'>('right')
  const [position, setPosition] = useState({ top: 0, left: 0 })
  useLayoutEffect(() => {
    if (!anchor) return
    const anchorRect = anchor.getBoundingClientRect()
    const flyoutWidth = flyoutRef.current?.offsetWidth || 190
    const flyoutHeight = flyoutRef.current?.offsetHeight || group.tools.length * 38 + 20
    const gap = 8
    const fitsRight = anchorRect.right + gap + flyoutWidth <= window.innerWidth
    const left = fitsRight ? anchorRect.right + gap : Math.max(8, anchorRect.left - flyoutWidth - gap)
    const top = Math.min(Math.max(8, anchorRect.top), Math.max(8, window.innerHeight - flyoutHeight - 8))
    setPlacement(fitsRight ? 'right' : 'left')
    setPosition({ top, left })
  }, [anchor, group.tools.length])
  useLayoutEffect(() => { itemRefs.current[group.tools.findIndex((tool) => tool.id === selectedToolId)]?.focus() }, [group, selectedToolId])
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const items = itemRefs.current
    const currentIndex = items.findIndex((item) => item === document.activeElement)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowDown': nextIndex = (currentIndex + 1) % items.length; break
      case 'ArrowUp': nextIndex = (currentIndex - 1 + items.length) % items.length; break
      case 'Home': nextIndex = 0; break
      case 'End': nextIndex = items.length - 1; break
      default: return
    }
    event.preventDefault()
    items[nextIndex]?.focus()
  }
  return <div ref={flyoutRef} className={`tool-flyout tool-flyout-${placement}`} role="menu" aria-label={`${group.label}工具`} style={{ top: position.top, left: position.left }} onPointerDown={(event) => event.stopPropagation()} onKeyDown={handleKeyDown}>
    <div className="tool-flyout-heading">{group.label}</div>
    {group.tools.map((definition, index) => <button key={definition.id} ref={(node) => { itemRefs.current[index] = node }} type="button" role="menuitem" className={`tool-flyout-item ${definition.id === selectedToolId ? 'active' : ''}`} aria-label={`${definition.label}${definition.shortcut ? ` (${definition.shortcut})` : ''}`} aria-pressed={definition.id === selectedToolId} onClick={() => { onSelect(definition.id); onClose() }}>
      <ToolIcon toolId={definition.id} /><span>{definition.label}</span>{definition.shortcut ? <kbd>{definition.shortcut}</kbd> : null}
    </button>)}
    {group.id === 'color-fill' ? <div className="recent-color-palette" role="group" aria-label="最近取色"><span>最近取色</span>{recentColors.length ? <div className="recent-color-swatches">{recentColors.map((color) => <button key={color} type="button" aria-label={`最近颜色 ${color}`} title={color} style={{ backgroundColor: color }} onClick={() => { onColorSelect?.(color); onClose() }} />)}</div> : <small>取色后会保留最近 20 个颜色</small>}</div> : null}
  </div>
}
