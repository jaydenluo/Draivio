import { useEffect, useRef, useState } from 'react'
import { message } from '../ui/message'

type ContextMenuState = { x: number; y: number; text: string }

function editableElement(target: EventTarget | null): HTMLInputElement | HTMLTextAreaElement | HTMLElement | null {
  if (target instanceof Element) {
    const found = target.closest<HTMLInputElement | HTMLTextAreaElement | HTMLElement>('input,textarea,[contenteditable="true"],[role="textbox"]')
    if (found) return found
  }
  const active = document.activeElement
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLElement && (active.isContentEditable || active.getAttribute('role') === 'textbox')) return active
  return null
}

/** Returns the text that should be offered to the custom copy action. */
export function getSelectedText(target: EventTarget | null): string {
  const editable = editableElement(target)
  if (editable instanceof HTMLInputElement || editable instanceof HTMLTextAreaElement) {
    const start = editable.selectionStart ?? 0
    const end = editable.selectionEnd ?? 0
    return end > start ? editable.value.slice(start, end) : ''
  }
  const selected = window.getSelection()?.toString() ?? ''
  return selected.trim().length > 0 ? selected : ''
}

/** Copies text through the WebView clipboard, with a document fallback for older runtimes. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the hidden textarea for WebViews without clipboard permission.
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.inset = '0 auto auto 0'
  textarea.style.opacity = '0'
  document.body.append(textarea)
  textarea.select()
  let copied = false
  try { copied = document.execCommand?.('copy') ?? false } catch { copied = false }
  textarea.remove()
  return copied
}

function clamp(value: number, min: number, max: number) { return Math.min(Math.max(value, min), Math.max(min, max)) }
function copyShortcut() { return /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘C' : 'Ctrl+C' }

export function AppContextMenu() {
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      const target=event.target instanceof Element?event.target:null
      if(target?.closest('[data-canvas-context-menu],[role="menu"]')&&!target.closest('input,textarea,[contenteditable="true"],[role="textbox"]')) { setMenu(null); return }
      if ((event.target as Element)?.closest?.('[data-layer-row]') && !(event.target as Element)?.closest?.('input,textarea,[contenteditable="true"]')) { setMenu(null); return }
      const text = getSelectedText(event.target)
      if (!text) {
        setMenu(null)
        return
      }
      const menuWidth = 128
      const menuHeight = 42
      setMenu({
        text,
        x: clamp(event.clientX, 8, window.innerWidth - menuWidth - 8),
        y: clamp(event.clientY, 8, window.innerHeight - menuHeight - 8),
      })
    }
    window.addEventListener('contextmenu', handleContextMenu, true)
    return () => window.removeEventListener('contextmenu', handleContextMenu, true)
  }, [])

  useEffect(() => {
    if (!menu) return
    menuRef.current?.focus()
    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setMenu(null) }
    }
    const closeOnViewportChange = () => setMenu(null)
    document.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', closeOnViewportChange)
    window.addEventListener('scroll', closeOnViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', closeOnViewportChange)
      window.removeEventListener('scroll', closeOnViewportChange, true)
    }
  }, [menu])

  if (!menu) return null
  const handleCopy = async () => {
    const copied = await copyText(menu.text)
    if (copied) message.success('已复制')
    else message.error('复制失败，请重试')
    setMenu(null)
  }

  return <div ref={menuRef} className="app-context-menu" role="menu" aria-label="编辑菜单" tabIndex={-1} style={{ left: menu.x, top: menu.y }}>
    <button type="button" role="menuitem" aria-label="复制" onClick={handleCopy}>复制 <kbd aria-hidden="true">{copyShortcut()}</kbd></button>
  </div>
}
