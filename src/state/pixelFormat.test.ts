import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState, snapshot } from './editor'

describe('document pixel format state', () => {
  it('defaults to rgba8 and records format changes for undo/redo', () => {
    expect(initialEditorState.pixelFormat).toBe('rgba8')
    const high = editorReducer(initialEditorState, { type: 'set-pixel-format', format: 'rgba16' })
    expect(high.pixelFormat).toBe('rgba16')
    expect(high.undoStack).toHaveLength(1)
    expect(editorReducer(high, { type: 'undo' }).pixelFormat).toBe('rgba8')
    expect(editorReducer(editorReducer(high, { type: 'undo' }), { type: 'redo' }).pixelFormat).toBe('rgba16')
    expect(snapshot(high).pixelFormat).toBe('rgba16')
  })

  it('rejects an invalid format without mutating the source state', () => {
    const next = editorReducer(initialEditorState, { type: 'set-pixel-format', format: 'rgba64' as never })
    expect(next.pixelFormat).toBe('rgba8')
    expect(next.undoStack).toHaveLength(0)
    expect(next.notice).toContain('不支持')
  })
})
