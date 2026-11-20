import { useEffect, useRef } from 'react'
import { useEditor, type Tool } from '../state/editor'
import { commands, matchesShortcut, toolCommandForKey } from '../commands/shortcuts'
import { executeEditorCommand } from '../commands/editorCommands'

/** Emitted when Escape cancels an in-progress canvas gesture. */
export const TOOL_CANCEL_EVENT = 'draivio:cancel'
export const CANVAS_FIT_EVENT = 'draivio:fit-canvas'

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

export function useToolShortcuts() {
  const { state, dispatch } = useEditor()
  const heldSpaceTool = useRef<Tool | null>(null)
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

      if (event.defaultPrevented || document.querySelector('.result-stage') || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (heldSpaceTool.current !== null && key !== 'escape') return
      if (event.repeat && key !== ' ') return
      if ((event.target as Element)?.closest?.('[role="menu"]')) return
      const command = commands.find(command => matchesShortcut(event, command.id))
      if (command && executeEditorCommand(toolCommandForKey(command.id, state.activeTool, event), state, dispatch)) {
        event.preventDefault()
        return
      }
      if (event.metaKey || event.ctrlKey) return

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
        if (!cancelled && !event.defaultPrevented && state.selectionVisible) dispatch({ type: 'clear-selection' })
        return
      }
      if (heldSpaceTool.current !== null || event.repeat) return

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
  }, [dispatch, state])
}
