import { expect, test } from 'vitest'
import { editorReducer, initialEditorState, type EditorState, type Layer } from '../state/editor'
import { hitMoveTarget, chooseMoveTargets, moveTargetBounds, translateMoveTargets, type MoveTarget } from './moveTargets'
import { createBrushStroke } from './BrushEngine'
import { layerWorldPixelMatrix } from './layerWorldMatrix'

const layer = (id: string, extra: Partial<Layer> = {}): Layer => ({ id, name: id, className: 'layer-image', visible: true, opacity: 100, blendMode: '正常', ...extra })
const state = (): EditorState => ({ ...structuredClone(initialEditorState), documentWidth: 200, documentHeight: 100, layers: [layer('front'), layer('back', { source: 'back.png' })], canvasShapes: [{ id: 'shape', layerId: 'front', kind: 'ellipse', rect: { x: 20, y: 20, width: 20, height: 20 }, color: '#f00', strokeWidth: 0 }], canvasTexts: [], brushStrokes: [], layerMasks: {}, sceneOrder: ['shape'], selectedLayerId: 'front', selectedLayerIds: ['front'], undoStack: [], redoStack: [] })
const target = (kind: MoveTarget['kind'], id: string, layerId = 'front'): MoveTarget => ({ kind, id, layerId })

test('hit follows painted content and stacking order instead of the full bounds of an empty layer', () => {
  const s = state()
  expect(hitMoveTarget(s, { x: 30, y: 30 })).toEqual(target('shape', 'shape'))
  expect(hitMoveTarget(s, { x: 20, y: 20 })).toEqual(target('layer', 'back', 'back'))
  s.layers[1].source = undefined
  expect(hitMoveTarget(s, { x: 80, y: 80 })).toBeNull()
  s.canvasTexts = [{ id: 'text', layerId: 'front', x: 24, y: 24, text: 'A', fontSize: 10, fontFamily: 'sans-serif', fontWeight: '400', color: '#fff', align: 'left' }]
  s.sceneOrder = ['shape', 'text']
  expect(hitMoveTarget(s, { x: 26, y: 28 })).toEqual(target('text', 'text'))
  s.sceneOrder = ['text', 'shape']
  expect(hitMoveTarget(s, { x: 26, y: 28 })).toEqual(target('shape', 'shape'))
})

test.each(['locked', 'hidden', 'transparent'] as const)('ignores %s content and its group descendants', reason => {
  const s = state()
  s.layers.unshift(layer('group', { kind: 'group', locked: reason === 'locked', visible: reason !== 'hidden', opacity: reason === 'transparent' ? 0 : 100 }))
  s.layers[1].groupId = 'group'
  expect(hitMoveTarget(s, { x: 30, y: 30 })).toEqual(target('layer', 'back', 'back'))
})

test('uses layer tree world coordinates and converts document movement into object-local coordinates', () => {
  const s = state()
  s.layers.unshift(layer('group', { kind: 'group', transform: { kind: 'transform', rect: { x: 10, y: 5, width: 50, height: 80 }, rotation: 30, flipX: true, flipY: false } }))
  s.layers[1].groupId = 'group'; s.layers[1].contentWidth = 400; s.layers[1].contentHeight = 200
  const m = layerWorldPixelMatrix(s.layers, 'front', 200, 100)
  const p = { x: (m[0] * 120 + m[2] * 60 + m[4]) / 2, y: m[1] * 120 + m[3] * 60 + m[5] }
  expect(hitMoveTarget(s, p)).toEqual(target('shape', 'shape'))
  const next = translateMoveTargets(s, [target('shape', 'shape')], { x: 7, y: -8 })
  const oldBounds = moveTargetBounds(s, [target('shape', 'shape')])!
  const newBounds = moveTargetBounds(next, [target('shape', 'shape')])!
  expect(newBounds.x - oldBounds.x).toBeCloseTo(7)
  expect(newBounds.y - oldBounds.y).toBeCloseTo(-8)
  expect(next.layers).toEqual(s.layers)
})

test('a shape can be selected independently after its background has been moved', () => {
  const s = state()
  expect(chooseMoveTargets(s, [target('layer', 'front')], target('shape', 'shape'), false)).toEqual([target('shape', 'shape')])
})

test('Shift toggles objects within one layer, dragging any selected object preserves the set', () => {
  const s = state()
  s.brushStrokes = [createBrushStroke('stroke', 'paint', 'front', { x: 50, y: 50 }, { size: 5, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: '#fff' })]
  const shape = target('shape', 'shape'), stroke = target('stroke', 'stroke')
  const selected = chooseMoveTargets(s, [shape], stroke, true)
  expect(selected).toEqual([shape, stroke])
  expect(chooseMoveTargets(s, selected, shape, false)).toEqual(selected)
  expect(chooseMoveTargets(s, selected, shape, true)).toEqual([stroke])
  const next = editorReducer(s, { type: 'move-canvas-targets', targets: selected, delta: { x: 5, y: 8 } })
  expect(next.canvasShapes[0].rect).toMatchObject({ x: 25, y: 28 })
  expect(next.brushStrokes[0].points[0]).toMatchObject({ x: 55, y: 58 })
  expect(next.layers).toEqual(s.layers)
  expect(next.undoStack).toHaveLength(1)
  const undone = editorReducer(next, { type: 'undo' })
  expect(undone.canvasShapes).toEqual(s.canvasShapes)
  expect(undone.brushStrokes).toEqual(s.brushStrokes)
})

test('layer-panel multiselection moves selected layers together; selected groups do not double-move children', () => {
  const s = state(); s.selectedLayerIds = ['front', 'back']
  const selected = chooseMoveTargets(s, [], target('shape', 'shape'), false)
  expect(selected).toEqual([target('layer', 'front'), target('layer', 'back', 'back')])
  const next = translateMoveTargets(s, selected, { x: 12, y: 3 })
  expect(next.layers.map(l => l.transform?.rect.x)).toEqual([12, 12])
  s.layers.unshift(layer('group', { kind: 'group' })); s.layers[1].groupId = 'group'
  const grouped = translateMoveTargets(s, [target('layer', 'group', 'group'), target('layer', 'front'), target('shape', 'shape')], { x: 12, y: 3 })
  expect(grouped.layers[0].transform?.rect.x).toBe(12)
  expect(grouped.layers[1].transform).toBeUndefined()
  expect(grouped.canvasShapes).toEqual(s.canvasShapes)
})

test('a stale or locked target and zero-distance movement create no history', () => {
  const s = state(); s.layers[0].locked = true
  for (const targets of [[target('shape', 'shape')], [target('shape', 'missing')]]) expect(editorReducer(s, { type: 'move-canvas-targets', targets, delta: { x: 10, y: 10 } })).toBe(s)
  expect(editorReducer(state(), { type: 'move-canvas-targets', targets: [target('shape', 'shape')], delta: { x: 0, y: 0 } }).undoStack).toHaveLength(0)
})

test('centered and right-aligned point text is hit where its glyphs are drawn', () => {
  const s = state(); s.layers[1].source = undefined
  s.canvasTexts = [{ id: 'text', layerId: 'front', x: 70, y: 50, text: 'AAAA', fontSize: 10, fontFamily: 'sans-serif', fontWeight: '400', color: '#fff', align: 'right' }]
  s.sceneOrder = ['text']
  expect(hitMoveTarget(s, { x: 65, y: 55 })).toEqual(target('text', 'text'))
  expect(hitMoveTarget(s, { x: 80, y: 55 })).toBeNull()
})

test('mixed-layer image offset survives saving and reopening without changing editable objects', async () => {
  const { encodeProject, decodeProject } = await import('../document/projectFormat')
  const s = state(); s.layers[0].source = 'fixture'
  const moved = editorReducer(s, { type: 'move-canvas-targets', targets: [target('image', 'front')], delta: { x: 12, y: 8 } })
  expect(moved.layers[0].sourceOffset).toEqual({ x: 12, y: 8 })
  expect(moved.canvasShapes).toEqual(s.canvasShapes)
  const reopened = decodeProject(await encodeProject(moved, { id: 'move', name: '背景独立移动' }))
  expect(reopened.document.layers[0].sourceOffset).toEqual(moved.layers[0].sourceOffset)
  expect(reopened.document.canvasShapes).toEqual(s.canvasShapes)
  expect(hitMoveTarget(moved, { x: 5, y: 5 })).toEqual(target('layer', 'back', 'back'))
  expect(hitMoveTarget(moved, { x: 80, y: 80 })).toEqual(target('image', 'front'))
})

test('image offset is not applied twice after rasterizing or converting to a smart object', () => {
  const s = state(); s.layers[0].source = 'fixture'
  const moved = editorReducer(s, { type: 'move-canvas-targets', targets: [target('image', 'front')], delta: { x: 12, y: 8 } })
  const baked = editorReducer(moved, { type: 'rasterize-layer', id: 'front', source: 'baked.png' })
  expect(baked.layers[0].sourceOffset).toBeUndefined()
  const smart = editorReducer(moved, { type: 'convert-to-smart-object', id: 'front' })
  expect(smart.layers[0].sourceOffset).toBeUndefined()
  const source = smart.smartObjectSources[smart.layers[0].smartObject!.sourceId]
  expect(source.document?.layers[0].sourceOffset).toEqual({ x: 12, y: 8 })
  const undone = editorReducer(smart, { type: 'undo' })
  expect(undone.layers[0].sourceOffset).toEqual({ x: 12, y: 8 })
})
