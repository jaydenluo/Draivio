import { useRef } from 'react'
import { rulerTicks } from '../document/rulers'

export function RulerOverlay({ width, height, zoom, toPoint, onCreate }: { width: number; height: number; zoom: number; toPoint?: (x: number, y: number) => { x: number; y: number }; onCreate?: (axis: 'x' | 'y', position: number) => void }) {
  const drag = useRef<'x' | 'y' | null>(null)
  const handlers = (axis: 'x' | 'y') => ({ onPointerDown: (event: React.PointerEvent) => { event.preventDefault(); event.stopPropagation(); drag.current = axis; (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId) }, onPointerMove: (event: React.PointerEvent) => { if (drag.current) event.stopPropagation() }, onPointerUp: (event: React.PointerEvent) => { event.stopPropagation(); if (drag.current && toPoint) { const p = toPoint(event.clientX, event.clientY); onCreate?.(drag.current, p[drag.current] * (drag.current === 'x' ? width : height) / 100) }; drag.current = null }, onPointerCancel: () => { drag.current = null } })
  const x = rulerTicks({ zoomPercent: zoom, originPx: 0, viewportPx: width * zoom / 100 })
  const y = rulerTicks({ zoomPercent: zoom, originPx: 0, viewportPx: height * zoom / 100 })
  return <div aria-label="像素标尺" data-export-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 22 }}>
    <div aria-label="拖出水平参考线" {...handlers('y')} style={{ pointerEvents: 'auto', position: 'absolute', top: -20, left: 0, right: 0, height: 20, background: '#1c2128', fontSize: 9, color: '#b5bbc4' }}>{x.filter(t => t.major).map(t => <span key={t.value} style={{ position: 'absolute', left: `${t.value / width * 100}%`, borderLeft: '1px solid #667080', paddingLeft: 2 }}>{t.value}</span>)}</div>
    <div aria-label="拖出垂直参考线" {...handlers('x')} style={{ pointerEvents: 'auto', position: 'absolute', top: 0, left: -26, bottom: 0, width: 26, background: '#1c2128', fontSize: 9, color: '#b5bbc4' }}>{y.filter(t => t.major).map(t => <span key={t.value} style={{ position: 'absolute', top: `${t.value / height * 100}%`, borderTop: '1px solid #667080' }}>{t.value}</span>)}</div>
  </div>
}
