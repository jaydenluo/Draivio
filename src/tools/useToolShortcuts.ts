import { useEffect, useRef } from 'react'
import { useEditor, type Tool } from '../state/editor'
import { getToolGroup } from './toolRegistry'
import type { ToolId } from './toolTypes'

/** Emitted when Escape cancels an in-progress canvas gesture. */
export const TOOL_CANCEL_EVENT = 'draivio:cancel'
export const CANVAS_FIT_EVENT = 'draivio:fit-canvas'

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'select', m: 'rectangle-select', l: 'lasso-select', p: 'pen',
  b: 'brush', e: 'eraser', q: 'mask', c: 'crop', t: 'text',
  i: 'picker', h: 'pan', z: 'zoom', r: 'rotate',
}

function isEditingText(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  let node: Element | null = target
  while (node) {
    const element = node as HTMLElement
    if (node.matches('input, textarea, select, [role="textbox"]')) return true
    // JSDOM may not reflect `element.contentEditable = "true"` as an
    // attribute, so inspect both the property and each ancestor explicitly.
    if (element.isContentEditable || element.contentEditable === 'true') return true
    if (node.hasAttribute('contenteditable') && node.getAttribute('contenteditable') !== 'false') return true
    node = node.parentElement
  }
  return false
}

function nextTool(current: Tool, start: ToolId): ToolId {
  const group = getToolGroup(start)
  if (!group) return start
  const tools = group.tools.map((tool) => tool.id).filter((id) => id !== 'selection') as ToolId[]
  const index = tools.indexOf(current)
  return tools[(index + 1) % tools.length] ?? start
}

export function useToolShortcuts() {
  const { state, dispatch } = useEditor()
  const heldSpaceTool = useRef<Tool | null>(null)
  const lastToolKey = useRef<string | null>(null)
  const composing = useRef(false)

  useEffect(() => {
    const restoreTool = () => {
      if (heldSpaceTool.current === null) return
      dispatch({ type: 'set-temporary-tool', tool: heldSpaceTool.current })
      heldSpaceTool.current = null
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (composing.current || event.isComposing || event.keyCode === 229) return
      const key = event.key.toLowerCase()
      if (isEditingText(event.target) || isEditingText(document.activeElement)) return

      if (event.metaKey || event.ctrlKey) {
        if (event.altKey) return
        if (key === 'z') {
          event.preventDefault()
          dispatch({ type: event.shiftKey ? 'redo' : 'undo' })
        } else if (key === '+' || key === '=' || key === '-') {
          event.preventDefault()
          dispatch({ type: 'set-zoom', zoom: state.zoom + (key === '-' ? -10 : 10) })
        } else if (key === '0') {
          event.preventDefault()
          window.dispatchEvent(new Event(CANVAS_FIT_EVENT))
        } else if (key === '1') {
          event.preventDefault()
          dispatch({ type: 'set-zoom', zoom: 100 })
        }
        return
      }

      if (event.altKey && key !== 'escape') return
      if (key === ' ' || key === 'spacebar') {
        if (heldSpaceTool.current !== null) return
        event.preventDefault()
        heldSpaceTool.current = state.activeTool
        dispatch({ type: 'set-temporary-tool', tool: 'pan' })
        return
      }
      if (key === 'escape') {
        const cancelled = !window.dispatchEvent(new CustomEvent(TOOL_CANCEL_EVENT, { cancelable: true }))
        if (!cancelled && !event.defaultPrevented && state.selectionVisible) dispatch({ type: 'set-selection-visible', visible: false })
        return
      }
      if (heldSpaceTool.current !== null || event.repeat) return
      const tool = TOOL_KEYS[key]
      if (!tool) return
      event.preventDefault()
      const group = getToolGroup(tool)
      const cycle = group && state.activeToolGroup === group.id && (event.shiftKey || lastToolKey.current === key)
      dispatch({ type: 'select-tool', tool: cycle ? nextTool(state.activeTool, tool) : tool })
      lastToolKey.current = key
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key.toLowerCase() === 'spacebar') restoreTool()
    }

    const onCompositionStart = () => { composing.current = true }
    const onCompositionEnd = () => { composing.current = false }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', restoreTool)
    window.addEventListener('compositionstart', onCompositionStart)
    window.addEventListener('compositionend', onCompositionEnd)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', restoreTool)
      window.removeEventListener('compositionstart', onCompositionStart)
      window.removeEventListener('compositionend', onCompositionEnd)
    }
  }, [dispatch, state.activeTool, state.activeToolGroup, state.selectionVisible, state.zoom])
}
