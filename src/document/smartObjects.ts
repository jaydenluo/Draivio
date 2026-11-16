import type { EditorState, Layer } from '../state/editor'

export type SmartObjectDocument = Pick<EditorState, 'layers' | 'canvasTexts' | 'canvasShapes' | 'brushStrokes' | 'sceneOrder' | 'layerMasks'>

export type SmartObjectSourceKind = 'image' | 'text' | 'shape' | 'document'
export type SmartObjectSource = {
  id: string
  kind: SmartObjectSourceKind
  source?: string
  text?: string
  width: number
  height: number
  revision: number
  parentSourceId?: string
  document?: SmartObjectDocument
}

export type SmartObjectInstance = {
  sourceId: string
  linked: boolean
  instanceWidth: number
  instanceHeight: number
  maskId?: string
}

export function validateSmartObjectGraph(sources: Record<string, SmartObjectSource>, rootId: string, maxDepth = 8): void {
  const visited = new Set<string>()
  const walk = (id: string, depth: number) => {
    if (depth > maxDepth) throw new Error(`智能对象嵌套超过上限 ${maxDepth}`)
    if (visited.has(id)) throw new Error('检测到智能对象循环引用')
    const source = sources[id]
    if (!source) throw new Error(`智能对象源内容缺失：${id}`)
    if (source.id !== id || !['image', 'text', 'shape', 'document'].includes(source.kind) || !Number.isFinite(source.width) || !Number.isFinite(source.height) || source.width <= 0 || source.height <= 0 || source.width > 16384 || source.height > 16384 || !Number.isInteger(source.revision) || source.revision < 1) throw new Error('智能对象源内容格式无效')
    if (source.source !== undefined && (typeof source.source !== 'string' || !source.source.trim()) || source.text !== undefined && typeof source.text !== 'string' || source.parentSourceId !== undefined && (typeof source.parentSourceId !== 'string' || !source.parentSourceId.trim())) throw new Error('智能对象源字段无效')
    if (source.document !== undefined && (!source.document || typeof source.document !== 'object' || Array.isArray(source.document) || Object.keys(source.document).some(key => !['layers', 'canvasTexts', 'canvasShapes', 'brushStrokes', 'sceneOrder', 'layerMasks'].includes(key)))) throw new Error('智能对象内部文档字段无效')
    if (!source.source && !source.document) throw new Error(`智能对象源内容缺失：${id}`)
    if (source.document && (!source.document.layerMasks || typeof source.document.layerMasks !== 'object' || Array.isArray(source.document.layerMasks) || !Array.isArray(source.document.layers) || !source.document.layers.length || source.document.layers.length > 10000 || !Array.isArray(source.document.canvasTexts) || !Array.isArray(source.document.canvasShapes) || !Array.isArray(source.document.brushStrokes) || !Array.isArray(source.document.sceneOrder))) throw new Error('智能对象内部文档无效')
    visited.add(id)
    if (source.parentSourceId) walk(source.parentSourceId, depth + 1)
    for (const layer of source.document?.layers ?? []) if (layer.smartObject) walk(layer.smartObject.sourceId, depth + 1)
    visited.delete(id)
  }
  walk(rootId, 0)
}

export function createSmartObjectSource(layer: Layer, id: string, state?: EditorState): SmartObjectSource {
  const kind: SmartObjectSourceKind = layer.kind === 'text' ? 'text' : layer.kind === 'shape' ? 'shape' : 'image'
  const source: SmartObjectSource = { id, kind, source: layer.source, width: Math.max(1, layer.contentWidth ?? state?.documentWidth ?? 1), height: Math.max(1, layer.contentHeight ?? state?.documentHeight ?? 1), revision: 1 }
  if (state) {
    const canvasTexts = state.canvasTexts.filter(item => item.layerId === layer.id), canvasShapes = state.canvasShapes.filter(item => item.layerId === layer.id), brushStrokes = state.brushStrokes.filter(item => item.layerId === layer.id)
    const objects = new Set([...canvasTexts, ...canvasShapes, ...brushStrokes].map(item => item.id))
    source.document = structuredClone({ layers: [{ ...layer, visible: true, transform: undefined, effects: undefined, smartFilters: undefined, adjustments: undefined, opacity: 100, blendMode: '正常', groupId: undefined, children: undefined, clipBaseId: undefined }], canvasTexts, canvasShapes, brushStrokes, sceneOrder: state.sceneOrder.filter(id => objects.has(id)), layerMasks: {} })
  }
  return source
}

export function smartObjectState(parent: EditorState, source: SmartObjectSource): EditorState {
  const document = source.document ?? { layers: [{ id: 'source', name: '源内容', className: 'layer-art', source: source.source, visible: true, opacity: 100, blendMode: '正常', contentWidth: source.width, contentHeight: source.height }], canvasTexts: [], canvasShapes: [], brushStrokes: [], sceneOrder: [], layerMasks: {} }
  // Internal content has a local canvas and layer namespace. Parent artboards
  // refer to sibling/instance IDs which do not exist inside the source.
  const board = { id: `source-board:${source.id}`, name: '源内容', x: 0, y: 0, width: source.width, height: source.height, background: 'transparent', layerIds: document.layers.map(layer => layer.id) }
  return { ...parent, ...document, artboards: [board], activeArtboardId: board.id, documentWidth: source.width, documentHeight: source.height, documentBackground: 'transparent', selectedLayerId: document.layers[0]?.id ?? '', selectedLayerIds: [], curvePreviewOffLayerId: undefined }
}

export function replaceSmartObjectInstance(layer: Layer, source: SmartObjectSource, maskId?: string): Layer {
  if (!layer.smartObject) throw new Error('目标图层不是智能对象')
  return { ...layer, source: source.source, smartObject: { ...layer.smartObject, sourceId: source.id, maskId: maskId ?? layer.smartObject.maskId } }
}

export function updateLinkedInstances(layers: Layer[], sourceId: string, patch: Partial<SmartObjectSource>): Layer[] {
  return layers.map(layer => layer.smartObject?.sourceId === sourceId && layer.smartObject.linked ? { ...layer, source: patch.source ?? layer.source } : layer)
}

export function rasterizeSmartObject(layer: Layer, source: SmartObjectSource): Layer {
  const { smartObject: _smartObject, ...rest } = layer
  return { ...rest, source: source.source, kind: 'image' }
}

export function sampleSourceSize(source: SmartObjectSource, scale: number): { width: number; height: number } {
  if (!Number.isFinite(scale) || scale <= 0) throw new Error('智能对象缩放比例无效')
  return { width: Math.max(1, Math.round(source.width * scale)), height: Math.max(1, Math.round(source.height * scale)) }
}
