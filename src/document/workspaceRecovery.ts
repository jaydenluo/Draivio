import { decodeProject, encodeProject } from './projectFormat'
import { createDocumentSession, MAX_OPEN_DOCUMENTS, type DocumentWorkspace } from './documentWorkspace'
import { dimensionError } from './documentGeometry'

export const WORKSPACE_RECOVERY_KEY = 'draivio-document-workspace-v1'
export async function encodeWorkspace(workspace: DocumentWorkspace): Promise<string> {
  const documents = await Promise.all(workspace.documents.map(async document => ({
    id: document.id,
    project: await encodeProject(document.state, document.metadata),
    view: { zoom: document.state.zoom, canvasOffset: document.state.canvasOffset, canvasRotation: document.state.canvasRotation },
  })))
  return JSON.stringify({ version: 1, activeId: workspace.activeId, documents })
}
export function decodeWorkspace(text: string): DocumentWorkspace {
  const raw = JSON.parse(text)
  if (raw.version !== 1 || !Array.isArray(raw.documents) || !raw.documents.length || raw.documents.length > MAX_OPEN_DOCUMENTS) throw new Error('工作区恢复数据无效')
  const ids = new Set<string>()
  const documents = raw.documents.map((item: { id: string; project: string; view?: { zoom?: number; canvasOffset?: { x: number; y: number }; canvasRotation?: number } }) => {
    if (typeof item.id !== 'string' || ids.has(item.id)) throw new Error('恢复文档标识无效')
    ids.add(item.id)
    const loaded = decodeProject(item.project)
    const error = dimensionError(loaded.document.documentWidth, loaded.document.documentHeight)
    if (error) throw new Error(error)
    const document = createDocumentSession(loaded.metadata.name, undefined, loaded)
    document.id = item.id
    document.state.conversationRuns = document.state.conversationRuns?.map(run => ({ ...run, documentId: item.id }))
    document.savedSignature = undefined
    document.location = undefined
    document.viewInitialized = true
    if (Number.isFinite(item.view?.zoom)) document.state.zoom = Math.min(400, Math.max(10, item.view!.zoom!))
    if (Number.isFinite(item.view?.canvasRotation)) document.state.canvasRotation = item.view!.canvasRotation!
    if (Number.isFinite(item.view?.canvasOffset?.x) && Number.isFinite(item.view?.canvasOffset?.y)) document.state.canvasOffset = item.view!.canvasOffset!
    return document
  })
  return { documents, activeId: ids.has(raw.activeId) ? raw.activeId : documents[0].id }
}
