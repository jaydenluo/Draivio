import type { EditorState, Layer } from '../state/editor'
import { invertMatrix, layerMatrix, multiplyPoint, type AffineMatrix } from '../canvas/layerCoordinates'
import type { TransformDraft } from '../canvas/TransformOverlay'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'

export type AlignmentRequest = { reference: 'canvas' | 'selection' | 'key'; operation: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'distribute-x' | 'distribute-y'; keyLayerId?: string }
type Bounds = { x: number; y: number; width: number; height: number }
const identity = (): AffineMatrix => [1, 0, 0, 1, 0, 0]
const defaultTransform = (): TransformDraft => ({ kind: 'transform', rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false })
function multiply(a: AffineMatrix, b: AffineMatrix): AffineMatrix {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
}
/** Pixel-space equivalent of CanvasScene.layerTransformValue, including content size. */
function localMatrix(state: EditorState, layer: Layer): AffineMatrix {
  const w = state.documentWidth, h = state.documentHeight
  const m = layerMatrix(layer.transform ?? defaultTransform(), w, h)
  return [m[0]*w/(layer.contentWidth ?? w), m[1]*h/(layer.contentWidth ?? w), m[2]*w/(layer.contentHeight ?? h), m[3]*h/(layer.contentHeight ?? h), m[4]*w/100, m[5]*h/100]
}
function worldMatrix(state: EditorState, id: string, visited = new Set<string>()): AffineMatrix {
  if (visited.has(id)) throw new Error('图层层级循环，无法对齐')
  visited.add(id)
  const layer = state.layers.find(l => l.id === id)
  if (!layer) throw new Error('图层不存在')
  const parent = layerParentId(state.layers, id)
  return multiply(parent ? worldMatrix(state, parent, visited) : identity(), localMatrix(state, layer))
}
function union(bounds: Bounds[]): Bounds {
  const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y))
  return { x, y, width: Math.max(...bounds.map(b => b.x+b.width))-x, height: Math.max(...bounds.map(b => b.y+b.height))-y }
}
/** A layer frame uses its four transformed corners; a group uses its visible subtree union. */
export function layerWorldBounds(state: EditorState, id: string): Bounds {
  const subtree = layerSubtreeIds(state.layers, id)
  const frames = subtree.filter(child => effectiveLayerState(state.layers, child).visible).filter(child => {
    const l = state.layers.find(item => item.id === child)!
    const hasOwnObjects = state.canvasShapes.some(item => item.layerId === child) || state.canvasTexts.some(item => item.layerId === child) || state.brushStrokes.some(item => item.layerId === child)
    return !!l.source || hasOwnObjects || !state.layers.some(item => layerParentId(state.layers, item.id) === child)
  }).map(child => {
    const l = state.layers.find(item => item.id === child)!, m = worldMatrix(state, child), w = l.contentWidth ?? state.documentWidth, h = l.contentHeight ?? state.documentHeight
    const p = [{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}].map(point => multiplyPoint(m,point))
    const x = Math.min(...p.map(v=>v.x)), y = Math.min(...p.map(v=>v.y))
    return { x, y, width: Math.max(...p.map(v=>v.x))-x, height: Math.max(...p.map(v=>v.y))-y }
  })
  if (!frames.length) throw new Error('图层没有可见边界')
  return union(frames)
}
/** Normalize before filtering so excluding a locked group never releases its selected children. */
export function alignmentTargets(state: EditorState): Layer[] {
  const selected = new Set(state.selectedLayerIds)
  return state.layers.filter(layer => selected.has(layer.id)).filter(layer => {
    const seen = new Set([layer.id]); let parent = layerParentId(state.layers, layer.id)
    while (parent) { if (seen.has(parent) || selected.has(parent)) return false; seen.add(parent); parent = layerParentId(state.layers,parent) }
    if (!effectiveLayerState(state.layers, layer.id).visible || layerSubtreeIds(state.layers,layer.id).some(id => effectiveLayerState(state.layers,id).locked)) return false
    try { invertMatrix(worldMatrix(state,layer.id)); const b = layerWorldBounds(state,layer.id); return Object.values(b).every(Number.isFinite) } catch { return false }
  })
}
export function planAlignment(state: EditorState, request: AlignmentRequest): { transforms: Record<string, TransformDraft>; error?: string; skipped: number } {
  const targets = alignmentTargets(state), skipped = new Set(state.selectedLayerIds).size-targets.length
  const fail = (error: string) => ({ transforms: {}, error, skipped })
  const distribute = request.operation.startsWith('distribute')
  if (targets.length < (distribute ? 3 : 2)) return fail(distribute ? '等距分布至少需要三个可移动对象（已排除锁定、隐藏及重复子层）' : '对齐至少需要两个可移动对象（已排除锁定、隐藏及重复子层）')
  const key = request.reference === 'key' ? targets.find(l => l.id === request.keyLayerId) : undefined
  if (request.reference === 'key' && !key) return fail('请选择有效的关键对象；关键对象不能被锁定、隐藏或包含于另一所选父组')
  try {
    const bounds = new Map(targets.map(l => [l.id,layerWorldBounds(state,l.id)])), selection = union([...bounds.values()])
    const crop = state.cropRect ?? { x:0,y:0,width:100,height:100 }
    const reference = request.reference === 'canvas' ? { x:crop.x*state.documentWidth/100,y:crop.y*state.documentHeight/100,width:crop.width*state.documentWidth/100,height:crop.height*state.documentHeight/100 } : key ? bounds.get(key.id)! : selection
    const axis = ['left','center-x','right','distribute-x'].includes(request.operation) ? 'x' : 'y', size = axis === 'x' ? 'width' : 'height'
    const positions = new Map<string,number>()
    if (distribute) {
      const sorted = [...targets].sort((a,b) => bounds.get(a.id)![axis]-bounds.get(b.id)![axis])
      // Key mode retains the selection span and translates the equally spaced run to pin the key.
      const span = request.reference === 'canvas' ? reference : selection
      const gap = (span[size]-targets.reduce((sum,l)=>sum+bounds.get(l.id)![size],0))/(targets.length-1)
      if (gap < -1e-7) return fail('无法等距分布：可用空间产生负间距，请扩大范围或缩小对象')
      let cursor = span[axis]
      for (const l of sorted) { positions.set(l.id,cursor); cursor += bounds.get(l.id)![size]+Math.max(0,gap) }
      const shift = key ? bounds.get(key.id)![axis]-positions.get(key.id)! : 0
      for (const [id,value] of positions) positions.set(id,value+shift)
    } else {
      const factor = request.operation.startsWith('center') ? .5 : ['right','bottom'].includes(request.operation) ? 1 : 0
      for (const l of targets) positions.set(l.id,reference[axis]+reference[size]*factor-bounds.get(l.id)![size]*factor)
    }
    const transforms: Record<string,TransformDraft> = {}
    for (const l of targets) {
      if (l.id === key?.id) continue
      const delta = positions.get(l.id)!-bounds.get(l.id)![axis]
      if (Math.abs(delta)<1e-7) continue
      const parent = layerParentId(state.layers,l.id), inverse = parent ? invertMatrix(worldMatrix(state,parent)) : identity()
      const dx = axis === 'x' ? delta : 0, dy = axis === 'y' ? delta : 0
      const localX = inverse[0]*dx+inverse[2]*dy, localY = inverse[1]*dx+inverse[3]*dy
      const transform = l.transform ?? defaultTransform()
      transforms[l.id] = { ...transform, rect: { ...transform.rect, x: transform.rect.x+localX/state.documentWidth*100, y: transform.rect.y+localY/state.documentHeight*100 } }
    }
    return { transforms, skipped }
  } catch (error) { return fail(error instanceof Error ? error.message : '图层几何无效，无法对齐') }
}
