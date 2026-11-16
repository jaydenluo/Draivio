import { createSelection } from '../canvas/selectionGeometry'
import { expect, test } from 'vitest'
import { editorReducer, initialEditorState, type EditorAction } from './editor'
import { createBrushStroke } from '../canvas/BrushEngine'

const stroke = createBrushStroke('one', 'paint', 'art', { x: 10, y: 20 }, { size: 20, hardness: 60, opacity: 80, flow: 100, smoothing: 0, color: '#112233' })
test('document undo restores whole strokes and preserves tool and view choices', () => {
  const painted = editorReducer(initialEditorState, { type: 'commit-brush-stroke', stroke })
  let next = editorReducer(painted, { type: 'select-tool', tool: 'text' })
  next = editorReducer(next, { type: 'set-zoom', zoom: 130 })
  expect(next.undoStack).toHaveLength(1)
  const undo = editorReducer(next, { type: 'undo' })
  expect(undo.brushStrokes).toHaveLength(0)
  expect(undo.activeTool).toBe('text')
  expect(undo.zoom).toBe(130)
  expect(editorReducer(undo, { type: 'redo' }).brushStrokes).toEqual([stroke])
})
test('mask creation, inversion, application and clearing are reversible', () => {
  let state = editorReducer(initialEditorState, { type: 'selection-to-mask' })
  expect(state.layerMasks.art.selection).toEqual(initialEditorState.selection)
  state = editorReducer(state, { type: 'invert-mask' })
  expect(state.layerMasks.art.inverted).toBe(true)
  state = editorReducer(state, { type: 'apply-mask' })
  expect(state.layerMasks.art.applied).toBe(true)
  const clear = editorReducer(state, { type: 'clear-mask' })
  expect(clear.layerMasks.art).toBeUndefined()
  expect(editorReducer(clear, { type: 'undo' }).layerMasks.art.applied).toBe(true)
})
test('text shape and layer transform persist through undo and redo', () => {
  const object = { id: 'text1', layerId: 'art', x: 10, y: 10, text: '你好', fontFamily: 'serif', fontSize: 32, fontWeight: '700', color: '#fff', align: 'left' as const }
  let state = editorReducer(initialEditorState, { type: 'upsert-text', object })
  state = editorReducer(state, { type: 'commit-layer-transform', layerId: 'art', transform: { kind: 'transform', rect: { x: 20, y: 20, width: 60, height: 50 }, rotation: 30, flipX: true, flipY: false } })
  expect(state.layers[0].transform?.rotation).toBe(30)
  const undo = editorReducer(state, { type: 'undo' })
  expect(undo.canvasTexts).toEqual([object])
  expect(undo.layers[0].transform).toBeUndefined()
  expect(editorReducer(undo, { type: 'redo' }).layers[0].transform?.flipX).toBe(true)
})

const text = { id: 'text', layerId: 'art', x: 10, y: 10, text: '你好', fontFamily: 'serif', fontSize: 32, fontWeight: '700', color: '#fff', align: 'left' as const }

test('visible history versions restore mixed document content and share the exact undo/redo sequence', () => {
  let state = initialEditorState
  const actions: EditorAction[] = [
    { type: 'commit-brush-stroke', stroke }, { type: 'upsert-text', object: text },
    { type: 'add-shape', shape: { id: 'shape', layerId: 'art', kind: 'ellipse', rect: { x: 10, y: 10, width: 20, height: 20 }, color: '#fff', strokeWidth: 1 } },
    { type: 'selection-to-mask' }, { type: 'set-layer-adjustment', id: 'art', key: 'brightness', value: 25 },
    { type: 'commit-selection', selection: createSelection('ellipse', { x: 10, y: 10, width: 20, height: 20 }) },
    { type: 'set-layer-source', id: 'art', source: 'data:image/png;base64,new-resource' },
  ]
  const versions = [state]
  for (const action of actions) { state = editorReducer(state, action); versions.push(state) }
  expect(state.history).toHaveLength(actions.length + 1)
  expect(state.history.at(-1)?.id).toBe(state.selectedHistoryId)
  const target = versions[3]
  const jump = editorReducer(state, { type: 'select-history', id: target.selectedHistoryId })
  for (const key of ['layers', 'canvasTexts', 'canvasShapes', 'brushStrokes', 'layerMasks', 'selection', 'sceneOrder'] as const) expect(jump[key], key).toEqual(target[key])
  expect(jump.redoStack).toHaveLength(4)
  expect(editorReducer(jump, { type: 'undo' }).canvasShapes).toEqual(versions[2].canvasShapes)
  expect(editorReducer(jump, { type: 'redo' }).layerMasks).toEqual(versions[4].layerMasks)
  const branch = editorReducer(jump, { type: 'rename-layer', id: 'art', name: 'branch' })
  expect(branch.redoStack).toEqual([])
  expect(branch.history).toHaveLength(5)
  expect(branch.history.some((item) => item.id === state.selectedHistoryId)).toBe(false)
})

test('forty numeric previews commit one undo/version and cancelled edits restore the exact baseline', () => {
  const begin = editorReducer(initialEditorState, { type: 'begin-transaction', label: '调整亮度' })
  let state = begin
  for (let value = 1; value <= 40; value++) state = editorReducer(state, { type: 'set-layer-adjustment', id: 'art', key: 'brightness', value })
  expect(state.undoStack).toHaveLength(0)
  expect(state.history).toHaveLength(begin.history.length)
  const committed = editorReducer(state, { type: 'end-transaction' })
  expect(committed.history).toHaveLength(2)
  expect(committed.undoStack).toHaveLength(1)
  expect(editorReducer(committed, { type: 'undo' }).layers).toEqual(initialEditorState.layers)
  const pending = editorReducer(editorReducer(committed, { type: 'begin-transaction', label: '取消调整' }), { type: 'set-layer-opacity', id: 'art', opacity: 10 })
  const cancel = editorReducer(pending, { type: 'cancel-transaction' })
  expect(cancel.layers).toEqual(committed.layers)
  expect(cancel.history).toEqual(committed.history)
  expect(cancel.undoStack).toEqual(committed.undoStack)
})

test('bounds snapshots and retains resources still referenced by current, undo and redo versions', () => {
  let state = initialEditorState
  for (let index = 0; index < 45; index++) state = editorReducer(state, { type: 'set-layer-source', id: 'art', source: `blob:resource-${index}` })
  expect(state.history).toHaveLength(31)
  expect(state.undoStack).toHaveLength(30)
  expect(state.history[0].snapshot?.layers[0].source).toBe('blob:resource-14')
  const undo = editorReducer(state, { type: 'undo' })
  expect(undo.layers[0].source).toBe('blob:resource-43')
  expect(editorReducer(undo, { type: 'redo' }).layers[0].source).toBe('blob:resource-44')
})

test('document/version guards reject stale async history transactions and reset on new document', () => {
  const state = editorReducer(initialEditorState, { type: 'rename-layer', id: 'art', name: 'current' })
  const stale = editorReducer(state, { type: 'begin-transaction', label: 'stale', documentId: 'another-document', revision: state.documentRevision })
  expect(stale.historyTransaction).toBeNull()
  const pending = editorReducer(state, { type: 'begin-transaction', label: 'pending' })
  const next = editorReducer(pending, { type: 'new-document', width: 20, height: 20 })
  const late = editorReducer(next, { type: 'end-transaction', documentId: state.documentId, revision: state.documentRevision })
  expect(late.layers).toEqual(next.layers)
  expect(late.historyTransaction).toBeNull()
  expect(late.undoStack).toEqual([])
  expect(late.history).toHaveLength(1)
})

test('reopening the same project ID discards the old session timeline and pending transaction', () => {
  const changed = editorReducer(initialEditorState, { type: 'set-layer-source', id: 'art', source: 'blob:old-session' })
  const pending = editorReducer(changed, { type: 'begin-transaction', label: 'old transaction' })
  const restored = editorReducer(pending, { type: 'restore-project', document: { ...initialEditorState, documentId: changed.documentId } })
  expect(restored.history).toHaveLength(1)
  expect(restored.history[0].snapshot?.layers).toEqual(initialEditorState.layers)
  expect(restored.undoStack).toEqual([])
  expect(restored.redoStack).toEqual([])
  expect(restored.historyTransaction).toBeNull()
  expect(restored.documentRevision).not.toBe(changed.documentRevision)
  expect(editorReducer(restored, { type: 'undo' }).layers).toEqual(restored.layers)
  const invalid = editorReducer(changed, { type: 'new-document', width: 0, height: 100 })
  expect(invalid.documentId).toBe(changed.documentId)
  expect(invalid.history).toBe(changed.history)
  expect(invalid.layers).toBe(changed.layers)
})

test('an unrelated asynchronous commit cannot be absorbed or lost by cancelling a numeric edit', () => {
  let state = editorReducer(initialEditorState, { type: 'begin-transaction', label: '亮度' })
  state = editorReducer(state, { type: 'set-layer-adjustment', id: 'art', key: 'brightness', value: 20 })
  const candidate = { id: 'arrived', prompt: 'p', model: 'm', provider: 'p', size: '1x1', createdAt: 'now', status: 'success' as const, source: 'data:image/png;base64,AA==', favorite: false, adopted: false }
  state = editorReducer(state, { type: 'add-ai-result', result: candidate })
  const cancelled = editorReducer(state, { type: 'cancel-transaction' })
  expect(cancelled.aiResults).toContainEqual(candidate)
  expect(cancelled.undoStack).toHaveLength(2)
  expect(cancelled.historyTransaction).toBeNull()
  const undoCandidate = editorReducer(cancelled, { type: 'undo' })
  expect(undoCandidate.aiResults).toEqual(initialEditorState.aiResults)
  expect(undoCandidate.layers[0].adjustments?.brightness).toBe(20)
  expect(editorReducer(undoCandidate, { type: 'undo' }).layers[0].adjustments?.brightness).toBe(0)
})

test('reducer rejects async writes with old document or revision tokens before recording history', () => {
  const current = editorReducer(initialEditorState, { type: 'rename-layer', id: 'art', name: 'new version' })
  for (const token of [{ expectedDocumentId: 'old-document' }, { expectedDocumentId: current.documentId, expectedRevision: initialEditorState.documentRevision }]) {
    const stale = editorReducer(current, { type: 'rasterize-layer', id: 'art', source: 'late-result', ...token })
    expect(stale.layers).toBe(current.layers)
    expect(stale.history).toBe(current.history)
    expect(stale.undoStack).toBe(current.undoStack)
    expect(stale.notice).toMatch(/更改|过期/)
  }
})

test('history navigation preserves pan, zoom and canvas rotation independently of document versions', () => {
  let state = editorReducer(initialEditorState, { type: 'commit-brush-stroke', stroke })
  state = editorReducer(state, { type: 'set-canvas-offset', x: 43, y: -133 })
  state = editorReducer(state, { type: 'set-zoom', zoom: 72 })
  state = editorReducer(state, { type: 'set-canvas-rotation', rotation: 20 })
  for (const action of [{ type: 'undo' }, { type: 'redo' }, { type: 'select-history', id: state.history[0].id }] as EditorAction[]) {
    const next = editorReducer(state, action)
    expect(next.canvasOffset).toEqual({ x: 43, y: -133 })
    expect(next.zoom).toBe(72)
    expect(next.canvasRotation).toBe(20)
  }
})
