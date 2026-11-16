import { describe, expect, it } from 'vitest'
import { alignRects, distributeRects, type AlignmentRect } from './alignment'
import { editorReducer, initialEditorState } from '../state/editor'
import { layerCanvasBounds } from './alignment'

const rects: AlignmentRect[] = [
  { x: 10, y: 20, width: 20, height: 10 },
  { x: 45, y: 40, width: 10, height: 20 },
  { x: 70, y: 15, width: 15, height: 15 },
]

describe('layer alignment geometry', () => {
  it('aligns selected rectangles against the canvas edge or center', () => {
    expect(alignRects(rects, 'left', { x: 0, y: 0, width: 100, height: 100 }).map((r) => r.x)).toEqual([0, 0, 0])
    expect(alignRects(rects, 'center-horizontal', { x: 0, y: 0, width: 100, height: 100 }).map((r) => r.x)).toEqual([40, 45, 42.5])
  })
  it('distributes by centers without changing outer bounds', () => {
    const output = distributeRects(rects, 'horizontal')
    expect(output.map((r) => r.x)).toEqual([10, 45, 70])
    expect(output[0].x).toBe(rects[0].x)
    expect(output[2].x + output[2].width).toBe(rects[2].x + rects[2].width)
  })
  it('leaves fewer than three rectangles unchanged for distribution', () => {
    expect(distributeRects(rects.slice(0, 2), 'vertical')).toEqual(rects.slice(0, 2))
  })
  it('applies alignment through the editor reducer and remains undoable', () => {
    const state = { ...initialEditorState, selectedLayerIds: ['a', 'b'], selectedLayerId: 'a', layers: [
      { ...initialEditorState.layers[0], id: 'a', transform: { kind: 'transform' as const, rect: rects[0], rotation: 0, flipX: false, flipY: false } },
      { ...initialEditorState.layers[0], id: 'b', transform: { kind: 'transform' as const, rect: rects[1], rotation: 0, flipX: false, flipY: false } },
    ] }
    const next = editorReducer(state, { type: 'align-layers', mode: 'right' })
    expect(next.layers.map((layer) => layer.transform?.rect.x)).toEqual([80, 90])
    expect(next.undoStack).toHaveLength(1)
  })
  it('aligns rotated bounds in physical pixels and preserves the angle and dimensions', () => {
    const layer = { ...initialEditorState.layers[0], id: 'a', transform: { kind: 'transform' as const, rect: { x: 20, y: 30, width: 40, height: 20 }, rotation: 90, flipX: false, flipY: false } }
    const state = { ...initialEditorState, documentWidth: 800, documentHeight: 400, layers: [layer], selectedLayerIds: ['a'], selectedLayerId: 'a' }
    const next = editorReducer(state, { type: 'align-layers', mode: 'left' })
    expect(layerCanvasBounds(next, 'a').x).toBeCloseTo(0)
    expect(next.layers[0].transform?.rect.width).toBe(40)
    expect(next.layers[0].transform?.rotation).toBe(90)
  })
  it('keeps the key object still and aligns the other bounds to it', () => {
    const layers = rects.map((rect, index) => ({ ...initialEditorState.layers[0], id: String(index), transform: { kind: 'transform' as const, rect, rotation: 0, flipX: false, flipY: false } }))
    const state = { ...initialEditorState, layers, selectedLayerIds: ['0', '1', '2'], selectedLayerId: '1' }
    const next = editorReducer(state, { type: 'align-layers', mode: 'right', target: 'key-object' })
    expect(next.layers[1]).toEqual(layers[1])
    expect(layerCanvasBounds(next, '0').x + layerCanvasBounds(next, '0').width).toBeCloseTo(275)
  })
  it('does not move descendants of a selected group twice or move locked descendants', () => {
    const layers = [
      { ...initialEditorState.layers[0], id: 'g', source: undefined, className: 'layer-group', children: ['a'] },
      { ...initialEditorState.layers[0], id: 'a', groupId: 'g', transform: { kind: 'transform' as const, rect: rects[0], rotation: 0, flipX: false, flipY: false } },
    ]
    const state = { ...initialEditorState, layers, selectedLayerIds: ['g', 'a'], selectedLayerId: 'g' }
    const next = editorReducer(state, { type: 'align-layers', mode: 'left' })
    expect(next.layers[1]).toEqual(layers[1])
    expect(layerCanvasBounds(next, 'a').x).toBeCloseTo(0)
    const locked = { ...state, layers: [layers[0], { ...layers[1], locked: true }] }
    const blocked = editorReducer(locked, { type: 'align-layers', mode: 'right' })
    expect(blocked.layers).toBe(locked.layers)
    expect(blocked.notice).toContain('锁定')
  })
  it('rejects negative spacing without changing content or history', () => {
    const layers = [0, 1, 2].map((index) => ({ ...initialEditorState.layers[0], id: String(index), transform: { kind: 'transform' as const, rect: { x: index * 5, y: 0, width: 40, height: 10 }, rotation: 0, flipX: false, flipY: false } }))
    const state = { ...initialEditorState, layers, selectedLayerIds: ['0', '1', '2'] }
    const next = editorReducer(state, { type: 'distribute-layers', axis: 'horizontal' })
    expect(next.layers).toBe(layers)
    expect(next.undoStack).toBe(state.undoStack)
    expect(next.notice).toContain('重叠')
  })
})
