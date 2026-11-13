import { Fragment, useId, type ReactNode } from 'react'
import { strokeSvgPath, type BrushStroke } from './BrushEngine'

function Stroke({ stroke, erase = false }: { stroke: BrushStroke; erase?: boolean }) {
  const id = `soft-${useId().replaceAll(':', '')}`
  const first = stroke.points[0]
  if (!first) return null
  const blur = (100 - stroke.hardness) / 100 * stroke.size / 5
  const padding = stroke.size / 2 + blur * 3
  let minX = first.x * 5, maxX = minX, minY = first.y * 6.25, maxY = minY
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x * 5); maxX = Math.max(maxX, point.x * 5)
    minY = Math.min(minY, point.y * 6.25); maxY = Math.max(maxY, point.y * 6.25)
  }
  return <g className="brush-stroke" data-stroke={stroke.id} opacity={stroke.opacity / 100 * stroke.flow / 100}>
    <defs><filter id={id} filterUnits="userSpaceOnUse" x={minX - padding} y={minY - padding} width={maxX - minX + padding * 2} height={maxY - minY + padding * 2}><feGaussianBlur stdDeviation={blur} /></filter></defs>
    <g filter={stroke.hardness < 100 ? `url(#${id})` : undefined}>
      {stroke.points.length === 1 ? <circle cx={first.x * 5} cy={first.y * 6.25} r={stroke.size / 2} fill={erase ? 'black' : stroke.color} /> : <path d={strokeSvgPath(stroke)} fill="none" stroke={erase ? 'black' : stroke.color} strokeWidth={stroke.size} strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  </g>
}

export function BrushScene({ strokes, baseByLayer = {}, objectsByLayer = {}, order = [] }: { strokes: BrushStroke[]; baseByLayer?: Record<string, ReactNode>; objectsByLayer?: Record<string, { id: string; node: ReactNode }[]>; order?: string[] }) {
  const prefix = `brush-${useId().replaceAll(':', '')}`
  const layers = Array.from(new Set([...Object.keys(baseByLayer), ...Object.keys(objectsByLayer), ...strokes.map((stroke) => stroke.layerId)]))
  const positions = new Map(order.map((id, index) => [id, index]))
  return <>{layers.map((layer) => {
    let content: ReactNode = baseByLayer[layer] ?? null
    const entries = [
      ...(objectsByLayer[layer] ?? []).map((object) => ({ id: object.id, node: object.node, stroke: null as BrushStroke | null })),
      ...strokes.filter((value) => value.layerId === layer).map((stroke) => ({ id: stroke.id, node: null as ReactNode, stroke })),
    ].sort((a, b) => (positions.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.id) ?? Number.MAX_SAFE_INTEGER))
    for (const entry of entries) {
      const stroke = entry.stroke
      if (!stroke) { content = <Fragment key={entry.id}>{content}{entry.node}</Fragment>; continue }
      if (stroke.mode === 'erase') {
        const maskId = `${prefix}-${stroke.id}`
        content = <Fragment key={stroke.id}><defs><mask id={maskId} data-eraser={stroke.id} maskUnits="userSpaceOnUse" x="0" y="0" width="500" height="625" style={{ maskType: 'luminance' }}><rect width="500" height="625" fill="white" /><Stroke stroke={stroke} erase /></mask></defs><g mask={`url(#${maskId})`}>{content}</g></Fragment>
      } else if (stroke.mode === 'paint') content = <Fragment key={stroke.id}>{content}<Stroke stroke={stroke} /></Fragment>
    }
    return <g key={layer} data-layer={layer}>{content}</g>
  })}</>
}
