import { act, renderHook } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { initialEditorState } from '../state/editor'
import { useRasterHitTest } from './useRasterHitTest'

test('image hit testing ignores transparent pixels and letterboxing and drops old source data', () => {
  const images: Array<{ onload?: () => void; naturalWidth: number; naturalHeight: number; src?: string }> = []
  vi.stubGlobal('Image', class { naturalWidth = 2; naturalHeight = 1; onload?: () => void; constructor() { images.push(this) } })
  const context = { drawImage: vi.fn(), getImageData: () => ({ data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]) }) }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  const state = { ...structuredClone(initialEditorState), documentWidth: 100, documentHeight: 100, layers: [{ ...initialEditorState.layers[0], id: 'image', source: 'test-image' }] }
  const { result, rerender } = renderHook(({ state }) => useRasterHitTest(state), { initialProps: { state } })
  act(() => images[0].onload?.())
  expect(result.current('image', { x: 25, y: 50 })).toBe(true)
  expect(result.current('image', { x: 75, y: 50 })).toBe(false)
  expect(result.current('image', { x: 25, y: 10 })).toBe(false)
  rerender({ state: { ...state, layers: [{ ...state.layers[0], source: 'replacement' }] } })
  expect(result.current('image', { x: 75, y: 50 })).toBe(true)
  vi.unstubAllGlobals()
})
