import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { rulerTicks } from '../document/rulers'
import './rulerOverlay.css'

export const rulerHeight = 18
export const rulerWidth = 20

export function RulerOverlay({ width, height, zoom, anchorRef, offset, toPoint, onCreate }: { width: number; height: number; zoom: number; anchorRef: RefObject<HTMLElement | null>; offset?: {x:number;y:number}; toPoint?: (x: number, y: number) => { x: number; y: number }; onCreate?: (axis: 'x' | 'y', position: number) => void }) {
  const drag = useRef<'x' | 'y' | null>(null)
  const viewportRef = useRef<HTMLDivElement>(null)
  const [anchor, setAnchor] = useState({ left: 0, top: 0, viewportWidth: 1, viewportHeight: 1 })
  useLayoutEffect(() => {
    const measure = () => {
      const viewport = viewportRef.current
      const target = anchorRef.current
      if (!viewport || !target) return
      const viewportBounds = viewport.getBoundingClientRect()
      const targetBounds = target.getBoundingClientRect()
      setAnchor({
        left: targetBounds.left - viewportBounds.left,
        top: targetBounds.top - viewportBounds.top,
        viewportWidth: Math.max(1, viewportBounds.width),
        viewportHeight: Math.max(1, viewportBounds.height),
      })
    }
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    if (anchorRef.current) observer?.observe(anchorRef.current)
    if (viewportRef.current) observer?.observe(viewportRef.current)
    window.addEventListener('resize', measure)
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [anchorRef, width, height, zoom, offset?.x, offset?.y])
  const handlers = (axis: 'x' | 'y') => ({ onPointerDown: (event: React.PointerEvent) => { event.preventDefault(); event.stopPropagation(); drag.current = axis; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId) }, onPointerMove: (event: React.PointerEvent) => { if (drag.current) event.stopPropagation() }, onPointerUp: (event: React.PointerEvent) => { event.stopPropagation(); if (drag.current && toPoint) { const p = toPoint(event.clientX, event.clientY); onCreate?.(drag.current, p[drag.current] * (drag.current === 'x' ? width : height) / 100) }; drag.current = null }, onPointerCancel: () => { drag.current = null } })
  const x = rulerTicks({ zoomPercent: Math.max(zoom, 1), originPx: anchor.left, viewportPx: anchor.viewportWidth })
  const y = rulerTicks({ zoomPercent: Math.max(zoom, 1), originPx: anchor.top, viewportPx: anchor.viewportHeight })
  return <div ref={viewportRef} className="ruler-overlay" aria-label="像素标尺" data-export-hidden="true">
    <div aria-label="标尺交汇角" className="ruler-corner" style={{width:rulerWidth,height:rulerHeight}} />
    <div aria-label="拖出水平参考线" className="ruler-axis ruler-horizontal" {...handlers('y')} style={{left:rulerWidth,height:rulerHeight}}>{x.filter(t=>t.screen>=rulerWidth).map(t=><span key={t.value} data-ruler-tick={t.value} className={`ruler-tick${t.major?' major':''}`} style={{left:t.screen-rulerWidth}}><i aria-hidden="true"/>{t.major?<span className="ruler-number">{t.value}</span>:null}</span>)}</div>
    <div aria-label="拖出垂直参考线" className="ruler-axis ruler-vertical" {...handlers('x')} style={{top:rulerHeight,width:rulerWidth}}>{y.filter(t=>t.screen>=rulerHeight).map(t=><span key={t.value} data-ruler-tick={t.value} className={`ruler-tick${t.major?' major':''}`} style={{top:t.screen-rulerHeight}}><i aria-hidden="true"/>{t.major?<span className="ruler-number">{t.value}</span>:null}</span>)}</div>
  </div>
}
