import { expect, test } from 'vitest'
import { editorReducer, initialEditorState } from './editor'
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
  const selected = editorReducer(initialEditorState, { type: 'set-selection-rect', rect: {x:20,y:20,width:40,height:40} })
  let state = editorReducer(selected, { type: 'selection-to-mask' })
  expect(state.layerMasks.art.selection).toEqual(selected.selection)
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
