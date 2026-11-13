import { useRef } from 'react'
import type { SelectionPoint } from './selectionGeometry'
export type PerspectiveQuad = [SelectionPoint, SelectionPoint, SelectionPoint, SelectionPoint]
type Props = { quad: PerspectiveQuad; onChange: (quad: PerspectiveQuad) => void; toPoint: (x: number, y: number) => SelectionPoint; onCommit: () => void; onCancel: () => void }
export function PerspectiveOverlay({ quad, onChange, toPoint, onCommit, onCancel }: Props) {
  const drag = useRef<number | null>(null)
  return <>
    <svg className="perspective-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polygon points={quad.map((p) => `${p.x},${p.y}`).join(' ')} /></svg>
    {quad.map((point, index) => <button key={index} className="perspective-handle selection-handle" aria-label={`透视控制点${index + 1}`} style={{ left: `${point.x}%`, top: `${point.y}%` }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); drag.current = index; event.currentTarget.setPointerCapture?.(event.pointerId) }} onPointerMove={(event) => { if (drag.current === null) return; event.stopPropagation(); onChange(quad.map((p, i) => i === drag.current ? toPoint(event.clientX, event.clientY) : p) as PerspectiveQuad) }} onPointerUp={(event) => { event.stopPropagation(); drag.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId) }} onPointerCancel={() => { drag.current = null }} />)}
    <div className="transform-actions" role="toolbar" aria-label="透视裁剪操作"><span>拖动四角校正透视</span><button aria-label="确认透视裁剪" onClick={onCommit}>确认 ↵</button><button aria-label="取消透视裁剪" onClick={onCancel}>取消 Esc</button></div>
  </>
}
