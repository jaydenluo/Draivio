import { describe, expect, it, vi } from 'vitest'
import { editorReducer, initialEditorState } from '../../state/editor'
import { executeTransaction, editorDocumentFingerprint, transactionFromActions } from './transaction'

const state = () => structuredClone(initialEditorState)

describe('AI editor transactions', () => {
  it.each([29, 30])('keeps a single accurate transaction snapshot with %i prior history entries', async count => {
    let before = state()
    for (let i = 0; i < count; i++) before = editorReducer(before, { type: 'rename-layer', id: 'art', name: `prior-${i}` })
    const result = await executeTransaction(before, transactionFromActions('bounded', [
      { type: 'rename-layer', id: 'art', name: 'transaction' },
      { type: 'set-layer-opacity', id: 'art', opacity: 25 },
      { type: 'toggle-layer', id: 'art' },
    ]))
    expect(result.status).toBe('committed'); if (result.status !== 'committed') return
    expect(result.state.undoStack).toHaveLength(30)
    const undone = editorReducer(result.state, { type: 'undo' }); expect(undone.layers).toEqual(before.layers)
    expect(editorReducer(undone, { type: 'redo' }).layers).toEqual(result.state.layers)
  })
  it('creates one undo snapshot for pure state document changes', async () => {
    const before = state()
    const result = await executeTransaction(before, { steps: [{ id: 'pure', apply: s => ({ ...s, layers: s.layers.map(layer => layer.id === 'art' ? { ...layer, name: 'pure change' } : layer) }) }] })
    expect(result.status).toBe('committed'); if (result.status !== 'committed') return
    expect(result.state.undoStack).toHaveLength(1)
    const undone = editorReducer(result.state, { type: 'undo' }); expect(undone.layers).toEqual(before.layers)
    expect(editorReducer(undone, { type: 'redo' }).layers).toEqual(result.state.layers)
  })
  it('keeps history and redo for no document change even if a reducer creates a snapshot', async () => {
    const before = editorReducer(editorReducer(state(), { type: 'rename-layer', id: 'art', name: 'future' }), { type: 'undo' })
    const result = await executeTransaction(before, transactionFromActions('noop', [{ type: 'set-color-management', settings: before.colorManagement }]))
    expect(result.status).toBe('committed'); if (result.status !== 'committed') return
    expect(result.state.undoStack).toEqual(before.undoStack); expect(result.state.redoStack).toEqual(before.redoStack)
  })
  it('commits three reducer steps as one undo entry and redoes as one unit', async () => {
    const before = state()
    const result = await executeTransaction(before, transactionFromActions('three', [
      { type: 'rename-layer', id: 'art', name: 'one' },
      { type: 'set-layer-opacity', id: 'art', opacity: 55 },
      { type: 'toggle-layer', id: 'art' },
    ]))
    expect(result.status).toBe('committed'); if (result.status !== 'committed') return
    expect(result.state.undoStack).toHaveLength(1); expect(result.state.layers[0].name).toBe('one')
    const undone = editorReducer(result.state, { type: 'undo' }); expect(undone.layers).toEqual(before.layers); expect(undone.redoStack).toHaveLength(1)
    const redone = editorReducer(undone, { type: 'redo' }); expect(redone.layers).toEqual(result.state.layers)
  })
  it('rolls back all prior steps and releases resources when a later step fails', async () => {
    const release = vi.fn(); const before = state()
    const result = await executeTransaction(before, { id: 'failure', resources: [{ id: 'image', release }], steps: [
      { id: 'first', apply: s => editorReducer(s, { type: 'rename-layer', id: 'art', name: 'dirty' }), resources: ['image'] },
      { id: 'second', apply: () => { throw new Error('network failed') }, resources: ['image'] },
    ]})
    expect(result.status).toBe('failed'); expect(result.state).toEqual(before); expect(release).toHaveBeenCalledTimes(1)
  })
  it('keeps a candidate when the document changes during execution', async () => {
    const before = state(); let current = before
    const result = await executeTransaction(before, { id: 'conflict', base: editorDocumentFingerprint(before), steps: [
      { id: 'first', apply: s => { current = editorReducer(current, { type: 'rename-layer', id: 'art', name: 'human edit' }); return editorReducer(s, { type: 'rename-layer', id: 'art', name: 'candidate' }) } },
    ]}, { current: () => current })
    expect(result.status).toBe('conflict'); if (result.status !== 'conflict') return
    expect(result.state.layers.find(layer => layer.id === 'art')?.name).toBe('human edit'); expect(result.candidate.state.layers.find(layer => layer.id === 'art')?.name).toBe('candidate')
  })
  it('cancels before the next step without committing or leaking resources', async () => {
    const controller = new AbortController(); const release = vi.fn(); const before = state()
    const result = await executeTransaction(before, { id: 'cancel', resources: [{ id: 'x', release }], steps: [{ id: 'one', apply: s => { controller.abort(); return s } }, { id: 'two', apply: () => { throw new Error('must not run') } }]}, { signal: controller.signal })
    expect(result.status).toBe('cancelled'); expect(result.state).toEqual(before); expect(release).toHaveBeenCalled()
  })
})
