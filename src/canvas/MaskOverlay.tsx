import { useId } from 'react'
import { strokeSvgPath, type BrushStroke } from './BrushEngine'
import type { LayerMask } from './documentTypes'
import { maskDefinitions } from './SelectionOverlay'

function MaskStroke({ stroke, id, width, height }: { stroke: BrushStroke; id: string; width: number; height: number }) {
  const first = stroke.points[0]
  if (!first) return null
  const blur = (100 - stroke.hardness) / 100 * stroke.size / 5
  const padding = stroke.size / 2 + blur * 3
  let minX = first.x * width / 100, maxX = minX, minY = first.y * height / 100, maxY = minY
  for (const point of stroke.points) {
    minX = Math.min(minX, point.x * width / 100); maxX = Math.max(maxX, point.x * width / 100)
    minY = Math.min(minY, point.y * height / 100); maxY = Math.max(maxY, point.y * height / 100)
  }
  return <g data-mask-stroke={stroke.id} opacity={stroke.opacity / 100 * stroke.flow / 100}>
    <defs><filter id={id} filterUnits="userSpaceOnUse" x={minX - padding} y={minY - padding} width={maxX - minX + padding * 2} height={maxY - minY + padding * 2}><feGaussianBlur stdDeviation={blur} /></filter></defs>
    <g filter={stroke.hardness < 100 ? `url(#${id})` : undefined}>
      {stroke.points.length === 1 ? <circle cx={first.x * width / 100} cy={first.y * height / 100} r={stroke.size / 2} fill="black" /> : <path d={strokeSvgPath(stroke, width, height)} stroke="black" strokeWidth={stroke.size} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </g>
  </g>
}

/** White retains pixels. Brush marks and the gradient's end hide them. */
export function MaskDefinitions(mask: LayerMask, id: string, width = 500, height = 625) {
  const selectionId = `${id}-selection`
  const selectionPixelsId = `${id}-selection-pixels`
  const rawId = `${id}-raw`
  const gradientId = `${id}-gradient`
  const featherId = `${id}-feather`
  return <>
    {mask.selection ? <>
      {maskDefinitions(mask.selection.path, selectionId)}
      <filter id={featherId} filterUnits="userSpaceOnUse" x="0" y="0" width={width} height={height}><feGaussianBlur stdDeviation={mask.selection.feather} /></filter>
      <mask id={selectionPixelsId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: 'luminance' }}>
        <rect width={width} height={height} fill="black" />
        <g filter={mask.selection.feather ? `url(#${featherId})` : undefined}><g transform={`scale(${width / 100} ${height / 100})`}><rect width="100" height="100" fill="white" mask={`url(#${selectionId})`} /></g></g>
      </mask>
    </> : null}
    {mask.gradient ? <linearGradient id={gradientId} gradientUnits="userSpaceOnUse" x1={mask.gradient.from.x * width / 100} y1={mask.gradient.from.y * height / 100} x2={mask.gradient.to.x * width / 100} y2={mask.gradient.to.y * height / 100}><stop stopColor="white" /><stop offset="1" stopColor="black" /></linearGradient> : null}
    <mask id={rawId} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: 'luminance' }}>
      <rect width={width} height={height} fill="black" />
      <rect width={width} height={height} fill={mask.gradient ? `url(#${gradientId})` : 'white'} mask={mask.selection ? `url(#${selectionPixelsId})` : undefined} />
      {mask.strokes.map((stroke, index) => <MaskStroke key={stroke.id} stroke={stroke} id={`${id}-stroke-${index}`} width={width} height={height} />)}
    </mask>
    <mask id={id} data-inverted={mask.inverted} maskUnits="userSpaceOnUse" x="0" y="0" width={width} height={height} style={{ maskType: 'luminance' }}>
      <rect width={width} height={height} fill={mask.inverted ? 'white' : 'black'} />
      <rect width={width} height={height} fill={mask.inverted ? 'black' : 'white'} mask={`url(#${rawId})`} />
    </mask>
  </>
}

/** Editor-only overlay; kept outside .canvas-art so export never includes red. */
export function MaskOverlay({ mask, transform, width = 500, height = 625, contentWidth = width, contentHeight = height }: { mask: LayerMask; transform?: string; width?: number; height?: number; contentWidth?: number; contentHeight?: number }) {
  const id = `mask-preview-${useId().replaceAll(':', '')}`
  if (mask.applied) return null
  return <svg className="mask-preview" aria-label="蒙版红色预览" data-editor-overlay="true" viewBox={`0 0 ${width} ${height}`} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
    <defs>{MaskDefinitions({ ...mask, inverted: !mask.inverted }, id, contentWidth, contentHeight)}</defs>
    <g data-mask-preview-transform="true" transform={transform}><rect data-mask-red="true" width={contentWidth} height={contentHeight} fill="#ff4d5b" opacity="0.4" mask={`url(#${id})`} /></g>
  </svg>
}
