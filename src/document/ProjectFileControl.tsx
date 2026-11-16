import { useCallback, useEffect, useRef, useState } from 'react'
import { isTauri } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { useEditor } from '../state/editor'
import { decodeProject, encodeProject, projectFingerprint, validateProjectImages } from './projectFormat'
import { hasProjectPicker, openProjectFile, saveProjectFile, type ProjectLocation } from './projectStorage'
import { PROJECT_LIFECYCLE, QUERY_PROJECT_LIFECYCLE, REQUEST_RECOVERY, type RecoveryRequest } from './projectLifecycleEvents'
import './projectFiles.css'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
type ProjectMetadata = Parameters<typeof encodeProject>[1]
type PendingSwitch = { label: string; run: () => void | Promise<void> }

export function ProjectFileControl() {
  const { state, dispatch } = useEditor()
  const workspace = useDocumentWorkspace()
  const workspaceTab = workspace?.tabs.find(tab => tab.id === state.documentId)
  const [metadata, setMetadata] = useState<ProjectMetadata>({ id: state.documentId, name: workspaceTab?.name ?? '未命名作品' })
  const [location, setLocation] = useState<ProjectLocation | undefined>(workspaceTab?.location)
  const [saved, setSaved] = useState<string | undefined>(workspaceTab?.savedFingerprint)
  const [busy, setBusy] = useState(false)
  const [pending, setPending] = useState<PendingSwitch | null>(null)
  const busyRef = useRef(false)
  const identity = useRef(state.documentId)
  const picker = useRef<HTMLInputElement>(null)
  const fingerprint = JSON.stringify([metadata.id, metadata.name, projectFingerprint(state)])
  const dirty = saved !== fingerprint
  const latest = useRef({ state, metadata, location, dirty })
  latest.current = { state, metadata, location, dirty }
  const notify = useCallback((message: string) => dispatch({ type: 'set-notice', message }), [dispatch])
  useEffect(() => {
    if (identity.current === state.documentId) return
    identity.current = state.documentId
    // Restore sets matching metadata explicitly; any other document identity resets its destination.
    if (metadata.id !== state.documentId) {
      const nextTab = workspace?.tabs.find(tab => tab.id === state.documentId)
      setMetadata({ id: state.documentId, name: nextTab?.name ?? '未命名作品' }); setLocation(nextTab?.location); setSaved(nextTab?.savedFingerprint)
    }
  }, [state.documentId, metadata.id, workspace])
  useEffect(() => {
    const publish = () => window.dispatchEvent(new CustomEvent(PROJECT_LIFECYCLE, { detail: { documentId: state.documentId, sessionId: state.documentSessionId, name: metadata.name, savedFingerprint: saved, dirty } }))
    publish(); window.addEventListener(QUERY_PROJECT_LIFECYCLE, publish)
    return () => window.removeEventListener(QUERY_PROJECT_LIFECYCLE, publish)
  }, [state.documentId, state.documentSessionId, metadata.name, saved, dirty])
  const save = useCallback(async (saveAs = false): Promise<boolean> => {
    if (busyRef.current) return false
    busyRef.current = true; setBusy(true)
    const current = latest.current
    try {
      const signature = JSON.stringify([current.metadata.id, current.metadata.name, projectFingerprint(current.state)])
      const contents = await encodeProject(current.state, current.metadata)
      await validateProjectImages(decodeProject(contents).document)
      const next = await saveProjectFile(contents, current.metadata.name, saveAs || current.state.documentId !== current.metadata.id ? undefined : current.location)
      if (!next || latest.current.state.documentId !== current.state.documentId) return false
      setLocation(next); setSaved(signature); workspace?.updateMeta(current.state.documentId, { name: current.metadata.name, location: next, savedFingerprint: signature, dirty: false }); notify('项目已保存，可重新打开继续编辑')
      workspace?.markSaved(current.state.documentId)
      // A save that completed while the user edited cannot authorize losing the newer edits.
      return signature === JSON.stringify([latest.current.metadata.id, latest.current.metadata.name, projectFingerprint(latest.current.state)])
    } catch (error) { notify(error instanceof Error ? error.message : '项目保存失败，原文件已保留'); return false }
    finally { busyRef.current = false; setBusy(false) }
  }, [notify, workspace])
  const requestSwitch = useCallback((action: PendingSwitch) => {
    if (busyRef.current) { notify('正在保存或打开项目，请完成后再切换'); return }
    if (latest.current.dirty) setPending(action)
    else void action.run()
  }, [notify])
  useEffect(() => {
    const recover = (event: Event) => {
      const detail = (event as CustomEvent<RecoveryRequest>).detail
      const current = latest.current.state
      if (current.documentSessionId !== detail.expectedSessionId || current.documentRevision !== detail.expectedRevision) { notify('当前文档已变化，请重新恢复'); return }
      requestSwitch({ label: '恢复副本', run: () => {
        if (detail.isCurrent && !detail.isCurrent()) return
        if (latest.current.state.documentSessionId !== detail.expectedSessionId || latest.current.state.documentRevision !== detail.expectedRevision) { notify('当前文档已变化，请重新恢复'); return }
        const id = crypto.randomUUID()
        const restoredName = `${detail.name} · 恢复副本`.slice(0, 100)
        if (workspace) workspace.open({ ...state, ...detail.document, documentId: id } as typeof state, restoredName)
        else dispatch({ type: 'restore-project', document: { ...detail.document, documentId: id } })
        setMetadata({ id, name: restoredName }); setLocation(undefined); setSaved(undefined); workspace?.updateMeta(id, { name: restoredName, location: undefined, savedFingerprint: undefined, dirty: true })
        notify('已恢复为独立副本，请手动保存'); detail.onRestored?.()
      } })
    }
    window.addEventListener(REQUEST_RECOVERY, recover)
    return () => window.removeEventListener(REQUEST_RECOVERY, recover)
  }, [dispatch, notify, requestSwitch])
  const restore = useCallback(async (text: string, nextLocation: ProjectLocation) => {
    const loaded = decodeProject(text) // Fully validate before asking to replace the current document.
    const documentId = latest.current.state.documentId
    await validateProjectImages(loaded.document)
    if (latest.current.state.documentId !== documentId) return notify('当前文档已切换，已取消打开旧项目')
    requestSwitch({ label: '打开项目', run: () => {
      if (workspace) workspace.open({ ...state, ...loaded.document, documentId: loaded.metadata.id, documentSessionId: crypto.randomUUID(), documentRevision: 'opened' } as typeof state, loaded.metadata.name)
      else dispatch({ type: 'restore-project', document: { ...loaded.document, documentId: loaded.metadata.id } })
      const loadedFingerprint = JSON.stringify([loaded.metadata.id, loaded.metadata.name, projectFingerprint(loaded.document)])
      setMetadata(loaded.metadata); setLocation(nextLocation); setSaved(loadedFingerprint); workspace?.updateMeta(loaded.metadata.id, { name: loaded.metadata.name, location: nextLocation, savedFingerprint: loadedFingerprint, dirty: false })
      notify('项目已打开，所有对象可继续编辑')
    } })
  }, [dispatch, notify, requestSwitch, workspace, state])
  useEffect(() => {
    const handleSaveAndClose = async (event: Event) => {
      const id = (event as CustomEvent<{ documentId?: string }>).detail?.documentId
      if (!id || id !== latest.current.state.documentId || !workspace) return
      if (await save() && latest.current.state.documentId === id) {
        // `save` updates the workspace asynchronously; explicitly mark this close as
        // authorized by the completed save so a stale `tabs` closure cannot block it.
        workspace.markSaved(id)
        if (!workspace.close(id, true)) notify('项目已保存，但关闭文档失败，请重试')
      }
    }
    window.addEventListener('draivio:request-save-and-close', handleSaveAndClose)
    return () => window.removeEventListener('draivio:request-save-and-close', handleSaveAndClose)
  }, [save, workspace])
  const open = useCallback(async () => {
    if (busyRef.current || pending) return
    if (!hasProjectPicker()) { picker.current?.click(); return }
    busyRef.current = true; setBusy(true)
    try {
      const file = await openProjectFile()
      busyRef.current = false
      if (file) await restore(file.text, file.location)
    } catch (error) { notify(error instanceof Error ? error.message : '项目打开失败，当前作品已保留') }
    finally { busyRef.current = false; setBusy(false) }
  }, [restore, notify, pending])
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (pending) return
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void save(event.shiftKey) }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') { event.preventDefault(); void open() }
    }
    const unload = (event: BeforeUnloadEvent) => { if (latest.current.dirty) { event.preventDefault(); event.returnValue = '' } }
    const newDocument = (event: Event) => {
      event.preventDefault()
      const detail = (event as CustomEvent<{ width: number; height: number; background?: string }>).detail
      requestSwitch({ label: '新建文档', run: () => workspace ? workspace.create(detail) : dispatch({ type: 'new-document', ...detail }) })
    }
    window.addEventListener('keydown', key); window.addEventListener('beforeunload', unload); window.addEventListener('draivio:request-new-document', newDocument)
    const unlisten = isTauri() ? getCurrentWindow().onCloseRequested(event => {
      if ((workspace?.tabs.some(tab => tab.dirty) ?? latest.current.dirty) || busyRef.current) {
        event.preventDefault()
        requestSwitch({ label: '关闭窗口', run: async () => { await getCurrentWindow().destroy() } })
      }
    }) : undefined
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('beforeunload', unload); window.removeEventListener('draivio:request-new-document', newDocument); void unlisten?.then(fn => fn()) }
  }, [open, save, pending, dispatch, requestSwitch, workspace])
  return <div className="project-files">
    <label className="project-name"><span className="sr-only">项目名称</span><input aria-label="项目名称" value={metadata.name} maxLength={100} onChange={event => { const name = event.target.value; setMetadata({ ...metadata, name }); setSaved(undefined); workspace?.updateMeta(state.documentId, { name, savedFingerprint: undefined, dirty: true }) }} /></label>
    <span className={`project-save-state${dirty ? ' is-dirty' : ''}`} aria-label={dirty ? '有未保存修改' : '已保存'}>{busy ? '处理中…' : dirty ? '未保存' : '已保存'}</span>
    <button className="top-button" disabled={busy || !!pending} onClick={() => window.dispatchEvent(new Event('draivio:new-document-dialog'))}>新建</button>
    <button className="top-button" disabled={busy || !!pending} onClick={() => void open()}>打开</button>
    <button className="top-button" disabled={busy || !!pending} onClick={() => void save()}>保存</button>
    <button className="top-button project-save-as" disabled={busy || !!pending} onClick={() => void save(true)}>另存为</button>
    <input ref={picker} type="file" accept=".draivio,application/json" className="sr-only" aria-label="打开 Draivio 项目" onChange={async event => {
      const file = event.target.files?.[0]; event.target.value = ''
      if (!file) return
      try { if (file.size > 256 * 1024 * 1024) throw new Error('项目文件超过 256MB'); await restore(await file.text(), { name: file.name }) }
      catch (error) { notify(error instanceof Error ? error.message : '项目文件无法读取') }
    }} />
    {pending ? <div className="project-switch-backdrop"><section role="dialog" aria-modal="true" aria-label="未保存修改" className="project-switch-dialog" onKeyDown={event => { if (event.key === 'Escape' && !busy) setPending(null) }}>
      <h2>保存当前作品？</h2><p>{pending.label}前，选择保存或放弃当前修改。</p>
      <div><button autoFocus disabled={busy} onClick={() => setPending(null)}>取消切换</button><button disabled={busy} onClick={() => { setPending(null); void pending.run() }}>放弃修改</button><button disabled={busy} onClick={async () => { if (await save()) { setPending(null); await pending.run() } }}>保存并继续</button></div>
    </section></div> : null}
  </div>
}
