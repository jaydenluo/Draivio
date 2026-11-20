import { ObjectProperties } from '../components/ObjectProperties'
import { selectedObjects } from '../canvas/objectProperties'
import './propertiesPanel.css'
import { Checkbox } from '../ui/Checkbox'
import { PanelHeader } from '../ui/dock/PanelHeader'
import { useSmartFilterEditor } from './SmartFilterEditor'
import { SmartObjectControls } from '../document/SmartObjectControls'
import {LayerEffectsPanel} from './LayerEffectsPanel'
import { effectiveLayerState } from '../state/layerHierarchy'
import { useEffect, useMemo, useState } from 'react'
import { useEditor, neutralAdjustments, type LayerAdjustments } from '../state/editor'
import type { CanvasTextObject } from '../canvas/TextObject'
import type { TransformDraft } from '../canvas/TransformOverlay'
import { NumericScrubber } from '../components/NumericScrubber'
import { layerCanvasBounds } from '../document/alignment'
import { fontChoices } from '../text/systemFonts'
import { HistogramPanel } from './HistogramPanel'
import { whiteBalanceGains } from '../adjustments/colorPipeline'
import { histogramRGBA } from '../adjustments/histogram'
import { CurveEditor } from './CurveEditor'
import { applyLayerAdjustments } from '../imaging/layerAdjustments'
import { rasterizeSelectionMask } from '../canvas/selectionRaster'
import { selectionContains } from '../canvas/selectionGeometry'
import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { HSL_CHANNELS, defaultHsl, defaultColorBalance, type HslChannel } from '../adjustments/hsl'
import { createPreset, exportPreset, importPreset, applyPresetMode, createThumbnailTask, samplePresetThumbnail, type AdjustmentPreset } from '../adjustments/presets'

export async function decodeSource(source: string): Promise<{ pixels: Uint8ClampedArray; width: number; height: number }> {
  if (typeof Image === 'undefined' || typeof document === 'undefined') throw new Error('当前环境不支持图像解码')
  const image = new Image()
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('图层图像解码失败')); image.src = source })
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const context = canvas.getContext('2d'); if (!context) throw new Error('无法读取图层像素')
  context.drawImage(image, 0, 0)
  return { pixels: context.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width, height: canvas.height }
}

const blank: TransformDraft = { kind: 'transform', rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
const adjustmentLabels: Array<[keyof LayerAdjustments, string]> = [['brightness', '亮度'], ['contrast', '对比度'], ['saturation', '饱和度'], ['temperature', '色温'], ['tint', '色调'], ['sharpness', '清晰度'], ['blur', '模糊'], ['shadows', '阴影'], ['highlights', '高光'], ['exposureEV', '曝光 EV']]

export function selectionMaskForLayer(selection: import('../canvas/selectionGeometry').Selection, layer: import('../state/editor').Layer, layers: import('../state/editor').Layer[], width: number, height: number, pixelWidth: number, pixelHeight: number): Uint8Array {
  const m = layerWorldPixelMatrix(layers, layer.id, width, height), mask = new Uint8Array(pixelWidth * pixelHeight), cw = layer.contentWidth ?? width, ch = layer.contentHeight ?? height
  for (let y = 0; y < pixelHeight; y++) for (let x = 0; x < pixelWidth; x++) {
    const px = (x + .5) / pixelWidth * cw, py = (y + .5) / pixelHeight * ch
    if (selectionContains(selection.path, { x: (m[0] * px + m[2] * py + m[4]) / width * 100, y: (m[1] * px + m[3] * py + m[5]) / height * 100 })) mask[y * pixelWidth + x] = 255
  }
  return mask
}

export function PropertiesPanel() {
  const { state, dispatch, setCurveDraft } = useEditor()
  const [unit, setUnit] = useState('px')
  const [lockRatio, setLockRatio] = useState(false)
  const { locate: locateSmartFilters } = useSmartFilterEditor()
  const userPresets = (state.adjustmentPresets ?? []) as unknown as AdjustmentPreset[]
  const presets = useMemo(() => { const warm = defaultColorBalance(); warm.midtones.cyanRed = 15; warm.midtones.yellowBlue = -10; return [createPreset('内置·中性'), createPreset('内置·暖调', defaultHsl(), warm), ...userPresets] }, [state.adjustmentPresets])
  const [presetName, setPresetName] = useState('我的预设')
  const [presetThumbnails, setPresetThumbnails] = useState<Record<string, string>>({})
  const layer = state.layers.find((item) => item.id === state.selectedLayerId)
  useEffect(() => { setCurveDraft(null); return () => setCurveDraft(null) }, [layer?.id, setCurveDraft])
  const adjustmentLocked = layer ? effectiveLayerState(state.layers,layer.id).locked : true
  const [histogramSource, setHistogramSource] = useState<{ pixels: Uint8ClampedArray; width: number; height: number } | null>(null)
  const [histogramRevision, setHistogramRevision] = useState(0)
  useEffect(() => {
    let cancelled = false; const revision = histogramRevision + 1; setHistogramRevision(revision); setHistogramSource(null)
    if (!layer?.source || !/^data:image\//.test(layer.source)) return () => { cancelled = true }
    void decodeSource(layer.source).then((decoded) => { if (!cancelled) setHistogramSource(decoded) }).catch(() => {})
    return () => { cancelled = true }
  }, [layer?.id, layer?.source])
  const histogramPixels = useMemo(() => histogramSource && layer
    ? applyLayerAdjustments(histogramSource.pixels, histogramSource.width, histogramSource.height, { ...neutralAdjustments, ...layer.adjustments })
    : null, [histogramSource, layer?.adjustments])
  const toneHistogram = useMemo(() => histogramSource && layer
    ? histogramRGBA(applyLayerAdjustments(histogramSource.pixels, histogramSource.width, histogramSource.height, { ...neutralAdjustments, ...layer.adjustments, curves: neutralAdjustments.curves, levels: neutralAdjustments.levels }), histogramSource.width, histogramSource.height).luma
    : undefined, [histogramSource, layer?.adjustments])
  useEffect(() => {
    let current = true
    setPresetThumbnails({})
    const jobs = presets.map((preset) => createThumbnailTask(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (!histogramSource || !current) return ''
      const sampled = samplePresetThumbnail(histogramSource.pixels, histogramSource.width, histogramSource.height)
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (!current) return ''
      const pixels = applyLayerAdjustments(sampled.pixels, sampled.width, sampled.height, applyPresetMode(neutralAdjustments, preset, 'replace'))
      const canvas = document.createElement('canvas'); canvas.width = sampled.width; canvas.height = sampled.height
      const context = canvas.getContext('2d'); if (!context) return ''
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), canvas.width, canvas.height), 0, 0)
      return canvas.toDataURL('image/png')
    }, () => current))
    jobs.forEach((job, index) => { void job.promise.then((image) => { if (image) setPresetThumbnails((items) => ({ ...items, [presets[index].name]: image })) }).catch(() => {}) })
    return () => { current = false; jobs.forEach((job) => job.cancel()) }
  }, [state.adjustmentPresets, histogramSource])
  const histogramMask = useMemo(() => histogramSource && state.selectionVisible ? rasterizeSelectionMask(state.selection, histogramSource.width, histogramSource.height) : undefined, [histogramSource, state.selectionVisible, state.selection])
  const layerSelectionMask = useMemo(() => {
    if (!histogramSource || !state.selectionVisible || !layer) return undefined
    return selectionMaskForLayer(state.selection, layer, state.layers, state.documentWidth, state.documentHeight, histogramSource.width, histogramSource.height)
  }, [histogramSource, state.selectionVisible, state.selection, state.layers, state.documentWidth, state.documentHeight, layer])
  const textObject = layer ? state.canvasTexts.find((object) => object.id === layer.textObjectId || object.layerId === layer.id) : undefined
  const fonts = useMemo(() => fontChoices(), [])
  const savePreset = () => { try { dispatch({ type: 'set-adjustment-presets', presets: [...userPresets.filter((item) => item.name !== presetName), createPreset(presetName, layer!.adjustments?.hsl, layer!.adjustments?.colorBalance)] as unknown as Array<Record<string, unknown>> }) } catch (error) { dispatch({ type: 'set-notice', message: error instanceof Error ? error.message : '预设无效' }) } }
  const applyPreset = (preset: AdjustmentPreset, mode: 'replace' | 'merge') => { if (!layer || layer.locked) return; dispatch({ type: 'set-layer-adjustments', id: layer.id, adjustments: applyPresetMode(layer.adjustments ?? neutralAdjustments, preset, mode) }) }
  const exportSelectedPreset = (preset: AdjustmentPreset) => { const blob = new Blob([exportPreset(preset)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `${preset.name}.draivio-preset.json`; a.click(); URL.revokeObjectURL(url) }
  const importPresetFile = (file: File) => { void file.text().then((text) => { const preset = importPreset(text); dispatch({ type: 'set-adjustment-presets', presets: [...userPresets.filter((item) => item.name !== preset.name), preset] as unknown as Array<Record<string, unknown>> }) }).catch((error) => dispatch({ type: 'set-notice', message: error instanceof Error ? error.message : '预设导入失败' })) }
  if (selectedObjects(state).length) return <ObjectProperties />
  if (!layer) return <div className="inspector-empty">请选择一个图层</div>

  const transform = layer.transform ?? (layer.children ? (() => { const b = layerCanvasBounds(state, layer.id); return { ...blank, rect: { x: b.x / state.documentWidth * 100, y: b.y / state.documentHeight * 100, width: b.width / state.documentWidth * 100, height: b.height / state.documentHeight * 100 } } })() : blank)
  const xFactor = unit === 'px' ? state.documentWidth / 100 : 1
  const yFactor = unit === 'px' ? state.documentHeight / 100 : 1
  const ratio = transform.rect.width / Math.max(1, transform.rect.height)
  const update = (patch: Omit<Partial<TransformDraft>, 'rect'> & { rect?: { x?: number; y?: number; width?: number; height?: number } }) => dispatch({ type: 'commit-layer-transform', layerId: layer.id, transform: { ...transform, ...patch, rotation: patch.rotation === undefined ? transform.rotation : ((patch.rotation + 180) % 360 + 360) % 360 - 180, rect: { ...transform.rect, ...patch.rect } } })
  const updateSize = (key: 'width' | 'height', value: number) => {
    const safe = Math.max(.001, Math.min(3276800, value))
    update({ rect: lockRatio ? key === 'width' ? { width: safe, height: safe / ratio } : { height: safe, width: safe * ratio } : { [key]: safe } })
  }
  const updateText = (patch: Partial<CanvasTextObject>) => {
    if (!textObject || layer.locked) return
    dispatch({ type: 'upsert-text', object: { ...textObject, ...patch } })
  }
  const textFontOptions = textObject && !fonts.some((font) => font.value === textObject.fontFamily)
    ? [{ value: textObject.fontFamily, label: textObject.fontFamily, available: false }, ...fonts]
    : fonts
  const sampleWhiteBalance = () => {
    if (!histogramSource || layer.locked) return
    const rect = state.selectionVisible ? { x: state.selectionRect.x / 100 * histogramSource.width, y: state.selectionRect.y / 100 * histogramSource.height, width: state.selectionRect.width / 100 * histogramSource.width, height: state.selectionRect.height / 100 * histogramSource.height } : { x: 0, y: 0, width: histogramSource.width, height: histogramSource.height }
    const x0 = Math.max(0, Math.floor(rect.x)), y0 = Math.max(0, Math.floor(rect.y)), x1 = Math.min(histogramSource.width, Math.ceil(rect.x + rect.width)), y1 = Math.min(histogramSource.height, Math.ceil(rect.y + rect.height)); const mask = layerSelectionMask; let r = 0, g = 0, b = 0, n = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * histogramSource.width + x) * 4; if (mask && mask[y * histogramSource.width + x] === 0) continue; if (histogramSource.pixels[i + 3] === 0) continue; r += histogramSource.pixels[i] / 255; g += histogramSource.pixels[i + 1] / 255; b += histogramSource.pixels[i + 2] / 255; n++ }
    if (n) dispatch({ type: 'set-layer-white-balance', id: layer.id, value: whiteBalanceGains({ r: r / n, g: g / n, b: b / n }) })
  }

  return <section className="inspector-panel properties-panel" aria-label="图层属性"><SmartObjectControls key={layer.id} layerId={layer.id} />
    <PanelHeader title="属性"><small className="panel-header-caption" title={layer.name}>{state.selectedLayerIds.length > 1 ? `已选 ${state.selectedLayerIds.length} 个图层` : layer.name}</small></PanelHeader>

    {textObject ? <>
      <section className="text-properties-section" aria-label="文字属性">
        <div className="panel-subheading"><h3>文字</h3><span>独立文字图层</span></div>
        <label>内容<textarea aria-label="文字内容" value={textObject.text} disabled={layer.locked} onChange={(event) => updateText({ text: event.target.value })} /></label>
        <div className="property-grid text-property-grid">
          <label>字体<select aria-label="字体" value={textObject.fontFamily} disabled={layer.locked} onChange={(event) => updateText({ fontFamily: event.target.value })}>{textFontOptions.map((font) => <option key={font.value} value={font.value}>{font.label}{font.available ? '' : ' · 未安装'}</option>)}</select></label>
          <label>字重<select aria-label="字重" value={textObject.fontWeight} disabled={layer.locked} onChange={(event) => updateText({ fontWeight: event.target.value })}><option value="300">细体</option><option value="400">常规</option><option value="500">中等</option><option value="600">半粗</option><option value="700">粗体</option><option value="800">特粗</option></select></label>
          <NumericScrubber label="字号" ariaLabel="字号" value={textObject.fontSize} min={1} max={500} unit="px" disabled={layer.locked} onChange={(value) => updateText({ fontSize: value })} />
          <label>颜色<input type="color" aria-label="文字颜色" value={textObject.color} disabled={layer.locked} onChange={(event) => updateText({ color: event.target.value })} /></label>
          <label>对齐<select aria-label="文字对齐" value={textObject.align} disabled={layer.locked} onChange={(event) => updateText({ align: event.target.value as CanvasTextObject['align'] })}><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label>
          <label>文字框<select aria-label="文字框类型" value={textObject.layout ?? 'point'} disabled={layer.locked} onChange={(event) => updateText({ layout: event.target.value as CanvasTextObject['layout'] })}><option value="point">点文字</option><option value="paragraph">段落文字</option></select></label>
          <NumericScrubber label="行高" ariaLabel="行高" value={textObject.lineHeight ?? 1.4} min={.5} max={4} step={.05} unit="倍" disabled={layer.locked} onChange={(value) => updateText({ lineHeight: value })} />
          <NumericScrubber label="字距" ariaLabel="字距" value={textObject.letterSpacing ?? 0} min={-20} max={100} step={.5} unit="px" disabled={layer.locked} onChange={(value) => updateText({ letterSpacing: value })} />
        </div>
      </section>
      <section className="text-properties-section" aria-label="文字框位置与大小">
        <div className="panel-subheading"><h3>位置与大小</h3><span>画布坐标</span></div>
        <div className="property-grid text-property-grid">
          <NumericScrubber label="X" ariaLabel="文字 X" value={textObject.x} min={-100} max={200} unit="%" disabled={layer.locked} onChange={(value) => updateText({ x: value })} />
          <NumericScrubber label="Y" ariaLabel="文字 Y" value={textObject.y} min={-100} max={200} unit="%" disabled={layer.locked} onChange={(value) => updateText({ y: value })} />
          <NumericScrubber label="宽度" ariaLabel="文字宽度" value={textObject.width ?? 160} min={20} max={3276800} unit="px" disabled={layer.locked || textObject.layout !== 'paragraph'} onChange={(value) => updateText({ width: value })} />
          <NumericScrubber label="高度" ariaLabel="文字高度" value={textObject.height ?? textObject.fontSize * 1.4} min={1} max={3276800} unit="px" disabled={layer.locked || textObject.layout !== 'paragraph'} onChange={(value) => updateText({ height: value })} />
          <NumericScrubber label="旋转" ariaLabel="文字旋转" value={textObject.rotation ?? 0} min={-180} max={180} unit="°" disabled={layer.locked} onChange={(value) => updateText({ rotation: value })} />
        </div>
      </section>
    </> : null}

    {!textObject ? <section className="property-section property-transform-section" aria-label="变换">
      <div className="property-section-heading"><h3>变换</h3><label className="property-unit"><select aria-label="属性单位" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="px">px</option><option value="%">%</option></select></label></div>
      <div className="property-grid"><NumericScrubber label="X" ariaLabel="X" value={transform.rect.x * xFactor} min={-16384} max={16384} disabled={adjustmentLocked} onChange={(x) => update({ rect: { x: x / xFactor } })} /><NumericScrubber label="Y" ariaLabel="Y" value={transform.rect.y * yFactor} min={-16384} max={16384} disabled={adjustmentLocked} onChange={(y) => update({ rect: { y: y / yFactor } })} /><NumericScrubber label="宽度" ariaLabel="宽度" value={transform.rect.width * xFactor} min={1} max={16384} disabled={adjustmentLocked} onChange={(width) => updateSize('width', width / xFactor)} /><NumericScrubber label="高度" ariaLabel="高度" value={transform.rect.height * yFactor} min={1} max={16384} disabled={adjustmentLocked} onChange={(height) => updateSize('height', height / yFactor)} /></div>
      <div className="property-meta"><label className="ratio-lock"><Checkbox checked={lockRatio} onChange={(event) => setLockRatio(event.target.checked)} />锁定比例</label><NumericScrubber className="property-rotation" label="旋转" ariaLabel="旋转" value={transform.rotation} min={-180} max={180} unit="°" disabled={layer.locked} onChange={(rotation) => update({ rotation })} /></div>
      <div className="property-actions"><button disabled={layer.locked} onClick={() => update({ flipX: !transform.flipX })}>水平翻转</button><button disabled={layer.locked} onClick={() => update({ flipY: !transform.flipY })}>垂直翻转</button><button disabled={layer.locked} onClick={() => dispatch({ type: 'commit-layer-transform', layerId: layer.id, transform: blank })}>重置变换</button></div>
    </section> : null}

<div className="adjustments-panel"><CurveEditor key={layer.id} histogram={toneHistogram} onPreview={(enabled)=>dispatch({type:'set-curve-preview',id:enabled?undefined:layer.id})} curves={layer.adjustments?.curves ?? neutralAdjustments.curves!} levels={layer.adjustments?.levels ?? neutralAdjustments.levels!} disabled={adjustmentLocked || !!layer.highPrecision || state.colorModel === 'cmyk'} onDraftCurves={curves => setCurveDraft(curves ? { layerId: layer.id, curves } : null)} onDraftLevels={levels => setCurveDraft(levels ? { layerId: layer.id, levels } : null)} onCurves={(curves) => dispatch({ type: 'set-layer-curves', id: layer.id, curves })} onLevels={(levels) => dispatch({ type: 'set-layer-levels', id: layer.id, levels })} /><details className="property-section property-basic-adjustments"><summary>基础调整</summary><div className="panel-subheading"><h3>图像调整</h3><button disabled={layer.locked} onClick={() => dispatch({ type: 'reset-layer-adjustments', id: layer.id })}>全部重置</button></div><div className="adjustments-grid">{adjustmentLabels.map(([key, label]) => <NumericScrubber key={key} label={label} ariaLabel={label} value={typeof layer.adjustments?.[key] === 'number' ? layer.adjustments[key] as number : (neutralAdjustments[key] as number ?? 0)} min={key === 'exposureEV' ? -8 : -100} max={key === 'exposureEV' ? 8 : 100} step={key === 'exposureEV' ? 0.1 : 1} disabled={layer.locked} onChange={(value) => dispatch({ type: 'set-layer-adjustment', id: layer.id, key, value })} />)}</div></details><details className="property-section property-advanced-adjustments"><summary>HSL 六色与色彩平衡</summary><button type="button" disabled={adjustmentLocked} onClick={() => dispatch({ type: 'set-layer-adjustments', id: layer.id, adjustments: { ...neutralAdjustments, ...layer.adjustments, hsl: defaultHsl() } })}>重置 HSL</button><button type="button" disabled={adjustmentLocked} onClick={() => dispatch({ type: 'set-layer-adjustments', id: layer.id, adjustments: { ...neutralAdjustments, ...layer.adjustments, colorBalance: defaultColorBalance() } })}>重置色彩平衡</button><label><Checkbox checked={layer.adjustments?.colorBalance?.preserveLuminosity ?? true} disabled={adjustmentLocked} onChange={(event) => dispatch({ type: 'set-layer-preserve-luminosity', id: layer.id, value: event.target.checked })} />保持明度</label><div className="adjustments-grid">{(['global', ...HSL_CHANNELS] as const).flatMap((channel) => { const value = channel === 'global' ? (layer.adjustments?.hsl?.global ?? neutralAdjustments.hsl!.global) : (layer.adjustments?.hsl?.channels[channel as HslChannel] ?? neutralAdjustments.hsl!.channels[channel as HslChannel]); return (['hue','saturation','lightness','range'] as const).map((key) => <NumericScrubber key={`${channel}-${key}`} label={`HSL ${channel} ${key}`} ariaLabel={`HSL ${channel} ${key}`} value={value[key] ?? 0} min={key === 'range' ? 1 : -100} max={key === 'range' ? 120 : 100} unit={key === 'hue' ? '°' : undefined} disabled={layer.locked} onChange={(next) => dispatch({ type: 'set-layer-hsl', id: layer.id, channel, key, value: next })} />) })}</div><div className="adjustments-grid">{(['shadows', 'midtones', 'highlights'] as const).flatMap((tone) => (['cyanRed','magentaGreen','yellowBlue'] as const).map((key) => <NumericScrubber key={`${tone}-${key}`} label={`平衡 ${tone} ${key}`} ariaLabel={`平衡 ${tone} ${key}`} value={layer.adjustments?.colorBalance?.[tone][key] ?? 0} min={-100} max={100} disabled={layer.locked} onChange={(next) => dispatch({ type: 'set-layer-color-balance', id: layer.id, tone, key, value: next })} />))}</div><div className="preset-controls"><p>替换会清空当前调整，合并保留其他调整并覆盖 HSL 与色彩平衡。</p><input aria-label="预设名称" value={presetName} onChange={(event) => setPresetName(event.target.value)} /><button type="button" disabled={layer.locked} onClick={savePreset}>保存预设</button><label>导入预设<input type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importPresetFile(file); event.currentTarget.value = '' }} /></label>{presets.map((preset) => <div key={preset.name}><span>{preset.name}</span>{presetThumbnails[preset.name] ? <img width="48" height="36" alt={`${preset.name} 缩略预览`} src={presetThumbnails[preset.name]} /> : <span>预览处理中</span>}<button type="button" disabled={!userPresets.includes(preset)} onClick={() => { const name = window.prompt('预设新名称', preset.name); if (!name) return; try { const renamed = createPreset(name, preset.hsl, preset.colorBalance); dispatch({ type: 'set-adjustment-presets', presets: userPresets.map((item) => item === preset ? renamed : item) as unknown as Array<Record<string, unknown>> }) } catch (error) { dispatch({ type: 'set-notice', message: error instanceof Error ? error.message : '预设名称无效' }) } }}>重命名</button><button type="button" disabled={layer.locked} onClick={() => applyPreset(preset, 'replace')}>替换</button><button type="button" disabled={layer.locked} onClick={() => applyPreset(preset, 'merge')}>合并</button><button type="button" onClick={() => exportSelectedPreset(preset)}>导出</button><button type="button" disabled={!userPresets.includes(preset)} onClick={() => dispatch({ type: 'set-adjustment-presets', presets: userPresets.filter((item) => item.name !== preset.name) as unknown as Array<Record<string, unknown>> })}>删除</button></div>)}</div></details>{histogramSource && histogramPixels ? <details className="property-section"><summary>直方图与白平衡</summary><button type="button" disabled={layer.locked} onClick={sampleWhiteBalance}>从选区取样中性灰</button><HistogramPanel pixels={histogramPixels} width={histogramSource.width} height={histogramSource.height} revision={histogramRevision} options={{ selection: state.selectionVisible ? { x: state.selectionRect.x / 100 * histogramSource.width, y: state.selectionRect.y / 100 * histogramSource.width, width: state.selectionRect.width / 100 * histogramSource.width, height: state.selectionRect.height / 100 * histogramSource.height } : undefined, mask: layerSelectionMask }} /></details> : null}</div>
    <section className="property-section property-appearance-section" aria-label="外观">
      <h3>外观</h3>
      {layer.smartFilters?.items.length ? <button type="button" className="panel-add-feature smart-filter-locate"
        aria-label={`定位智能滤镜 · ${layer.smartFilters.items.length}`} onClick={() => locateSmartFilters(layer.id)}>
        智能滤镜 · {layer.smartFilters.items.length}<span aria-hidden="true">›</span>
      </button> : null}
      <LayerEffectsPanel key={layer.id} layerId={layer.id} effects={layer.effects} disabled={adjustmentLocked}/>
    </section>
  </section>
}
