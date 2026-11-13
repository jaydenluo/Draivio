import { expect, test } from 'vitest'
import { editorReducer, initialEditorState } from '../state/editor'
import { isValidOutputFormat, outputFormats } from './outputFormats'

test('every resolution matches its parent ratio and auto is valid at each level', () => {
  for (const preset of outputFormats) {
    const [rw, rh] = preset.ratio.split(':').map(Number)
    expect(isValidOutputFormat(preset.ratio, 'auto')).toBe(true)
    for (const size of preset.sizes) {
      const [width, height] = size.split(' × ').map(Number)
      expect(width * rh).toBe(height * rw)
      expect(isValidOutputFormat(preset.ratio, size)).toBe(true)
    }
  }
  expect(isValidOutputFormat('auto', 'auto')).toBe(true)
})

test('rejects mismatched ratio and resolution without changing parameters', () => {
  expect(editorReducer(initialEditorState, { type: 'set-output-format', ratio: '16:9', size: '1024 × 1024' })).toBe(initialEditorState)
  expect(editorReducer(initialEditorState, { type: 'set-output-format', ratio: 'auto', size: '1920 × 1080' })).toBe(initialEditorState)
})
