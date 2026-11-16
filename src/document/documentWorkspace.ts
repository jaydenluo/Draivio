import { editorReducer, initialEditorState, type EditorAction, type EditorState } from '../state/editor'
import { projectFingerprint, type ProjectMetadata, type ProjectDocument } from './projectFormat'
import type { ProjectLocation } from './projectStorage'

export const MAX_OPEN_DOCUMENTS = 16
export type DocumentSession = { id: string; metadata: ProjectMetadata; state: EditorState; location?: ProjectLocation; savedSignature?: string; viewInitialized?: boolean }
export type DocumentWorkspace = { documents: DocumentSession[]; activeId: string }
export type WorkspaceAction =
  | { type: 'edit'; id: string; action: EditorAction }
  | { type: 'open'; document: DocumentSession }
  | { type: 'activate'; id: string }
  | { type: 'close'; id: string }
  | { type: 'rename'; id: string; name: string }
  | { type: 'saved'; id: string; signature: string; location: ProjectLocation }
  | { type: 'view-initialized'; id: string }
  | { type: 'recover'; workspace: DocumentWorkspace }

export function documentSignature(document: DocumentSession) {
  return JSON.stringify([document.metadata.id, document.metadata.name, projectFingerprint(document.state)])
}
export function documentIsDirty(document: DocumentSession) { return document.savedSignature !== documentSignature(document) }

export function createDocumentSession(name: string, size = { width: 1024, height: 1024 }, loaded?: { metadata: ProjectMetadata; document: ProjectDocument; location?: ProjectLocation }): DocumentSession {
  const base = structuredClone(initialEditorState)
  const blank = editorReducer(base, { type: 'new-document', ...size })
  const state = { ...blank, history: [], aiResults: [], prompt: '', undoStack: [], redoStack: [], selectedHistoryId: '', notice: null, isGenerating: false }
  const session: DocumentSession = { id: crypto.randomUUID(), metadata: loaded?.metadata ?? { id: crypto.randomUUID(), name }, state: loaded ? editorReducer(state, { type: 'restore-project', document: loaded.document }) : state, location: loaded?.location }
  // Saved records belong to this loaded project; runtime session IDs are renewed on open.
  if (loaded && session.state.conversationRuns) session.state = { ...session.state, conversationRuns: session.state.conversationRuns.map(run => ({ ...run, documentId: session.id })) }
  if (loaded) session.savedSignature = documentSignature(session)
  return session
}

export function createDocumentWorkspace(state?: EditorState): DocumentWorkspace {
  const first: DocumentSession = { id: crypto.randomUUID(), metadata: { id: crypto.randomUUID(), name: '未命名作品' }, state: state ?? structuredClone(initialEditorState) }
  return { documents: [first], activeId: first.id }
}

export function workspaceReducer(workspace: DocumentWorkspace, action: WorkspaceAction): DocumentWorkspace {
  if (action.type === 'recover') return action.workspace.documents.length && action.workspace.documents.some(document => document.id === action.workspace.activeId) ? action.workspace : workspace
  if (action.type === 'open') return workspace.documents.length >= MAX_OPEN_DOCUMENTS ? workspace : { documents: [...workspace.documents, action.document], activeId: action.document.id }
  if (action.type === 'activate') return workspace.documents.some(document => document.id === action.id) ? { ...workspace, activeId: action.id } : workspace
  const target = workspace.documents.find(document => document.id === action.id)
  if (!target) return workspace
  if (action.type === 'close') {
    const index = workspace.documents.indexOf(target)
    const documents = workspace.documents.filter(document => document.id !== action.id)
    if (!documents.length) return createDocumentWorkspace(createDocumentSession('未命名作品').state)
    return { documents, activeId: workspace.activeId === action.id ? documents[Math.min(index, documents.length - 1)].id : workspace.activeId }
  }
  return { ...workspace, documents: workspace.documents.map(document => {
    if (document.id !== action.id) return document
    if (action.type === 'edit') return { ...document, state: editorReducer(document.state, action.action) }
    if (action.type === 'rename') return { ...document, metadata: { ...document.metadata, name: action.name } }
    if (action.type === 'saved') return { ...document, savedSignature: action.signature, location: action.location }
    return { ...document, viewInitialized: true }
  }) }
}
