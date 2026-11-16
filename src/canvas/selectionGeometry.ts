import { pathBounds, pathToSvg, type EditorPath } from './pathGeometry'
export type SelectionPoint = { x: number; y: number }
export type SelectionRect = SelectionPoint & { width: number; height: number }
export type SelectionKind = 'rectangle' | 'ellipse' | 'path'
export type SelectionMode = 'new' | 'add' | 'subtract' | 'intersect'
export type SelectionPath =
  | { type: 'shape'; kind: SelectionKind; rect: SelectionRect }
  | { type: 'boolean'; mode: Exclude<SelectionMode, 'new'>; left: SelectionPath; right: SelectionPath }
  | { type: 'inverse'; source: SelectionPath; sourceRect: SelectionRect }
  | { type: 'transform'; source: SelectionPath; from: SelectionRect; to: SelectionRect }
  | { type: 'path'; d: string; points: SelectionPoint[] }
  | { type: 'raster'; rows: string[]; d: string; alpha?: number[]; alphaWidth?: number; alphaHeight?: number }
  | { type: 'affine'; source: SelectionPath; matrix: [number, number, number, number, number, number] }
export type Selection = { kind: SelectionKind; mode: SelectionMode; rect: SelectionRect; path: SelectionPath; feather: number; fixedRatio: number | null }

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))
const inside = (rect: SelectionRect, point: SelectionPoint) => point.x >= rect.x && point.y >= rect.y && point.x <= rect.x + rect.width && point.y <= rect.y + rect.height

/** Coordinates use artboard percentages; ratios describe physical width / height. */
export function drawSelectionRect(start: SelectionPoint, end: SelectionPoint, options: { fromCenter?: boolean; ratio?: number | null; artboardRatio?: number } = {}): SelectionRect {
  let dx = end.x - start.x
  let dy = end.y - start.y
  if (options.ratio && options.ratio > 0) {
    const ratio = options.ratio / (options.artboardRatio ?? .8)
    const width = Math.max(Math.abs(dx), Math.abs(dy) * ratio)
    dx = (dx < 0 ? -1 : 1) * width
    dy = (dy < 0 ? -1 : 1) * width / ratio
  }
  const availableX = options.fromCenter ? Math.min(start.x, 100 - start.x) : dx < 0 ? start.x : 100 - start.x
  const availableY = options.fromCenter ? Math.min(start.y, 100 - start.y) : dy < 0 ? start.y : 100 - start.y
  const scale = Math.min(1, Math.abs(dx) ? availableX / Math.abs(dx) : 1, Math.abs(dy) ? availableY / Math.abs(dy) : 1)
  dx *= scale; dy *= scale
  return options.fromCenter
    ? { x: start.x - Math.abs(dx), y: start.y - Math.abs(dy), width: Math.abs(dx) * 2, height: Math.abs(dy) * 2 }
    : { x: Math.min(start.x, start.x + dx), y: Math.min(start.y, start.y + dy), width: Math.abs(dx), height: Math.abs(dy) }
}

export function createSelection(kind: SelectionKind, rect: SelectionRect, options: Partial<Pick<Selection, 'mode' | 'feather' | 'fixedRatio'>> = {}): Selection {
  return { kind, mode: options.mode ?? 'new', rect, path: { type: 'shape', kind, rect }, feather: clamp(options.feather ?? 0), fixedRatio: options.fixedRatio ?? null }
}

export function selectionContains(path: SelectionPath, point: SelectionPoint): boolean {
  if (!inside({ x: 0, y: 0, width: 100, height: 100 }, point)) return false
  if (path.type === 'shape') {
    const r = path.rect
    if (!r.width || !r.height || !inside(r, point)) return false
    return path.kind === 'rectangle' || ((point.x - r.x - r.width / 2) / (r.width / 2)) ** 2 + ((point.y - r.y - r.height / 2) / (r.height / 2)) ** 2 <= 1
  }
  if (path.type === 'path') {
    let hit = false
    for (let i = 0, j = path.points.length - 1; i < path.points.length; j = i++) {
      const a = path.points[i], b = path.points[j]
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) hit = !hit
    }
    return hit
  }
  if (path.type === 'inverse') return !selectionContains(path.source, point)
  if (path.type === 'affine') {
    const [a, b, c, d, e, f] = path.matrix
    const determinant = a * d - b * c
    if (Math.abs(determinant) < 1e-8) return false
    const x = point.x - e; const y = point.y - f
    const inverse = { x: (d * x - c * y) / determinant, y: (-b * x + a * y) / determinant }
    return selectionContains(path.source, inverse)
  }
  if (path.type === 'transform') return selectionContains(path.source, { x: path.from.x + (point.x - path.to.x) / path.to.width * path.from.width, y: path.from.y + (point.y - path.to.y) / path.to.height * path.from.height })
  if (path.type === 'raster') {
    const x = Math.min(path.rows[0].length - 1, Math.floor(point.x / 100 * path.rows[0].length))
    const y = Math.min(path.rows.length - 1, Math.floor(point.y / 100 * path.rows.length))
    const i = y * path.rows[0].length + x
    return path.alpha ? (path.alpha[i] ?? 0) > 0 : path.rows[y]?.[x] === '1'
  }
  const left = selectionContains(path.left, point)
  const right = selectionContains(path.right, point)
  return path.mode === 'add' ? left || right : path.mode === 'subtract' ? left && !right : left && right
}

export function combineSelection(previous: Selection | null, next: Selection, mode: SelectionMode): Selection {
  if (mode === 'new' || (!previous && mode === 'add')) return { ...next, mode }
  if (!previous) return createSelection(next.kind, { x: 0, y: 0, width: 0, height: 0 }, { ...next, mode })
  const a = previous.rect; const b = next.rect
  const x = mode === 'intersect' ? Math.max(a.x, b.x) : Math.min(a.x, b.x)
  const y = mode === 'intersect' ? Math.max(a.y, b.y) : Math.min(a.y, b.y)
  const right = mode === 'intersect' ? Math.min(a.x + a.width, b.x + b.width) : Math.max(a.x + a.width, b.x + b.width)
  const bottom = mode === 'intersect' ? Math.min(a.y + a.height, b.y + b.height) : Math.max(a.y + a.height, b.y + b.height)
  return { ...next, mode, rect: mode === 'subtract' ? a : { x, y, width: Math.max(0, right - x), height: Math.max(0, bottom - y) }, path: { type: 'boolean', mode, left: previous.path, right: next.path } }
}

export function invertSelection(selection: Selection): Selection {
  if (selection.path.type === 'inverse') return { ...selection, rect: selection.path.sourceRect, path: selection.path.source }
  return { ...selection, rect: { x: 0, y: 0, width: 100, height: 100 }, path: { type: 'inverse', source: selection.path, sourceRect: selection.rect } }
}

/** Expand/contract the actual mask, including holes. One cell is .25% of artboard width.
 * A summed-area table implements square-kernel morphology in linear time.
 * The 400×500 grid has square physical pixels on the 4:5 artboard.
 */
export function morphSelection(selection: Selection, amount: number, documentWidth = 500, documentHeight = 625): Selection {
  if (!Number.isFinite(amount) || amount === 0) return selection
  const scale = Math.min(400 / documentWidth, 500 / documentHeight)
  const width = Math.max(1, Math.round(documentWidth * scale)); const height = Math.max(1, Math.round(documentHeight * scale)); const stride = width + 1
  const radius = Math.max(1, Math.round(Math.abs(amount) / 100 * width))
  const sums = new Int32Array((width + 1) * (height + 1))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = selectionContains(selection.path, { x: (x + .5) / width * 100, y: (y + .5) / height * 100 }) ? 1 : 0
    sums[(y + 1) * stride + x + 1] = value + sums[y * stride + x + 1] + sums[(y + 1) * stride + x] - sums[y * stride + x]
  }
  const rows: string[] = []; const commands: string[] = []
  let minX = width; let minY = height; let maxX = 0; let maxY = 0
  for (let y = 0; y < height; y++) {
    let row = ''; let run = -1
    for (let x = 0; x <= width; x++) {
      const x0 = Math.max(0, x - radius); const x1 = Math.min(width, x + radius + 1)
      const y0 = Math.max(0, y - radius); const y1 = Math.min(height, y + radius + 1)
      const count = sums[y1 * stride + x1] - sums[y0 * stride + x1] - sums[y1 * stride + x0] + sums[y0 * stride + x0]
      const selected = x < width && (amount > 0 ? count > 0 : x >= radius && y >= radius && x + radius < width && y + radius < height && count === (radius * 2 + 1) ** 2)
      if (x < width) row += selected ? '1' : '0'
      if (selected) { minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1); minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1); if (run < 0) run = x }
      else if (run >= 0) { commands.push(`M${run / width * 100},${y / height * 100}h${(x - run) / width * 100}v${100 / height}h${-(x - run) / width * 100}Z`); run = -1 }
    }
    rows.push(row)
  }
  return { ...selection, rect: maxX ? { x: minX / width * 100, y: minY / height * 100, width: (maxX - minX) / width * 100, height: (maxY - minY) / height * 100 } : { x: 0, y: 0, width: 0, height: 0 }, path: { type: 'raster', rows, d: commands.join('') } }
}

export function transformSelection(selection: Selection, rect: SelectionRect): Selection {
  if (!selection.rect.width || !selection.rect.height) return selection
  return { ...selection, rect, path: { type: 'transform', source: selection.path, from: selection.rect, to: rect } }
}

export function moveSelection(selection: Selection, dx: number, dy: number): Selection {
  return transformSelection(selection, { ...selection.rect, x: clamp(selection.rect.x + dx, 0, 100 - selection.rect.width), y: clamp(selection.rect.y + dy, 0, 100 - selection.rect.height) })
}

export function resizeSelection(selection: Selection, handle: string, delta: SelectionPoint): Selection {
  const r = selection.rect; const min = .2
  let { x, y, width, height } = r
  if (handle.includes('w')) { x = clamp(r.x + delta.x, 0, r.x + r.width - min); width = r.x + r.width - x }
  if (handle.includes('e')) width = clamp(r.width + delta.x, min, 100 - r.x)
  if (handle.includes('n')) { y = clamp(r.y + delta.y, 0, r.y + r.height - min); height = r.y + r.height - y }
  if (handle.includes('s')) height = clamp(r.height + delta.y, min, 100 - r.y)
  return transformSelection(selection, { x, y, width, height })
}

/** SVG keeps exact cubic curves; hit testing samples each segment at 1/32 intervals. */
export function pathSelection(path: EditorPath, options: Partial<Pick<Selection, 'mode' | 'feather' | 'fixedRatio'>> = {}): Selection {
  const points: SelectionPoint[] = []
  path.anchors.forEach((a, index) => {
    const b = path.anchors[(index + 1) % path.anchors.length]
    points.push({ x: a.x, y: a.y })
    if (path.kind !== 'bezier' || !b) return
    const out = a.out ?? a, incoming = b.in ?? b
    for (let step = 1; step < 32; step++) {
      const t = step / 32, u = 1 - t
      points.push({ x: u ** 3 * a.x + 3 * u ** 2 * t * out.x + 3 * u * t ** 2 * incoming.x + t ** 3 * b.x, y: u ** 3 * a.y + 3 * u ** 2 * t * out.y + 3 * u * t ** 2 * incoming.y + t ** 3 * b.y })
    }
  })
  return { ...createSelection('rectangle', pathBounds(path) ?? { x: 0, y: 0, width: 0, height: 0 }, options), kind: 'path', path: { type: 'path', d: pathToSvg({ ...path, closed: true }), points } }
}
