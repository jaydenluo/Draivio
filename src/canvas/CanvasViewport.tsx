import { extractLayerScene } from './layerExtraction'
import { layerSubtreeIds } from '../state/layerHierarchy'
import { layerPixelScale } from '../document/documentGeometry'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, type EditorAction } from '../state/editor'
import { AIComposer } from '../creation/AIComposer'
import { TOOL_CANCEL_EVENT } from '../tools/useToolShortcuts'
import { SelectionOverlay } from './SelectionOverlay'
import { combineSelection, createSelection, drawSelectionRect, moveSelection, pathSelection, type Selection, type SelectionPoint } from './selectionGeometry'
import { layerPoint, layerMatrix, selectionToLayer } from './layerCoordinates'
import { addAnchor, closePath, moveControl, type EditorPath } from './pathGeometry'
import { PathOverlay } from './PathOverlay'
import { appendBrushPoint, createBrushStroke, type BrushStroke } from './BrushEngine'
import { pointerInput } from './pointerPressure'
import { CanvasScene } from './CanvasScene'
import { TransformOverlay, type TransformDraft } from './TransformOverlay'
import { TextObject } from './TextObject'
import type { CanvasShape, LayerMask } from './documentTypes'
import { canvasCloudServices } from './cloudToolServices'
import { contiguousMagicSelection, eraseBackground, sampleCanvasColor, serializeSvg, rasterizeSvg, rasterizeSvgPixels, imageToPng, perspectiveWarp, cloneImage, smudgeImage } from './rasterTools'
import { fillPixels, paintBrushStroke } from './rasterBrush'
import { rasterizeSelectionMask } from './selectionRaster'
import { PerspectiveOverlay, type PerspectiveQuad } from './PerspectiveOverlay'
import { fitViewportZoom } from './viewportFit'

type Point = SelectionPoint
type Touches = { length: number; [index: number]: { clientX: number; clientY: number } }
const distance = (t: Touches) => Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY)
const freshId = () => crypto.randomUUID()
const fullRect = { x: 0, y: 0, width: 100, height: 100 }
const defaultTransform = (): TransformDraft => ({ kind: 'transform', rect: { ...fullRect }, rotation: 0, flipX: false, flipY: false })
const fullQuad: PerspectiveQuad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const inputTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')
type Gesture = { pointerId: number; start: Point; client: Point; previous: Selection | null; selection?: Selection; stroke?: BrushStroke; shape?: CanvasShape; offset: Point; transform?: TransformDraft; pathIndex?: number; points: Point[]; rotation: number }

export function CanvasViewport() {
  const { state, dispatch } = useEditor()
  const latestDocument = useRef(state)
  latestDocument.current = state
  const artboardRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null)
  const [preview, setPreview] = useState<Selection | null>(null)
  const [path, setPath] = useState<EditorPath | null>(null)
  const pathRef = useRef<EditorPath | null>(null)
  const [strokePreview, setStrokePreview] = useState<BrushStroke | null>(null)
  const [shapePreview, setShapePreview] = useState<CanvasShape | null>(null)
  const [transform, setTransform] = useState<TransformDraft | null>(null)
  const [quad, setQuad] = useState<PerspectiveQuad | null>(null)
  const [maskPreview, setMaskPreview] = useState<LayerMask | null>(null)
  const cloneSource = useRef<Point | null>(null)
  const [busy, setBusy] = useState(false)
  const autoFitZoom = useRef<number | null>(null)
  const crop = state.cropRect ?? fullRect
  const changePath = (next: EditorPath | null) => { pathRef.current = next; setPath(next) }
  const notice = (message: string) => dispatch({ type: 'set-notice', message })
  const zoom = (value: number) => dispatch({ type: 'set-zoom', zoom: value })
  const fitToViewport = useCallback(() => {
    const canvas = artboardRef.current?.closest('.canvas-area') as HTMLElement | null
    if (!canvas) return
    const composer = canvas.querySelector<HTMLElement>('.ai-composer[data-placement="floating"]')
    const fitted = fitViewportZoom({
      documentWidth: state.documentWidth * crop.width / 100,
      documentHeight: state.documentHeight * crop.height / 100,
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
      composerHeight: composer?.getBoundingClientRect().height ?? 0,
    })
    const composerHeight = composer?.getBoundingClientRect().height ?? 0
    autoFitZoom.current = fitted
    zoom(fitted)
    dispatch({ type: 'set-canvas-offset', x: 0, y: composerHeight ? -(composerHeight + 20) / 2 : 0 })
    dispatch({ type: 'set-canvas-rotation', rotation: 0 })
  }, [crop.height, crop.width, state.documentHeight, state.documentWidth])
  const textLayerStyle = (layerId: string) => {
    const layer = state.layers.find((item) => item.id === layerId)
    const width = layer?.contentWidth ?? state.documentWidth, height = layer?.contentHeight ?? state.documentHeight
    const m = layerMatrix(layer?.transform ?? defaultTransform(), state.documentWidth, state.documentHeight)
    return { position: 'absolute' as const, left: 0, top: 0, width, height, zIndex: 5, pointerEvents: 'none' as const, transformOrigin: '0 0', transform: `matrix(${m[0] * state.documentWidth / width},${m[1] * state.documentHeight / width},${m[2] * state.documentWidth / height},${m[3] * state.documentHeight / height},${m[4] * state.documentWidth / 100},${m[5] * state.documentHeight / 100})` }
  }
  const selectedTransform = () => state.layers.find((layer) => layer.id === state.selectedLayerId)?.transform
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId)
  const { y: sourceScaleY, mean: sourcePixelScale } = layerPixelScale(selectedLayer, state.documentWidth, state.documentHeight)
  const localSelection = (selection: Selection) => ({ ...selectionToLayer(selection, selectedTransform(), state.documentWidth, state.documentHeight), feather: selection.feather / sourcePixelScale })
  const localPoint = (point: Point) => layerPoint(point, selectedTransform(), true, state.documentWidth, state.documentHeight)
  const isLayerTool = (tool: string) => ['brush', 'pencil', 'soft-brush', 'brush-line', 'smudge', 'eraser', 'background-eraser', 'healing', 'clone-stamp', 'mask', 'mask-quick', 'mask-gradient', 'shape', 'shape-ellipse', 'shape-line', 'shape-arrow', 'gradient-fill', 'text', 'fill'].includes(tool)
  const option = (key: string, fallback: number) => typeof state.toolOptions[key] === 'number' ? state.toolOptions[key] as number : fallback
  const scene = () => artboardRef.current?.querySelector<SVGSVGElement>('.canvas-art') ?? null
  // Raster tools operate on the selected layer, so other layers remain editable.
  const layerScene = () => {
    const svg = scene()
    if (!svg) throw new Error('画布尚未就绪')
    if (selectedLayer?.children || layerSubtreeIds(state.layers, state.selectedLayerId).length > 1) throw new Error('图层组暂不支持破坏性像素编辑，请先选择组内的具体图层')
    return extractLayerScene(svg, state.selectedLayerId, { mode: 'raster-source', previewIds: [strokePreview?.id, shapePreview?.id].filter((id): id is string => !!id) })
  }
  const perform = async (job: (commit: (action: EditorAction) => void) => Promise<void>) => {
    if (busy) return
    setBusy(true)
    const expectedDocumentId = state.documentId, expectedRevision = state.documentRevision
    const commit = (action: EditorAction) => {
      if (latestDocument.current.documentId !== expectedDocumentId || latestDocument.current.documentRevision !== expectedRevision) throw new Error('文档或版本已更改，已放弃过期操作')
      dispatch({ ...action, expectedDocumentId, expectedRevision })
    }
    try { await job(commit) } catch (error) { notice(error instanceof Error ? error.message : '操作失败，请重试') } finally { setBusy(false) }
  }
  const clientPoint = (clientX: number, clientY: number): Point => {
    const board = artboardRef.current
    const bounds = board?.getBoundingClientRect()
    if (!bounds) return { x: 0, y: 0 }
    const angle = state.canvasRotation * Math.PI / 180
    const dx = clientX - bounds.left - bounds.width / 2, dy = clientY - bounds.top - bounds.height / 2
    const width = board?.offsetWidth ? board.offsetWidth * state.zoom / 100 : bounds.width || state.documentWidth
    const height = board?.offsetHeight ? board.offsetHeight * state.zoom / 100 : bounds.height || state.documentHeight
    const crop = state.cropRect ?? fullRect
    const x = ((Math.cos(angle) * dx + Math.sin(angle) * dy) / width + .5) * crop.width + crop.x
    const y = ((-Math.sin(angle) * dx + Math.cos(angle) * dy) / height + .5) * crop.height + crop.y
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
  }
  const cancel = () => {
    const current = gesture.current
    if (current) {
      artboardRef.current?.releasePointerCapture?.(current.pointerId)
      if (state.activeTool === 'pan') dispatch({ type: 'set-canvas-offset', x: current.offset.x, y: current.offset.y })
      if (state.activeTool === 'rotate') dispatch({ type: 'set-canvas-rotation', rotation: current.rotation })
    }
    gesture.current = null
    setPreview(null); setStrokePreview(null); setShapePreview(null); setMaskPreview(null); setTransform(null); setQuad(null); changePath(null)
  }
  const commitSelection = (selection: Selection) => { setPreview(null); dispatch({ type: 'commit-selection', selection }) }
  const convertPath = (mask = false) => {
    const active = pathRef.current
    if (!active?.closed) return
    const selection = pathSelection(active, state.selection)
    if (mask) dispatch({ type: 'selection-to-mask', selection })
    else commitSelection(combineSelection(state.selectionVisible ? state.selection : null, selection, state.selection.mode))
    changePath(null)
  }
  const commitTransform = () => {
    if (!transform) return
    if (transform.kind === 'crop') {
      if (transform.rect.width < .2 || transform.rect.height < .2) return notice('裁剪范围太小')
      dispatch({ type: 'commit-crop', rect: transform.rect })
    } else dispatch({ type: 'commit-layer-transform', layerId: state.selectedLayerId, transform })
    setTransform(null)
  }
  const commitPerspective = () => void perform(async (commit) => {
    if (!quad) return
    const image = await rasterizeSvg(layerScene()), context = image.getContext('2d')
    if (!context) throw new Error('无法访问画布像素')
    const width = Math.max(1, Math.round(Math.max(Math.hypot((quad[1].x - quad[0].x) * state.documentWidth / 100, (quad[1].y - quad[0].y) * state.documentHeight / 100), Math.hypot((quad[2].x - quad[3].x) * state.documentWidth / 100, (quad[2].y - quad[3].y) * state.documentHeight / 100))))
    const height = Math.max(1, Math.round(Math.max(Math.hypot((quad[3].x - quad[0].x) * state.documentWidth / 100, (quad[3].y - quad[0].y) * state.documentHeight / 100), Math.hypot((quad[2].x - quad[1].x) * state.documentWidth / 100, (quad[2].y - quad[1].y) * state.documentHeight / 100))))
    const pixels = perspectiveWarp(context.getImageData(0, 0, image.width, image.height), width, height, quad)
    const out = document.createElement('canvas'); out.width = width; out.height = height
    const ctx = out.getContext('2d'); if (!ctx) throw new Error('无法创建裁剪结果')
    const data = ctx.createImageData(width, height); data.data.set(pixels.data); ctx.putImageData(data, 0, 0)
    commit({ type: 'rasterize-layer', id: state.selectedLayerId, source: out.toDataURL('image/png') })
    setQuad(null); notice('透视已校正到当前图层，可撤销')
  })
  const selectionInteractive = state.activeToolGroup === 'selection' || state.activeTool === 'select'
  useEffect(() => {
    const onCancel = (event: Event) => {
      if (!gesture.current && !pathRef.current && !transform && !quad) return
      event.preventDefault(); cancel()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (inputTarget(event.target) || inputTarget(document.activeElement) || event.isComposing || event.defaultPrevented) return
      if (event.key === 'Enter') {
        if (quad) { event.preventDefault(); commitPerspective() }
        else if (transform) { event.preventDefault(); commitTransform() }
        else if (pathRef.current) { event.preventDefault(); changePath(closePath(pathRef.current)) }
        return
      }
      if (!selectionInteractive || !state.selectionVisible || gesture.current || pathRef.current || event.ctrlKey || event.metaKey || event.altKey) return
      const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } }
      const delta = directions[event.key]; if (!delta) return
      event.preventDefault()
      const amount = event.shiftKey ? 10 : 1
      dispatch({ type: 'commit-selection', selection: moveSelection(state.selection, delta.x * amount * 100 / state.documentWidth, delta.y * amount * 100 / state.documentHeight) })
    }
    window.addEventListener(TOOL_CANCEL_EVENT, onCancel); window.addEventListener('keydown', keyboard)
    return () => { window.removeEventListener(TOOL_CANCEL_EVENT, onCancel); window.removeEventListener('keydown', keyboard) }
  })
  useEffect(() => {
    gesture.current = null; setPreview(null); setStrokePreview(null); setShapePreview(null); setMaskPreview(null)
    if (state.activeTool !== 'pan') {
      if (!['lasso-select', 'polygon-select', 'bezier-select', 'pen'].includes(state.activeTool)) changePath(null)
      setTransform(state.activeTool === 'transform' ? state.layers.find((l) => l.id === state.selectedLayerId)?.transform ?? defaultTransform() : null)
      setQuad(state.activeTool === 'perspective-crop' ? fullQuad.map((p) => ({ ...p })) as PerspectiveQuad : null)
    }
  }, [state.activeTool, state.selectedLayerId])
  useEffect(() => {
    let frame = 0
    const fitIfNeeded = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const currentZoomIsAuto = autoFitZoom.current !== null && Math.abs(state.zoom - autoFitZoom.current) < .1
        if (state.zoom !== 100 && !currentZoomIsAuto) return
        const canvas = artboardRef.current?.closest('.canvas-area') as HTMLElement | null
        if (!canvas) return
        const composer = canvas.querySelector<HTMLElement>('.ai-composer[data-placement="floating"]')
        const fitted = fitViewportZoom({
          documentWidth: state.documentWidth * crop.width / 100,
          documentHeight: state.documentHeight * crop.height / 100,
          canvasWidth: canvas.clientWidth,
          canvasHeight: canvas.clientHeight,
          composerHeight: composer?.getBoundingClientRect().height ?? 0,
        })
        const composerHeight = composer?.getBoundingClientRect().height ?? 0
        autoFitZoom.current = fitted
        if (Math.abs(fitted - state.zoom) > .1) dispatch({ type: 'set-zoom', zoom: fitted })
        dispatch({ type: 'set-canvas-offset', x: 0, y: composerHeight ? -(composerHeight + 20) / 2 : 0 })
      })
    }
    fitIfNeeded()
    window.addEventListener('resize', fitIfNeeded)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', fitIfNeeded) }
  }, [crop.height, crop.width, state.composerMinimized, state.composerPlacement, state.documentHeight, state.documentWidth, state.zoom])
  const brushSettings = () => ({ size: option('size', 20) / sourcePixelScale, hardness: state.activeTool === 'pencil' ? 100 : state.activeTool === 'soft-brush' ? 0 : option('hardness', 80), opacity: option('opacity', 100), flow: option('flow', 100), smoothing: state.activeTool === 'pencil' ? 0 : option('smoothing', 15), color: state.brushColor })
  const update = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current; if (!g) return
    const documentPoint = clientPoint(event.clientX, event.clientY), tool = state.activeTool
    const point = isLayerTool(tool) ? localPoint(documentPoint) : documentPoint
    const delta = { x: point.x - g.start.x, y: point.y - g.start.y }
    if (delta.x || delta.y) g.points.push(point)
    if (tool === 'pan') dispatch({ type: 'set-canvas-offset', x: g.offset.x + event.clientX - g.client.x, y: g.offset.y + event.clientY - g.client.y })
    else if (tool === 'rotate') dispatch({ type: 'set-canvas-rotation', rotation: g.rotation + event.clientX - g.client.x })
    else if (tool === 'move' && g.transform) setTransform({ ...g.transform, rect: { ...g.transform.rect, x: g.transform.rect.x + delta.x, y: g.transform.rect.y + delta.y } })
    else if (g.stroke) {
      const input = pointerInput(event)
      const brushPoint = { ...point, ...input }
      g.stroke = tool === 'brush-line' ? { ...g.stroke, points: [g.stroke.points[0], brushPoint] } : appendBrushPoint(g.stroke, brushPoint)
      g.points.push(point)
      if (tool === 'mask' || tool === 'mask-quick') setMaskPreview({ ...(state.layerMasks[state.selectedLayerId] ?? { strokes: [], inverted: false, applied: false }), applied: false, strokes: [...(state.layerMasks[state.selectedLayerId]?.strokes ?? []), g.stroke] })
      else setStrokePreview(g.stroke)
    } else if (tool === 'mask-gradient') setMaskPreview({ strokes: [], inverted: false, applied: false, gradient: { from: g.start, to: point } })
    else if (tool === 'lasso-select' && pathRef.current) changePath(addAnchor(pathRef.current, point))
    else if ((tool === 'bezier-select' || tool === 'pen') && pathRef.current && g.pathIndex !== undefined) {
      let next = moveControl(pathRef.current, g.pathIndex, 'out', point)
      next = moveControl(next, g.pathIndex, 'in', { x: 2 * g.start.x - point.x, y: 2 * g.start.y - point.y }); changePath(next)
    } else if (g.shape) {
      g.shape = { ...g.shape, rect: drawSelectionRect(g.start, point, { ratio: event.shiftKey ? 1 : null, fromCenter: event.altKey, artboardRatio: (state.layers.find((layer) => layer.id === state.selectedLayerId)?.contentWidth ?? state.documentWidth) / (state.layers.find((layer) => layer.id === state.selectedLayerId)?.contentHeight ?? state.documentHeight) }), from: g.start, to: point }; setShapePreview(g.shape)
    } else if (['selection', 'rectangle-select', 'ellipse-select', 'crop'].includes(tool)) {
      const ratio = tool === 'crop' ? String(state.toolOptions.cropRatio ?? 'free').split(':').map(Number) : null
      const fixed = ratio && ratio[0] && ratio[1] ? ratio[0] / ratio[1] : tool === 'crop' ? null : state.selection.fixedRatio
      const rect = drawSelectionRect(g.start, point, { fromCenter: event.altKey, ratio: event.shiftKey ? 1 : fixed, artboardRatio: state.documentWidth / state.documentHeight })
      if (tool === 'crop') setTransform({ ...defaultTransform(), kind: 'crop', rect })
      else { g.selection = combineSelection(g.previous, createSelection(tool === 'ellipse-select' ? 'ellipse' : 'rectangle', rect, state.selection), state.selection.mode); setPreview(g.selection) }
    }
  }
  const down = (event: React.PointerEvent<HTMLDivElement>) => {
    if (busy || (event.button !== 0 && event.button !== undefined)) return
    if (event.target instanceof Element && event.target.closest('.path-actions,.transform-actions,.perspective-handle,.path-point,.selection-overlay,.selection-handle')) return
    const documentPoint = clientPoint(event.clientX, event.clientY), tool = state.activeTool
    const point = isLayerTool(tool) ? localPoint(documentPoint) : documentPoint
    if (tool === 'zoom') { zoom(state.zoom * (event.altKey ? .8 : 1.25)); return }
    if (tool === 'picker') { const svg = scene(); if (svg) void perform(async (commit) => commit({ type: 'set-brush-color', color: await sampleCanvasColor(svg, documentPoint.x, documentPoint.y) })); return }
    if (tool === 'magic-wand') { const svg = scene(); if (svg) void perform(async (commit) => { commit({ type: 'commit-selection', selection: combineSelection(state.selectionVisible ? state.selection : null, await contiguousMagicSelection(svg, documentPoint, option('tolerance', 32)), state.selection.mode) }); setPreview(null) }); return }
    if (tool === 'subject-select' || tool === 'mask-subject') {
      const service = canvasCloudServices().selectSubject
      if (!service) return notice('主体识别服务尚未配置，请在接入云端模型后使用')
      void perform(async (commit) => { const selection = await service(serializeSvg(layerScene()).source); commit(tool === 'mask-subject' ? { type: 'selection-to-mask', selection } : { type: 'commit-selection', selection }); setPreview(null) }); return
    }
    if (tool === 'healing' && !canvasCloudServices().heal) return notice('修复服务尚未配置，请在接入云端模型后使用')
    if (tool === 'background-eraser') { void perform(async (commit) => commit({ type: 'rasterize-layer', id: state.selectedLayerId, source: await eraseBackground(layerScene(), documentPoint, option('tolerance', 32)) })); return }
    if (tool === 'clone-stamp' && event.altKey) { cloneSource.current = localPoint(documentPoint); notice('已设置仿制源，拖动画布开始仿制'); return }
    if (tool === 'clone-stamp' && !cloneSource.current) return notice('请先按住 Alt 点击画布设置仿制源')
    if (tool === 'text') { dispatch({ type: 'upsert-text', object: { id: freshId(), layerId: state.selectedLayerId, ...point, text: '双击编辑文字', fontFamily: String(state.toolOptions.fontFamily ?? 'sans-serif'), fontSize: option('fontSize', 24) / Math.max(.000001, sourceScaleY), fontWeight: String(state.toolOptions.fontWeight ?? '400'), color: String(state.toolOptions.textColor ?? state.brushColor), align: state.toolOptions.textAlign as 'left' | 'center' | 'right' || 'left' } }); return }
    if (tool === 'fill') {
      const selected = state.layers.find((layer) => layer.id === state.selectedLayerId)
      if (selected?.source && selected.source !== 'fixture' && !selected.transform) void perform(async (commit) => {
        const image = await rasterizeSvgPixels(layerScene())
        const mask = state.selectionVisible && state.selection.rect.width > 0 && state.selection.rect.height > 0 ? rasterizeSelectionMask(localSelection(state.selection), image.width, image.height) : undefined
        commit({ type: 'rasterize-layer', id: state.selectedLayerId, source: imageToPng(fillPixels(image, state.brushColor, mask)) })
        notice('已填充当前图层像素，可撤销')
      })
      else dispatch({ type: 'add-shape', shape: { id: freshId(), layerId: state.selectedLayerId, kind: 'fill', rect: fullRect, color: state.brushColor, opacity: option('opacity', 100), strokeWidth: 0, selection: state.selectionVisible ? localSelection(state.selection) : undefined } })
      return
    }
    if (tool === 'select') { notice('已选择当前图层，使用移动工具拖动内容'); return }
    const g: Gesture = { pointerId: event.pointerId, start: point, client: { x: event.clientX, y: event.clientY }, previous: state.selectionVisible ? state.selection : null, offset: { ...state.canvasOffset }, points: [point], rotation: state.canvasRotation }
    if (state.activeToolGroup === 'brush' || ['eraser', 'mask', 'mask-quick', 'healing', 'clone-stamp'].includes(tool)) {
      g.stroke = createBrushStroke(freshId(), tool === 'eraser' ? 'erase' : tool === 'mask' || tool === 'mask-quick' || tool === 'healing' ? 'mask' : 'paint', state.selectedLayerId, { ...point, ...pointerInput(event) }, brushSettings())
      if (tool === 'mask' || tool === 'mask-quick') setMaskPreview({ ...(state.layerMasks[state.selectedLayerId] ?? { strokes: [], inverted: false, applied: false }), applied: false, strokes: [...(state.layerMasks[state.selectedLayerId]?.strokes ?? []), g.stroke] })
      else setStrokePreview(g.stroke)
    }
    if (tool === 'move') { g.transform = state.layers.find((l) => l.id === state.selectedLayerId)?.transform ?? defaultTransform(); setTransform(g.transform) }
    if (tool === 'lasso-select') changePath(addAnchor({ kind: 'freehand', anchors: [], closed: false }, point))
    if (['polygon-select', 'bezier-select', 'pen'].includes(tool)) {
      const previous = pathRef.current?.closed ? null : pathRef.current
      const next = addAnchor(previous ?? { kind: tool === 'polygon-select' ? 'polygon' : 'bezier', anchors: [], closed: false }, point)
      changePath(next); g.pathIndex = next.anchors.length - 1
    }
    if (['shape', 'shape-ellipse', 'shape-line', 'shape-arrow', 'gradient-fill'].includes(tool)) {
      g.shape = { id: freshId(), layerId: state.selectedLayerId, kind: tool === 'shape-ellipse' ? 'ellipse' : tool === 'shape-line' ? 'line' : tool === 'shape-arrow' ? 'arrow' : tool === 'gradient-fill' ? 'gradient' : 'rectangle', rect: { ...point, width: 0, height: 0 }, color: state.brushColor, opacity: option('opacity', 100), endColor: String(state.toolOptions.gradientEndColor ?? '#ffffff'), strokeWidth: option('shapeStrokeWidth', 3) / sourcePixelScale, selection: state.selectionVisible && tool === 'gradient-fill' ? localSelection(state.selection) : undefined }
    }
    gesture.current = g; event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    const g = gesture.current; if (!g) return
    update(event); gesture.current = null; event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (state.activeTool === 'rotate' && Math.hypot(event.clientX - g.client.x, event.clientY - g.client.y) < 6) {
      dispatch({ type: 'set-canvas-rotation', rotation: g.rotation + 15 })
      notice('画布已顺时针旋转 15°')
    }
    if (g.selection && (g.points.length > 1 || g.selection.rect.width > 0)) commitSelection(g.selection)
    else setPreview(null)
    const tool = state.activeTool
    if (g.stroke) {
      if (tool === 'mask' || tool === 'mask-quick') dispatch({ type: 'commit-mask', mask: { ...(state.layerMasks[state.selectedLayerId] ?? { strokes: [], inverted: false, applied: false }), applied: false, strokes: [...(state.layerMasks[state.selectedLayerId]?.strokes ?? []), g.stroke] } })
      else if (tool === 'healing') {
        const region = pathSelection({ kind: 'freehand', anchors: g.points, closed: true })
        void perform(async (commit) => { const service = canvasCloudServices().heal; if (!service) throw new Error('修复服务尚未配置'); commit({ type: 'rasterize-layer', id: state.selectedLayerId, source: await service(serializeSvg(layerScene()).source, region) }) })
      } else if (tool === 'clone-stamp' || tool === 'smudge') void perform(async (commit) => commit({ type: 'rasterize-layer', id: state.selectedLayerId, source: tool === 'clone-stamp' ? await cloneImage(layerScene(), g.points, cloneSource.current!, g.stroke!.size) : await smudgeImage(layerScene(), g.points, g.stroke!.size, g.stroke!.opacity) }))
      else if (['brush', 'pencil', 'soft-brush', 'brush-line', 'eraser'].includes(tool) && state.layers.find((layer) => layer.id === state.selectedLayerId)?.source && state.layers.find((layer) => layer.id === state.selectedLayerId)?.source !== 'fixture' && !state.layers.find((layer) => layer.id === state.selectedLayerId)?.transform) {
        const stroke = g.stroke
        void perform(async (commit) => {
          const image = await rasterizeSvgPixels(layerScene())
          const mask = state.selectionVisible && state.selection.rect.width > 0 && state.selection.rect.height > 0 ? rasterizeSelectionMask(localSelection(state.selection), image.width, image.height) : undefined
          commit({ type: 'rasterize-layer', id: state.selectedLayerId, source: imageToPng(paintBrushStroke(image, stroke, mask)) })
          notice(tool === 'eraser' ? '已擦除当前图层像素，可撤销' : '已绘制到当前图层像素，可撤销')
        })
      } else dispatch({ type: 'commit-brush-stroke', stroke: g.stroke })
      setStrokePreview(null); setMaskPreview(null)
    }
    if (tool === 'mask-gradient') { dispatch({ type: 'commit-mask', mask: { strokes: [], inverted: false, applied: false, gradient: { from: g.start, to: localPoint(clientPoint(event.clientX, event.clientY)) } } }); setMaskPreview(null) }
    if (tool === 'lasso-select' && pathRef.current) {
      const closed = closePath(pathRef.current)
      if (closed.closed) commitSelection(combineSelection(g.previous, pathSelection(closed, state.selection), state.selection.mode))
      changePath(null)
    }
    if (g.shape && (g.shape.rect.width > .1 || g.shape.rect.height > .1)) {
      if (g.shape.kind === 'gradient') g.shape.rect = fullRect
      dispatch({ type: 'add-shape', shape: g.shape }); setShapePreview(null)
    }
    if (tool === 'move' && g.transform) {
      const point = clientPoint(event.clientX, event.clientY)
      dispatch({ type: 'commit-layer-transform', layerId: state.selectedLayerId, transform: { ...g.transform, rect: { ...g.transform.rect, x: g.transform.rect.x + point.x - g.start.x, y: g.transform.rect.y + point.y - g.start.y } } }); setTransform(null)
    }
  }
  return <section className="canvas-area" aria-label="主画布" aria-busy={busy} onWheel={(event) => { if (event.ctrlKey) { event.preventDefault(); zoom(state.zoom * Math.exp(-event.deltaY * .003)) } }} onTouchStart={(event) => { if (event.touches.length === 2) { cancel(); pinchStart.current = { distance: distance(event.touches), zoom: state.zoom } } }} onTouchMove={(event) => { if (pinchStart.current && event.touches.length === 2) { event.preventDefault(); zoom(pinchStart.current.zoom * distance(event.touches) / pinchStart.current.distance) } }} onTouchEnd={() => { pinchStart.current = null }} onTouchCancel={() => { pinchStart.current = null }}>
    <div className="canvas-grid" />
    <div ref={artboardRef} className="artboard" data-active-tool={state.activeTool} style={{ width: state.documentWidth * crop.width / 100, maxWidth: 'none', flexShrink: 0, aspectRatio: `${state.documentWidth * crop.width}/${state.documentHeight * crop.height}`, transform: `translate(${state.canvasOffset.x}px,${state.canvasOffset.y}px) scale(${state.zoom / 100}) rotate(${state.canvasRotation}deg)` }} onPointerDown={down} onPointerMove={update} onPointerUp={up} onPointerCancel={cancel} onDoubleClick={() => { if (pathRef.current) changePath(closePath(pathRef.current)) }}>
      <div className="canvas-crop-window"><div className="canvas-document" style={{ width: `${10000 / crop.width}%`, height: `${10000 / crop.height}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` }}>
        <CanvasScene state={state} strokePreview={strokePreview} shapePreview={shapePreview} maskPreview={maskPreview} transformPreview={transform?.kind === 'transform' ? { layerId: state.selectedLayerId, draft: transform } : null} />
        <div className="canvas-interaction" aria-label="画布交互层" />
        {!path && !transform && !quad && (state.selectionVisible || preview) ? <SelectionOverlay selection={preview ?? state.selection} clientPoint={clientPoint} onPreview={setPreview} onCommit={commitSelection} onCancel={() => setPreview(null)} interactive={selectionInteractive} movable={state.activeTool === 'select' || state.selection.mode === 'new'} /> : null}
        {path ? <PathOverlay path={path} onChange={changePath} toPoint={clientPoint} onConvert={() => convertPath()} onMask={() => convertPath(true)} /> : null}
        {transform ? <TransformOverlay draft={transform} onChange={setTransform} onCommit={commitTransform} onCancel={() => setTransform(null)} toPoint={clientPoint} artboardRatio={state.documentWidth / state.documentHeight} /> : null}
        {quad ? <PerspectiveOverlay quad={quad} onChange={setQuad} toPoint={clientPoint} onCommit={commitPerspective} onCancel={() => setQuad(null)} /> : null}
        {['text', 'select'].includes(state.activeTool) ? state.canvasTexts.filter((object) => state.layers.find((layer) => layer.id === object.layerId)?.visible).map((object) => <div key={object.id} style={textLayerStyle(object.layerId)}><TextObject object={object} selected={state.selectedLayerId === object.layerId} onSelect={() => dispatch({ type: 'select-layer', id: object.layerId })} onCommit={(next) => dispatch({ type: 'upsert-text', object: next })} /></div>) : null}
      </div></div>
    </div>
    {state.composerPlacement === 'floating' ? <AIComposer /> : null}
    <div className="canvas-hint">{busy ? '正在处理画布…' : '长按工具切换　Space 平移　⌘ / Ctrl + Z 撤销　双指缩放画布'}</div>
    <div className={`zoom-control ${state.activeTool === 'rotate' ? 'is-rotate-control' : ''}`}>
      {state.activeTool === 'rotate' ? <>
        <span className="canvas-rotation-readout">画布旋转 {Math.round(state.canvasRotation)}°</span>
        <button disabled={busy} aria-label="逆时针旋转 15°" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: state.canvasRotation - 15 })}>↺</button>
        <button disabled={busy} aria-label="顺时针旋转 15°" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: state.canvasRotation + 15 })}>↻</button>
        <button disabled={busy} aria-label="重置画布旋转" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: 0 })}>重置</button>
      </> : null}
      <button disabled={busy} className="canvas-action-button" aria-label="撤销" onClick={() => { cancel(); dispatch({ type: 'undo' }) }}>↶</button><button disabled={busy} className="canvas-action-button" aria-label="重做" onClick={() => { cancel(); dispatch({ type: 'redo' }) }}>↷</button><span className="zoom-divider" aria-hidden="true" /><button disabled={busy} aria-label="缩小" onClick={() => zoom(state.zoom - 10)}>−</button><span>{Math.round(state.zoom)}%</span><button disabled={busy} aria-label="放大" onClick={() => zoom(state.zoom + 10)}>＋</button><button disabled={busy} aria-label="适应画布" onClick={fitToViewport}>适应</button>
    </div>
  </section>
}
