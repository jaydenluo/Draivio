import type { EditorState, Layer } from '../state/editor'
import { invertMatrix, layerMatrix, multiplyPoint, type AffineMatrix } from '../canvas/layerCoordinates'
import { layerParentId, layerSubtreeIds, layerWriteIsLocked } from '../state/layerHierarchy'

export type AlignmentRect = { x: number; y: number; width: number; height: number }
export type AlignmentMode = 'left' | 'center-horizontal' | 'right' | 'top' | 'center-vertical' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type AlignmentTarget = 'canvas' | 'selection' | 'key-object'

export function alignRects(rects: AlignmentRect[], mode: AlignmentMode, reference: AlignmentRect): AlignmentRect[] {
  return rects.map((rect) => {
    if (mode === 'top-left') return { ...rect, x: reference.x, y: reference.y }
    if (mode === 'top-right') return { ...rect, x: reference.x + reference.width - rect.width, y: reference.y }
    if (mode === 'bottom-left') return { ...rect, x: reference.x, y: reference.y + reference.height - rect.height }
    if (mode === 'bottom-right') return { ...rect, x: reference.x + reference.width - rect.width, y: reference.y + reference.height - rect.height }
    if (mode === 'left') return { ...rect, x: reference.x }
    if (mode === 'center-horizontal') return { ...rect, x: reference.x + (reference.width - rect.width) / 2 }
    if (mode === 'right') return { ...rect, x: reference.x + reference.width - rect.width }
    if (mode === 'top') return { ...rect, y: reference.y }
    if (mode === 'center-vertical') return { ...rect, y: reference.y + (reference.height - rect.height) / 2 }
    return { ...rect, y: reference.y + reference.height - rect.height }
  })
}

export function distributeRects(rects: AlignmentRect[], axis: 'horizontal' | 'vertical'): AlignmentRect[] {
  if (rects.length < 3) return rects.map((rect) => ({ ...rect }))
  const sorted = rects.map((rect, index) => ({ rect, index })).sort((a, b) => axis === 'horizontal' ? a.rect.x - b.rect.x : a.rect.y - b.rect.y)
  const first = sorted[0].rect
  const last = sorted[sorted.length - 1].rect
  const start = axis === 'horizontal' ? first.x : first.y
  const end = axis === 'horizontal' ? last.x + last.width : last.y + last.height
  const occupied = sorted.reduce((sum, item) => sum + (axis === 'horizontal' ? item.rect.width : item.rect.height), 0)
  const gap = (end - start - occupied) / (sorted.length - 1)
  if (gap < -1e-7) throw new Error('对象重叠，无法在当前首尾边界内等距分布；请先拉开首尾对象')
  let cursor = start
  const result = rects.map((rect) => ({ ...rect }))
  sorted.forEach(({ rect, index }) => {
    if (axis === 'horizontal') result[index] = { ...result[index], x: cursor }
    else result[index] = { ...result[index], y: cursor }
    cursor += (axis === 'horizontal' ? rect.width : rect.height) + gap
  })
  return result
}

const identity: AffineMatrix = [1, 0, 0, 1, 0, 0]
function multiply(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
}
function worldMatrix(state: EditorState, id: string, seen = new Set<string>()): AffineMatrix {
  if (seen.has(id)) throw new Error('图层组包含循环引用')
  seen.add(id)
  const layer = state.layers.find((item) => item.id === id)
  if (!layer) throw new Error('找不到所选图层')
  const own = layer.transform ? layerMatrix(layer.transform, state.documentWidth, state.documentHeight) : identity
  const parent = layerParentId(state.layers, id)
  return parent ? multiply(worldMatrix(state, parent, seen), own) : own
}
function union(rects: AlignmentRect[]): AlignmentRect {
  const x = Math.min(...rects.map((rect) => rect.x)), y = Math.min(...rects.map((rect) => rect.y))
  return { x, y, width: Math.max(...rects.map((rect) => rect.x + rect.width)) - x, height: Math.max(...rects.map((rect) => rect.y + rect.height)) - y }
}
/** Axis-aligned canvas bounds in physical pixels; groups use their descendant content. */
export function layerCanvasBounds(state: EditorState, id: string): AlignmentRect {
  const layer = state.layers.find((item) => item.id === id)
  if (!layer) throw new Error('找不到所选图层')
  const children = state.layers.filter((item) => layerParentId(state.layers, item.id) === id)
  if (children.length && !layer.source) return union(children.map((child) => layerCanvasBounds(state, child.id)))
  const matrix = worldMatrix(state, id)
  const corners = [{x:0,y:0},{x:100,y:0},{x:100,y:100},{x:0,y:100}].map((point) => multiplyPoint(matrix, point)).map((point) => ({ x: point.x * state.documentWidth / 100, y: point.y * state.documentHeight / 100 }))
  return union(corners.map((point) => ({ ...point, width: 0, height: 0 })))
}

export function selectedAlignmentLayers(state: EditorState): Layer[] {
  const ids = new Set(state.selectedLayerIds.length ? state.selectedLayerIds : [state.selectedLayerId])
  return state.layers.filter((layer) => {
    if (!ids.has(layer.id)) return false
    let parent = layerParentId(state.layers, layer.id)
    const visited = new Set<string>()
    while (parent && !visited.has(parent)) {
      if (ids.has(parent)) return false
      visited.add(parent); parent = layerParentId(state.layers, parent)
    }
    return true
  })
}

export function arrangeLayers(state: EditorState, action: { mode: AlignmentMode; target?: AlignmentTarget; reference?: AlignmentRect } | { axis: 'horizontal' | 'vertical' }): { layers: Layer[]; notice: string } {
  try {
    const selected = selectedAlignmentLayers(state)
    const allowed = selected.filter((layer) => !layerWriteIsLocked(state, { type: 'commit-layer-transform', layerId: layer.id, transform: layer.transform! }))
    const skipped = selected.length - allowed.length
    if (!allowed.length) return { layers: state.layers, notice: '所选图层或其祖先/后代已锁定，请先解锁' }
    const bounds = allowed.map((layer) => layerCanvasBounds(state, layer.id))
    let positions: AlignmentRect[]
    let keyId: string | undefined
    if ('mode' in action) {
      let reference = { x: 0, y: 0, width: state.documentWidth, height: state.documentHeight }
      if (action.target === 'selection') reference = union(selected.map((layer) => layerCanvasBounds(state, layer.id)))
      if (action.target === 'key-object') {
        const key = selected.find((layer) => layerSubtreeIds(state.layers, layer.id).includes(state.selectedLayerId))
        if (!key) return { layers: state.layers, notice: '请在所选对象中指定关键对象' }
        keyId = key.id; reference = layerCanvasBounds(state, keyId)
      }
      if (action.reference) reference = { x: action.reference.x * state.documentWidth / 100, y: action.reference.y * state.documentHeight / 100, width: action.reference.width * state.documentWidth / 100, height: action.reference.height * state.documentHeight / 100 }
      positions = alignRects(bounds, action.mode, reference)
    } else {
      if (allowed.length < 3) return { layers: state.layers, notice: '等距分布至少需要选择 3 个可编辑图层' }
      positions = distributeRects(bounds, action.axis)
    }
    const updates = new Map<string, Layer>()
    allowed.forEach((layer, index) => {
      if (layer.id === keyId) return
      const dx = (positions[index].x - bounds[index].x) * 100 / state.documentWidth
      const dy = (positions[index].y - bounds[index].y) * 100 / state.documentHeight
      if (Math.abs(dx) + Math.abs(dy) < 1e-8) return
      const parent = layerParentId(state.layers, layer.id)
      const inverse = parent ? invertMatrix(worldMatrix(state, parent)) : identity
      const localDx = inverse[0] * dx + inverse[2] * dy, localDy = inverse[1] * dx + inverse[3] * dy
      const transform = layer.transform ?? { kind: 'transform' as const, rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
      updates.set(layer.id, { ...layer, transform: { ...transform, rect: { ...transform.rect, x: transform.rect.x + localDx, y: transform.rect.y + localDy } } })
    })
    return { layers: updates.size ? state.layers.map((layer) => updates.get(layer.id) ?? layer) : state.layers, notice: `${'mode' in action ? '已对齐图层' : '已等距分布图层'}${skipped ? `，跳过 ${skipped} 个锁定对象` : ''}` }
  } catch (error) { return { layers: state.layers, notice: error instanceof Error ? error.message : '无法对齐图层' } }
}
