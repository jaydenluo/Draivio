import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { normalizeFontFamily } from '../text/systemFonts'
import type { SelectionPoint } from './selectionGeometry'
import { TOOL_CANCEL_EVENT } from '../tools/useToolShortcuts'
import { resizeTextObject } from './textTransformGeometry'
import { wrapParagraphLines } from '../text/paragraphLayout'

export type TextStyleRun = { start: number; end: number; fontFamily?: string; fontSize?: number; fontWeight?: string; color?: string; stroke?: string; shadow?: string }

export type CanvasTextObject = {
  id: string; layerId: string; x: number; y: number; text: string
  layout?: 'point' | 'paragraph'; width?: number; height?: number
  fontFamily: string; fontSize: number; fontWeight: string; color: string; align: 'left' | 'center' | 'right'
  opacity?: number; flipX?: boolean; flipY?: boolean; lineHeight?: number; letterSpacing?: number; rotation?: number; runs?: TextStyleRun[]
}

type TextTransformGesture = { handle: string; start: SelectionPoint; startClient: { x: number; y: number }; object: CanvasTextObject; bounds: DOMRect | null; size: { width: number; height: number }; moved: boolean; target: HTMLElement; pointerId: number }

export function TextObject({ object, onCommit, selected, onSelect, autoEdit = false, delegateMove = false, moving = false, editOnClick = false, allowMoveOnSelect = false, onPreview, onEditStart, onEditEnd, toPoint, documentWidth = 500, documentHeight = 625 }: { object: CanvasTextObject; onCommit: (object: CanvasTextObject) => void; selected: boolean; onSelect?: () => void; autoEdit?: boolean; delegateMove?: boolean; moving?: boolean; editOnClick?: boolean; allowMoveOnSelect?: boolean; onPreview?: (object: CanvasTextObject | null) => void; onEditStart?: () => void; onEditEnd?: () => void; toPoint?: (x: number, y: number) => SelectionPoint; documentWidth?: number; documentHeight?: number }) {
  const [editing, setEditing] = useState(false)
  const [overflow, setOverflow] = useState(false)
  const [draft, setDraft] = useState(object.text)
  const [transformPreview, setTransformPreview] = useState<CanvasTextObject | null>(null)
  const [transforming, setTransforming] = useState(false)
  const transformPreviewRef = useRef<CanvasTextObject | null>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const transformGesture = useRef<TextTransformGesture | null>(null)
  const movedTransform = useRef(false)
  if (moving) movedTransform.current = true
  const selectAllOnFocus = useRef(false)
  const composing = useRef(false)
  const finished = useRef(false)
  const resizeEditor = () => {
    const editor = input.current
    if (!editor) return
    if (object.layout !== 'paragraph') {
      // Textarea scrollHeight can include font overflow below the final baseline.
      // Use the same content box as the selection instead of growing a blank row.
      const lines = draft.split('\n').length
      editor.style.height = `${root.current?.offsetHeight || object.fontSize * lines * (object.lineHeight ?? 1.4)}px`
      return
    }
    editor.style.height = 'auto'
    editor.style.height = `${Math.max(editor.scrollHeight || 0, editor.clientHeight || 0)}px`
  }
  useLayoutEffect(() => {
    if (!editing || !input.current) return
    input.current.focus({ preventScroll: true })
    if (selectAllOnFocus.current) input.current.select()
    else input.current.setSelectionRange(input.current.value.length, input.current.value.length)
    resizeEditor()
  }, [editing])
  useEffect(() => { if (editing) resizeEditor() }, [draft, editing, object.layout, object.height, object.width, object.fontSize, object.fontFamily, object.fontWeight, object.lineHeight, object.letterSpacing])
  useEffect(() => { const element = root.current; if (!element || object.layout !== 'paragraph') { setOverflow(false); return }; setOverflow(element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1) }, [object.text, object.width, object.height, object.fontSize, object.lineHeight, object.letterSpacing, object.fontFamily])
  useEffect(() => {
    if (!autoEdit || editing) return
    finished.current = false
    selectAllOnFocus.current = true
    setDraft(object.text)
    setEditing(true)
  }, [autoEdit, editing, object.text])
  const finish = (apply: boolean) => {
    if (finished.current) return
    finished.current = true
    setEditing(false)
    if (apply && draft !== object.text) onCommit({ ...object, text: draft })
    onEditEnd?.()
  }
  const display = transformPreview ?? object
  const pointAt = (x: number, y: number) => toPoint?.(x, y) ?? { x: x / documentWidth * 100, y: y / documentHeight * 100 }
  const down = (handle: string, allowUnselected = false) => (event: React.PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (!selected && !allowUnselected) || editing || !toPoint) return
    event.preventDefault(); event.stopPropagation()
    onSelect?.()
    setTransforming(true)
    onPreview?.(object)
    transformPreviewRef.current = null
    setTransformPreview(null)
    const pointWidth = Math.max(1, ...object.text.split('\n').map(line => Array.from(line).length * object.fontSize * .6))
    const size = {
      width: root.current?.offsetWidth || (object.layout === 'paragraph' ? object.width ?? 240 : pointWidth),
      height: root.current?.offsetHeight || (object.layout === 'paragraph' ? object.height ?? object.fontSize * 1.5 : object.text.split('\n').length * object.fontSize * (object.lineHeight ?? 1.4)),
    }
    transformGesture.current = { handle, start: pointAt(event.clientX, event.clientY), startClient: { x: event.clientX, y: event.clientY }, object, bounds: root.current?.getBoundingClientRect() ?? null, size, moved: false, target: event.currentTarget, pointerId: event.pointerId }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = transformGesture.current
    if (!gesture) return
    event.preventDefault(); event.stopPropagation()
    const point = pointAt(event.clientX, event.clientY)
    const dx = point.x - gesture.start.x, dy = point.y - gesture.start.y
    const distance = Math.hypot(event.clientX - gesture.startClient.x, event.clientY - gesture.startClient.y)
    gesture.moved = gesture.moved || (gesture.handle === 'move' ? distance >= 3 : Math.abs(dx) + Math.abs(dy) > .05)
    if (!gesture.moved) return
    let next = { ...gesture.object }
    if (gesture.handle === 'move') next = { ...next, x: Math.max(0, Math.min(100, gesture.object.x + dx)), y: Math.max(0, Math.min(100, gesture.object.y + dy)) }
    else if (gesture.handle === 'rotate') {
      const bounds = gesture.bounds
      if (bounds) {
        const cx = bounds.left + bounds.width / 2, cy = bounds.top + bounds.height / 2
        const startAngle = Math.atan2(gesture.startClient.y - cy, gesture.startClient.x - cx)
        const currentAngle = Math.atan2(event.clientY - cy, event.clientX - cx)
      next = { ...next, rotation: (gesture.object.rotation ?? 0) + (Math.atan2(Math.sin(currentAngle - startAngle), Math.cos(currentAngle - startAngle)) * 180 / Math.PI) }
      }
    } else {
      next = resizeTextObject(gesture.object, gesture.handle, { x: dx / 100 * documentWidth, y: dy / 100 * documentHeight }, gesture.size, documentWidth, documentHeight)
    }
    transformPreviewRef.current = next
    setTransformPreview(next)
    onPreview?.(next)
  }
  const up = (event: React.PointerEvent<HTMLElement>) => {
    const gesture = transformGesture.current
    if (!gesture) return
    event.preventDefault(); event.stopPropagation(); transformGesture.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    const next = transformPreviewRef.current
    movedTransform.current = gesture.moved
    transformPreviewRef.current = null
    setTransformPreview(null)
    setTransforming(false)
    onPreview?.(null)
    if (gesture.moved && next) onCommit(next)
  }
  const cancelTransform = () => {
    const gesture = transformGesture.current
    if (!gesture) return
    transformGesture.current = null
    movedTransform.current = true
    gesture.target.releasePointerCapture?.(gesture.pointerId)
    transformPreviewRef.current = null
    setTransformPreview(null)
    setTransforming(false)
    onPreview?.(null)
  }
  useEffect(() => {
    const cancel = (event: Event) => {
      if (!transformGesture.current) return
      event.preventDefault()
      cancelTransform()
    }
    window.addEventListener(TOOL_CANCEL_EVENT, cancel)
    return () => window.removeEventListener(TOOL_CANCEL_EVENT, cancel)
  })
  const layout = display.layout ?? 'point'
  const lineHeight = display.lineHeight ?? 1.4
  const previewText = layout === 'paragraph' ? wrapParagraphLines(display.text, display.width ?? 240, display.fontSize, display.letterSpacing ?? 0, display).join('\n') : display.text
  const style = { left: `${display.x}%`, top: `${display.y}%`, width: layout === 'paragraph' ? `${display.width ?? 240}px` : 'max-content', minHeight: layout === 'paragraph' ? `${display.height ?? display.fontSize * 1.5}px` : undefined, fontFamily: normalizeFontFamily(display.fontFamily), fontSize: display.fontSize, fontWeight: display.fontWeight, color: display.color, textAlign: display.align, lineHeight, letterSpacing: `${display.letterSpacing ?? 0}px`, opacity:(display.opacity??100)/100, transform: `rotate(${display.rotation ?? 0}deg) scale(${display.flipX?-1:1},${display.flipY?-1:1})`, transformOrigin: '0 0' }
  const startEditing = (selectAll = false) => { if (editing) return; finished.current = false; selectAllOnFocus.current = selectAll; setDraft(object.text); onEditStart?.(); setEditing(true) }
  return <div ref={root} data-text-overflow={overflow ? 'true' : undefined} title={overflow ? '文字超出文本框范围' : undefined} className={`canvas-text-object canvas-text-layout-${layout} ${selected ? 'selected' : ''} ${transforming || moving ? 'is-transforming' : ''}`} style={style} onPointerDown={(event) => { movedTransform.current = false; if (delegateMove && !editing) return; if (!editing && (selected || allowMoveOnSelect)) down('move', allowMoveOnSelect)(event); else event.stopPropagation() }} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelTransform} onClick={(event) => { if (delegateMove && (!selected || !editOnClick || event.shiftKey || movedTransform.current)) { movedTransform.current = false; return }; onSelect?.(); if (editOnClick && !movedTransform.current && !(event.target instanceof Element && event.target.closest('button'))) startEditing(); movedTransform.current = false }} onDoubleClick={() => { if (!delegateMove || selected) startEditing(false) }}>
    {editing ? <><span className="canvas-text canvas-text-edit-preview" aria-hidden="true">{draft || '\u200b'}</span><textarea ref={input} rows={1} className="canvas-text-editor" aria-label="编辑画布文字" value={draft} onCompositionStart={() => { composing.current = true }} onCompositionEnd={(event) => { composing.current = false; setDraft(event.currentTarget.value) }} onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)} onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing && !composing.current) { event.preventDefault(); finish(true) }
      else if (event.key === 'Enter' && layout !== 'paragraph' && !event.shiftKey && !event.nativeEvent.isComposing && !composing.current) { event.preventDefault(); finish(true) }
    }} /></> : <span className="canvas-text">{previewText}</span>}
    {selected && !editing ? <><button type="button" className="text-transform-rotate" aria-label="旋转文字" onPointerDown={down('rotate')} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelTransform}>↻</button>{['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => <button key={handle} type="button" className={`text-transform-handle handle-${handle}`} aria-label={`缩放文字${handle === 'se' ? '右下角' : handle}`} title={handle.length === 2 ? '等比缩放文字' : layout === 'paragraph' ? '调整文本框宽高，不改变字号' : '缩放文字'} onPointerDown={down(handle)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancelTransform} />)}</> : null}
  </div>
}
