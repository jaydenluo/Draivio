import { describe, expect, it } from 'vitest'
import { initialEditorState, type EditorState } from '../state/editor'
import { cloneDocumentContent, createSharedPreviewCache, collectDocumentResourceReferences } from './documentWorkspace'

function stateWithContent(): EditorState {
  return {
    ...initialEditorState,
    documentId: 'source-doc',
    documentSessionId: 'source-session',
    layers: [{ ...initialEditorState.layers[0], id: 'source-layer', source: 'data:image/png;base64,source' }],
    selectedLayerId: 'source-layer', selectedLayerIds: ['source-layer'],
    brushStrokes: [{ id: 'stroke-1', layerId: 'source-layer', points: [{ x: 1, y: 2 }] } as never],
    canvasTexts: [{ id: 'text-1', layerId: 'source-layer', text: 'hello', x: 1, y: 2 } as never],
    canvasShapes: [], sceneOrder: ['stroke-1', 'text-1'],
  }
}

describe('cross-document content migration', () => {
  it('deep clones content and remaps every object and layer reference', () => {
    const copied = cloneDocumentContent(stateWithContent(), 'target-doc')
    expect(copied.documentId).toBe('target-doc')
    expect(copied.layers[0].id).not.toBe('source-layer')
    expect(copied.brushStrokes[0].id).not.toBe('stroke-1')
    expect(copied.brushStrokes[0].layerId).toBe(copied.layers[0].id)
    expect(copied.canvasTexts[0].layerId).toBe(copied.layers[0].id)
    expect(copied.sceneOrder).toEqual([copied.brushStrokes[0].id, copied.canvasTexts[0].id])
    expect(copied.layers[0].source).toContain('source')
  })

  it('collects image references across layers, results and previews without duplicates', () => {
    const source = stateWithContent()
    source.layers[0].thumbnail = source.layers[0].source
    source.aiResults = [{ id: 'result', source: source.layers[0].source, thumbnail: 'data:image/png;base64:thumb', prompt: '', model: '', provider: '', size: '', createdAt: '', status: 'success', favorite: false, adopted: false }]
    expect(collectDocumentResourceReferences(source)).toEqual(new Set([
      'data:image/png;base64,source', 'data:image/png;base64:thumb',
    ]))
  })
})

describe('shared preview cache budget', () => {
  it('evicts least recently used previews until the byte budget is met', () => {
    const cache = createSharedPreviewCache(10)
    cache.set('a', '12345')
    cache.set('b', '1234')
    expect(cache.get('a')).toBe('12345')
    cache.set('c', '12345')
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('12345')
    expect(cache.bytes).toBeLessThanOrEqual(10)
  })
})
