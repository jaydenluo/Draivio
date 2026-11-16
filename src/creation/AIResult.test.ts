import { expect, test } from 'vitest'
import { editorReducer, initialEditorState, type AIOperation } from '../state/editor'
const request: AIOperation = { mode: 'generate', prompt: '一只猫', sourceLayerId: 'art', selection: null, sourceId: 'draivio-cloud', parameters: { ...initialEditorState.composerParameters, count: '2 张' } }
function candidates() { return editorReducer({ ...initialEditorState, isGenerating: true }, { type: 'complete-ai-operation', id: 'batch-demo', request }) }
test('simulation finishes with visible successful candidates without selecting or creating formal layers', () => {
 const next = candidates()
 expect(next.layers).toEqual(initialEditorState.layers)
 expect(next.selectedLayerId).toBe(initialEditorState.selectedLayerId)
 expect(next.aiResults).toHaveLength(2)
 expect(next.isGenerating).toBe(false)
 for (const result of next.aiResults) {
  expect(result).toMatchObject({ batchId: 'batch-demo', status: 'success', adopted: false, request })
  expect(result.source).toMatch(/^data:image\/png;base64,/)
  expect(result.thumbnail).toBe(result.source)
 }
})
test('real callback creates only an unadopted candidate', () => {
 const next = editorReducer(initialEditorState, { type: 'append-ai-result', id: 'actual', request: { ...request, batchId: 'real-batch' }, image: 'data:image/png;base64,aGVsbG8=', index: 0 })
 expect(next.layers).toBe(initialEditorState.layers)
 expect(next.selectedLayerId).toBe('art')
 expect(next.aiResults[0]).toMatchObject({ batchId: 'real-batch', adopted: false, source: 'data:image/png;base64,aGVsbG8=' })
})
test('adoption records independent layer relationships, deletion leaves adopted layers, and undo restores', () => {
 const base = candidates(), id = base.aiResults[0].id
 const first = editorReducer(base, { type: 'adopt-ai-result-as-layer', id })
 const second = editorReducer(first, { type: 'adopt-ai-result-as-layer', id })
 expect(new Set(second.layers.map(layer => layer.id)).size).toBe(second.layers.length)
 expect(second.aiResults[0].adoptions?.map(item => item.layerId)).toEqual([first.selectedLayerId, second.selectedLayerId])
 expect(second.layers[0].aiOperation).toEqual(request)
 expect(editorReducer(second, { type: 'undo' }).layers).toEqual(first.layers)
 const deleted = editorReducer(second, { type: 'delete-ai-result', id })
 expect(deleted.layers).toEqual(second.layers)
})
test('replacement keeps original source for comparison, records relationship and undoes', () => {
 const base = candidates(), resultId = base.aiResults[0].id
 const next = editorReducer(base, { type: 'replace-layer-with-ai-result', targetId: 'art', resultId })
 expect(next.aiResults[0].adoptions?.[0]).toMatchObject({ kind: 'replace', layerId: 'art', originalLayer: base.layers[0] })
 expect(next.layers.find(layer => layer.id === 'art')?.source).toBe(base.aiResults[0].source)
 expect(editorReducer(next, { type: 'undo' }).layers).toEqual(base.layers)
})
test('ancestor locking and unavailable candidates reject replacements without history mutation', () => {
 const base = candidates()
 const locked = { ...base, layers: [{ ...base.layers[0], id: 'parent', children: ['art'], locked: true }, ...base.layers.map(layer => layer.id === 'art' ? { ...layer, groupId: 'parent' } : layer)] }
 expect(editorReducer(locked, { type: 'replace-layer-with-ai-result', targetId: 'art', resultId: base.aiResults[0].id }).layers).toBe(locked.layers)
 const broken = editorReducer(base, { type: 'add-ai-result', result: { ...base.aiResults[0], id: 'bad', source: undefined, status: 'error', error: '失败' } })
 expect(editorReducer(broken, { type: 'adopt-ai-result-as-layer', id: 'bad' }).layers).toBe(broken.layers)
})
test('continue editing restores source, model, prompt, mode, selection and every generation parameter', () => {
 const base = candidates()
 const edited = editorReducer({ ...base, composerParameters: { ...base.composerParameters, model: 'wrong', strength: '0' }, composerSourceId: 'wrong', prompt: '' }, { type: 'continue-ai-result', id: base.aiResults[0].id })
 expect(edited.composerParameters).toEqual(request.parameters)
 expect(edited.composerSourceId).toBe(request.sourceId)
 expect(edited.prompt).toBe(request.prompt)
 expect(edited.composerMode).toBe(request.mode)
 expect(edited.selectedLayerId).toBe(request.sourceLayerId)
})
test('restoring the same document refreshes only session identity and stale AI actions cannot flush an active transaction', () => {
 const old = initialEditorState
 const reopened = editorReducer(old, { type: 'restore-project', document: { ...old } })
 expect(reopened.documentId).toBe(old.documentId)
 expect(reopened.documentSessionId).not.toBe(old.documentSessionId)
 const editing = editorReducer(reopened, { type: 'begin-transaction', label: 'numeric input' })
 const dirty = editorReducer(editing, { type: 'set-layer-opacity', id: 'art', opacity: 50 })
 const stale = editorReducer(dirty, { type: 'append-ai-result', id: 'stale', image: 'fixture', index: 0, request, expectedDocumentSessionId: old.documentSessionId })
 expect(stale.historyTransaction).toEqual(dirty.historyTransaction)
 expect(stale.history).toEqual(dirty.history)
 expect(stale.aiResults).toEqual(dirty.aiResults)
 const committed = editorReducer(dirty, { type: 'end-transaction' })
 expect(editorReducer(committed, { type: 'undo' }).documentSessionId).toBe(reopened.documentSessionId)
 expect(editorReducer(old, { type: 'new-document', width: 500, height: 500 }).documentSessionId).not.toBe(old.documentSessionId)
})

test('legacy state and project data without session identity get a new session on restore and keep it through undo', () => {
 const { documentSessionId: _session, ...legacy } = initialEditorState
 const next = editorReducer(legacy as typeof initialEditorState, { type: 'restore-project', document: legacy })
 expect(next.documentSessionId).toBeTruthy()
 expect(next.documentSessionId).not.toBe(_session)
 const changed = editorReducer(next, { type: 'set-prompt', prompt: 'new' })
 expect(editorReducer(changed, { type: 'undo' }).documentSessionId).toBe(next.documentSessionId)
})
