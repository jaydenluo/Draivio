import { expect, test } from 'vitest'
import { editorReducer, initialEditorState } from './editor'

test('manages layer names, lock state, ordering and duplication', () => {
  let state = editorReducer(initialEditorState, { type: 'rename-layer', id: 'art', name: '主视觉' })
  state = editorReducer(state, { type: 'toggle-layer-lock', id: 'art' })
  expect(state.layers[0]).toMatchObject({ name: '主视觉', locked: true })
  state = editorReducer(state, { type: 'duplicate-layer', id: 'art' })
  expect(state.layers[0].name).toBe('主视觉 副本')
  expect(state.layers[0].locked).toBe(false)
  state = editorReducer(state, { type: 'reorder-layer', id: state.layers[0].id, direction: 'down' })
  expect(state.layers[1].name).toBe('主视觉 副本')
  state = editorReducer(state, { type: 'delete-layer', id: state.layers[1].id })
  expect(state.layers.some((layer) => layer.name === '主视觉 副本')).toBe(false)
})

test('adds or replaces a layer from an AI result', () => {
  const resultLayer = { id: 'result-1', name: '生成结果 · 1', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' as const, thumbnail: 'data:image/png;base64,result' }
  let state = editorReducer({ ...initialEditorState, layers: [resultLayer, ...initialEditorState.layers], selectedLayerId: 'art' }, { type: 'add-result-layer', resultId: 'result-1' })
  expect(state.layers[0].name).toBe('生成结果 · 1 副本')
  state = editorReducer(state, { type: 'replace-layer-with-result', targetId: 'art', resultId: 'result-1' })
  expect(state.layers.find((layer) => layer.id === 'art')).toMatchObject({ name: '生成结果 · 1', thumbnail: 'data:image/png;base64,result' })
})

test('patch and heal results are committed as independent repair layers', () => {
  const state = editorReducer(initialEditorState, { type: 'add-repair-layer', baseLayerId: 'art', name: '修补结果', source: 'data:image/png;base64,repair' })
  expect(state.layers[0]).toMatchObject({ className: 'layer-repair', source: 'data:image/png;base64,repair' })
  expect(state.layers.find(layer => layer.id === 'art')?.source).toBe('fixture')
  expect(state.history.at(-1)?.label).toBe('修补结果')
  expect(editorReducer(state, { type: 'undo' }).layers).toHaveLength(initialEditorState.layers.length)
})

test('supports multi-selection and batch layer operations', () => {
  let state = editorReducer(initialEditorState, { type: 'select-layer', id: 'art', additive: false })
  state = editorReducer(state, { type: 'toggle-layer-selection', id: 'mask' })
  expect(state.selectedLayerIds).toEqual(expect.arrayContaining(['art', 'mask']))
  state = editorReducer(state, { type: 'batch-toggle-layer', ids: state.selectedLayerIds, property: 'visible' })
  expect(state.layers.find((layer) => layer.id === 'art')?.visible).toBe(false)
  expect(state.layers.find((layer) => layer.id === 'mask')?.visible).toBe(false)
})

test('stores non destructive adjustments and resets them', () => {
  let state = editorReducer(initialEditorState, { type: 'set-layer-adjustment', id: 'art', key: 'brightness', value: 22 })
  expect(state.layers.find((layer) => layer.id === 'art')?.adjustments?.brightness).toBe(22)
  state = editorReducer(state, { type: 'reset-layer-adjustments', id: 'art' })
  expect(state.layers.find((layer) => layer.id === 'art')?.adjustments?.brightness).toBe(0)
})

test('creates adjustment layers below the selected layer and protects them when locked', () => {
  const base = { ...initialEditorState, layers: [
    { ...initialEditorState.layers[0], id: 'top' },
    { ...initialEditorState.layers[0], id: 'bottom' },
  ], selectedLayerId: 'top', selectedLayerIds: ['top'] }
  const added = editorReducer(base, { type: 'add-adjustment-layer' })
  expect(added.layers.map(layer => layer.id)).toEqual(['top', expect.any(String), 'bottom'])
  const adjustment = added.layers[1]
  expect(adjustment.kind).toBe('adjustment')
  const locked = editorReducer(added, { type: 'toggle-layer-lock', id: adjustment.id })
  const unchanged = editorReducer(locked, { type: 'set-layer-adjustment', id: adjustment.id, key: 'brightness', value: 40 })
  expect(unchanged.layers.find(layer => layer.id === adjustment.id)?.adjustments?.brightness).toBe(0)
  const undone = editorReducer(unchanged, { type: 'undo' })
  expect(undone.layers.some(layer => layer.id === adjustment.id)).toBe(true)
  expect(undone.layers.find(layer => layer.id === adjustment.id)?.locked).toBeFalsy()
})

test('keeps AI candidates separate from formal layers and allows adoption', () => {
  const result = { id: 'candidate-1', source: 'data:image/png;base64,x', thumbnail: 'data:image/png;base64,x', prompt: '海报', model: 'gpt-image-1', provider: 'openai', size: '1024x1024', createdAt: '2026-11-13T00:00:00Z', status: 'success' as const, favorite: false, adopted: false }
  let state = editorReducer(initialEditorState, { type: 'add-ai-result', result })
  expect(state.aiResults).toHaveLength(1)
  state = editorReducer(state, { type: 'toggle-ai-result-favorite', id: result.id })
  expect(state.aiResults[0].favorite).toBe(true)
  state = editorReducer(state, { type: 'adopt-ai-result-as-layer', id: result.id })
  expect(state.aiResults[0].adopted).toBe(true)
  expect(state.layers[0].source).toBe(result.source)
})

// R01 exercises the public reducer: a locked ancestor must protect every content path.
function hierarchyState() {
  const child = { ...initialEditorState.layers[0], id: 'child', groupId: 'group', locked: false }
  return { ...initialEditorState, selectedLayerId: 'child', selectedLayerIds: ['child'], layers: [
    { ...child, id: 'group', groupId: undefined, children: ['child'], locked: true }, child,
    { ...child, id: 'outside', groupId: undefined },
  ], brushStrokes: [{ id: 'stroke', layerId: 'child', mode: 'paint' as const, points: [{ x: 10, y: 10 }], size: 10, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: '#000000' }], canvasTexts: [{ id: 'text', layerId: 'child', x: 10, y: 20, text: 'original', fontFamily: 'serif', fontSize: 20, fontWeight: '400', color: '#ffffff', align: 'left' as const }], canvasShapes: [{ id: 'shape', layerId: 'child', kind: 'rectangle' as const, rect: { x: 0, y: 0, width: 20, height: 20 }, color: '#ffffff', strokeWidth: 1 }], layerMasks: { child: { strokes: [], inverted: false, applied: false } }, sceneOrder: ['stroke', 'text', 'shape'] }
}

test('locked ancestors protect all reducer content mutations, including masks, deletion and bulk operations', () => {
  const state = hierarchyState()
  const actions: import('./editor').EditorAction[] = [
    { type: 'toggle-layer', id: 'child' }, { type: 'rename-layer', id: 'child', name: 'changed' },
    { type: 'set-layer-opacity', id: 'child', opacity: 5 }, { type: 'set-layer-blend', id: 'child', blendMode: 'multiply' },
    { type: 'toggle-layer-lock', id: 'child' }, { type: 'delete-layer', id: 'child' },
    { type: 'batch-delete-layers', ids: ['child'] }, { type: 'batch-toggle-layer', ids: ['child'], property: 'visible' },
    { type: 'batch-toggle-layer', ids: ['child'], property: 'locked' }, { type: 'group-layers', ids: ['child', 'outside'] },
    { type: 'reorder-layer', id: 'child', direction: 'down' }, { type: 'move-layer', id: 'child', toIndex: 0 },
    { type: 'remove-stroke', id: 'stroke' }, { type: 'commit-brush-stroke', stroke: { ...state.brushStrokes[0], id: 'new' } },
    { type: 'upsert-text', object: { ...state.canvasTexts[0], text: 'changed' } },
    { type: 'upsert-text', object: { ...state.canvasTexts[0], layerId: 'outside' } },
    { type: 'add-canvas-text', text: { id: 'new', x: 0, y: 0, text: 'changed' } },
    { type: 'add-shape', shape: { ...state.canvasShapes[0], id: 'new' } },
    { type: 'selection-to-mask', selection: state.selection }, { type: 'commit-mask', mask: { strokes: [], inverted: true, applied: false } },
    { type: 'invert-mask' }, { type: 'clear-mask' }, { type: 'apply-mask' },
    { type: 'commit-layer-transform', layerId: 'child', transform: { kind: 'transform', rect: { x: 5, y: 5, width: 50, height: 50 }, rotation: 0, flipX: false, flipY: false } },
    { type: 'set-layer-adjustment', id: 'child', key: 'brightness', value: 5 }, { type: 'reset-layer-adjustments', id: 'child' },
    { type: 'set-layer-source', id: 'child', source: 'changed' }, { type: 'rasterize-layer', id: 'child', source: 'changed' },
    { type: 'replace-layer-with-result', targetId: 'child', resultId: 'outside' },
  ]
  for (const action of actions) {
    const next = editorReducer(state, action)
    expect({ ...next, notice: state.notice }, action.type).toEqual(state)
    expect(next.notice, action.type).toContain('锁定')
  }
})

test('deep group duplication owns independent content and references and undoes in one step', () => {
  const base = hierarchyState()
  const state = { ...base, layers: base.layers.map((layer) => ({ ...layer, locked: false })) }
  const next = editorReducer(state, { type: 'duplicate-layer', id: 'group' })
  const group = next.layers.find((layer) => layer.id === next.selectedLayerId)!
  expect(group.id).not.toBe('group')
  expect(group.children).toHaveLength(1)
  expect(group.children![0]).not.toBe('child')
  const child = next.layers.find((layer) => layer.id === group.children![0])!
  expect(child.groupId).toBe(group.id)
  const text = next.canvasTexts.find((item) => item.layerId === child.id)!
  const shape = next.canvasShapes.find((item) => item.layerId === child.id)!
  const stroke = next.brushStrokes.find((item) => item.layerId === child.id)!
  expect([text.id, shape.id, stroke.id].every((id) => !state.sceneOrder.includes(id))).toBe(true)
  expect(next.sceneOrder).toEqual([...state.sceneOrder, stroke.id, text.id, shape.id])
  expect(next.layerMasks[child.id]).toEqual(state.layerMasks.child)
  expect(next.layerMasks[child.id]).not.toBe(state.layerMasks.child)
  shape.rect.x = 99
  stroke.points[0].x = 99
  expect(state.canvasShapes[0].rect.x).toBe(0)
  expect(state.brushStrokes[0].points[0].x).toBe(10)
  const edited = editorReducer(next, { type: 'upsert-text', object: { ...text, text: 'copy only' } })
  expect(edited.canvasTexts.find((item) => item.id === 'text')?.text).toBe('original')
  const undone = editorReducer(next, { type: 'undo' })
  expect(undone.layers).toEqual(state.layers)
  expect(undone.canvasTexts).toEqual(state.canvasTexts)
  expect(undone.brushStrokes).toEqual(state.brushStrokes)
  expect(undone.canvasShapes).toEqual(state.canvasShapes)
  expect(undone.layerMasks).toEqual(state.layerMasks)
  expect(undone.sceneOrder).toEqual(state.sceneOrder)
})

test('deleting an unlocked group removes its full subtree and content with complete undo', () => {
  const base = hierarchyState()
  const state = { ...base, layers: base.layers.map((layer) => ({ ...layer, locked: false })) }
  const next = editorReducer(state, { type: 'delete-layer', id: 'group' })
  expect(next.layers.map((layer) => layer.id)).toEqual(['outside'])
  expect(next.canvasTexts).toEqual([])
  expect(next.brushStrokes).toEqual([])
  expect(next.canvasShapes).toEqual([])
  expect(next.layerMasks).toEqual({})
  expect(next.sceneOrder).toEqual([])
  expect(editorReducer(next, { type: 'undo' }).layers).toEqual(state.layers)
})

test('copies leaf and nested mask strokes with fresh IDs even within one millisecond', () => {
  const base = hierarchyState()
  const state = { ...base, layers: base.layers.map((layer) => ({ ...layer, locked: false })), layerMasks: { child: { strokes: [{ ...base.brushStrokes[0], id: 'mask-stroke', mode: 'mask' as const }], inverted: false, applied: true } } }
  const first = editorReducer(state, { type: 'duplicate-layer', id: 'child' })
  const second = editorReducer(first, { type: 'duplicate-layer', id: 'child' })
  const firstId = first.selectedLayerId, secondId = second.selectedLayerId
  expect(firstId).not.toBe(secondId)
  expect(second.layers.find((layer) => layer.id === 'group')?.children).toEqual(['child', firstId, secondId])
  const maskStroke = second.layerMasks[secondId].strokes[0]
  expect(maskStroke.id).not.toBe('mask-stroke')
  expect(maskStroke.id).not.toBe(first.layerMasks[firstId].strokes[0].id)
  expect(maskStroke.layerId).toBe(secondId)
  maskStroke.points[0].x = 90
  expect(state.layerMasks.child.strokes[0].points[0].x).toBe(10)
  expect(second.canvasTexts.filter((item) => item.layerId === secondId)).toHaveLength(1)
  expect(second.canvasShapes.filter((item) => item.layerId === secondId)).toHaveLength(1)
})

test('protects locked descendants from deleting or transforming their unlocked group and allows explicit root unlock', () => {
  const base = hierarchyState()
  const state = { ...base, layers: base.layers.map((layer) => ({ ...layer, locked: layer.id === 'child' })) }
  expect(editorReducer(state, { type: 'delete-layer', id: 'group' }).layers).toBe(state.layers)
  expect(editorReducer(state, { type: 'batch-delete-layers', ids: ['group', 'outside'] }).layers.some((layer) => layer.id === 'child')).toBe(true)
  expect(editorReducer(state, { type: 'commit-layer-transform', layerId: 'group', transform: { kind: 'transform', rect: { x: 10, y: 10, width: 50, height: 50 }, rotation: 0, flipX: false, flipY: false } }).layers).toBe(state.layers)
  const unlocked = editorReducer(base, { type: 'toggle-layer-lock', id: 'group' })
  expect(unlocked.layers[0].locked).toBe(false)
  const changed = editorReducer(unlocked, { type: 'set-layer-opacity', id: 'child', opacity: 50 })
  expect(changed.layers.find((layer) => layer.id === 'child')?.opacity).toBe(50)
})

test('legacy add-result-layer duplicates linked content independently', () => {
  const base = hierarchyState()
  const state = { ...base, layers: base.layers.map((layer) => ({ ...layer, locked: false })) }
  const copied = editorReducer(state, { type: 'add-result-layer', resultId: 'child' })
  expect(copied.canvasTexts.filter((item) => item.layerId === copied.selectedLayerId)).toHaveLength(1)
  expect(copied.brushStrokes.filter((item) => item.layerId === copied.selectedLayerId)).toHaveLength(1)
  expect(copied.layerMasks[copied.selectedLayerId]).toEqual(state.layerMasks.child)
})


test('mixed batch operations skip locked subtrees and report them while committing eligible changes once', () => {
  const state = hierarchyState()
  const hidden = editorReducer(state, { type: 'batch-toggle-layer', ids: ['child', 'outside'], property: 'visible' })
  expect(hidden.layers.find((layer) => layer.id === 'child')?.visible).toBe(true)
  expect(hidden.layers.find((layer) => layer.id === 'outside')?.visible).toBe(false)
  expect(hidden.notice).toMatch(/跳过.*1.*锁定/)
  expect(hidden.undoStack).toHaveLength(1)
  const deleted = editorReducer(state, { type: 'batch-delete-layers', ids: ['group', 'outside'] })
  expect(deleted.layers.map((layer) => layer.id)).toEqual(['group', 'child'])
  expect(deleted.notice).toMatch(/跳过.*1.*锁定/)
  expect(deleted.brushStrokes).toEqual(state.brushStrokes)
  expect(editorReducer(deleted, { type: 'undo' }).layers).toEqual(state.layers)
})

test('protected final-layer deletion and absent copy targets do not add undo entries', () => {
  const state = { ...initialEditorState, layers: [initialEditorState.layers[0]], selectedLayerIds: ['art'] }
  expect(editorReducer(state, { type: 'delete-layer', id: 'art' }).undoStack).toHaveLength(0)
  expect(editorReducer(state, { type: 'duplicate-layer', id: 'missing' }).undoStack).toHaveLength(0)
  expect(editorReducer(state, { type: 'delete-layer', id: 'missing' }).undoStack).toHaveLength(0)
})
