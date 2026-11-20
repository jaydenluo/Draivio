import { expect, test } from 'vitest'
import { initialEditorState } from '../state/editor'
import { resolveImageEditTarget } from './imageEditTarget'

test('defaults to selection, selected object, then document', () => {
  const state = { ...initialEditorState, layers: [{ id: 'shape', name: '圆形' }], selectedLayerId: 'shape', selectedLayerIds: ['shape'] } as typeof initialEditorState
  expect(resolveImageEditTarget({ ...state, selectionVisible: true }, 'auto')).toBe('selection')
  expect(resolveImageEditTarget({ ...state, selectionVisible: false }, 'auto')).toBe('object')
  expect(resolveImageEditTarget({ ...state, selectionVisible: false, selectedLayerId: '', selectedLayerIds: [] }, 'auto')).toBe('document')
  expect(resolveImageEditTarget(state, 'document')).toBe('document')
})
