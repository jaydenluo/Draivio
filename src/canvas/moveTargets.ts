import { shapeBounds, shapePoint } from './objectProperties'
import type { EditorState } from '../state/editor'
import type { CanvasShape } from './documentTypes'
import type { CanvasTextObject } from './TextObject'
import type { EditablePath } from '../vector/pathGeometry'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { documentDeltaToParentLocal, documentPointToLayerLocal, layerWorldPixelMatrix } from './layerWorldMatrix'
import { hitStroke } from './BrushEngine'
import { pathSelection, selectionContains, type SelectionPoint, type SelectionRect } from './selectionGeometry'
import { paragraphMeasurer } from '../text/paragraphLayout'
import { createSnapIndex, type SnapIndex } from '../document/snapping'

export type MoveTarget = { kind: 'layer' | 'image' | 'text' | 'shape' | 'stroke'; id: string; layerId: string }
export const sameMoveTarget = (a: MoveTarget, b: MoveTarget) => a.kind === b.kind && a.id === b.id && a.layerId === b.layerId
const inside = (p: SelectionPoint, r: SelectionRect) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.width && p.y <= r.y + r.height
const layerTarget = (id: string): MoveTarget => ({ kind: 'layer', id, layerId: id })
const union = (rects: SelectionRect[]): SelectionRect => {
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y))
  return { x, y, width: Math.max(...rects.map(r => r.x + r.width)) - x, height: Math.max(...rects.map(r => r.y + r.height)) - y }
}
function textRect(object: CanvasTextObject, width: number, height: number): SelectionRect {
  const measure = paragraphMeasurer(object.fontSize, object.letterSpacing ?? 0, object)
  const lines = object.text.split('\n')
  const w = (object.layout === 'paragraph' ? object.width ?? 160 : Math.max(1, ...lines.map(measure))) / width * 100
  return { x: object.x - (object.layout !== 'paragraph' ? object.align === 'right' ? w : object.align === 'center' ? w / 2 : 0 : 0), y: object.y, width: (object.layout === 'paragraph' ? object.width ?? 160 : Math.max(1, ...lines.map(measure))) / width * 100, height: (object.layout === 'paragraph' ? object.height ?? object.fontSize * 1.4 : lines.length * object.fontSize * (object.lineHeight ?? 1.4)) / height * 100 }
}
function shapeContains(shape: CanvasShape, p: SelectionPoint, width: number, height: number) {
  if (shape.hidden || shape.opacity === 0) return false
  p=shapePoint(shape,p,width,height,true)
  if(shape.selection&&!selectionContains(shape.selection.path,p))return false
  const pathHit = (path: EditablePath) => selectionContains(pathSelection({ kind: 'bezier', anchors: path.anchors, closed: path.closed }).path, p)
  if (shape.kind === 'path' && shape.path) {
    if (shape.fillEnabled !== false && pathHit(shape.path)) return true
    const points = pathSelection({ kind: 'bezier', anchors: shape.path.anchors, closed: shape.path.closed }).path
    return points.type === 'path' && hitStroke({ id: '', layerId: '', mode: 'paint', points: points.points, size: shape.strokeWidth, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: shape.color }, p, 4, width, height)
  }
  if (shape.boolean) {
    const a = pathHit(shape.boolean.left), b = pathHit(shape.boolean.right)
    return shape.boolean.mode === 'union' ? a || b : shape.boolean.mode === 'difference' ? a && !b : shape.boolean.mode === 'intersect' ? a && b : a !== b
  }
  if (shape.kind === 'line' || shape.kind === 'arrow') return hitStroke({ id: '', layerId: '', mode: 'paint', points: [shape.from ?? shape.rect, shape.to ?? { x: shape.rect.x + shape.rect.width, y: shape.rect.y + shape.rect.height }], size: shape.strokeWidth, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: shape.color }, p, shape.kind === 'arrow' ? 8 : 4, width, height)
  const r=shape.rect,px=(p.x-r.x)*width/100,py=(p.y-r.y)*height/100,w=r.width*width/100,h=r.height*height/100
  const tolerance=shape.strokeWidth/2+3
  if(px < -tolerance || py < -tolerance || px>w+tolerance || py>h+tolerance)return false
  if(shape.kind==='ellipse'){
   const distance=((px-w/2)/(w/2||1))**2+((py-h/2)/(h/2||1))**2
   return shape.fillEnabled!==false?distance<=1:Math.abs(Math.sqrt(distance)-1)*Math.min(w,h)/2<=tolerance
  }
  if(shape.kind==='rectangle'){
   const radii=shape.cornerRadii??[0,0,0,0]
   const corner=px<w/2?(py<h/2?0:3):(py<h/2?1:2),radius=Math.min(radii[corner],w/2,h/2)
   const cx=corner===0||corner===3?radius:w-radius,cy=corner<2?radius:h-radius
   if(radius>0&&Math.abs(px-cx)>0&&((corner===0&&px<cx&&py<cy)||(corner===1&&px>cx&&py<cy)||(corner===2&&px>cx&&py>cy)||(corner===3&&px<cx&&py>cy))){const d=Math.hypot(px-cx,py-cy);return shape.fillEnabled!==false?d<=radius:Math.abs(d-radius)<=tolerance}
   if(shape.fillEnabled===false)return Math.min(Math.abs(px),Math.abs(py),Math.abs(w-px),Math.abs(h-py))<=tolerance
  }
  return inside(p,r)

}

/** Front to back, descending through groups instead of treating an empty group as a full canvas. */
export function hitMoveTarget(state: EditorState, point: SelectionPoint, sourceHit?: (layerId: string, local: SelectionPoint) => boolean): MoveTarget | null {
  const positions = new Map(state.sceneOrder.map((id, i) => [id, i]))
  const board = state.artboards.length > 1 ? state.artboards.find(b => b.id === state.activeArtboardId) : null
  const allowed = board ? new Set(board.layerIds.flatMap(id => layerSubtreeIds(state.layers, id))) : null
  const visit = (parent?: string, ancestors = new Set<string>()): MoveTarget | null => {
    for (const layer of state.layers.filter(l => layerParentId(state.layers, l.id) === parent)) {
      if (ancestors.has(layer.id) || allowed && !allowed.has(layer.id)) continue
      const effective = effectiveLayerState(state.layers, layer.id)
      if (!effective.visible || effective.locked || effective.opacity <= 0 || layer.kind === 'adjustment') continue
      const local = documentPointToLayerLocal(state.layers, layer.id, point, state.documentWidth, state.documentHeight)
      const mask = state.layerMasks[layer.id]
      if (mask?.applied && mask.selection && (selectionContains(mask.selection.path, local) === !!mask.inverted)) continue
      const child = visit(layer.id, new Set([...ancestors, layer.id]))
      if (child) return child
      const width = layer.contentWidth ?? state.documentWidth, height = layer.contentHeight ?? state.documentHeight
      if (!layer.smartObject) {
        const entries = [
          ...state.canvasShapes.filter(s => s.layerId === layer.id).map(s => ({ target: { kind: 'shape' as const, id: s.id, layerId: layer.id }, hit: () => shapeContains(s, local, width, height) })),
          ...state.canvasTexts.filter(t => t.layerId === layer.id).map(t => ({ target: { kind: 'text' as const, id: t.id, layerId: layer.id }, hit: () => {
            const angle = -(t.rotation ?? 0) * Math.PI / 180, dx = (local.x - t.x) * width / 100, dy = (local.y - t.y) * height / 100
            return !!t.text.trim() && inside({ x: t.x + (Math.cos(angle) * dx - Math.sin(angle) * dy) * (t.flipX?-1:1) / width * 100, y: t.y + (Math.sin(angle) * dx + Math.cos(angle) * dy) * (t.flipY?-1:1) / height * 100 }, textRect(t, width, height))
          } })),
          ...state.brushStrokes.filter(s => s.layerId === layer.id && s.mode !== 'mask').map(s => ({ target: { kind: 'stroke' as const, id: s.id, layerId: layer.id }, erase: s.mode === 'erase', hit: () => s.opacity > 0 && s.flow > 0 && hitStroke(s, local, 0, width, height) })),
        ].sort((a, b) => (positions.get(a.target.id) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.target.id) ?? Number.MAX_SAFE_INTEGER)).reverse()
        let erased = false
        for (const entry of entries) if (entry.hit()) {
          if ('erase' in entry && entry.erase) { erased = true; break }
          return entry.target
        }
        if (erased) continue
      }
      const sourcePoint = { x: local.x - (layer.sourceOffset?.x ?? 0), y: local.y - (layer.sourceOffset?.y ?? 0) }
      if ((layer.source || layer.smartObject) && inside(sourcePoint, { x: 0, y: 0, width: 100, height: 100 }) && (!sourceHit || sourceHit(layer.id, sourcePoint))) {
        const mixed = !layer.smartObject && [...state.canvasTexts, ...state.canvasShapes, ...state.brushStrokes].some(o => o.layerId === layer.id)
        return mixed ? { kind: 'image', id: layer.id, layerId: layer.id } : layerTarget(layer.id)
      }
    }
    return null
  }
  return visit()
}

/** Drop descendants of selected layers so selecting a group cannot double-move children. */
export function validMoveTargets(state: EditorState, targets: MoveTarget[]): MoveTarget[] {
  const existing = targets.filter(t => {
    const layer = state.layers.find(l => l.id === t.layerId)
    if (!layer) return false
    const effective = effectiveLayerState(state.layers, t.layerId)
    if (!effective.visible || effective.locked) return false
    if (t.kind === 'layer') return t.id === t.layerId && !layerSubtreeIds(state.layers, t.layerId).some(id => effectiveLayerState(state.layers, id).locked)
    if (layer.smartObject) return false
    if (t.kind === 'image') return t.id === t.layerId && !!layer.source
    return (t.kind === 'shape' ? state.canvasShapes : t.kind === 'text' ? state.canvasTexts : state.brushStrokes).some(o => o.id === t.id && o.layerId === t.layerId)
  })
  return existing.filter((t, i) => !existing.slice(0, i).some(other => sameMoveTarget(t, other)) && !existing.some(other => other.kind === 'layer' && !sameMoveTarget(t, other) && layerSubtreeIds(state.layers, other.layerId).includes(t.layerId)))
}
export function chooseMoveTargets(state: EditorState, selected: MoveTarget[], hit: MoveTarget, additive: boolean): MoveTarget[] {
  const layerIds = [...new Set(selected.map(t => t.layerId))]
  const synchronized = layerIds.length === state.selectedLayerIds.length && layerIds.every(id => state.selectedLayerIds.includes(id))
  const current = validMoveTargets(state, synchronized ? selected : state.selectedLayerIds.map(layerTarget))
  // A single layer selected in the layer list still allows automatic object selection.
  const explicit = synchronized || current.length > 1 || current.some(t => t.kind === 'layer' && t.layerId !== hit.layerId && layerSubtreeIds(state.layers, t.layerId).includes(hit.layerId))
  const covered = current.some(t => sameMoveTarget(t, hit) || t.kind === 'layer' && (current.length > 1 || t.layerId !== hit.layerId) && layerSubtreeIds(state.layers, t.layerId).includes(hit.layerId))
  if (additive) {
    const exact = current.some(t => sameMoveTarget(t, hit))
    return validMoveTargets(state, exact ? current.filter(t => !sameMoveTarget(t, hit)) : [...(explicit ? current : []), hit])
  }
  return explicit && covered ? current : [hit]
}

const shiftPoint = <T extends SelectionPoint>(p: T, delta: SelectionPoint): T => ({ ...p, x: p.x + delta.x, y: p.y + delta.y })
const shiftPath = (path: EditablePath, delta: SelectionPoint): EditablePath => ({ ...path, anchors: path.anchors.map(p => ({ ...shiftPoint(p, delta), in: p.in ? shiftPoint(p.in, delta) : undefined, out: p.out ? shiftPoint(p.out, delta) : undefined })) })
/** Preview and commit share this pure translation; no pointer frame writes document history. */
export function translateMoveTargets(state: EditorState, targets: MoveTarget[], delta: SelectionPoint): EditorState {
  if (![delta.x, delta.y].every(Number.isFinite) || Math.abs(delta.x) + Math.abs(delta.y) < 1e-8) return state
  const valid = validMoveTargets(state, targets)
  if (!valid.length) return state
  const byId = new Map(valid.map(t => [`${t.kind}:${t.id}`, t]))
  const localDelta = (id: string) => {
    const a = documentPointToLayerLocal(state.layers, id, { x: 0, y: 0 }, state.documentWidth, state.documentHeight)
    const b = documentPointToLayerLocal(state.layers, id, delta, state.documentWidth, state.documentHeight)
    return { x: b.x - a.x, y: b.y - a.y }
  }
  return { ...state,
    layers: state.layers.map(layer => {
      if (byId.has(`image:${layer.id}`)) return { ...layer, sourceOffset: shiftPoint(layer.sourceOffset ?? { x: 0, y: 0 }, localDelta(layer.id)) }
      if (!byId.has(`layer:${layer.id}`)) return layer
      const d = documentDeltaToParentLocal(state.layers, layer.id, delta.x, delta.y, state.documentWidth, state.documentHeight)
      const t = layer.transform ?? { kind: 'transform' as const, rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
      return { ...layer, transform: { ...t, rect: { ...t.rect, ...shiftPoint(t.rect, d) } } }
    }),
    canvasTexts: state.canvasTexts.map(t => byId.has(`text:${t.id}`) ? shiftPoint(t, localDelta(t.layerId)) : t),
    brushStrokes: state.brushStrokes.map(s => byId.has(`stroke:${s.id}`) ? { ...s, points: s.points.map(p => shiftPoint(p, localDelta(s.layerId))) } : s),
    canvasShapes: state.canvasShapes.map(s => {
      if (!byId.has(`shape:${s.id}`)) return s
      const d = localDelta(s.layerId)
      const selection = s.selection ? { ...s.selection, rect: shiftPoint(s.selection.rect, d), path: { type: 'affine' as const, source: s.selection.path, matrix: [1, 0, 0, 1, d.x, d.y] as [number, number, number, number, number, number] } } : undefined
      return { ...s, rect: shiftPoint(s.rect, d), from: s.from ? shiftPoint(s.from, d) : undefined, to: s.to ? shiftPoint(s.to, d) : undefined, path: s.path ? shiftPath(s.path, d) : undefined, boolean: s.boolean ? { ...s.boolean, left: shiftPath(s.boolean.left, d), right: shiftPath(s.boolean.right, d) } : undefined, selection }
    }),
  }
}
export function moveTargetBounds(state: EditorState, targets: MoveTarget[]): SelectionRect | null {
  const rects: SelectionRect[] = []
  for (const target of validMoveTargets(state, targets)) {
    const layer = state.layers.find(l => l.id === target.layerId)!
    const width = layer.contentWidth ?? state.documentWidth, height = layer.contentHeight ?? state.documentHeight
    let rect: SelectionRect | undefined, rotation = 0, origin: SelectionPoint | undefined, flipX=false,flipY=false
    if (target.kind === 'layer') {
      const children = state.layers.filter(l => layerParentId(state.layers, l.id) === layer.id)
      if (children.length && !layer.source) {
        const childBounds = moveTargetBounds(state, children.map(l => layerTarget(l.id)))
        if (childBounds) rects.push(childBounds)
        continue
      }
      rect = { x: 0, y: 0, width: 100, height: 100 }
    } else if (target.kind === 'image') rect = { x: layer.sourceOffset?.x ?? 0, y: layer.sourceOffset?.y ?? 0, width: 100, height: 100 }
    else if (target.kind === 'shape') {const shape=state.canvasShapes.find(o=>o.id===target.id);if(shape){rect=shapeBounds(shape);rotation=shape.rotation??0;origin={x:rect.x+rect.width/2,y:rect.y+rect.height/2}}}
    else if (target.kind === 'text') {
      const text = state.canvasTexts.find(o => o.id === target.id)!
      rect = textRect(text, width, height); rotation = text.rotation ?? 0; origin = text;flipX=!!text.flipX;flipY=!!text.flipY
    } else {
      const stroke = state.brushStrokes.find(o => o.id === target.id)!
      if (!stroke.points.length) continue
      const bounds = union(stroke.points.map(p => ({ ...p, width: 0, height: 0 })))
      rect = { x: bounds.x - stroke.size / width * 50, y: bounds.y - stroke.size / height * 50, width: bounds.width + stroke.size / width * 100, height: bounds.height + stroke.size / height * 100 }
    }
    if (!rect) continue
    const m = layerWorldPixelMatrix(state.layers, layer.id, state.documentWidth, state.documentHeight)
    const angle = rotation * Math.PI / 180
    const pivot = origin ?? rect
    const corners = [[0, 0], [rect.width, 0], [rect.width, rect.height], [0, rect.height]].map(([x, y]) => {
      const dx = (rect!.x + x - pivot.x) * width / 100*(flipX?-1:1), dy = (rect!.y + y - pivot.y) * height / 100*(flipY?-1:1)
      const px = pivot.x * width / 100 + Math.cos(angle) * dx - Math.sin(angle) * dy
      const py = pivot.y * height / 100 + Math.sin(angle) * dx + Math.cos(angle) * dy
      return { x: (m[0] * px + m[2] * py + m[4]) / state.documentWidth * 100, y: (m[1] * px + m[3] * py + m[5]) / state.documentHeight * 100, width: 0, height: 0 }
    })
    rects.push(union(corners))
  }
  return rects.length ? union(rects) : null
}
export function moveSnapIndex(state: EditorState, targets: MoveTarget[]): SnapIndex {
  const moving = new Set(targets.flatMap(t => t.kind === 'layer' ? layerSubtreeIds(state.layers, t.layerId) : [t.layerId]))
  return createSnapIndex({ objects: state.layers.filter(l => !moving.has(l.id) && !layerSubtreeIds(state.layers, l.id).some(id => moving.has(id)) && effectiveLayerState(state.layers, l.id).visible).flatMap(l => {
    const bounds = moveTargetBounds(state, [layerTarget(l.id)])
    return bounds ? [{ id: l.id, bounds: { x: bounds.x * state.documentWidth / 100, y: bounds.y * state.documentHeight / 100, width: bounds.width * state.documentWidth / 100, height: bounds.height * state.documentHeight / 100 } }] : []
  }), guides: state.guideSettings.guidesVisible ? state.guideSettings.guides : [], canvas: { width: state.documentWidth, height: state.documentHeight }, grid: state.guideSettings.grid })
}
