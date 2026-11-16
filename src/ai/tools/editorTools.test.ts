import { describe, expect, it } from 'vitest'
import { executeEditorCommand } from './editorTools'
import { editorReducer, initialEditorState } from '../../state/editor'

const state = () => structuredClone(initialEditorState)
function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}
const transformedState = () => editorReducer(state(), { type: 'commit-layer-transform', layerId: 'art', transform: { kind: 'transform', rect: { x: 7, y: 9, width: 60, height: 40 }, rotation: 20, flipX: false, flipY: true } })

describe('structured editor commands', () => {
  it.each([{ op: 'rotate', degrees: 35 }, { op: 'flip', axis: 'horizontal' }, { op: 'flip', axis: 'vertical' }] as const)('keeps frozen existing transform and input immutable for $op $axis', command => {
    const before = transformedState(), original = structuredClone(before)
    deepFreeze(before)
    const next = executeEditorCommand(before, { ...command, layerId: 'art' })
    expect(before).toEqual(original)
    expect(next.layers[0].transform).not.toBe(before.layers[0].transform)
    const undone = editorReducer(next, { type: 'undo' })
    expect(undone.layers).toEqual(original.layers)
    expect(editorReducer(undone, { type: 'redo' }).layers).toEqual(next.layers)
  })

  it('preserves every prior transform snapshot across rotation and both flip axes', () => {
    const before = transformedState(), original = structuredClone(before)
    const rotated = executeEditorCommand(before, { op: 'rotate', layerId: 'art', degrees: 35 })
    const horizontal = executeEditorCommand(rotated, { op: 'flip', layerId: 'art', axis: 'horizontal' })
    const both = executeEditorCommand(horizontal, { op: 'flip', layerId: 'art', axis: 'vertical' })
    expect(before).toEqual(original)
    let current = both
    for (const expected of [horizontal, rotated, before]) { current = editorReducer(current, { type: 'undo' }); expect(current.layers).toEqual(expected.layers) }
    for (const expected of [rotated, horizontal, both]) { current = editorReducer(current, { type: 'redo' }); expect(current.layers).toEqual(expected.layers) }
  })

  it.each([{ op: 'rotate', degrees: 35 }, { op: 'flip', axis: 'horizontal' }, { op: 'flip', axis: 'vertical' }] as const)('never mutates a locked existing transform for $op $axis', command => {
    const before = editorReducer(transformedState(), { type: 'toggle-layer-lock', id: 'art' }), original = structuredClone(before)
    deepFreeze(before)
    const next = executeEditorCommand(before, { ...command, layerId: 'art' })
    expect(before).toEqual(original)
    expect(next.layers).toEqual(original.layers)
    expect(next.undoStack).toEqual(original.undoStack)
    expect(next.notice).toContain('锁定')
  })
  it('applies pixel moves and degree rotation through the editor reducer', () => {
    const next = executeEditorCommand(state(), { op: 'move', layerId: 'art', dx: 50, dy: -25 })
    expect(next.layers.find((layer) => layer.id === 'art')?.transform?.rect).toMatchObject({ x: 10, y: -4 })
    const rotated = executeEditorCommand(next, { op: 'rotate', layerId: 'art', degrees: 45 })
    expect(rotated.layers.find((layer) => layer.id === 'art')?.transform?.rotation).toBe(45)
    const moved = executeEditorCommand(rotated, { op: 'move', layerIds: ['art', 'original'], dx: 10, dy: 0 })
    expect(moved.layers.find((layer) => layer.id === 'art')?.transform?.rect.x).toBeCloseTo(12)
    expect(moved.layers.find((layer) => layer.id === 'original')?.transform?.rect.x).toBeCloseTo(2)
  })

  it('supports scale, flips, opacity, visibility and blend without mutating input', () => {
    const original = state(); const scaled = executeEditorCommand(original, { op: 'scale', layerId: 'art', sx: 2, sy: .5 })
    expect(scaled.layers.find((layer) => layer.id === 'art')?.transform?.rect).toMatchObject({ width: 200, height: 50 })
    const flipped = executeEditorCommand(executeEditorCommand(scaled, { op: 'flip', layerId: 'art', axis: 'horizontal' }), { op: 'opacity', layerId: 'art', value: 37 })
    expect(flipped.layers.find((layer) => layer.id === 'art')?.transform?.flipX).toBe(true)
    expect(flipped.layers.find((layer) => layer.id === 'art')?.opacity).toBe(37)
    expect(executeEditorCommand(flipped, { op: 'visibility', layerId: 'art', visible: false }).layers.find((layer) => layer.id === 'art')?.visible).toBe(false)
    expect(executeEditorCommand(flipped, { op: 'blend', layerId: 'art', blendMode: '滤色' }).layers.find((layer) => layer.id === 'art')?.blendMode).toBe('滤色')
    expect(original.layers.find((layer) => layer.id === 'art')?.transform).toBeUndefined()
  })

  it('duplicates independently and routes layer operations to existing reducer actions', () => {
    const duplicated = executeEditorCommand(state(), { op: 'duplicate', layerId: 'art' })
    expect(duplicated.layers).toHaveLength(4)
    const copy = duplicated.layers.find((layer) => layer.id !== 'art' && layer.source === 'fixture')
    expect(copy).toBeDefined(); expect(copy).not.toBe(duplicated.layers.find((layer) => layer.id === 'art'))
    const renamed = executeEditorCommand(duplicated, { op: 'rename', layerId: copy!.id, name: '复制' })
    const grouped = executeEditorCommand(renamed, { op: 'group', layerIds: ['art', copy!.id] })
    expect(grouped.layers.some((layer) => layer.children?.includes('art') && layer.children.includes(copy!.id))).toBe(true)
  })

  it('rejects invalid parameters and protects locked ancestors', () => {
    expect(() => executeEditorCommand(state(), { op: 'scale', layerId: 'art', sx: 0 })).toThrow('大于 0')
    const locked = editorReducer(state(), { type: 'toggle-layer-lock', id: 'art' })
    const next = executeEditorCommand(locked, { op: 'rename', layerId: 'art', name: 'blocked' })
    expect(next.layers.find((layer) => layer.id === 'art')?.name).not.toBe('blocked')
    expect(next.notice).toContain('锁定')
  })

  it('aligns and distributes selected targets using existing pixel geometry', () => {
    const withLayers = editorReducer(editorReducer(state(), { type: 'duplicate-layer', id: 'art' }), { type: 'duplicate-layer', id: 'art' })
    const ids = withLayers.layers.filter((layer) => layer.source === 'fixture').slice(0, 3).map((layer) => layer.id)
    let selected = { ...withLayers, selectedLayerIds: ids, selectedLayerId: ids[0] }
    selected = editorReducer(selected, { type: 'commit-layer-transform', layerId: ids[0], transform: { kind: 'transform', rect: { x: 10, y: 0, width: 20, height: 20 }, rotation: 0, flipX: false, flipY: false } })
    selected = editorReducer(selected, { type: 'commit-layer-transform', layerId: ids[1], transform: { kind: 'transform', rect: { x: 40, y: 0, width: 20, height: 20 }, rotation: 0, flipX: false, flipY: false } })
    selected = editorReducer(selected, { type: 'commit-layer-transform', layerId: ids[2], transform: { kind: 'transform', rect: { x: 70, y: 0, width: 20, height: 20 }, rotation: 0, flipX: false, flipY: false } })
    const aligned = executeEditorCommand(selected, { op: 'align', mode: 'left', target: 'canvas' })
    expect(aligned.layers.filter((layer) => ids.includes(layer.id)).every((layer) => layer.transform?.rect.x === 0)).toBe(true)
    const distributed = executeEditorCommand(selected, { op: 'distribute', axis: 'horizontal' })
    expect(distributed.notice).toContain('等距')
  })

  it('scopes explicit alignment targets without changing the editor selection', () => {
    let current = editorReducer(editorReducer(state(), { type: 'duplicate-layer', id: 'art' }), { type: 'duplicate-layer', id: 'art' })
    const ids = current.layers.filter((layer) => layer.source === 'fixture').slice(0, 3).map((layer) => layer.id)
    current = { ...current, selectedLayerIds: ['mask'], selectedLayerId: 'mask' }
    ids.forEach((id, index) => { current = editorReducer(current, { type: 'commit-layer-transform', layerId: id, transform: { kind: 'transform', rect: { x: 10 + index * 20, y: 0, width: 10, height: 10 }, rotation: 0, flipX: false, flipY: false } }) })
    const next = executeEditorCommand(current, { op: 'align', layerIds: ids, mode: 'left', target: 'canvas' })
    expect(next.selectedLayerId).toBe('mask'); expect(next.selectedLayerIds).toEqual(['mask'])
    expect(ids.every((id) => next.layers.find((layer) => layer.id === id)?.transform?.rect.x === 0)).toBe(true)
  })
})
