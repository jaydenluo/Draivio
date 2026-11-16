import { expect, test } from 'vitest'
import { editorReducer, initialEditorState } from './editor'
import { encodeProject, decodeProject } from '../document/projectFormat'

test('converts, links, replaces and rasterizes a smart object with undo', async () => {
  let state = editorReducer(initialEditorState, { type: 'convert-to-smart-object', id: 'art' })
  const layer = state.layers.find(item => item.id === 'art')!
  expect(layer.smartObject?.linked).toBe(true)
  const sourceId = layer.smartObject!.sourceId
  state = editorReducer(state, { type: 'update-smart-object-source', sourceId, patch: { source: 'data:image/png;base64,new', width: 1000, height: 500 } })
  expect(state.layers.find(item => item.id === 'art')).toMatchObject({ source: 'data:image/png;base64,new', contentWidth: 500 })
  state = editorReducer(state, { type: 'rasterize-smart-object', id: 'art', source: 'data:image/png;base64,new' })
  expect(state.layers.find(item => item.id === 'art')?.smartObject).toBeUndefined()
  expect(editorReducer(state, { type: 'undo' }).layers.find(item => item.id === 'art')?.smartObject).toBeDefined()
  const serialized = await encodeProject(state, { id: 'p', name: 'smart' })
  const reopened = decodeProject(serialized).document
  expect(reopened.layers.find(item => item.id === 'art')?.smartObject).toBeUndefined()
})

test('internal editable content is saved separately and ordinary copies share updates while independent copies do not', async () => {
  const base = structuredClone(initialEditorState)
  base.canvasTexts = [{ id: 'text', layerId: 'art', text: '原文', x: 10, y: 10, fontFamily: 'sans-serif', fontSize: 20, fontWeight: '400', color: '#000000', align: 'left' }]
  let state = editorReducer(base, { type: 'convert-to-smart-object', id: 'art' })
  expect(state.canvasTexts).toHaveLength(0)
  const sourceId = state.layers[0].smartObject!.sourceId
  state = editorReducer(state, { type: 'duplicate-layer', id: 'art' })
  expect(state.layers[0].smartObject!.sourceId).toBe(sourceId)
  state = editorReducer(state, { type: 'duplicate-smart-object-independent', id: 'art' })
  const independentId = state.layers.find(layer => layer.id === state.selectedLayerId)!.smartObject!.sourceId
  expect(independentId).not.toBe(sourceId)
  const document = structuredClone(state.smartObjectSources[sourceId].document!)
  document.canvasTexts[0].text = '回写'
  state = editorReducer(state, { type: 'update-smart-object-source', sourceId, patch: { document } })
  expect(state.smartObjectSources[sourceId].document!.canvasTexts[0].text).toBe('回写')
  expect(state.smartObjectSources[independentId].document!.canvasTexts[0].text).toBe('原文')
  const reopened = decodeProject(await encodeProject(state, { id: 'p', name: '源文件' })).document
  expect(reopened.smartObjectSources![sourceId].document!.canvasTexts[0].text).toBe('回写')
  expect(editorReducer(state, { type: 'undo' }).smartObjectSources[sourceId].document!.canvasTexts[0].text).toBe('原文')
})

test('rejects missing smart object source and protects locked conversion', () => {
  const locked = { ...initialEditorState, layers: initialEditorState.layers.map(layer => layer.id === 'art' ? { ...layer, locked: true } : layer) }
  expect(editorReducer(locked, { type: 'convert-to-smart-object', id: 'art' }).notice).toContain('锁定')
  expect(editorReducer(initialEditorState, { type: 'rasterize-smart-object', id: 'art' }).notice).toContain('不是智能对象')
})

test('shared locked instances and stale revisions reject internal writes; reopening a plain project clears old sources', () => {
  let state = editorReducer(initialEditorState, { type: 'convert-to-smart-object', id: 'art' })
  const sourceId = state.layers.find(layer => layer.id === 'art')!.smartObject!.sourceId
  state = editorReducer(state, { type: 'duplicate-layer', id: 'art' })
  state = editorReducer(state, { type: 'toggle-layer-lock', id: state.selectedLayerId })
  const blocked = editorReducer(state, { type: 'update-smart-object-source', sourceId, patch: { source: 'new' } })
  expect(blocked.notice).toContain('锁定')
  expect(blocked.smartObjectSources[sourceId].revision).toBe(1)
  const unlocked = { ...state, layers: state.layers.map(layer => ({ ...layer, locked: false })) }
  expect(editorReducer(unlocked, { type: 'update-smart-object-source', sourceId, baseRevision: 0, patch: { source: 'new' } }).notice).toContain('过期')
  expect(editorReducer(unlocked, { type: 'restore-project', document: { ...initialEditorState, smartObjectSources: undefined } }).smartObjectSources).toEqual({})
})

test('offline reopen rejects missing source references and recursive source documents', async () => {
  const state = editorReducer(initialEditorState, { type: 'convert-to-smart-object', id: 'art' })
  const raw = JSON.parse(await encodeProject(state, { id: 'p', name: 'source' }))
  const missing = structuredClone(raw); missing.document.smartObjectSources = {}
  expect(() => decodeProject(JSON.stringify(missing))).toThrow('缺失')
  const sourceId = state.layers[0].smartObject!.sourceId
  raw.document.smartObjectSources[sourceId].document.layers[0].smartObject = { sourceId, linked: true, instanceWidth: 500, instanceHeight: 625 }
  expect(() => decodeProject(JSON.stringify(raw))).toThrow('循环')
})


test('source identity rejects obsolete writes after undo and a same-revision branch', () => {
  let state = editorReducer(initialEditorState, { type: 'convert-to-smart-object', id: 'art' })
  const sourceId = state.layers[0].smartObject!.sourceId
  state = editorReducer(state, { type: 'update-smart-object-source', sourceId, patch: { text: 'first branch' } })
  const obsolete = state.smartObjectSources[sourceId]
  state = editorReducer(state, { type: 'undo' })
  state = editorReducer(state, { type: 'update-smart-object-source', sourceId, patch: { text: 'second branch' } })
  expect(state.smartObjectSources[sourceId].revision).toBe(obsolete.revision)
  for (const action of [
    { type: 'update-smart-object-source', sourceId, patch: { text: 'stale' }, expectedSource: obsolete },
    { type: 'replace-smart-object', id: 'art', source: obsolete, expectedSource: obsolete },
    { type: 'rasterize-smart-object', id: 'art', source: 'stale', expectedSource: obsolete },
  ] as const) {
    const result = editorReducer(state, action)
    expect(result.smartObjectSources).toBe(state.smartObjectSources)
    expect(result.undoStack).toBe(state.undoStack)
    expect(result.notice).toContain('过期')
  }
})


test.each(['document', 'text', 'shape'] as const)('project reopen rejects orphan %s source lacking renderable content', async kind => {
  const state = { ...structuredClone(initialEditorState), smartObjectSources: { orphan: { id: 'orphan', kind, width: 8, height: 8, revision: 1 } } }
  await expect(encodeProject(state, { id: 'orphan', name: 'empty' })).rejects.toThrow('缺失')
  const raw = JSON.parse(await encodeProject(initialEditorState, { id: 'orphan', name: 'empty' }))
  raw.document.smartObjectSources = state.smartObjectSources
  expect(() => decodeProject(JSON.stringify(raw))).toThrow('缺失')
})
