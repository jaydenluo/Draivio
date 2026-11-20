import type { PathPoint } from './pathGeometry'

export type BrushSettings = { size: number; hardness: number; opacity: number; flow: number; smoothing: number; color: string; endColor?: string }
export type BrushPoint = PathPoint & { pressure?: number; tiltX?: number; tiltY?: number }
export type BrushStroke = BrushSettings & { id: string; mode: 'paint' | 'erase' | 'mask'; layerId: string; points: BrushPoint[] }

export function createBrushStroke(id: string, mode: BrushStroke['mode'], layerId: string, point: BrushPoint, settings: BrushSettings): BrushStroke {
  return { ...settings, id, mode, layerId, points: [{ ...point }] }
}

export function appendBrushPoint(stroke: BrushStroke, point: BrushPoint): BrushStroke {
  const previous = stroke.points.at(-1)
  if (!previous) return { ...stroke, points: [point] }
  const weight = Math.max(.15, 1 - stroke.smoothing / 100)
  const next = { x: previous.x + (point.x - previous.x) * weight, y: previous.y + (point.y - previous.y) * weight }
  if (Math.hypot(next.x - previous.x, next.y - previous.y) < .05) return stroke
  return { ...stroke, points: [...stroke.points, { ...next, pressure: point.pressure, tiltX: point.tiltX, tiltY: point.tiltY }] }
}

export function hitStroke(stroke: BrushStroke, point: PathPoint, eraserSize: number, canvasWidth = 500, canvasHeight = 625): boolean {
  const pixels = (p: PathPoint) => ({ x: p.x * canvasWidth / 100, y: p.y * canvasHeight / 100 })
  const target = pixels(point)
  const radius = (stroke.size + eraserSize) / 2
  for (let index = 0; index < stroke.points.length; index++) {
    const a = pixels(stroke.points[index]), b = pixels(stroke.points[Math.min(index + 1, stroke.points.length - 1)])
    const dx = b.x - a.x, dy = b.y - a.y
    const length = dx * dx + dy * dy
    const t = length === 0 ? 0 : Math.min(1, Math.max(0, ((target.x - a.x) * dx + (target.y - a.y) * dy) / length))
    if (Math.hypot(target.x - a.x - t * dx, target.y - a.y - t * dy) <= radius) return true
  }
  return false
}

export function strokeSvgPath(stroke: BrushStroke, width = 500, height = 625): string {
  return stroke.points.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x * width / 100} ${p.y * height / 100}`).join(' ')
}

/** Gradient coordinates share the same physical space as the rendered stroke. */
export function brushGradientAxis(stroke: BrushStroke, width: number, height: number) {
  if (stroke.mode !== 'paint' || !stroke.endColor || stroke.points.length < 2) return null
  const pixels = (point: BrushPoint) => ({ x: point.x * width / 100, y: point.y * height / 100 })
  const from = pixels(stroke.points[0])
  let to = pixels(stroke.points.at(-1)!)
  // Closed strokes still need a nonzero axis; a single dab stays the foreground color.
  if (Math.hypot(to.x - from.x, to.y - from.y) < .001) {
    to = stroke.points.map(pixels).reduce((best, point) => Math.hypot(point.x-from.x, point.y-from.y) > Math.hypot(best.x-from.x, best.y-from.y) ? point : best, from)
  }
  return Math.hypot(to.x - from.x, to.y - from.y) < .001 ? null : { from, to }
}
