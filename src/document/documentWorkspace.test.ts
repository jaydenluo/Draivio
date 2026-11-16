import { expect, test } from 'vitest'
import { createDocumentSession, createDocumentWorkspace, documentSignature, workspaceReducer } from './documentWorkspace'

test('keeps dimensions, view and undo separate across documents', () => {
  let workspace = createDocumentWorkspace()
  const first = workspace.activeId
  workspace = workspaceReducer(workspace, { type: 'edit', id: first, action: { type: 'set-zoom', zoom: 150 } })
  workspace = workspaceReducer(workspace, { type: 'edit', id: first, action: { type: 'add-layer' } })
  const selection = { x: 10, y: 12, width: 30, height: 24 }
  workspace = workspaceReducer(workspace, { type: 'edit', id: first, action: { type: 'set-selection-rect', rect: selection } })
  const second = createDocumentSession('第二张', { width: 1200, height: 800 })
  workspace = workspaceReducer(workspace, { type: 'open', document: second })
  expect(workspace.documents[1].state.documentWidth).toBe(1200)
  workspace = workspaceReducer(workspace, { type: 'edit', id: second.id, action: { type: 'undo' } })
  expect(workspace.documents[0].state.layers).toHaveLength(4)
  workspace = workspaceReducer(workspace, { type: 'activate', id: first })
  expect(workspace.documents[0].state.zoom).toBe(150)
  expect(workspace.documents[0].state.selectionRect).toEqual(selection)
  expect(workspace.documents[1].state.selectionVisible).toBe(false)
  workspace = workspaceReducer(workspace, { type: 'edit', id: first, action: { type: 'undo' } })
  expect(workspace.documents[0].state.layers).toHaveLength(3)
  expect(workspace.documents[1].state.documentWidth).toBe(1200)
})

test('routes background results to their original document and ignores closed sessions', () => {
  let workspace = createDocumentWorkspace()
  const first = workspace.activeId
  workspace = workspaceReducer(workspace, { type: 'open', document: createDocumentSession('第二张') })
  workspace = workspaceReducer(workspace, { type: 'edit', id: first, action: { type: 'add-layer' } })
  expect(workspace.documents[0].state.layers).toHaveLength(4)
  expect(workspace.documents[1].state.layers).toHaveLength(1)
  workspace = workspaceReducer(workspace, { type: 'close', id: first })
  const before = workspace
  expect(workspaceReducer(workspace, { type: 'edit', id: first, action: { type: 'add-layer' } })).toBe(before)
})

test('records the captured save signature without marking later edits saved', () => {
  let workspace = createDocumentWorkspace()
  const first = workspace.documents[0]
  const signature = documentSignature(first)
  workspace = workspaceReducer(workspace, { type: 'rename', id: first.id, name: '保存中改名' })
  workspace = workspaceReducer(workspace, { type: 'saved', id: first.id, signature, location: { name: '旧名称.draivio' } })
  expect(workspace.documents[0].savedSignature).not.toBe(documentSignature(workspace.documents[0]))
})

test('new documents start without demonstration content or previous history', () => {
  const document = createDocumentSession('新文档')
  expect(document.state.layers).toHaveLength(1)
  expect(document.state.layers[0].source).toBeUndefined()
  expect(document.state.undoStack).toEqual([])
  expect(document.state.history).toEqual([])
  expect(document.state.prompt).toBe('')
})
