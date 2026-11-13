import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from './editor'

describe('editor model source state', () => {
  it('starts on Draivio credits and changes source independently', () => {
    expect(initialEditorState.composerSourceId).toBe('draivio-cloud')
    const next = editorReducer(initialEditorState, { type: 'set-composer-source', sourceId: 'openai-custom' })
    expect(next.composerSourceId).toBe('openai-custom')
    expect(next.composerParameters.model).toBe('Image Pro')
  })
})
