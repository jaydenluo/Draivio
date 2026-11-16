import { FloatingSurface } from '../ui/FloatingSurface'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { dimensionError } from './documentGeometry'
import { decodeProject, encodeProject } from './projectFormat'
import { saveProjectFile, type ProjectLocation } from './projectStorage'
import { createDocumentSession, documentIsDirty, documentSignature, MAX_OPEN_DOCUMENTS, type DocumentWorkspace, type WorkspaceAction } from './documentWorkspace'
import { decodeWorkspace, encodeWorkspace, WORKSPACE_RECOVERY_KEY } from './workspaceRecovery'
import { createRecoveryStore } from './recoveryStore'
import { message } from '../ui/message'
import './documentTabs.css'

type WorkspaceContextValue = {
  workspace: DocumentWorkspace; dispatchWorkspace: Dispatch<WorkspaceAction>; busyIds: Set<string>
  newDocument: (size?: { width: number; height: number; background?: string; colorManagement?: import('../color/iccPipeline').ColorManagementSettings }) => void
  openSerialized: (text: string, location?: ProjectLocation) => void
  saveDocument: (id: string, saveAs?: boolean) => Promise<boolean>
  requestClose: (id: string) => void
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

export function DocumentWorkspaceProvider({ workspace, dispatch, children }: { workspace: DocumentWorkspace; dispatch: Dispatch<WorkspaceAction>; children: ReactNode }) {
  const latest = useRef(workspace); latest.current = workspace
  const saving = useRef(new Set<string>())
  const [busyIds, setBusyIds] = useState(new Set<string>())
  const [closeId, setCloseId] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<DocumentWorkspace | null>(null)
  const recoveryPending = useRef(true)
  const persistenceVersion = useRef(0)
  const mounted = useRef(true)
  const closing = workspace.documents.find(document => document.id === closeId)
  const notify = useCallback((text: string) => message.warning(text, { key: 'document-workspace' }), [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; persistenceVersion.current++ } }, [])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const stored = localStorage.getItem(WORKSPACE_RECOVERY_KEY)
        if (stored) { if (!cancelled) setRecovery(decodeWorkspace(stored)); return }
        const legacy = await createRecoveryStore().list('draivio-default-document')
        if (legacy.length && typeof legacy[0].payload === 'string') {
          const loaded = decodeProject(legacy[0].payload)
          const document = createDocumentSession(loaded.metadata.name, undefined, loaded)
          document.savedSignature = undefined
          if (!cancelled) setRecovery({ documents: [document], activeId: document.id })
        } else if (!cancelled) recoveryPending.current = false
      } catch { if (!cancelled) recoveryPending.current = false }
    }
    void load()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (recoveryPending.current) return
    const version = ++persistenceVersion.current
    const timer = setTimeout(() => {
      void encodeWorkspace(workspace).then(text => {
        if (!mounted.current || version !== persistenceVersion.current) return
        if (text.length > 24 * 1024 * 1024) throw new Error('恢复副本超过本地缓存容量，请保存项目文件')
        localStorage.setItem(WORKSPACE_RECOVERY_KEY, text)
      }).catch(() => { if (mounted.current && version === persistenceVersion.current) notify('恢复副本未能写入，请及时保存项目文件') })
    }, 900)
    return () => { clearTimeout(timer); persistenceVersion.current++ }
  }, [workspace, notify])

  const newDocument = useCallback((size: { width: number; height: number; background?: string; colorManagement?: import('../color/iccPipeline').ColorManagementSettings } = { width: 1024, height: 1024, background: 'transparent' }) => {
    if (latest.current.documents.length >= MAX_OPEN_DOCUMENTS) { notify(`最多同时打开 ${MAX_OPEN_DOCUMENTS} 个文档，请先关闭部分标签`); return }
    const error = dimensionError(size.width, size.height)
    if (error) { notify(error); return }
    const document = createDocumentSession(`未命名作品 ${latest.current.documents.length + 1}`, size)
    document.state.documentBackground = size.background ?? 'transparent'; if (size.colorManagement) document.state.colorManagement = size.colorManagement
    dispatch({ type: 'open', document })
  }, [dispatch, notify])

  const openSerialized = useCallback((text: string, location?: ProjectLocation) => {
    if (latest.current.documents.length >= MAX_OPEN_DOCUMENTS) { notify(`最多同时打开 ${MAX_OPEN_DOCUMENTS} 个文档，请先关闭部分标签`); return }
    try {
      const loaded = decodeProject(text)
      const error = dimensionError(loaded.document.documentWidth, loaded.document.documentHeight)
      if (error) throw new Error(error)
      // A file may carry the same project ID as another copy: the session ID remains unique.
      dispatch({ type: 'open', document: createDocumentSession(loaded.metadata.name, undefined, { ...loaded, location }) })
    } catch (error) { notify(error instanceof Error ? error.message : '项目无法打开，当前作品已保留') }
  }, [dispatch, notify])

  const saveDocument = useCallback(async (id: string, saveAs = false) => {
    const document = latest.current.documents.find(item => item.id === id)
    if (!document || saving.current.has(id)) return false
    saving.current.add(id); setBusyIds(new Set(saving.current))
    try {
      const signature = documentSignature(document)
      const text = await encodeProject(document.state, document.metadata)
      const location = await saveProjectFile(text, document.metadata.name, saveAs ? undefined : document.location)
      if (!location || !mounted.current) return false
      const current = latest.current.documents.find(item => item.id === id)
      if (!current) return false
      dispatch({ type: 'saved', id, signature, location })
      return documentSignature(current) === signature
    } catch (error) { notify(error instanceof Error ? error.message : '保存失败，原文件已保留'); return false }
    finally { saving.current.delete(id); if (mounted.current) setBusyIds(new Set(saving.current)) }
  }, [dispatch, notify])

  const requestClose = useCallback((id: string) => {
    const document = latest.current.documents.find(item => item.id === id)
    if (!document) return
    if (documentIsDirty(document) || document.state.isGenerating || saving.current.has(id)) setCloseId(id)
    else dispatch({ type: 'close', id })
  }, [dispatch])

  useEffect(() => {
    const dirty = () => latest.current.documents.some(documentIsDirty) || latest.current.documents.some(document => document.state.isGenerating) || saving.current.size > 0
    const unload = (event: BeforeUnloadEvent) => { if (dirty()) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', unload)
    const unlisten = isTauri() ? getCurrentWindow().onCloseRequested(event => { if (dirty() && !window.confirm('有作品尚未保存或仍在处理中。确定放弃并关闭所有文档？')) event.preventDefault() }) : undefined
    return () => { window.removeEventListener('beforeunload', unload); void unlisten?.then(fn => fn()) }
  }, [])

  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || closeId) return
      const command = event.ctrlKey || event.metaKey
      if (!command) return
      if (event.key.toLowerCase() === 'n') { event.preventDefault(); newDocument() }
      if (event.key.toLowerCase() === 'w') { event.preventDefault(); requestClose(latest.current.activeId) }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        const current = latest.current, index = current.documents.findIndex(document => document.id === current.activeId)
        dispatch({ type: 'activate', id: current.documents[(index + (event.shiftKey ? -1 : 1) + current.documents.length) % current.documents.length].id })
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.document-tabs [aria-selected="true"]')?.focus({ preventScroll: true }))
      }
    }
    window.addEventListener('keydown', keyboard)
    return () => window.removeEventListener('keydown', keyboard)
  }, [dispatch, newDocument, requestClose, closeId])

  return <WorkspaceContext.Provider value={{ workspace, dispatchWorkspace: dispatch, busyIds, newDocument, openSerialized, saveDocument, requestClose }}>
    {children}
    {recovery ? <FloatingSurface className="recovery-banner" role="dialog" aria-label="恢复编辑" title="恢复编辑" onClose={() => { recoveryPending.current = false; setRecovery(null) }}><strong>发现 {recovery.documents.length} 个未关闭文档</strong><span>恢复后可继续编辑，请重新保存项目文件。</span><div><button onClick={() => { recoveryPending.current = false; dispatch({ type: 'recover', workspace: recovery }); setRecovery(null) }}>恢复副本</button><button onClick={() => { recoveryPending.current = false; localStorage.removeItem(WORKSPACE_RECOVERY_KEY); void createRecoveryStore().discard('draivio-default-document'); setRecovery(null); dispatch({ type: 'activate', id: latest.current.activeId }) }}>丢弃</button></div></FloatingSurface> : null}
    {closing ? <div className="document-close-backdrop"><FloatingSurface title="关闭文档" closeLabel="取消关闭文档" onClose={() => setCloseId(null)} className="document-close-dialog" role="dialog" aria-modal="true" aria-label="关闭文档" onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Escape') { event.preventDefault(); setCloseId(null) }
      if (event.key === 'Tab') {
        const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        event.preventDefault()
        buttons[(index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
      }
    }}><h2>关闭「{closing.metadata.name}」？</h2><p>{closing.state.isGenerating ? '此文档仍在生成中。关闭将停止排队，已提交请求可能仍计费，后续结果不会写入其他文档。' : '保存修改后再关闭，或放弃本次修改。'}</p><footer><button autoFocus onClick={() => setCloseId(null)}>取消</button><button disabled={busyIds.has(closing.id)} onClick={() => { dispatch({ type: 'close', id: closing.id }); setCloseId(null) }}>不保存</button><button className="primary" disabled={busyIds.has(closing.id) || closing.state.isGenerating} onClick={async () => { if (await saveDocument(closing.id)) { dispatch({ type: 'close', id: closing.id }); setCloseId(null) } }}>保存并关闭</button></footer></FloatingSurface></div> : null}
  </WorkspaceContext.Provider>
}

export function useDocumentWorkspace() {
  const value = useContext(WorkspaceContext)
  if (!value) throw new Error('Document workspace requires EditorProvider')
  return value
}
