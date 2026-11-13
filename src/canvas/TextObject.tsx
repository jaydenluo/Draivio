import { useEffect, useRef, useState } from 'react'

export type CanvasTextObject = {
  id: string; layerId: string; x: number; y: number; text: string
  fontFamily: string; fontSize: number; fontWeight: string; color: string; align: 'left' | 'center' | 'right'
}

export function TextObject({ object, onCommit, selected, onSelect }: { object: CanvasTextObject; onCommit: (object: CanvasTextObject) => void; selected: boolean; onSelect?: () => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(object.text)
  const input = useRef<HTMLTextAreaElement>(null)
  const finished = useRef(false)
  useEffect(() => { if (editing) { input.current?.focus(); input.current?.select() } }, [editing])
  const finish = (apply: boolean) => {
    if (finished.current) return
    finished.current = true
    setEditing(false)
    if (apply && draft !== object.text) onCommit({ ...object, text: draft })
  }
  const style = { left: `${object.x}%`, top: `${object.y}%`, fontFamily: object.fontFamily, fontSize: object.fontSize, fontWeight: object.fontWeight, color: object.color, textAlign: object.align }
  return <div className={`canvas-text-object ${selected ? 'selected' : ''}`} style={style} onPointerDown={(event) => event.stopPropagation()} onClick={onSelect} onDoubleClick={() => { if (editing) return; finished.current = false; setDraft(object.text); setEditing(true) }}>
    {editing ? <textarea ref={input} aria-label="编辑画布文字" value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => finish(true)} onKeyDown={(event) => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); finish(false) }
      if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); finish(true) }
    }} /> : <span className="canvas-text">{object.text || '文字'}</span>}
  </div>
}
