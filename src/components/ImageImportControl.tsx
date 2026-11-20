import { useEffect, useRef, useState } from 'react'
import { COMMAND_EVENT } from '../commands/shortcuts'
import { prepareImageProfile, type ImportProfilePolicy } from '../color/iccInput'
import { readImageMetadata } from '../canvas/documentIO'
import { useEditor, type EditorState } from '../state/editor'
import { SettingsDialog } from './SettingsDialog'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import './imageImport.css'
import { imageMime, readImportFile, nativeEditingError, readNativeOriginal } from '../assets/imageImportSource'
import { isTauri } from '@tauri-apps/api/core'
import { ImageAssetClient } from '../assets/imageAssetClient'
import { releaseImportAsset, retryImportCleanup } from '../assets/imageImportCleanup'
import type { ImageAsset } from '../assets/imageAssetTypes'
import { dimensionError } from '../document/documentGeometry'
import { readFilePreferences } from '../document/filePreferences'

type PendingImport = { file?: File; asset?: ImageAsset; preview?: string; name: string; documentId: string; version: EditorState['undoStack'] }

export function ImageImportControl() {
  const { state, dispatch, documentId } = useEditor()
  const latest = useRef({ state, documentId }); latest.current = { state, documentId }
  const sequence = useRef(0)
  const aborter = useRef<AbortController | null>(null)
  const client = useRef(new ImageAssetClient())
  const nativeAssets = useRef(new Set<ImageAsset>())
  const [phase, setPhase] = useState('')
  const mounted = useRef(true)
  const releaseNative = async (asset: ImageAsset) => {
    if (!nativeAssets.current.has(asset)) return
    await releaseImportAsset(client.current,asset)
    nativeAssets.current.delete(asset)
  }
  const cleanupError = (error: unknown) => {
    const message=`导入资源清理尚未确认，将在下次原生选择时重试：${error instanceof Error?error.message:'服务不可用'}`
    if(mounted.current) dispatch({type:'set-notice',message})
    else console.warn(message)
  }
  const releaseAll = () => { for (const asset of nativeAssets.current) void releaseNative(asset).catch(cleanupError) }
  const input = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)
  const [busy, setBusy] = useState(false)
  const [sizing, setSizing] = useState('auto')
  const [policy, setPolicy] = useState<ImportProfilePolicy>('preserve')
  const applyImportDefaults = () => {
    const preferences = readFilePreferences()
    setSizing(preferences.importSizing)
    setPolicy(preferences.importProfile)
  }
  const close = () => { aborter.current?.abort(); releaseAll(); sequence.current++; setPhase(''); setPending(null); setBusy(false) }
  const selectFile = (file: File) => {
    close(); applyImportDefaults()
    setPending({file, name:file.name, documentId:latest.current.documentId, version:latest.current.state.undoStack})
  }
  const pickNative = async () => {
    close()
    applyImportDefaults()
    void retryImportCleanup().catch(cleanupError)
    const request = ++sequence.current
    const origin = latest.current
    const current = () => request === sequence.current && origin.documentId === latest.current.documentId && origin.state.undoStack === latest.current.state.undoStack
    const controller = new AbortController(); aborter.current=controller
    setBusy(true); setPhase('正在读取原件信息…')
    try {
      const asset = await client.current.pick()
      if(!asset) { if(current()) close(); return }
      nativeAssets.current.add(asset)
      if(!current()) { await releaseNative(asset); return }
      setPending({asset,name:'原生图片',documentId:origin.documentId,version:origin.state.undoStack})
      setPhase('正在准备显示预览；预览不会用于编辑…')
      const started=await client.current.start(asset,'preview')
      const preview=await client.current.wait(asset,started.jobId,{signal:controller.signal})
      if(!current()) return
      if(!preview.resource || preview.resource.role!=='preview' || preview.resource.coordinateSpace!=='display') throw new Error('显示预览无效')
      setPending({asset,preview:preview.resource.resourceUrl,name:'原生图片',documentId:origin.documentId,version:origin.state.undoStack})
      setPhase(nativeEditingError(asset.metadata) ?? '预览已就绪；导入时保留完整原件，兼容编辑上限 16 MiB')
    } catch(error) { if(current()) { setPending(null); setPhase(`预览失败：${error instanceof Error ? error.message : '原生服务不可用'}；可选择浏览器兼容导入`); releaseAll() } }
    finally { if(current()) setBusy(false) }
  }
  useEffect(() => {
    mounted.current=true
    const command = (event: Event) => { if ((event as CustomEvent<string>).detail === 'importImage') { if(isTauri()) void pickNative(); else input.current?.click() } }
    const drop = (event: DragEvent) => {
      const files=event.dataTransfer?.files
      if(!files?.length || [...files].some(file=>file.name.toLowerCase().endsWith('.draivio'))) return
      event.preventDefault();selectFile(files[0])
    }
    const over = (event: DragEvent) => { if(event.dataTransfer?.types.includes('Files')) event.preventDefault() }
    window.addEventListener(COMMAND_EVENT, command)
    window.addEventListener('drop',drop); window.addEventListener('dragover',over)
    return () => { mounted.current=false; aborter.current?.abort(); releaseAll(); sequence.current++; window.removeEventListener(COMMAND_EVENT, command); window.removeEventListener('drop',drop); window.removeEventListener('dragover',over) }
  }, [])
  useEffect(() => {
    close()
  },[documentId,state.undoStack])
  const importImage = async () => {
    if (!pending || busy) return
    const request = ++sequence.current
    const unchanged = () => pending.documentId === latest.current.documentId && pending.version === latest.current.state.undoStack
    const notifyChanged = () => dispatch({ type:'set-notice', message:'文档已更改，已放弃此次图片导入，请重新选择文件' })
    if (!unchanged()) { notifyChanged(); close(); return }
    setBusy(true)
    try {
      const controller = new AbortController(); aborter.current = controller
      let bytes: Uint8Array
      if(pending.asset) {
        const problem=nativeEditingError(pending.asset.metadata); if(problem) throw new Error(problem)
        setPhase('正在持久保留原件…')
        const started=await client.current.start(pending.asset,'original')
        const original=await client.current.wait(pending.asset,started.jobId,{signal:controller.signal})
        const snapshot=await client.current.snapshot(pending.asset)
        if(!snapshot.rasterRef || !original.resource) throw new Error('原件持久化尚未完成')
        if(request!==sequence.current || !unchanged()) return
        setPhase('正在准备完整原件的兼容编辑数据…')
        bytes=await readNativeOriginal(original.resource,controller.signal)
      } else bytes = await readImportFile(pending.file!, controller.signal)
      if(request!==sequence.current || !unchanged()) return
      const mime = imageMime(bytes)
      const prepared = await prepareImageProfile(bytes, mime, latest.current.state.colorManagement.profile, policy)
      controller.signal.throwIfAborted()
      const dimensions = await readImageMetadata(prepared.source, controller.signal)
      if (request !== sequence.current) return
      const problem = dimensionError(dimensions.width, dimensions.height); if (problem) throw new Error(problem)
      if (!unchanged()) { notifyChanged(); close(); return }
      dispatch({ type:'import-image', id:`import-${Date.now()}-${request}`, name:pending.name, source:prepared.source, width:dimensions.width, height:dimensions.height, autoSize:sizing === 'auto', inputProfile:{bytes:Array.from(prepared.profile.bytes), checksum:prepared.profile.checksum, policy} })
      if (prepared.warning) dispatch({type:'set-notice', message:`已导入 ${pending.name} · ${prepared.warning}`})
      close()
    } catch (error) {
      if (request === sequence.current) { const message=error instanceof Error ? error.message : '图片导入失败'; setPhase(message); dispatch({type:'set-notice', message}) }
    } finally { if (request === sequence.current) setBusy(false) }
  }
  return <>
    <input ref={input} className="sr-only" type="file" accept="image/*" aria-label="选择要导入的图片" onChange={event => {
      const file = event.currentTarget.files?.[0]
      if (file) selectFile(file)
      event.currentTarget.value = ''
    }} />
    {phase && !pending ? <div role="status">{phase}<button type="button" onClick={() => input.current?.click()}>浏览器兼容导入</button><button type="button" onClick={close}>取消导入</button></div> : null}
    {pending ? <SettingsDialog label="导入图片" onClose={close} className="image-import-dialog">
      <DialogTitlebar title="导入图片" closeLabel="关闭导入图片" onClose={close} />
      <p className="image-import-filename" title={pending.name}>{pending.name}</p>
      {pending.asset ? <>
        <div data-import-preview-slot style={{height:240,flexShrink:0,display:'grid',placeItems:'center',overflow:'hidden'}}>
          {pending.preview ? <img src={pending.preview} alt="原生显示预览（不用于编辑）" style={{maxWidth:'100%',maxHeight:'100%',objectFit:'contain'}} /> : <span>正在准备显示预览…</span>}
        </div>
        <div data-import-phase-slot style={{height:96,flexShrink:0,overflowY:'auto'}} tabIndex={0} aria-label="原件信息与导入状态">
          原件 {pending.asset.metadata.width} × {pending.asset.metadata.height} · EXIF {pending.asset.metadata.orientation} · {phase}
        </div>
      </> : null}
      <label>导入尺寸<select aria-label="导入尺寸" disabled={busy} value={sizing} onChange={event => setSizing(event.target.value)}><option value="auto">跟随原图尺寸</option><option value="canvas">保持当前画布</option></select></label>
      <label>导入色彩<select aria-label="导入色彩策略" disabled={busy} value={policy} onChange={event => setPolicy(event.target.value as ImportProfilePolicy)}><option value="preserve">保留嵌入 ICC · 缺失按 sRGB</option><option value="assign">指定文档 ICC · 保留通道数值</option></select></label>
      <p className="image-import-hint">图片将作为新图层导入。这里的调整仅用于本次导入。</p>
      <footer>{pending.asset ? <button type="button" onClick={() => input.current?.click()}>浏览器兼容导入 · PNG / JPEG / WebP</button> : null}<button type="button" onClick={close}>取消</button><button type="button" disabled={busy || !!(pending.asset && nativeEditingError(pending.asset.metadata))} onClick={() => void importImage()}>{busy ? '正在导入…' : '导入'}</button></footer>
    </SettingsDialog> : null}
  </>
}
