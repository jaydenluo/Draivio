import type { EditorState, Layer } from '../state/editor'

type IdMap = Map<string, string>

function freshId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function remapLayer(layer: Layer, ids: IdMap, sourceRoot: string) {
  const next = clone(layer)
  next.id = ids.get(layer.id) ?? layer.id
  if (layer.groupId) next.groupId = ids.get(layer.groupId)
  if (layer.children) next.children = layer.children.map(id => ids.get(id) ?? id)
  if (next.aiOperation) {
    next.aiOperation.sourceLayerId = ids.get(next.aiOperation.sourceLayerId) ?? next.aiOperation.sourceLayerId
  }
  if (layer.id === sourceRoot) next.name = `${layer.name} 副本`
  return next
}

/** Copy editable document content into another session without sharing mutable objects or IDs. */
export function cloneDocumentContent(source: EditorState, targetDocumentId: string): Pick<EditorState, 'documentId' | 'documentWidth' | 'documentHeight' | 'documentBackground' | 'layers' | 'selectedLayerId' | 'selectedLayerIds' | 'aiResults' | 'brushStrokes' | 'canvasTexts' | 'canvasShapes' | 'layerMasks' | 'sceneOrder' | 'selection' | 'selectionRect' | 'selectionVisible' | 'cropRect' | 'prompt' | 'composerMode' | 'composerSourceId' | 'composerParameters'> {
  const layerIds = new Map(source.layers.map(layer => [layer.id, freshId('layer')]))
  const objectIds = new Map<string, string>()
  const copyObject = <T extends { id: string; layerId: string }>(object: T): T => {
    const next = clone(object)
    const id = freshId('object')
    objectIds.set(object.id, id)
    next.id = id
    next.layerId = layerIds.get(object.layerId) ?? object.layerId
    return next
  }
  const layers = source.layers.map(layer => remapLayer(layer, layerIds, source.selectedLayerId))
  const brushStrokes = source.brushStrokes.map(copyObject)
  const canvasTexts = source.canvasTexts.map(copyObject)
  const canvasShapes = source.canvasShapes.map(copyObject)
  const layerMasks = Object.fromEntries(Object.entries(source.layerMasks).map(([id, mask]) => [layerIds.get(id) ?? id, { ...clone(mask), strokes: mask.strokes.map(copyObject) }]))
  const aiResults = clone(source.aiResults).map(result => ({
    ...result,
    id: objectIds.get(result.id) ?? freshId('result'),
    request: result.request ? { ...result.request, sourceLayerId: layerIds.get(result.request.sourceLayerId) ?? result.request.sourceLayerId } : result.request,
    adoptions: result.adoptions?.map(adoption => ({ ...adoption, layerId: layerIds.get(adoption.layerId) ?? adoption.layerId, originalLayer: adoption.originalLayer ? remapLayer(adoption.originalLayer, layerIds, source.selectedLayerId) : undefined })),
  }))
  return {
    documentId: targetDocumentId, documentWidth: source.documentWidth, documentHeight: source.documentHeight, documentBackground: source.documentBackground,
    layers, selectedLayerId: layerIds.get(source.selectedLayerId) ?? layers[0]?.id ?? source.selectedLayerId,
    selectedLayerIds: source.selectedLayerIds.map(id => layerIds.get(id) ?? id), aiResults, brushStrokes, canvasTexts, canvasShapes, layerMasks,
    sceneOrder: source.sceneOrder.map(id => objectIds.get(id) ?? id), selection: clone(source.selection), selectionRect: clone(source.selectionRect), selectionVisible: source.selectionVisible,
    cropRect: clone(source.cropRect), prompt: source.prompt, composerMode: source.composerMode, composerSourceId: source.composerSourceId, composerParameters: clone(source.composerParameters),
  }
}

/** Return all persisted image strings referenced by a document, deduplicated by content. */
export function collectDocumentResourceReferences(document: Pick<EditorState, 'layers' | 'aiResults'>): Set<string> {
  const result = new Set<string>()
  const add = (value: unknown) => { if (typeof value === 'string' && value !== 'fixture' && (value.startsWith('data:image/') || value.startsWith('asset:') || value.startsWith('blob:') || value.startsWith('http'))) result.add(value) }
  for (const layer of document.layers) { add(layer.source); add(layer.thumbnail); add(layer.aiOperation?.sourceImage) }
  for (const item of document.aiResults) { add(item.source); add(item.thumbnail); add(item.request?.sourceImage); for (const adoption of item.adoptions ?? []) { add(adoption.originalLayer?.source); add(adoption.originalLayer?.thumbnail) } }
  return result
}

export function createSharedPreviewCache(maxBytes: number) {
  const entries = new Map<string, { value: string; bytes: number }>()
  let bytes = 0
  const size = (value: string) => new TextEncoder().encode(value).byteLength
  const trim = () => { while (bytes > maxBytes && entries.size) { const oldest = entries.keys().next().value as string; const item = entries.get(oldest)!; entries.delete(oldest); bytes -= item.bytes } }
  return {
    get(key: string) { const item = entries.get(key); if (!item) return undefined; entries.delete(key); entries.set(key, item); return item.value },
    set(key: string, value: string) { const previous = entries.get(key); if (previous) bytes -= previous.bytes; const item = { value, bytes: size(value) }; entries.set(key, item); bytes += item.bytes; trim() },
    delete(key: string) { const item = entries.get(key); if (!item) return false; entries.delete(key); bytes -= item.bytes; return true },
    clear() { entries.clear(); bytes = 0 },
    get bytes() { return bytes },
    get size() { return entries.size },
  }
}
