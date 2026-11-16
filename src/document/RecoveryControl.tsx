import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor } from '../state/editor'
import { SettingsDialog } from '../components/SettingsDialog'
import { message } from '../ui/message'
import { serializeEditorSvg } from '../canvas/documentIO'
import { createRecoveryStore, type RecoverySnapshot, type RecoveryStore } from './recoveryStore'
import { createRecoveryScheduler } from './recoveryScheduler'
import { decodeProject, encodeProject, projectFingerprint, validateProjectImages, type ProjectDocument } from './projectFormat'
import { PROJECT_LIFECYCLE, QUERY_PROJECT_LIFECYCLE, REQUEST_RECOVERY, type ProjectLifecycle } from './projectLifecycleEvents'
import './recovery.css'
const PREFERENCE = 'draivio-autosave-enabled'
function currentPreview() {
  const svg = document.querySelector<SVGSVGElement>('.canvas-art')
  if (!svg || [...svg.querySelectorAll('image')].some(image => /^https?:|^blob:/.test(image.getAttribute('href') ?? ''))) return undefined
  const source = serializeEditorSvg(svg)
  return source.length <= 256 * 1024 ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}` : undefined
}
export async function findRecoverableSnapshot(snapshots: RecoverySnapshot[], validate: (document: ProjectDocument) => Promise<void> = validateProjectImages) {
  let lastError: unknown
  for (let index = 0; index < snapshots.length; index++) {
    try {
      const loaded = decodeProject(snapshots[index].payload)
      await validate(loaded.document)
      // Pending calls are never replayed after a process interruption.
      loaded.document.aiResults = loaded.document.aiResults?.map(result => result.status === 'loading' ? { ...result, status: 'error', error: '生成已因应用中断而停止，请重新发起', adopted: false } : result)
      return { ...loaded, snapshot: snapshots[index], skipped: index }
    } catch (error) { lastError = error }
  }
  throw new Error(`没有可用的恢复副本：${lastError instanceof Error ? lastError.message : '内容已损坏'}`)
}
export function RecoveryControl({ store: suppliedStore }: { store?: RecoveryStore }) {
  const { state } = useEditor()
  const store = useRef(suppliedStore ?? createRecoveryStore()).current
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem(PREFERENCE) !== 'false' } catch { return true } })
  const [status, setStatus] = useState('等待自动保存')
  const [error, setError] = useState('')
  const [readError, setReadError] = useState('')
  const [open, setOpen] = useState(false)
  const [snapshots, setSnapshots] = useState<RecoverySnapshot[]>([])
  const [confirmDiscard, setConfirmDiscard] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [lifecycle, setLifecycle] = useState<ProjectLifecycle>()
  const mounted = useRef(true)
  const restoreGeneration = useRef(0)
  const latest = useRef(state); latest.current = state
  const fingerprint = projectFingerprint(state)
  const scheduler = useRef<ReturnType<typeof createRecoveryScheduler> | null>(null)
  const makeScheduler = () => createRecoveryScheduler(store, (next, reason) => {
    if (!mounted.current) return
    setStatus(next === 'saving' ? '保存恢复副本中…' : next === 'saved' ? '恢复副本已保存' : '恢复副本保存失败')
    setError(reason ?? '')
    if (reason) message.error(`自动保存失败：${reason}`, { key: 'recovery-save' })
  })
  if (!scheduler.current) scheduler.current = makeScheduler()
  const reload = useCallback(async (show = false) => {
    try {
      const rows = await store.list()
      if (mounted.current) { setSnapshots(rows); if (show || rows.length) setOpen(true); setReadError('') }
    } catch (reason) {
      if (mounted.current) { const text = reason instanceof Error ? reason.message : '无法读取恢复记录'; setReadError(text); message.error(text, { key: 'recovery-list' }) }
    }
  }, [store])
  useEffect(() => {
    mounted.current = true
    if (!scheduler.current) scheduler.current = makeScheduler()
    const listener = (event: Event) => setLifecycle((event as CustomEvent<ProjectLifecycle>).detail)
    window.addEventListener(PROJECT_LIFECYCLE, listener)
    window.dispatchEvent(new Event(QUERY_PROJECT_LIFECYCLE))
    void reload()
    return () => { mounted.current = false; restoreGeneration.current++; window.removeEventListener(PROJECT_LIFECYCLE, listener); scheduler.current?.dispose(); scheduler.current = null }
  }, [reload])
  useEffect(() => {
    scheduler.current?.setEnabled(enabled)
    if (!enabled) return
    const current = latest.current
    const preview = currentPreview()
    const metadata = lifecycle?.documentId === current.documentId && lifecycle.sessionId === current.documentSessionId ? lifecycle : undefined
    if (metadata && !metadata.dirty) { scheduler.current?.invalidate(current.documentId); setStatus('手动项目已保存'); return }
    scheduler.current?.update({ documentId: current.documentId, sessionId: current.documentSessionId, fingerprint: `${metadata?.name ?? '未命名作品'}:${fingerprint}`, encode: async () => ({
      documentId: current.documentId, sessionId: current.documentSessionId, projectVersion: Date.now(), savedAt: Date.now(), name: metadata?.name ?? '未命名作品', preview, baseSavedFingerprint: metadata?.savedFingerprint ? Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(metadata.savedFingerprint))), b => b.toString(16).padStart(2, '0')).join('') : undefined,
      payload: await encodeProject(current, { id: current.documentId, name: metadata?.name ?? '未命名作品' }),
    }) })
  }, [enabled, fingerprint, state.documentId, state.documentSessionId, lifecycle])
  const restore = async (documentId: string) => {
    const generation = ++restoreGeneration.current
    const isCurrent = () => mounted.current && generation === restoreGeneration.current
    setBusy(true)
    const before = latest.current
    try {
      const found = await findRecoverableSnapshot(snapshots.filter(row => row.documentId === documentId))
      if (!isCurrent()) return
      if (before.documentSessionId !== latest.current.documentSessionId || before.documentRevision !== latest.current.documentRevision) throw new Error('当前作品已变化，请重新选择恢复副本')
      if (found.skipped) message.warning(`最新${found.skipped}份副本损坏，已回退到上一个有效版本`)
      window.dispatchEvent(new CustomEvent(REQUEST_RECOVERY, { detail: { document: found.document, name: found.metadata.name, sourceDocumentId: documentId, expectedSessionId: before.documentSessionId, expectedRevision: before.documentRevision, isCurrent, onRestored: () => { if (!isCurrent()) return; scheduler.current?.invalidate(documentId); setStatus('已恢复独立副本'); setOpen(false) } } }))
    } catch (reason) { if (!isCurrent()) return; const text = reason instanceof Error ? reason.message : '恢复失败，当前作品已保留'; setError(text); message.error(text) }
    finally { if (isCurrent()) setBusy(false) }
  }
  const discard = async () => {
    if (!confirmDiscard) return
    setBusy(true)
    try { scheduler.current?.invalidate(confirmDiscard); await store.discard(confirmDiscard); setSnapshots(rows => rows.filter(row => row.documentId !== confirmDiscard)); setConfirmDiscard(undefined); message.info('已丢弃恢复副本，手动项目未受影响') }
    catch (reason) { const text = reason instanceof Error ? reason.message : '丢弃失败，请重试'; setError(text); message.error(text) }
    finally { setBusy(false) }
  }
  const close = useCallback(() => { restoreGeneration.current++; setBusy(false); setOpen(false) }, [])
  const documents = [...new Map(snapshots.map(row => [row.documentId, snapshots.find(item => item.documentId === row.documentId)!])).values()]
  return <div className="recovery-control">
    <button aria-label="自动保存与恢复" onClick={() => { setOpen(true); void reload(true) }}>{enabled ? status : '自动保存已关闭'}</button>
    {error ? <button aria-label="重试自动保存" onClick={() => scheduler.current?.retry()}>重试</button> : null}
    {open ? <SettingsDialog label="自动保存与恢复" onClose={close}><header><strong>自动保存与恢复</strong><button aria-label="关闭自动保存与恢复" onClick={close}>×</button></header>
      <div className="recovery-content"><label className="recovery-preference"><input type="checkbox" aria-label="启用自动保存" checked={enabled} onChange={event => { const value = event.target.checked; setEnabled(value); scheduler.current?.setEnabled(value); try { localStorage.setItem(PREFERENCE, String(value)) } catch { message.warning('无法保存自动保存偏好') } }} />自动保存恢复副本</label><small>停止输入后保存，持续编辑最多每15秒保存；每个作品保留5个版本。</small>
      {error || readError ? <p role="alert">{error || readError}</p> : null}
      {!documents.length ? <p>没有待恢复的作品</p> : documents.map(row => <div className="recovery-row" key={row.documentId}>{row.preview ? <img src={row.preview} alt={`${row.name ?? '作品'}恢复预览`} /> : <span className="recovery-placeholder" aria-hidden="true">图</span>}<span><strong>{row.name ?? '未命名作品'}</strong><small>{new Date(row.savedAt).toLocaleString()} · {snapshots.filter(item => item.documentId === row.documentId).length}个版本</small></span><button disabled={busy} onClick={() => void restore(row.documentId)}>恢复副本</button><button disabled={busy} onClick={() => setConfirmDiscard(row.documentId)}>丢弃</button></div>)}
      {confirmDiscard ? <div className="recovery-confirm" role="alertdialog" aria-label="确认丢弃恢复副本"><p>丢弃该作品的所有恢复副本？手动保存的文件不受影响。</p><button disabled={busy} onClick={() => setConfirmDiscard(undefined)}>取消丢弃</button><button disabled={busy} onClick={() => void discard()}>确认丢弃</button></div> : null}
      </div><footer><span>{enabled ? status : '自动保存已关闭'}</span><button onClick={() => { scheduler.current?.retry(); void reload(true) }}>重新读取与重试</button><button onClick={close}>关闭</button></footer>
    </SettingsDialog> : null}
  </div>
}
