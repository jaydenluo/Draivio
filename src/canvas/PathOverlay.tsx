import { useRef } from 'react'
import { closePath, moveAnchor, moveControl, pathToSvg, type EditorPath, type PathPoint } from './pathGeometry'

type Props = {
  path: EditorPath
  onChange: (path: EditorPath) => void
  toPoint: (x: number, y: number) => PathPoint
  onConvert: () => void
  onMask: () => void
}

export function PathOverlay({ path, onChange, toPoint, onConvert, onMask }: Props) {
  const dragging = useRef<{ index: number; side?: 'in' | 'out'; x: number; y: number } | null>(null)
  const suppressClick = useRef(false)
  const control = (index: number, point: PathPoint, side?: 'in' | 'out') => <button
    type="button" key={`${index}-${side ?? 'anchor'}`} className={`path-point ${side ? 'path-control' : ''}`}
    aria-label={side ? `路径控制柄${index + 1}-${side}` : `路径锚点${index + 1}`}
    style={{ left: `${point.x}%`, top: `${point.y}%` }}
    onPointerDown={(event) => { event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); suppressClick.current = false; dragging.current = { index, side, x: event.clientX, y: event.clientY } }}
    onPointerMove={(event) => {
      if (!dragging.current || dragging.current.index !== index || dragging.current.side !== side) return
      if (Math.hypot(event.clientX - dragging.current.x, event.clientY - dragging.current.y) > 3) suppressClick.current = true
      const point = toPoint(event.clientX, event.clientY)
      onChange(side ? moveControl(path, index, side, point) : moveAnchor(path, index, point))
    }}
    onPointerUp={(event) => { dragging.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId) }}
    onPointerCancel={() => { dragging.current = null }}
    onClick={() => { if (suppressClick.current) { suppressClick.current = false; return }; if (index === 0 && !side && !path.closed) onChange(closePath(path)) }}
    onKeyDown={(event) => {
      const steps: Record<string, PathPoint> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
      const step = steps[event.key]
      if (!step) return
      event.preventDefault(); event.stopPropagation()
      const next = { x: Math.max(0, Math.min(100, point.x + step.x)), y: Math.max(0, Math.min(100, point.y + step.y)) }
      onChange(side ? moveControl(path, index, side, next) : moveAnchor(path, index, next))
    }}
  />
  return <div className="path-overlay" aria-label={path.closed ? '已闭合路径' : '绘制中的路径'}>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="path-preview" aria-hidden="true">
      <path d={pathToSvg(path)} fill={path.closed ? 'rgba(119,199,255,.08)' : 'none'} stroke="var(--sky)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {path.anchors.map((point, i) => <g key={i}>{(['in', 'out'] as const).map((side) => point[side] ? <line key={side} x1={point.x} y1={point.y} x2={point[side]!.x} y2={point[side]!.y} stroke="var(--muted)" vectorEffect="non-scaling-stroke" /> : null)}</g>)}
    </svg>
    {path.anchors.map((point, index) => <span key={index}>{control(index, point)}{point.in ? control(index, point.in, 'in') : null}{point.out ? control(index, point.out, 'out') : null}</span>)}
    {path.closed ? <div className="path-actions"><button type="button" aria-label="路径转为选区" onClick={onConvert}>转为选区</button><button type="button" aria-label="路径创建蒙版" onClick={onMask}>创建蒙版</button></div> : <small className="path-help">点击添加点 · Enter 闭合 · Esc 取消</small>}
  </div>
}
