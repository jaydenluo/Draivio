import { DialogTitlebar } from '../ui/DialogTitlebar'
import { defaultProfile, type RenderingIntent, type IccProfile } from '../color/iccPipeline'
import { useEffect, useMemo, useRef, useState } from 'react'
import { exportSvgImage, materializeColorAdjustments, validateDimensions, validateExportResources, type ImageExportFormat } from './exportImage'
import './exportDialog.css'
import { useDraggableDialog } from '../ui/useDraggableDialog'

type ExportRange = 'canvas' | 'selection' | 'layer'
type ExportSettings = { format: ImageExportFormat | 'svg'; range: ExportRange; width: number; height: number; lockRatio: boolean; quality: number; background: string }

const STORAGE_KEY = 'draivio-export-settings'

export function ExportDialog({ open, hasHighPrecision, svgSource, documentWidth, documentHeight, selectionWidth, selectionHeight, hasSelection, selectedLayerName, onClose, onExport, pixelPostProcess, colorProfile, renderingIntent }: {
  hasHighPrecision?: boolean
  colorProfile?: IccProfile
  renderingIntent?: RenderingIntent
  open: boolean
  svgSource: (range: ExportRange) => string
  documentWidth: number
  documentHeight: number
  selectionWidth?: number
  selectionHeight?: number
  hasSelection: boolean
  selectedLayerName?: string
  onClose: () => void
  onExport?: (range: ExportRange) => void
  pixelPostProcess?: (rgba: Uint8ClampedArray, width: number, height: number, range: ExportRange) => Uint8ClampedArray
}) {
  const dimensions = (range: ExportRange) => range === 'selection' ? { width: selectionWidth ?? documentWidth, height: selectionHeight ?? documentHeight } : { width: documentWidth, height: documentHeight }
  const initial = useMemo<ExportSettings>(() => {
    const defaults: ExportSettings = { format: 'png', range: 'canvas', width: documentWidth, height: documentHeight, lockRatio: true, quality: 90, background: '#ffffff' }
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
      if (!saved || typeof saved !== 'object') return defaults
      if (['png', 'jpeg', 'webp', 'svg'].includes(saved.format)) defaults.format = saved.format
      if (['canvas', 'selection', 'layer'].includes(saved.range)) defaults.range = saved.range
      if (typeof saved.lockRatio === 'boolean') defaults.lockRatio = saved.lockRatio
      if (Number.isFinite(saved.quality) && saved.quality >= 1 && saved.quality <= 100) defaults.quality = saved.quality
      if (typeof saved.background === 'string' && /^#[0-9a-f]{6}$/i.test(saved.background)) defaults.background = saved.background
      try { validateDimensions(saved.width, saved.height); defaults.width = saved.width; defaults.height = saved.height } catch { /* invalid stored dimensions use document size */ }
      return defaults
    } catch { return defaults }
  }, [documentHeight, documentWidth])
  const [settings, setSettings] = useState<ExportSettings>(initial)
  const [colorMode,setColorMode] = useState<'convert'|'srgb'>('convert')
  const [explicit8Bit,setExplicit8Bit] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { if (open) { setSettings({ ...initial, range: !hasSelection && initial.range === 'selection' ? 'canvas' : initial.range }); setError(null) } }, [open, initial, hasSelection])
  const root = useRef<HTMLElement>(null)
  const draggable = useDraggableDialog(root, open)
  const closeRef = useRef(onClose); closeRef.current = onClose
  const busyRef = useRef(busy); busyRef.current = busy
  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    root.current?.querySelector<HTMLButtonElement>('button')?.focus()
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); if (!busyRef.current) closeRef.current() }
      if (event.key === 'Tab') {
        const controls = [...(root.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled)') ?? [])]
        const first = controls[0], last = controls.at(-1)
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
      }
    }
    document.addEventListener('keydown', keydown, true)
    return () => { document.removeEventListener('keydown', keydown, true); previous?.focus() }
  }, [open])
  if (!open) return null
  const size = dimensions(settings.range)
  const ratio = size.width / Math.max(1, size.height)
  const update = (patch: Partial<ExportSettings>) => setSettings((current) => ({ ...current, ...patch }))
  const updateWidth = (value: number) => update({ width: value, ...(settings.lockRatio ? { height: Math.max(1, Math.round(value / ratio)) } : {}) })
  const updateHeight = (value: number) => update({ height: value, ...(settings.lockRatio ? { width: Math.max(1, Math.round(value * ratio)) } : {}) })
  const runExport = async () => {
    setBusy(true); setError(null)
    try {
      if (hasHighPrecision && !explicit8Bit) throw new Error('当前文档含高精度原始资源，请勾选“显式导出 8 位显示副本”后再导出。')
      validateDimensions(settings.width, settings.height)
      const source = svgSource(settings.range)
      validateExportResources(source)
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
      if (settings.format === 'svg') {
        const doc = new DOMParser().parseFromString(await materializeColorAdjustments(source), 'image/svg+xml')
        doc.documentElement.setAttribute('width', String(settings.width)); doc.documentElement.setAttribute('height', String(settings.height))
        const blob = new Blob([new XMLSerializer().serializeToString(doc)], { type: 'image/svg+xml;charset=utf-8' })
        downloadBlob(blob, 'draivio-canvas.svg')
      } else {
        const blob = await exportSvgImage(source, { profile: colorMode === 'srgb' ? defaultProfile() : colorProfile, renderingIntent, format: settings.format, width: settings.width, height: settings.height, quality: settings.quality, background: settings.format === 'jpeg' ? settings.background : 'transparent', postProcess: pixelPostProcess ? (rgba, width, height) => pixelPostProcess(rgba, width, height, settings.range) : undefined })
        downloadBlob(blob, `draivio-canvas.${settings.format}`)
      }
      onExport?.(settings.range)
      onClose()
    } catch (cause) { setError(cause instanceof Error ? cause.message : '导出失败') } finally { setBusy(false) }
  }
  return <div className="export-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (!busy && event.currentTarget === event.target) onClose() }}><section ref={root} style={draggable.style} onPointerDown={draggable.onPointerDown} className="export-dialog" role="dialog" aria-modal="true" aria-label="导出图像">
    <DialogTitlebar title="导出" closeLabel="关闭导出" disabled={busy} onClose={onClose} />
    <fieldset className="export-grid" disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
      <label>格式<select value={settings.format} onChange={(event) => update({ format: event.target.value as ExportSettings['format'] })}><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option><option value="svg">SVG</option></select></label>
      <label>范围<select value={settings.range} onChange={(event) => update({ range: event.target.value as ExportRange, ...dimensions(event.target.value as ExportRange) })}><option value="canvas">整画布</option><option value="selection" disabled={!hasSelection}>选区{hasSelection ? '' : '（无选区）'}</option><option value="layer">当前图层{selectedLayerName ? ` · ${selectedLayerName}` : ''}</option></select></label>
      <label>宽度<input type="number" min="1" max="16384" value={settings.width} onChange={(event) => updateWidth(Number(event.target.value))} /> px</label>
      <label>高度<input type="number" min="1" max="16384" value={settings.height} onChange={(event) => updateHeight(Number(event.target.value))} /> px</label>
    </fieldset>
    <label className="export-check"><input type="checkbox" checked={settings.lockRatio} onChange={(event) => update({ lockRatio: event.target.checked })} />锁定比例</label>
    {settings.format === 'jpeg' || settings.format === 'webp' ? <div className="export-inline"><label>质量<input type="number" min="1" max="100" value={settings.quality} onChange={(event) => update({ quality: Math.max(1, Math.min(100, Number(event.target.value))) })} />%</label>{settings.format === 'jpeg' ? <label>背景<input type="color" value={settings.background} onChange={(event) => update({ background: event.target.value })} /></label> : null}</div> : null}
    {hasHighPrecision ? <label><input aria-label="显式导出 8 位显示副本" type="checkbox" checked={explicit8Bit} onChange={e=>setExplicit8Bit(e.target.checked)} />显式导出 8 位显示副本（原始高精度资源不变）</label> : null}
    {colorProfile ? <p>输出色彩空间：{colorMode === 'srgb' ? 'sRGB' : colorProfile.name} · PNG/JPEG/WebP 嵌入 ICC。自定义 RGB ICC 转换需要桌面原生引擎。<select aria-label="导出色彩策略" value={colorMode} onChange={e=>setColorMode(e.target.value as typeof colorMode)}><option value="convert">转换到文档色彩空间并嵌入 ICC</option><option value="srgb">保留预览 sRGB 数值并嵌入 sRGB</option></select></p> : null}
    <small className="export-hint">{settings.width} × {settings.height} px · {settings.format.toUpperCase()}{settings.range === 'layer' ? '（当前图层范围）' : ''}</small>
    {error ? <p className="export-error" role="alert">{error}</p> : null}
    <footer><button onClick={onClose} disabled={busy}>取消</button><button className="primary" onClick={runExport} disabled={busy || Boolean(hasHighPrecision && !explicit8Bit)}>{busy ? '导出中…' : '导出'}</button></footer>
  </section></div>
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a'); link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30_000)
}
