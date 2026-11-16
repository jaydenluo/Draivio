import type { EditorState, Layer } from '../../state/editor'
import type { Selection, SelectionRect } from '../../canvas/selectionGeometry'
import { multiplyPoint, type AffineMatrix } from '../../canvas/layerCoordinates'
import { effectiveLayerState, layerParentId } from '../../state/layerHierarchy'

export type EditorScope = 'document' | 'layer' | 'selection'
export type EditorRequestContext = {
  documentId: string
  revision: string
  scope: EditorScope
  width: number
  height: number
  targetLayerId: string | null
  selection: Selection | null
  pixelBounds: SelectionRect
  targetToDocument: AffineMatrix
  layers: { id: string; name: string; parentId: string | null; locked: boolean; visible: boolean }[]
  /** Rendered PNG is attached by captureRenderedEditorContext before dispatching a request. */
  preview: { width: number; height: number; scale: number; dataUrl?: string }
  requestId: string
}

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

// Content identity excludes presentation and current selection. Compact metadata avoids
// embedding the entire prior document recursively in each generated result's provenance.
export function contentRevision(state: EditorState, ownRequestId?: string): string {
  const layers = ownRequestId ? state.layers.filter(layer => {
    if (layer.aiOperation?.context?.requestId !== ownRequestId) return true
    const result = state.aiResults.find(result => result.id === layer.id)
    // Ignore only a completely pristine receipt. Any user-visible/content field
    // edit (including blend, adjustments, dimensions, order/group metadata or
    // provenance) must invalidate the request so a late result cannot land.
    const receiptFields = new Set(['id','name','className','visible','opacity','blendMode','source','thumbnail','aiOperation','adjustments'])
    if (Object.entries(layer).some(([key,value])=>value!==undefined && !receiptFields.has(key))) return true
    if (!result || layer.source !== result.source || layer.thumbnail !== result.thumbnail ||
      layer.opacity !== 100 || !layer.visible || !!layer.locked || !!layer.transform ||
      !!layer.clipBaseId || !!layer.groupId || !!layer.children || layer.contentWidth !== undefined ||
      layer.contentHeight !== undefined || layer.className !== 'layer-art' ||
      !/^生成图片 · \d+$/.test(layer.name) || layer.blendMode !== '正常' ||
      (layer.adjustments !== undefined && JSON.stringify(layer.adjustments) !== JSON.stringify({ brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, blur: 0, shadows: 0, highlights: 0 })) ||
      JSON.stringify(layer.aiOperation) !== JSON.stringify(result.request)) return true
    return false
  }) : state.layers
  const text = JSON.stringify([state.documentWidth, state.documentHeight, state.documentBackground, layers,
    state.brushStrokes, state.canvasTexts, state.canvasShapes, state.layerMasks, state.sceneOrder, state.smartObjectSources])
  let a = 2166136261, b = 5381
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619)
    b = Math.imul(b, 33) ^ text.charCodeAt(i)
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`
}

function multiply(left: AffineMatrix, right: AffineMatrix): AffineMatrix {
  const [a, b, c, d, e, f] = left, [g, h, i, j, k, l] = right
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f]
}

/** Physical-pixel equivalent of CanvasScene.layerTransformValue, including content sizing. */
function localPixelMatrix(layer: Layer, width: number, height: number): AffineMatrix {
  const contentWidth = layer.contentWidth ?? width, contentHeight = layer.contentHeight ?? height
  if (![contentWidth, contentHeight].every(value => Number.isFinite(value) && value > 0)) throw new Error('图层内容尺寸无效')
  const transform = layer.transform
  if (!transform) return [width / contentWidth, 0, 0, height / contentHeight, 0, 0]
  if(transform.affine){const [a,b,c,d,e,f]=transform.affine;return multiply([a,b*height/width,c*width/height,d,e*width/100,f*height/100],localPixelMatrix({...layer,transform:{...transform,affine:undefined}},width,height))}
  const { rect, rotation, flipX, flipY } = transform
  if (![rect.x, rect.y, rect.width, rect.height, rotation].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new Error('图层变换无效')
  const theta = rotation * Math.PI / 180, cos = Math.cos(theta), sin = Math.sin(theta)
  const sx = rect.width / 100 * width / contentWidth * (flipX ? -1 : 1)
  const sy = rect.height / 100 * height / contentHeight * (flipY ? -1 : 1)
  const a = cos * sx, b = sin * sx, c = -sin * sy, d = cos * sy
  const cx = (rect.x + rect.width / 2) * width / 100, cy = (rect.y + rect.height / 2) * height / 100
  return [a, b, c, d, cx - a * contentWidth / 2 - c * contentHeight / 2, cy - b * contentWidth / 2 - d * contentHeight / 2]
}

/** Target content percentages to document percentages, matching the nested SVG transform chain. */
function targetMatrix(state: EditorState, target: Layer | undefined): AffineMatrix {
  if (!target) return [1, 0, 0, 1, 0, 0]
  const { documentWidth: width, documentHeight: height } = state
  let matrix: AffineMatrix = [(target.contentWidth ?? width) / 100, 0, 0, (target.contentHeight ?? height) / 100, 0, 0]
  let current: Layer | undefined = target
  const visited = new Set<string>()
  while (current) {
    if (visited.has(current.id)) throw new Error('图层组存在循环引用')
    visited.add(current.id)
    matrix = multiply(localPixelMatrix(current, width, height), matrix)
    const parentId = layerParentId(state.layers, current.id)
    current = parentId ? state.layers.find(layer => layer.id === parentId) : undefined
  }
  return multiply([100 / width, 0, 0, 100 / height, 0, 0], matrix)
}

/** Capture once before asynchronous work. Coordinates never depend on CSS/device pixels. */
export function captureEditorContext(state: EditorState, documentId: string, scope: EditorScope): EditorRequestContext {
  const width = state.documentWidth, height = state.documentHeight
  if (!documentId || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('文档尺寸无效')
  const target = state.layers.find(layer => layer.id === state.selectedLayerId)
  if (scope !== 'document' && !target) throw new Error('请先选择有效图层')
  if (scope !== 'document' && target && effectiveLayerState(state.layers, target.id).locked) throw new Error('目标图层或所属组已锁定，请先解锁')
  const selection = scope === 'selection' && state.selectionVisible ? structuredClone(state.selection) : null
  if (scope === 'selection' && (!selection || ![selection.rect.x, selection.rect.y, selection.rect.width, selection.rect.height].every(Number.isFinite) || selection.rect.width <= 0 || selection.rect.height <= 0)) throw new Error('请先建立有效选区')
  const targetToDocument = targetMatrix(state, target)
  const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }].map(point => multiplyPoint(targetToDocument, point))
  const left = Math.min(...corners.map(point => point.x)), top = Math.min(...corners.map(point => point.y))
  const layerBounds = { x: left, y: top, width: Math.max(...corners.map(point => point.x)) - left, height: Math.max(...corners.map(point => point.y)) - top }
  const rect = scope === 'selection' ? selection!.rect : scope === 'layer' ? layerBounds : { x: 0, y: 0, width: 100, height: 100 }
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y)
  const right = Math.min(100, rect.x + rect.width), bottom = Math.min(100, rect.y + rect.height)
  if (right <= x || bottom <= y) throw new Error(scope === 'selection' ? '选区位于画布外，请重新选择' : '目标图层位于画布外')
  const scale = Math.min(1, 1024 / Math.max(width, height))
  return freeze({
    documentId, requestId: crypto.randomUUID(), revision: contentRevision(state), scope, width, height, targetLayerId: target?.id ?? null,
    selection, targetToDocument, pixelBounds: { x: x / 100 * width, y: y / 100 * height, width: (right - x) / 100 * width, height: (bottom - y) / 100 * height },
    layers: state.layers.map(layer => ({ id: layer.id, name: layer.name, parentId: layerParentId(state.layers, layer.id) ?? null, ...effectiveLayerState(state.layers, layer.id) })),
    preview: { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale },
  })
}

/** A batch's own appended results are excluded; unrelated edits still invalidate its basis. */
export function contextCanCommit(state: EditorState, context: EditorRequestContext): boolean {
  return contentRevision(state, context.requestId) === context.revision &&
    (context.targetLayerId === null || state.layers.some(layer => layer.id === context.targetLayerId))
}
