import type { Layer } from '../state/editor'
import type { TransformDraft } from '../canvas/TransformOverlay'

export type Matrix = [number, number, number, number, number, number]
export type Point = { x: number; y: number }
export type Bounds = { x: number; y: number; width: number; height: number }

export const identityMatrix = (): Matrix => [1, 0, 0, 1, 0, 0]
export function multiplyMatrix(a: Matrix, b: Matrix): Matrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
}
export function applyMatrix(matrix: Matrix, point: Point): Point { return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] } }
export function inverseMatrix(matrix: Matrix): Matrix {
  const [a, b, c, d, e, f] = matrix; const det = a * d - b * c
  if (Math.abs(det) < 1e-9) throw new Error('不可逆的组变换矩阵')
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det]
}
export function transformMatrix(transform: Pick<TransformDraft, 'rect' | 'rotation' | 'flipX' | 'flipY'>): Matrix {
  const angle = transform.rotation * Math.PI / 180; const cos = Math.cos(angle), sin = Math.sin(angle)
  const sx = transform.flipX ? -1 : 1, sy = transform.flipY ? -1 : 1
  const cx = transform.rect.x + transform.rect.width / 2, cy = transform.rect.y + transform.rect.height / 2
  return multiplyMatrix([cos * sx, sin * sx, -sin * sy, cos * sy, 0, 0], [1, 0, 0, 1, cx, cy])
}
export function transformBounds(bounds: Bounds, matrix: Matrix): Bounds {
  const points = [applyMatrix(matrix, bounds), applyMatrix(matrix, { x: bounds.x + bounds.width, y: bounds.y }), applyMatrix(matrix, { x: bounds.x, y: bounds.y + bounds.height }), applyMatrix(matrix, { x: bounds.x + bounds.width, y: bounds.y + bounds.height })]
  const xs = points.map(p => p.x), ys = points.map(p => p.y); const x = Math.min(...xs), y = Math.min(...ys)
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }
}
export function unionBounds(bounds: Bounds[]): Bounds | null {
  if (!bounds.length) return null; const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y))
  const right = Math.max(...bounds.map(b => b.x + b.width)), bottom = Math.max(...bounds.map(b => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}
export function groupDescendantIds(layers: Layer[], groupId: string): string[] {
  const result: string[] = []; const visit = (id: string) => { for (const layer of layers) if (layer.groupId === id || layers.find(l => l.id === id)?.children?.includes(layer.id)) { if (!result.includes(layer.id)) { result.push(layer.id); visit(layer.id) } } }; visit(groupId); return result
}
export function groupBounds(layers: Layer[], groupId: string): Bounds | null {
  const ids = groupDescendantIds(layers, groupId); return unionBounds(ids.map(id => layers.find(l => l.id === id)?.transform?.rect).filter((x): x is Bounds => !!x))
}
export function transformGroup(layers: Layer[], groupId: string, matrix: Matrix): Layer[] {
  const ids = new Set(groupDescendantIds(layers, groupId)); return layers.map(layer => {
    if (!ids.has(layer.id) || !layer.transform) return layer
    const rect = transformBounds(layer.transform.rect, matrix)
    return { ...layer, transform: { ...layer.transform, rect } }
  })
}
export function ungroupPreserveWorld(layers: Layer[], groupId: string): Layer[] {
  const group = layers.find(l => l.id === groupId); if (!group) return layers
  const children = new Set(group.children ?? layers.filter(l => l.groupId === groupId).map(l => l.id))
  return layers.filter(l => l.id !== groupId).map(l => children.has(l.id) ? { ...l, groupId: undefined } : l)
}

export type MergeMode = 'selected' | 'down' | 'visible' | 'flatten'
export type MergePlan = { mode: MergeMode; layerIds: string[]; keepHidden: boolean; requiresRasterize: boolean; warning?: string }
export function createMergePlan(layers: Layer[], selectedIds: string[], mode: MergeMode, keepHidden = true): MergePlan {
  const selected = [...new Set(selectedIds)].map(id => layers.find(l => l.id === id)).filter((layer): layer is Layer => !!layer)
  const candidates: Layer[] = mode === 'visible' || mode === 'flatten' ? layers.filter(l => l.visible || keepHidden && mode === 'visible') : selected
  const requiresRasterize = candidates.some(l => l.blendMode !== '正常' || !!l.maskId)
  return { mode, layerIds: candidates.map(l => l.id), keepHidden, requiresRasterize, warning: requiresRasterize ? '所选图层含混合模式或蒙版，合并将栅格化并保留当前视觉效果。' : undefined }
}

/** Creates a self-contained SVG rasterization source for merge operations.
 * Keeping the original data URLs inside the SVG makes the merged layer render
 * the same pixels when the document is reopened, while the operation remains undoable.
 */
export function composeMergedSource(layers: Layer[], width: number, height: number): string | undefined {
  const drawable = layers.filter(layer => layer.source)
  if (!drawable.length) return undefined
  const images = drawable.map(layer => {
    const rect = layer.transform?.rect ?? { x: 0, y: 0, width: 100, height: 100 }
    const opacity = Math.max(0, Math.min(1, layer.opacity / 100))
    const href = String(layer.source).replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    return `<image href="${href}" x="${rect.x * width / 100}" y="${rect.y * height / 100}" width="${rect.width * width / 100}" height="${rect.height * height / 100}" opacity="${opacity}" preserveAspectRatio="none"/>`
  }).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${images}</svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
