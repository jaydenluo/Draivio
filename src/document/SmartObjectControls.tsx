import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useEditor } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
import { CanvasScene } from '../canvas/CanvasScene'
import { exportSvgImage } from '../render/exportImage'
import { FloatingSurface } from '../ui/FloatingSurface'
import { smartObjectState, type SmartObjectDocument, type SmartObjectSource } from './smartObjects'

const readData = (blob: Blob) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('无法读取源图片')); reader.readAsDataURL(blob) })

export function SmartObjectControls({ layerId }: { layerId: string }) {
  const { state, dispatch, documentId } = useEditor()
  const layer = state.layers.find(item => item.id === layerId)
  const source = layer?.smartObject && state.smartObjectSources?.[layer.smartObject.sourceId]
  const latest = useRef({ state, documentId }); latest.current = { state, documentId }
  const [draft, setDraft] = useState<SmartObjectDocument | null>(null)
  const [baseRevision, setBaseRevision] = useState(0)
  const draftSource = useRef<SmartObjectSource | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const locked = !layer || effectiveLayerState(state.layers, layer.id).locked
  const sourceLocked = locked || Boolean(source && state.layers.some(item => item.smartObject?.sourceId === source.id && effectiveLayerState(state.layers, item.id).locked))
  const open = () => {
    if (!source || locked) return
    const { layers, canvasTexts, canvasShapes, brushStrokes, layerMasks, sceneOrder } = smartObjectState(state, source)
    setDraft(structuredClone({ layers, canvasTexts, canvasShapes, brushStrokes, layerMasks, sceneOrder }))
    draftSource.current = source; setBaseRevision(source.revision); setError('')
  }
  useEffect(() => {
    const listener = (event: Event) => { if ((event as CustomEvent<string>).detail === layerId) open() }
    window.addEventListener('draivio-open-smart-object', listener)
    return () => window.removeEventListener('draivio-open-smart-object', listener)
  }, [layerId, source, locked])
  useEffect(() => { setDraft(null); setError('') }, [documentId, layerId])
  if (!layer || !source) return null
  const current = () => mounted.current && latest.current.documentId === documentId && latest.current.state.smartObjectSources?.[source.id] === source && !effectiveLayerState(latest.current.state.layers, layerId).locked
  const replace = async (file: File) => {
    if (busy || sourceLocked) return
    setBusy(true); setError('')
    try {
      if (file.size > 32 * 1024 * 1024 || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) throw new Error('请选择不超过 32MB 的 PNG、JPEG、WebP 或 GIF 图片')
      const data = await readData(file), image = new Image()
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('源图片解码失败')); image.src = data })
      if (!current() || latest.current.state.layers.some(item => item.smartObject?.sourceId === source.id && effectiveLayerState(latest.current.state.layers, item.id).locked)) throw new Error('文档或源内容已改变或共享实例已锁定，未替换')
      dispatch({ type: 'replace-smart-object', id: layerId, expectedSource: source, source: { id: `smart-source-${crypto.randomUUID()}`, kind: 'image', source: data, width: image.naturalWidth, height: image.naturalHeight, revision: 1 } })
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '替换失败') }
    finally { if (mounted.current) setBusy(false) }
  }
  const rasterize = async () => {
    if (busy || locked) return
    setBusy(true); setError('')
    try {
      const svg = renderToStaticMarkup(<CanvasScene thumbnail state={smartObjectState(state, source)} />)
      const blob = await exportSvgImage(svg, { format: 'png', width: source.width, height: source.height })
      const data = await readData(blob)
      if (!current()) throw new Error('文档或源内容已改变，未栅格化')
      dispatch({ type: 'rasterize-smart-object', id: layerId, source: data, baseRevision: source.revision, expectedSource: source })
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '栅格化失败') }
    finally { if (mounted.current) setBusy(false) }
  }
  const close = () => { if (!draft || window.confirm('放弃尚未回写的内部修改？')) setDraft(null) }
  return <section className="smart-object-controls" aria-label="智能对象属性">
    <p>智能对象 · 源 {source.width} × {source.height} · 版本 {source.revision}</p>
    <small>普通复制共享源；独立副本另存源。内部保存一次回写所有共享实例，父文档撤销可恢复。</small>
    <button type="button" disabled={locked || busy} onClick={open}>打开内部文档</button>
    <label>替换内容<input aria-label="替换智能对象内容" disabled={sourceLocked || busy} type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={e => { const file = e.target.files?.[0]; if (file) void replace(file); e.currentTarget.value = '' }} /></label>
    <button type="button" disabled={locked || busy} onClick={() => dispatch({ type: 'duplicate-smart-object-independent', id: layerId })}>建立独立副本</button>
    <button type="button" disabled={locked || busy} onClick={() => void rasterize()}>栅格化智能对象</button>
    {busy ? <span role="status">处理源内容…</span> : null}{error ? <p role="alert">{error}</p> : null}
    {draft ? <div className="document-close-backdrop"><FloatingSurface title="智能对象内部文档" className="document-close-dialog" role="dialog" aria-modal="true" aria-label="智能对象内部文档" onClose={close} onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') close() }}>
      <p>内部修改仅保留在草稿中；保存并回写后，父文档及共享实例一起更新。取消关闭不改变父文档。</p>
      <div style={{ height: 180 }}><CanvasScene thumbnail state={{ ...smartObjectState(state, source), ...draft }} /></div>
      {draft.canvasTexts.map(text => <label key={text.id}>内部文字<textarea aria-label={`内部文字 ${text.id}`} value={text.text} onChange={e => setDraft({ ...draft, canvasTexts: draft.canvasTexts.map(item => item.id === text.id ? { ...item, text: e.target.value } : item) })} /></label>)}
      {draft.canvasShapes.map(shape => <label key={shape.id}>形状颜色<input type="color" aria-label={`内部形状 ${shape.id} 颜色`} value={shape.color} onChange={e => setDraft({ ...draft, canvasShapes: draft.canvasShapes.map(item => item.id === shape.id ? { ...item, color: e.target.value } : item) })} /></label>)}
      {!draft.canvasTexts.length && !draft.canvasShapes.length ? <p>此源只有图片；可用“替换内容”更换原始图片。</p> : null}
      <footer><button onClick={close}>取消关闭</button><button disabled={sourceLocked || source !== draftSource.current || source.revision !== baseRevision} onClick={() => { dispatch({ type: 'update-smart-object-source', sourceId: source.id, baseRevision, expectedSource: draftSource.current ?? undefined, patch: { document: draft } }); setDraft(null) }}>保存并回写</button></footer>
      {source !== draftSource.current || source.revision !== baseRevision ? <p role="alert">源内容已变化，请关闭并重新打开，草稿未覆盖新版本。</p> : null}
    </FloatingSurface></div> : null}
  </section>
}
