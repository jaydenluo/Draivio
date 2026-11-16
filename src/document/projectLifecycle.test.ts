import { expect, it } from 'vitest'
import { editorReducer, initialEditorState } from '../state/editor'
it('new document gets a fresh identity and cannot undo into the previous project', () => {
  const before = { ...initialEditorState, aiResults: [{ id: 'old' }], history: [{ id: 'old' }], undoStack: [{}] } as never
  const after = editorReducer(before, { type: 'new-document', width: 800, height: 600 })
  expect(after.documentId).toBeTruthy()
  expect(after.documentId).not.toBe(initialEditorState.documentId)
  expect(after.aiResults).toEqual([])
  expect(after.history.some(item => item.id === 'old')).toBe(false)
  expect(after.undoStack).toEqual([])
  expect(after.redoStack).toEqual([])
})
