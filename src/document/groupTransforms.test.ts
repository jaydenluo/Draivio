import { describe, expect, it } from 'vitest'
import { applyMatrix, composeMergedSource, createMergePlan, groupBounds, identityMatrix, inverseMatrix, multiplyMatrix, transformBounds, transformGroup, ungroupPreserveWorld, type Matrix } from './groupTransforms'
import type { Layer } from '../state/editor'

const layer = (id: string, rect: { x: number; y: number; width: number; height: number }, groupId?: string): Layer => ({ id, name: id, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', groupId, transform: { kind: 'transform', rect, rotation: 0, flipX: false, flipY: false } })

describe('group transforms', () => {
  it('composes and inverts parent matrices without losing local points', () => {
    const parent: Matrix = [2, 0, 0, 2, 10, 20]; const child: Matrix = [1, 0, 0, 1, 4, 5]
    const world = multiplyMatrix(parent, child); expect(applyMatrix(inverseMatrix(world), applyMatrix(world, { x: 3, y: 7 }))).toEqual({ x: 3, y: 7 })
  })
  it('computes bounds for nested group descendants and applies one matrix to all', () => {
    const layers = [layer('g', { x: 0, y: 0, width: 1, height: 1 }), layer('child', { x: 10, y: 20, width: 30, height: 40 }, 'g'), layer('grand', { x: 50, y: 10, width: 5, height: 6 }, 'child')]
    expect(groupBounds(layers, 'g')).toEqual({ x: 10, y: 10, width: 45, height: 50 })
    const moved = transformGroup(layers, 'g', [1, 0, 0, 1, 5, -2]); expect(moved.find(x => x.id === 'grand')?.transform?.rect.x).toBe(55)
    expect(ungroupPreserveWorld(moved, 'g').find(x => x.id === 'child')?.groupId).toBeUndefined()
  })
  it('handles rotated bounds and reports rasterization requirements', () => {
    expect(transformBounds({ x: 0, y: 0, width: 10, height: 20 }, [0, 1, -1, 0, 0, 0])).toEqual({ x: -20, y: 0, width: 20, height: 10 })
    const layers = [{ ...layer('a', { x: 0, y: 0, width: 1, height: 1 }), blendMode: '正片叠底' }]
    const plan = createMergePlan(layers, ['a'], 'selected'); expect(plan.requiresRasterize).toBe(true); expect(plan.warning).toContain('栅格化')
  })
  it('keeps hidden layers out of visible merge when requested', () => {
    const layers = [{ ...layer('a', { x: 0, y: 0, width: 1, height: 1 }), visible: true }, { ...layer('b', { x: 1, y: 1, width: 1, height: 1 }), visible: false }]
    expect(createMergePlan(layers, [], 'visible', false).layerIds).toEqual(['a'])
    expect(createMergePlan(layers, [], 'visible', true).layerIds).toEqual(['a', 'b'])
  })
  it('creates a self-contained merged SVG source from image layers', () => {
    const source = composeMergedSource([{ ...layer('a', { x: 0, y: 0, width: 50, height: 100 }), source: 'data:image/png;base64,AAA' }, { ...layer('b', { x: 50, y: 0, width: 50, height: 100 }), source: 'data:image/png;base64,BBB', opacity: 50 }], 200, 100)
    expect(source).toMatch(/^data:image\/svg\+xml/); expect(decodeURIComponent(source!.split(',')[1])).toContain('data:image/png;base64,AAA'); expect(decodeURIComponent(source!.split(',')[1])).toContain('opacity="0.5"')
  })
})
