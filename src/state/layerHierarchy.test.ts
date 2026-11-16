import { expect, test } from 'vitest'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from './layerHierarchy'
import type { Layer } from './editor'

const layer = (id: string, extra: Partial<Layer> = {}): Layer => ({ id, name: id, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', ...extra })
test('inherits visibility, locks and effective opacity through all ancestors', () => {
  const layers = [layer('root', { opacity: 50, children: ['group'], locked: true, visible: false }), layer('group', { opacity: 40, children: ['child'] }), layer('child', { groupId: 'group', opacity: 50 })]
  expect(layerParentId(layers, 'group')).toBe('root')
  expect(effectiveLayerState(layers, 'child')).toEqual({ visible: false, locked: true, opacity: 0.1 })
  expect(layerSubtreeIds(layers, 'root')).toEqual(['root', 'group', 'child'])
})
test('terminates malformed cyclic hierarchies without repeating descendants', () => {
  const layers = [layer('a', { groupId: 'b' }), layer('b', { groupId: 'a' })]
  expect(layerSubtreeIds(layers, 'a')).toEqual(['a', 'b'])
  expect(effectiveLayerState(layers, 'a').opacity).toBe(1)
})
