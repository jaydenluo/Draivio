import { useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { rulerTicks } from '../document/rulers'

export function RulerOverlay({ width, height, zoom, anchorRef, toPoint, onCreate }: { width: number; height: number; zoom: number; anchorRef: RefObject<HTMLElement | null>; toPoint?: (x: number, y: number) => { x: number; y: number }; onCreate?: (axis: 'x' | 'y', position: number) => void }) {
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
  }, [anchorRef, width, height, zoom])
  const handlers = (axis: 'x' | 'y') => ({ onPointerDown: (event: React.PointerEvent) => { event.preventDefault(); event.stopPropagation(); drag.current = axis; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId) }, onPointerMove: (event: React.PointerEvent) => { if (drag.current) event.stopPropagation() }, onPointerUp: (event: React.PointerEvent) => { event.stopPropagation(); if (drag.current && toPoint) { const p = toPoint(event.clientX, event.clientY); onCreate?.(drag.current, p[drag.current] * (drag.current === 'x' ? width : height) / 100) }; drag.current = null }, onPointerCancel: () => { drag.current = null } })
  const x = rulerTicks({ zoomPercent: Math.max(zoom, 1), originPx: anchor.left, viewportPx: anchor.viewportWidth })
  const y = rulerTicks({ zoomPercent: Math.max(zoom, 1), originPx: anchor.top, viewportPx: anchor.viewportHeight })
  return <div ref={viewportRef} aria-label="像素标尺" data-export-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}>
    <div aria-label="标尺交汇角" style={{ pointerEvents: 'none', position: 'absolute', left: 0, top: 0, width: 26, height: 20, background: '#171b21', borderRight: '1px solid #343b46', borderBottom: '1px solid #343b46' }} />
    <div aria-label="拖出水平参考线" {...handlers('y')} style={{ pointerEvents: 'auto', position: 'absolute', top: 0, left: 26, right: 0, height: 20, background: '#1c2128', fontSize: 9, color: '#b5bbc4', overflow: 'hidden' }}>{x.filter(t => t.major && t.screen >= 26).map(t => <span key={t.value} style={{ position: 'absolute', left: t.screen, borderLeft: '1px solid #667080', paddingLeft: 2, height: 20 }}>{t.value}</span>)}</div>
    <div aria-label="拖出垂直参考线" {...handlers('x')} style={{ pointerEvents: 'auto', position: 'absolute', top: 20, left: 0, bottom: 0, width: 26, background: '#1c2128', fontSize: 9, color: '#b5bbc4', overflow: 'hidden' }}>{y.filter(t => t.major && t.screen >= 20).map(t => <span key={t.value} style={{ position: 'absolute', top: t.screen, borderTop: '1px solid #667080', width: 26 }}>{t.value}</span>)}</div>
  </div>
}
