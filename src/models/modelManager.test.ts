import { describe, expect, test } from 'vitest'
import { MODEL_CATALOG } from './modelCatalog'
import { createModelManager, initialModelState, modelReducer } from './modelManager'

describe('model manager state', () => {
  test('contains the five optional models', () => { expect(MODEL_CATALOG.map((item) => item.id)).toEqual(['u2net', 'u2netp', 'rmbg-2.0', 'realesrgan-x4plus', 'realesrgan-anime']) })
  test('moves a model through download and verification', () => {
    let state = initialModelState()
    state = modelReducer(state, { type: 'queue', modelId: 'u2net', totalBytes: 100 })
    state = modelReducer(state, { type: 'progress', modelId: 'u2net', downloadedBytes: 40, totalBytes: 100 })
    state = modelReducer(state, { type: 'verify', modelId: 'u2net' })
    state = modelReducer(state, { type: 'install', modelId: 'u2net' })
    expect(state.u2net).toMatchObject({ status: 'installed', downloadedBytes: 100 })
  })
  test('does not enqueue duplicate work', () => {
    const manager = createModelManager()
    manager.dispatch({ type: 'queue', modelId: 'u2net', totalBytes: 100 })
    manager.dispatch({ type: 'queue', modelId: 'u2net', totalBytes: 100 })
    expect(manager.getState().u2net.status).toBe('queued')
  })
})
