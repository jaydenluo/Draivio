import { COMMAND_EVENT, matchesFileShortcut, isShortcutTextTarget } from '../commands/shortcuts'
import { FloatingSurface } from '../ui/FloatingSurface'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type Dispatch, type ReactNode } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { dimensionError } from './documentGeometry'
import { decodeProject, encodeProject, serializableDocument, PROJECT_FORMAT, PROJECT_SCHEMA_VERSION } from './projectFormat'
import type { ProjectMetadata } from './projectFormat'
import type { EditorState } from '../state/editor'
import { saveProjectFile,saveProjectContainer,registerProjectInline,releaseProjectContainer,openProjectToken,type OpenedProjectFile, type ProjectLocation } from './projectStorage'
import {decodeProjectContainer,prepareProjectContainer,type NativeContainer} from './projectContainer'
import {openProjectPreviews} from './projectRuntime'
import {projectCleanup} from './projectCleanup'
import {collectRasterReferences,imageResourceOwnership} from '../assets/imageAssetStore'
import { createDocumentSession, documentIsDirty, documentSignature, workspaceReducer, MAX_OPEN_DOCUMENTS, type DocumentWorkspace, type WorkspaceAction } from './documentWorkspace'
import { decodeWorkspace, encodeWorkspace, WORKSPACE_RECOVERY_KEY } from './workspaceRecovery'
import { createRecoveryStore } from './recoveryStore'
import { listNativeRecovery, writeNativeRecovery, discardNativeRecovery, nativeRecoveryAvailable } from './nativeRecovery'
import { savedContentIdentity } from './contentIdentity'
import { message } from '../ui/message'
import { RecoveryNotice } from './RecoveryNotice'
import {createResultDocument} from '../creation/resultDocument'
import type {AIResult} from '../state/editor'
import './documentTabs.css'

type WorkspaceContextValue = {
  workspace: DocumentWorkspace; dispatchWorkspace: Dispatch<WorkspaceAction>; busyIds: Set<string>
  newDocument: (size?: { width: number; height: number; background?: string; colorManagement?: import('../color/iccPipeline').ColorManagementSettings }) => void
  openSerialized: (text: string, location?: ProjectLocation) => void
  openPickedProject: (file:OpenedProjectFile)=>Promise<void>
  saveDocument: (id: string, saveAs?: boolean) => Promise<boolean>
  requestClose: (id: string) => void
  openResultDocument: (result:AIResult)=>boolean
}
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

function prepareNativeRecoveryProject(state: EditorState, metadata: ProjectMetadata): string {
  const document = serializableDocument(state) as unknown as Record<string, unknown>
  const visit = (value: unknown): void => {
    if (typeof value === 'string') {
      if (value.startsWith('data:image/') && value.length > 256 * 1024) throw new Error('恢复副本包含过大的内嵌图像；请先保存项目文件')
      return
    }
    if (Array.isArray(value)) {
      if (value.length > 1_000_000 && value.every(item => typeof item === 'number')) throw new Error('恢复副本包含未持久化的像素数组；请先保存项目文件')
      value.forEach(visit); return
    }
    if (!value || typeof value !== 'object') return
    Object.values(value as Record<string, unknown>).forEach(visit)
  }
  visit(document)
  return JSON.stringify({ format: PROJECT_FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, metadata, assets: {}, document })
}

export function DocumentWorkspaceProvider({ workspace, dispatch, children }: { workspace: DocumentWorkspace; dispatch: Dispatch<WorkspaceAction>; children: ReactNode }) {
  const latest = useRef(workspace); latest.current = workspace
  const saving = useRef(new Set<string>())
  const [busyIds, setBusyIds] = useState(new Set<string>())
  const [closeId, setCloseId] = useState<string | null>(null)
  const [recovery, setRecovery] = useState<DocumentWorkspace | null>(null)
  const recoveryPending = useRef(true)
  // View changes and re-activation must not create a recovery record for the
  // untouched startup document, especially immediately after discarding one.
  const [startupSignatures] = useState(() => new Map(workspace.documents.map(document => [document.id, documentSignature(document)])))
  const ownsRecovery = useRef(false)
  const persistenceVersion = useRef(0)
  const mounted = useRef(true)
  const resourceOwners=useRef(new Map<string,{ownerId:string;release:()=>Promise<void>}>())
  const openingSlots=useRef(new Set<AbortController>())
  const openingControllers=useRef(new Set<AbortController>())
  const trackedDocuments=useRef(new Set(workspace.documents.map(d=>d.id)))
  const queueProjectRelease=(id:string,resources?:{ownerId:string;release:()=>Promise<void>})=>projectCleanup.release(resources?.ownerId??`document:${id}`,{
    dispose:resources?.release??(async()=>{}),
    releaseRoots:async()=>{await imageResourceOwnership.replaceMany(['document','undo','redo'].map(kind=>({owner:{kind:kind as 'document'|'undo'|'redo',id},references:[]})));if(resources && /^(open|save):/.test(resources.ownerId))await releaseProjectContainer(resources.ownerId)}
  })
  const closing = workspace.documents.find(document => document.id === closeId)
  const notify = useCallback((text: string) => message.warning(text, { key: 'document-workspace' }), [])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; persistenceVersion.current++ } }, [])
  useEffect(()=>{
    const ids=new Set(workspace.documents.map(d=>d.id))
    for(const id of trackedDocuments.current)if(!ids.has(id)){
      const resources=resourceOwners.current.get(id);resourceOwners.current.delete(id)
      void queueProjectRelease(id,resources).catch(()=>notify('关闭后的项目资源释放待重试，原件与保护根已保留'))
    }
    trackedDocuments.current=ids
  },[workspace.documents,notify])
  useEffect(()=>()=>{
    for(const controller of openingControllers.current)controller.abort()
    for(const [id,resources] of resourceOwners.current)void queueProjectRelease(id,resources).catch(()=>{/* Module-owned queue retains failed cleanup across unmount. */})
    resourceOwners.current.clear()
  },[])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const native = await listNativeRecovery()
        if (native.length) {
          const documents = native.map(entry => { const loaded=decodeProject(entry.project,true); const d=createDocumentSession(loaded.metadata.name,undefined,{...loaded}); d.id=entry.documentId; d.savedSignature=undefined; return d })
          if (!cancelled) setRecovery({documents,activeId:documents[0].id}); return
        }
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
      const persist = async () => {
        const unchanged = workspace.documents.length === startupSignatures.size && workspace.documents.every(document => startupSignatures.get(document.id) === documentSignature(document))
        if (unchanged) {
          // An edit subsequently undone to the startup state has nothing left
          // to recover. Only clear a slot this instance has written itself.
          if (ownsRecovery.current) { localStorage.removeItem(WORKSPACE_RECOVERY_KEY); ownsRecovery.current = false }
          return
        }
        if (nativeRecoveryAvailable) {
          for (const document of workspace.documents) {
            const project = prepareNativeRecoveryProject(document.state, document.metadata)
            await writeNativeRecovery({documentId:document.id, revision:savedContentIdentity(document.state), savedAt:Date.now(), project})
          }
        } else {
          const text = await encodeWorkspace(workspace)
          if (!mounted.current || version !== persistenceVersion.current) return
          if (text.length > 24 * 1024 * 1024) throw new Error('恢复副本超过本地缓存容量，请保存项目文件')
          localStorage.setItem(WORKSPACE_RECOVERY_KEY, text)
        }
        ownsRecovery.current = true
      }
      void persist().catch(() => { if (mounted.current && version === persistenceVersion.current) notify('恢复副本未能写入，请及时保存项目文件') })
    }, 900)
    return () => { clearTimeout(timer); persistenceVersion.current++ }
  }, [workspace, notify, startupSignatures])

  const restoreRecovery = useCallback(async () => {
    if (!recovery) return
    const adopted: string[] = []
    try {
      for (const document of recovery.documents) {
        const references = collectRasterReferences(document.state)
        if (!references.length) continue
        const release = await openProjectPreviews(document.state as never, document.id)
        await imageResourceOwnership.replace({ kind: 'document', id: document.id }, references)
        resourceOwners.current.set(document.id, { ownerId: `recovery:${document.id}`, release })
        adopted.push(document.id)
      }
      recoveryPending.current = false
      dispatch({ type: 'recover', workspace: recovery })
      setRecovery(null)
    } catch (error) {
      await Promise.all(adopted.map(id => queueProjectRelease(id, resourceOwners.current.get(id)).catch(() => undefined)))
      notify(error instanceof Error ? error.message : '恢复原件预览失败；恢复副本已保留')
    }
  }, [dispatch, notify, recovery])

  const discardRecovery = useCallback(async () => {
    if (!recovery) return
    try {
      await Promise.all(recovery.documents.map(document => discardNativeRecovery(document.id)))
      await createRecoveryStore().discard('draivio-default-document')
      persistenceVersion.current++
      ownsRecovery.current = false
      recoveryPending.current = false
      localStorage.removeItem(WORKSPACE_RECOVERY_KEY)
      setRecovery(null)
      dispatch({ type: 'activate', id: latest.current.activeId })
    } catch (error) {
      notify(error instanceof Error ? error.message : '恢复副本删除失败，副本仍会保留')
    }
  }, [dispatch, notify, recovery])

  const newDocument = useCallback((size: { width: number; height: number; background?: string; colorManagement?: import('../color/iccPipeline').ColorManagementSettings } = { width: 1024, height: 1024, background: 'transparent' }) => {
    if (latest.current.documents.length+openingSlots.current.size >= MAX_OPEN_DOCUMENTS) { notify(`最多同时打开 ${MAX_OPEN_DOCUMENTS} 个文档，请先关闭部分标签`); return }
    const error = dimensionError(size.width, size.height)
    if (error) { notify(error); return }
    const document = createDocumentSession(`未命名作品 ${latest.current.documents.length + 1}`, size)
    document.state.documentBackground = size.background ?? 'transparent'; if (size.colorManagement) document.state.colorManagement = size.colorManagement
    latest.current=workspaceReducer(latest.current,{type:'open',document})
    dispatch({ type: 'open', document })
  }, [dispatch, notify])

  const openResultDocument=useCallback((result:AIResult)=>{
    if(latest.current.documents.length+openingSlots.current.size>=MAX_OPEN_DOCUMENTS){notify(`最多同时打开 ${MAX_OPEN_DOCUMENTS} 个文档，请先关闭部分标签`);return false}
    try{
      const document=createResultDocument(result)
      latest.current=workspaceReducer(latest.current,{type:'open',document})
      dispatch({type:'open',document});return true
    }catch(error){notify(error instanceof Error?error.message:'无法打开结果图片');return false}
  },[dispatch,notify])

  const openSerialized = useCallback((text: string, location?: ProjectLocation) => {
    if (latest.current.documents.length+openingSlots.current.size >= MAX_OPEN_DOCUMENTS) { notify(`最多同时打开 ${MAX_OPEN_DOCUMENTS} 个文档，请先关闭部分标签`); return }
    try {
      const loaded = decodeProject(text)
      const error = dimensionError(loaded.document.documentWidth, loaded.document.documentHeight)
      if (error) throw new Error(error)
      // A file may carry the same project ID as another copy: the session ID remains unique.
      const document=createDocumentSession(loaded.metadata.name, undefined, { ...loaded, location });latest.current=workspaceReducer(latest.current,{type:'open',document});dispatch({type:'open',document})
    } catch (error) { notify(error instanceof Error ? error.message : '项目无法打开，当前作品已保留') }
  }, [dispatch, notify])

  const openContainer=useCallback(async(container:NativeContainer,location:ProjectLocation)=>{
    let release:(()=>Promise<void>)|undefined,adopted=false,documentOwner:string|undefined
    const controller=new AbortController();openingControllers.current.add(controller)
    try{
      if(latest.current.documents.length+openingSlots.current.size>=MAX_OPEN_DOCUMENTS)throw new Error(`最多同时打开 ${MAX_OPEN_DOCUMENTS} 个文档，请先关闭部分标签`)
      openingSlots.current.add(controller)
      if(container.workingDiffs?.length)throw new Error('此项目含尚未支持的原生编辑差分；原始项目与全部资源已保留，当前版本无法安全预览，请等待差分编解码支持')
      const loaded=decodeProjectContainer(container)
      const document=createDocumentSession(loaded.metadata.name,undefined,{...loaded,location:{...location,schemaVersion:4}})
      document.state.rasterPreviewOnly=collectRasterReferences(loaded.document).length>0
      release=await openProjectPreviews(loaded.document,document.id,controller.signal,handle=>{release=handle})
      if(!mounted.current||controller.signal.aborted)throw new Error('项目打开已取消')
      if(latest.current.documents.length>=MAX_OPEN_DOCUMENTS)throw new Error('打开的文档数量已达到上限')
      // Install the document owner before dropping any temporary open owner.
      // The open owner also retains compatibility source blobs until close.
      documentOwner=document.id
      await imageResourceOwnership.replace({kind:'document',id:document.id},collectRasterReferences(loaded.document))
      if(!mounted.current||controller.signal.aborted)throw new Error('项目打开已取消')
      if(latest.current.documents.length>=MAX_OPEN_DOCUMENTS)throw new Error('打开的文档数量已达到上限')
      openingSlots.current.delete(controller)
      latest.current=workspaceReducer(latest.current,{type:'open',document})
      resourceOwners.current.set(document.id,{ownerId:container.ownerId,release})
      dispatch({type:'open',document});adopted=true
    }catch(error){notify(error instanceof Error?error.message:'项目无法打开，当前作品已保留')}
    finally{openingControllers.current.delete(controller);openingSlots.current.delete(controller);if(!adopted){await queueProjectRelease(documentOwner??`aborted:${container.ownerId}`,{ownerId:container.ownerId,release:release??(async()=>{})}).catch(()=>notify('项目资源释放待重试；原件与保护根已保留'))}}
  },[dispatch,notify])
  const openPickedProject=useCallback(async(file:OpenedProjectFile)=>{await projectCleanup.retry().catch(()=>notify('先前项目资源释放仍待重试；原件已保留'));if(file.container)await openContainer(file.container,file.location);else if(typeof file.text==='string')openSerialized(file.text,file.location);else notify('项目文件缺少清单')},[openContainer,openSerialized,notify])
  useEffect(()=>{
    if(!isTauri())return
    const unlisten=getCurrentWindow().listen<[string,string][]>('project-file-drop',event=>{void(async()=>{for(const [token]of event.payload){try{await openPickedProject(await openProjectToken(token))}catch(error){notify(error instanceof Error?error.message:'项目拖放打开失败')}}})()})
    return()=>{void unlisten.then(fn=>fn())}
  },[openPickedProject,notify])

  const saveDocument = useCallback(async (id: string, saveAs = false) => {
    const document = latest.current.documents.find(item => item.id === id)
    if (!document || saving.current.has(id)) return false
    saving.current.add(id); setBusyIds(new Set(saving.current))
    try {
      const signature = documentSignature(document)
      const useContainer=document.location?.schemaVersion===4||collectRasterReferences(document.state).length>0||(isTauri()&&saveAs)
      let location:ProjectLocation|null
      if(useContainer){
        if(!isTauri())throw new Error('此浏览器不支持受预算的 v4 二进制项目保存，请使用桌面版')
        const ownerId=`save:${crypto.randomUUID()}`
        try{const request=await prepareProjectContainer(document.state,document.metadata,{ownerId,registerInline:registerProjectInline});location=await saveProjectContainer(request,document.metadata.name,saveAs?undefined:document.location)}
        finally{await releaseProjectContainer(ownerId).catch(()=>notify('项目临时资源释放失败，原件已保留'))}
      }else{
        const text=await encodeProject(document.state,document.metadata)
        location=await saveProjectFile(text,document.metadata.name,saveAs?undefined:document.location)
      }
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
      if (event.defaultPrevented || event.isComposing || event.repeat || (!(event.metaKey || event.ctrlKey) && (isShortcutTextTarget(event.target) || isShortcutTextTarget(document.activeElement))) || closeId) return
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return
      if (matchesFileShortcut(event, 'new')) { event.preventDefault(); newDocument() }
      if (matchesFileShortcut(event, 'close')) { event.preventDefault(); requestClose(latest.current.activeId) }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        const current = latest.current, index = current.documents.findIndex(document => document.id === current.activeId)
        dispatch({ type: 'activate', id: current.documents[(index + (event.shiftKey ? -1 : 1) + current.documents.length) % current.documents.length].id })
        requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.document-tabs [aria-selected="true"]')?.focus({ preventScroll: true }))
      }
    }
    const command = (event: Event) => { if (closeId) return; const id = (event as CustomEvent<string>).detail; if (id === 'new') newDocument(); if (id === 'close') requestClose(latest.current.activeId) }
    window.addEventListener(COMMAND_EVENT, command)
    window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener('keydown', keyboard); window.removeEventListener(COMMAND_EVENT, command) }
  }, [dispatch, newDocument, requestClose, closeId])

  return <WorkspaceContext.Provider value={{ workspace, dispatchWorkspace: dispatch, busyIds, newDocument, openSerialized, openPickedProject, saveDocument, requestClose, openResultDocument }}>
    {children}
    {recovery ? <RecoveryNotice documents={recovery.documents.map(document => ({ id: document.id, name: document.metadata.name, width: document.state.documentWidth, height: document.state.documentHeight }))} onRestore={() => { void restoreRecovery() }} onDiscard={() => { void discardRecovery() }} /> : null}
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
