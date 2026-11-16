import { expect, test } from 'vitest'
import { createSelection } from '../canvas/selectionGeometry'
import { editorReducer, initialEditorState, type EditorAction } from '../state/editor'

for (const mode of ['edit', 'generate'] as const) {
  for (const selection of [null, createSelection('ellipse', { x: 10, y: 20, width: 30, height: 40 })]) {
    test(`${mode} keeps loading results separate from formal layers for ${selection ? 'selection' : 'canvas'} and supports undo`, () => {
      const request = { mode, prompt: '一只猫', sourceLayerId: 'art', selection, parameters: { ...initialEditorState.composerParameters, count: '2 张' } }
      const action = { type: 'complete-ai-operation', id: 'result', request } satisfies EditorAction
      const next = editorReducer({ ...initialEditorState, isGenerating: true }, action)
      expect(next.layers).toBe(initialEditorState.layers)
      expect(next.aiResults).toHaveLength(2)
      expect(next.aiResults.every(result=>result.status==='loading'&&!result.adopted)).toBe(true)
      expect(next.selectedLayerId).toBe(initialEditorState.selectedLayerId)
      expect(next.isGenerating).toBe(false)
      expect(next.history).toBe(initialEditorState.history)
      expect(next.undoStack).toBe(initialEditorState.undoStack)
      expect(editorReducer(next,{type:'adopt-ai-result-as-layer',id:next.aiResults[0].id}).layers).toBe(next.layers)
    })
  }
}
