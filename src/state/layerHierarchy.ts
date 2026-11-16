import type { EditorAction, EditorState, Layer } from './editor'

/** groupId is authoritative; children also supports older saved layer trees. */
export function layerParentId(layers: Layer[], id: string): string | undefined {
  const layer = layers.find((item) => item.id === id)
  if (layer?.groupId && layers.some((item) => item.id === layer.groupId)) return layer.groupId
  return layers.find((item) => item.id !== id && item.children?.includes(id))?.id
}

export function effectiveLayerState(layers: Layer[], id: string) {
  let visible = true, locked = false, opacity = 1
  const visited = new Set<string>()
  let current: string | undefined = id
  while (current && !visited.has(current)) {
    visited.add(current)
    const layer = layers.find((item) => item.id === current)
    if (!layer) break
    visible = visible && layer.visible
    locked = locked || !!layer.locked
    opacity *= layer.opacity / 100
    current = layerParentId(layers, current)
  }
  return { visible, locked, opacity }
}

export function layerSubtreeIds(layers: Layer[], id: string): string[] {
  const found = new Set<string>()
  const visit = (current: string) => {
    if (found.has(current) || !layers.some((layer) => layer.id === current)) return
    found.add(current)
    layers.filter((layer) => layerParentId(layers, layer.id) === current).forEach((layer) => visit(layer.id))
  }
  visit(id)
  return [...found]
}

/** One gate for all content writes, including moving existing objects across layers.
 * Lock controls may change the target's own lock, but cannot bypass a locked parent.
 * Copying a locked source is allowed because it does not change that source.
 */
export function layerWriteIsLocked(state: EditorState, action: EditorAction): boolean {
  const locked = (id: string) => effectiveLayerState(state.layers, id).locked
  const ancestorLocked = (id: string) => {
    const parent = layerParentId(state.layers, id)
    return parent ? locked(parent) : false
  }
  const subtreeLocked = (id: string) => layerSubtreeIds(state.layers, id).some(locked)
  const existingObjectLayer = (id: string) => [...state.canvasTexts, ...state.canvasShapes, ...state.brushStrokes].find((item) => item.id === id)?.layerId
  switch (action.type) {
    case 'toggle-layer-lock': return ancestorLocked(action.id)
    case 'batch-toggle-layer': case 'batch-delete-layers': case 'group-layers': return false
    case 'duplicate-layer': return ancestorLocked(action.id)
    case 'add-result-layer': return false
    case 'toggle-layer': case 'set-layer-opacity': case 'set-layer-blend': case 'rename-layer':
    case 'delete-layer': case 'reorder-layer': case 'move-layer': case 'set-layer-adjustment':
    case 'toggle-layer-adjustments-preview': case 'reset-layer-adjustments': case 'rasterize-layer': case 'set-layer-source': return subtreeLocked(action.id)
    case 'transform-group': case 'ungroup-layer': return subtreeLocked(action.id)
    case 'merge-layers': return action.ids.some(id => subtreeLocked(id))
    case 'replace-layer-with-result': case 'replace-layer-with-ai-result': return subtreeLocked(action.targetId)
    case 'commit-layer-transform': return subtreeLocked(action.layerId)
    case 'commit-brush-stroke': {
      const previous = existingObjectLayer(action.stroke.id)
      return locked(action.stroke.layerId) || !!previous && locked(previous)
    }
    case 'upsert-text': {
      const previous = existingObjectLayer(action.object.id)
      return locked(action.object.layerId) || !!previous && locked(previous)
    }
    case 'add-shape': {
      const previous = existingObjectLayer(action.shape.id)
      return locked(action.shape.layerId) || !!previous && locked(previous)
    }
    case 'remove-stroke': {
      const previous = existingObjectLayer(action.id)
      return !!previous && locked(previous)
    }
    case 'add-canvas-text': case 'selection-to-mask': case 'commit-mask': case 'invert-mask':
    case 'clear-mask': case 'apply-mask': return subtreeLocked(state.selectedLayerId)
    case 'resize-document': case 'commit-crop': return state.layers.some((layer) => locked(layer.id))
    case 'import-image': return !!action.autoSize && state.layers.some((layer) => locked(layer.id))
    default: return false
  }
}

let idSequence = 0
function freshId(prefix: string) {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${++idSequence}`}`
}

/** Document values are JSON data; clone nested geometry/metadata rather than alias it. */
function clone<T>(value: T): T { return structuredClone(value) }

export function duplicateLayerTree(state: EditorState, id: string, asRoot = false): EditorState {
  const source = state.layers.find((layer) => layer.id === id)
  if (!source) return state
  const subtree = new Set(layerSubtreeIds(state.layers, id))
  const layerIds = new Map([...subtree].map((oldId) => [oldId, freshId('layer')]))
  const objectIds = new Map<string, string>()
  const copyObject = <T extends { id: string; layerId: string }>(object: T): T => {
    const newId = freshId('object')
    objectIds.set(object.id, newId)
    return { ...clone(object), id: newId, layerId: layerIds.get(object.layerId) ?? object.layerId }
  }
  const copies = state.layers.filter((layer) => subtree.has(layer.id)).map((layer) => ({
    ...clone(layer), id: layerIds.get(layer.id)!, name: layer.id === id ? `${layer.name} 副本` : layer.name,
    locked: layer.id === id ? false : layer.locked,
    groupId: asRoot && layer.id === id ? undefined : layerIds.get(layerParentId(state.layers, layer.id) ?? '') ?? layerParentId(state.layers, layer.id),
    children: layer.children ? state.layers.filter((child) => layerParentId(state.layers, child.id) === layer.id).map((child) => layerIds.get(child.id)!) : undefined,
  }))
  const brushStrokes = state.brushStrokes.filter((item) => subtree.has(item.layerId)).map(copyObject)
  const canvasTexts = state.canvasTexts.filter((item) => subtree.has(item.layerId)).map(copyObject)
  const canvasShapes = state.canvasShapes.filter((item) => subtree.has(item.layerId)).map(copyObject)
  const layerMasks = { ...state.layerMasks }
  for (const oldId of subtree) {
    const mask = state.layerMasks[oldId]
    if (mask) layerMasks[layerIds.get(oldId)!] = { ...clone(mask), strokes: mask.strokes.map(copyObject) }
  }
  // AI edit metadata may refer to a layer inside the copied tree.
  for (const layer of copies) if (layer.aiOperation && layerIds.has(layer.aiOperation.sourceLayerId)) layer.aiOperation.sourceLayerId = layerIds.get(layer.aiOperation.sourceLayerId)!
  const copyId = layerIds.get(id)!
  const parent = asRoot ? undefined : layerParentId(state.layers, id)
  const layers = state.layers.map((layer) => layer.id === parent ? { ...layer, children: [...(layer.children ?? state.layers.filter((child) => layerParentId(state.layers, child.id) === parent).map((child) => child.id)), copyId] } : layer)
  const index = asRoot ? 0 : layers.findIndex((layer) => layer.id === id)
  return { ...state, layers: [...layers.slice(0, index), ...copies, ...layers.slice(index)], brushStrokes: [...state.brushStrokes, ...brushStrokes], canvasTexts: [...state.canvasTexts, ...canvasTexts], canvasShapes: [...state.canvasShapes, ...canvasShapes], layerMasks, sceneOrder: [...state.sceneOrder, ...state.sceneOrder.flatMap((oldId) => objectIds.has(oldId) ? [objectIds.get(oldId)!] : [])], selectedLayerId: copyId, selectedLayerIds: [copyId], notice: `已复制图层：${source.name}` }
}

export function deleteLayerTrees(state: EditorState, ids: string[]): EditorState {
  const removed = new Set(ids.flatMap((id) => layerSubtreeIds(state.layers, id)))
  if (!removed.size) return state
  if (state.layers.length - removed.size < 1) return { ...state, notice: '至少保留一个图层' }
  const layers = state.layers.filter((layer) => !removed.has(layer.id)).map((layer) => layer.children?.some((id) => removed.has(id)) ? { ...layer, children: layer.children.filter((id) => !removed.has(id)) } : layer)
  const objectIds = new Set([...state.brushStrokes, ...state.canvasTexts, ...state.canvasShapes].filter((item) => removed.has(item.layerId)).map((item) => item.id))
  const selectedLayerId = removed.has(state.selectedLayerId) ? layers[0].id : state.selectedLayerId
  const selectedLayerIds = state.selectedLayerIds.filter((id) => !removed.has(id))
  return { ...state, layers, selectedLayerId, selectedLayerIds: selectedLayerIds.length ? selectedLayerIds : [selectedLayerId], brushStrokes: state.brushStrokes.filter((item) => !removed.has(item.layerId)), canvasTexts: state.canvasTexts.filter((item) => !removed.has(item.layerId)), canvasShapes: state.canvasShapes.filter((item) => !removed.has(item.layerId)), layerMasks: Object.fromEntries(Object.entries(state.layerMasks).filter(([id]) => !removed.has(id))), sceneOrder: state.sceneOrder.filter((id) => !objectIds.has(id)), notice: '已删除图层' }
}

/** Reordering changes sibling stacking and carries every descendant with its root. */
export function moveLayerSubtree(layers: Layer[], id: string, targetId: string, position: 'before' | 'after'): Layer[] {
  if (id === targetId || !layers.some((layer) => layer.id === id) || !layers.some((layer) => layer.id === targetId)) return layers
  if (layerParentId(layers, id) !== layerParentId(layers, targetId)) return layers
  const movingIds = new Set(layerSubtreeIds(layers, id))
  if (movingIds.has(targetId)) return layers
  const moving = layers.filter((layer) => movingIds.has(layer.id))
  const remaining = layers.filter((layer) => !movingIds.has(layer.id))
  const targetIds = new Set(layerSubtreeIds(layers, targetId))
  const index = position === 'before' ? remaining.findIndex((layer) => layer.id === targetId) : remaining.reduce((last, layer, index) => targetIds.has(layer.id) ? index + 1 : last, 0)
  const next = [...remaining.slice(0, index), ...moving, ...remaining.slice(index)]
  if (next.every((layer, index) => layer === layers[index])) return layers
  const parentId = layerParentId(layers, id)
  const children = next.filter((layer) => layerParentId(layers, layer.id) === parentId).map((layer) => layer.id)
  return parentId ? next.map((layer) => layer.id === parentId ? { ...layer, children } : layer) : next
}

export function reorderLayerSubtree(layers: Layer[], id: string, direction: 'up' | 'down'): Layer[] {
  const parentId = layerParentId(layers, id)
  const siblings = layers.filter((layer) => layerParentId(layers, layer.id) === parentId)
  const from = siblings.findIndex((layer) => layer.id === id)
  const target = siblings[from + (direction === 'up' ? -1 : 1)]
  return from < 0 || !target ? layers : moveLayerSubtree(layers, id, target.id, direction === 'up' ? 'before' : 'after')
}
