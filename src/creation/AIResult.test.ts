import { expect, test } from 'vitest'
import { createSelection } from '../canvas/selectionGeometry'
import { editorReducer, initialEditorState, type EditorAction } from '../state/editor'

for (const mode of ['edit', 'generate'] as const) {
  for (const selection of [null, createSelection('ellipse', { x: 10, y: 20, width: 30, height: 40 })]) {
    test(`${mode} adds separate result layers for ${selection ? 'selection' : 'canvas'} and supports undo`, () => {
      const request = { mode, prompt: '一只猫', sourceLayerId: 'art', selection, parameters: { ...initialEditorState.composerParameters, count: '2 张' } }
      const action = { type: 'complete-ai-operation', id: 'result', request } satisfies EditorAction
      const next = editorReducer({ ...initialEditorState, isGenerating: true }, action)
      expect(next.layers).toHaveLength(initialEditorState.layers.length + 2)
      expect(next.layers.slice(2)).toEqual(initialEditorState.layers)
      expect(next.layers[0].aiOperation).toEqual(request)
      expect(next.selectedLayerId).toBe(next.layers[0].id)
      expect(next.isGenerating).toBe(false)
      expect(next.history).toHaveLength(initialEditorState.history.length + 2)
      const undone = editorReducer(next, { type: 'undo' })
      expect(undone.layers).toEqual(initialEditorState.layers)
      expect(undone.history).toEqual(initialEditorState.history)
      expect(editorReducer(undone, { type: 'redo' }).layers).toEqual(next.layers)
    })
  }
}
