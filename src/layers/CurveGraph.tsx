import { useEffect, useMemo, useRef } from 'react'
import { createCurveSampler, MIN_CURVE_ANCHOR_GAP, type CurvePoint } from '../adjustments/curves'

type Props = {
 points: CurvePoint[]; selected: number; onSelect: (index: number) => void; disabled?: boolean
 histogram?: Uint32Array | number[]; channel?: string
 onPreview: (points: CurvePoint[]) => void; onCommit: (points: CurvePoint[]) => void; onCancel: (points: CurvePoint[]) => void
}
const clamp = (value: number, low = 0, high = 1) => Math.max(low, Math.min(high, value))
const copy = (points: CurvePoint[]) => points.map(p => ({ ...p }))
export function constrainCurvePoint(points: CurvePoint[], index: number, point: CurvePoint): CurvePoint[] {
 const next = copy(points), last = points.length - 1
 const low = (points[index - 1]?.x ?? 0) + MIN_CURVE_ANCHOR_GAP * 2, high = (points[index + 1]?.x ?? 1) - MIN_CURVE_ANCHOR_GAP * 2
 next[index] = {
  x: index === 0 ? 0 : index === last ? 1 : low <= high ? clamp(point.x, low, high) : points[index].x,
  y: clamp(point.y, points[index - 1]?.y ?? 0, points[index + 1]?.y ?? 1),
 }
 return next
}
export function CurveGraph(props: Props) {
 const { points, selected, disabled, histogram, channel = 'rgb', onSelect, onCommit, onPreview } = props
 const svg = useRef<SVGSVGElement>(null)
 const latest = useRef(props); latest.current = props
 const drag = useRef<{ id: number; index: number; original: CurvePoint[]; current: CurvePoint[]; changed: boolean } | null>(null)
 const cancel = () => { const current = drag.current; drag.current = null; if (current) latest.current.onCancel(current.original) }
 useEffect(() => {
  const blur = () => cancel()
  window.addEventListener('blur', blur)
  return () => { window.removeEventListener('blur', blur) }
 }, [])
 useEffect(() => { if (disabled) cancel() }, [disabled])
 const curve = useMemo(() => {
  const sample = createCurveSampler(points)
  return Array.from({ length: 257 }, (_, i) => `${12 + i / 256 * 232},${244 - sample(i / 256) * 232}`).join(' ')
 }, [points])
 const bins = histogram ? Array.from(histogram) : []
 const peak = bins.reduce((max, value) => Math.max(max, value), 1)
 const toPoint = (clientX: number, clientY: number) => {
  const rect = svg.current!.getBoundingClientRect()
  return { x: clamp(((clientX - rect.left) / Math.max(1, rect.width) * 256 - 12) / 232), y: clamp((244 - (clientY - rect.top) / Math.max(1, rect.height) * 256) / 232) }
 }
 const remove = (index: number) => {
  if (disabled || index <= 0 || index >= points.length - 1) return
  onCommit(points.filter((_, i) => i !== index)); onSelect(index - 1)
 }
 return <svg ref={svg} className={`curve-graph channel-${channel}`} role="group" aria-label="曲线编辑区域" aria-disabled={!!disabled} tabIndex={disabled ? -1 : 0} viewBox="0 0 256 256" onPointerDown={event => {
  if (disabled || event.button !== 0 || drag.current) return
  event.preventDefault(); event.stopPropagation()
  event.currentTarget.focus(); event.currentTarget.setPointerCapture?.(event.pointerId)
  const point = toPoint(event.clientX, event.clientY), rect = event.currentTarget.getBoundingClientRect()
  const target = event.target instanceof Element ? event.target.closest('[data-curve-index]') : null
  let index = target ? Number(target.getAttribute('data-curve-index')) : points.findIndex(p => Math.hypot((p.x - point.x) * rect.width * 232 / 256, (p.y - point.y) * rect.height * 232 / 256) < 10)
  let current = points, changed = false
  if (index < 0) {
   if (points.length >= 64 || point.x < MIN_CURVE_ANCHOR_GAP * 2 || point.x > 1 - MIN_CURVE_ANCHOR_GAP * 2) return
   index = points.findIndex(p => p.x > point.x)
   if (point.x - points[index - 1].x < MIN_CURVE_ANCHOR_GAP * 2 || points[index].x - point.x < MIN_CURVE_ANCHOR_GAP * 2) return
   current = [...points.slice(0, index), { ...point, y: clamp(point.y, points[index - 1].y, points[index].y) }, ...points.slice(index)]
   changed = true; onPreview(current)
  }
  onSelect(index)
  drag.current = { id: event.pointerId, index, original: copy(points), current, changed }
 }} onPointerMove={event => {
  const current = drag.current
  if (!current || current.id !== event.pointerId || disabled) return
  event.preventDefault()
  const next = constrainCurvePoint(current.current, current.index, toPoint(event.clientX, event.clientY))
  if (JSON.stringify(next) === JSON.stringify(current.current)) return
  current.current = next; current.changed = true; onPreview(next)
 }} onPointerUp={event => {
  const current = drag.current
  if (!current || current.id !== event.pointerId) return
  drag.current = null
  if (current.changed) onCommit(current.current)
  if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
 }} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event => {
  if (event.key === 'Escape' && drag.current) { event.preventDefault(); event.stopPropagation(); cancel(); return }
  if (disabled) return
  if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); event.stopPropagation(); remove(selected); return }
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) return
  event.preventDefault(); event.stopPropagation()
  const step = (event.shiftKey ? 10 : 1) / 255, point = points[selected] ?? points[0]
  onCommit(constrainCurvePoint(points, selected, { x: point.x + (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0), y: point.y + (event.key === 'ArrowUp' ? step : event.key === 'ArrowDown' ? -step : 0) }))
 }}>
  <rect className="curve-graph-background" x="12" y="12" width="232" height="232" />
  <g role="img" aria-label="曲线直方图背景" className="curve-histogram">{bins.map((value, index) => <rect key={index} x={12 + index / bins.length * 232} y={244 - value / peak * 232} width={232 / bins.length} height={value / peak * 232} />)}</g>
  <g className="curve-grid">{[0,.25,.5,.75,1].map(value=><g key={value}><path d={`M${12+value*232} 12V244M12 ${12+value*232}H244`} /></g>)}</g>
  <path className="curve-identity" d="M12 244 244 12" />
  <polyline data-curve-path points={curve} className="curve-line" fill="none" />
  {points.map((point,index)=><g key={index} data-curve-index={index} role="button" aria-label={`曲线控制点 ${index + 1}`} aria-pressed={index === selected} aria-disabled={!!disabled} tabIndex={disabled ? -1 : 0} onFocus={()=>onSelect(index)} onDoubleClick={event=>{event.preventDefault();event.stopPropagation();remove(index)}} className={index === selected ? 'curve-anchor is-selected' : 'curve-anchor'}>
   <circle cx={12+point.x*232} cy={244-point.y*232} r="10" fill="transparent" stroke="none" />
   <circle cx={12+point.x*232} cy={244-point.y*232} r="3.5" className="curve-anchor-dot" />
  </g>)}
 </svg>
}
