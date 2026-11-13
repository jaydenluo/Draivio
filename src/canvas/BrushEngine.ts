import type { PathPoint } from './pathGeometry'

export type BrushSettings = { size: number; hardness: number; opacity: number; flow: number; smoothing: number; color: string }
export type BrushStroke = BrushSettings & { id: string; mode: 'paint' | 'erase' | 'mask'; layerId: string; points: PathPoint[] }

export function createBrushStroke(id: string, mode: BrushStroke['mode'], layerId: string, point: PathPoint, settings: BrushSettings): BrushStroke {
  return { ...settings, id, mode, layerId, points: [{ ...point }] }
}

export function appendBrushPoint(stroke: BrushStroke, point: PathPoint): BrushStroke {
  const previous = stroke.points.at(-1)
  if (!previous) return { ...stroke, points: [point] }
  const weight = Math.max(.15, 1 - stroke.smoothing / 100)
  const next = { x: previous.x + (point.x - previous.x) * weight, y: previous.y + (point.y - previous.y) * weight }
  if (Math.hypot(next.x - previous.x, next.y - previous.y) < .05) return stroke
  return { ...stroke, points: [...stroke.points, next] }
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

export function strokeSvgPath(stroke: BrushStroke): string {
  return stroke.points.map((p, index) => `${index === 0 ? 'M' : 'L'} ${p.x * 5} ${p.y * 6.25}`).join(' ')
}
