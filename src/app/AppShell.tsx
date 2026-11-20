import { TransformToolbarProvider } from '../canvas/TransformToolbar'
import { executeEditorCommand, INSPECTOR_ACTIVATE_EVENT } from '../commands/editorCommands'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { StatusBar } from '../components/StatusBar'
import { ImageImportControl } from '../components/ImageImportControl'
import { Inspector } from '../components/Inspector'
import { ToolRail } from '../components/ToolRail'
import { TopBar } from '../components/TopBar'
import { MessageHost } from '../components/MessageHost'
import { ToolOptionsBar } from '../components/ToolOptionsBar'
import { useEditor } from '../state/editor'
import type { Selection } from '../canvas/selectionGeometry'
import { SelectionRefinePanel, initialRefineParameters, type SelectionRefineBrushMode, type SelectionRefineOutput, type SelectionRefinePreviewMode, type SelectionRefineParameters } from '../components/SelectionRefinePanel'
import { useToolShortcuts } from '../tools/useToolShortcuts'
import { DocumentTabs } from '../document/DocumentTabs'
import { useDocumentWorkspace } from '../document/DocumentWorkspaceProvider'
import { message } from '../ui/message'
import { ModelManagerDialog } from '../models/ModelManagerDialog'
import { EnhancementPanel } from '../components/EnhancementPanel'
import { alphaToSelection, cancelRefinementJob, createRefinementJob, runFullResolution, selectionToAlpha } from '../masks/refineAsync'
import { renderRefinePreview, rasterizeRefineLayer, selectionRefineParameters, type RefinePreview } from '../masks/selectionRefinePreview'
import { contentRevision } from '../ai/context/editorContext'
import { AppContextMenu } from '../components/AppContextMenu'
import { UpdateManager } from '../update/UpdateManager'
import {readBrowserProjectFile} from '../document/projectStorage'
import {isTauri} from '@tauri-apps/api/core'
import { assertRegionRasterCapability } from '../render/regionScene'

const MIN_INSPECTOR_WIDTH = 240
const MAX_INSPECTOR_WIDTH = 520
const COMPACT_WINDOW_WIDTH = 900
const inspectorEntries = [
  { command: 'layers', tab: 'layers', label: '图层' },
  { command: 'properties', tab: 'edit', label: '属性' },
  { command: 'results', tab: 'results', label: 'AI 结果' },
] as const

export function layerOnlySvg(svg: SVGSVGElement, targetLayerId: string): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  const layers = [...clone.querySelectorAll('[data-layer-id]')]
  const target = layers.find(node => node.getAttribute('data-layer-id') === targetLayerId)
  layers.forEach(node => {
    if (target && (node.contains(target) || target.contains(node))) return
    node.remove()
  })
  clone.querySelectorAll('[data-mask-preview],[data-editor-overlay]').forEach(node => node.remove())
  clone.querySelectorAll('[data-color-preview-source]').forEach(node => node.removeAttribute('visibility'))
  for (const child of clone.children) {
    if (child.localName === 'rect') child.remove()
  }
  return clone
}

export function AppShell() {
  const { state, dispatch, documentId } = useEditor()
  const { openPickedProject } = useDocumentWorkspace()
  useToolShortcuts()
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth)
  const [preferredInspectorWidth, setInspectorWidth] = useState(320)
  const [overlayOpen, setOverlayOpen] = useState(false)
  const inspectorRail = useRef<HTMLElement>(null)
  const compactWindow = windowWidth <= COMPACT_WINDOW_WIDTH
  const overlayVisible = compactWindow && overlayOpen
  const maxInspectorWidth = Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, windowWidth - 660))
  const inspectorWidth = Math.min(preferredInspectorWidth, maxInspectorWidth)
  const [resizing, setResizing] = useState(false)
  useEffect(() => {
    const measure = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])
  useEffect(() => {
    if (!compactWindow) {
      setOverlayOpen(false)
      return
    }
    setResizing(false)
    const open = () => setOverlayOpen(true)
    window.addEventListener(INSPECTOR_ACTIVATE_EVENT, open)
    return () => window.removeEventListener(INSPECTOR_ACTIVATE_EVENT, open)
  }, [compactWindow])
  useEffect(() => {
    if (state.composerPlacement === 'right') setOverlayOpen(true)
  }, [state.composerPlacement])
  const [modelKind, setModelKind] = useState<'cutout' | 'upscale' | null>(null)
  const [enhancementRequest, setEnhancementRequest] = useState<{ kind: 'cutout' | 'upscale'; nonce: number }>()
  const [selectionRefine, setSelectionRefine] = useState<{
    selection: Selection
    previewMode: SelectionRefinePreviewMode
    brushMode: SelectionRefineBrushMode
    brushSize: number
    parameters: SelectionRefineParameters
    layerId: string
    processing?: boolean
  } | null>(null)
  const [refinePreview, setRefinePreview] = useState<{ draft: Selection; params: SelectionRefineParameters; revision: string; value: RefinePreview } | null>(null)
  const refineJob = useRef<ReturnType<typeof createRefinementJob> | null>(null)
  const refineAnchor = useRef<HTMLElement | null>(null)
  const revision = selectionRefine ? contentRevision(state) : ''
  const revisionRef = useRef(revision)
  revisionRef.current = revision
  const draftSelection = selectionRefine?.selection
  const draftParameters = selectionRefine?.parameters
  const draftLayer = selectionRefine?.layerId
  const draftProcessing = selectionRefine?.processing
  const imageWidth = state.documentWidth
  const imageHeight = state.documentHeight
  const cancelSelectionRefine = useCallback(() => {
    if (refineJob.current) cancelRefinementJob(refineJob.current)
    refineJob.current = null
    setRefinePreview(null)
    setSelectionRefine(null)
  }, [])
  useEffect(() => () => { if (refineJob.current) cancelRefinementJob(refineJob.current) }, [documentId])
  useEffect(() => {
    if (!draftSelection || !draftParameters || draftProcessing) return
    const job = createRefinementJob(documentId, revision)
    let sourceWarning = false
    let renderedCap = 0
    const runPreview = async (cap: number) => {
      const readSource = draftLayer ? async (width: number, height: number) => {
        const svg = document.querySelector<SVGSVGElement>('.canvas-art')
        if (!svg) throw new Error('画布尚未就绪')
        return rasterizeRefineLayer(layerOnlySvg(svg, draftLayer), width, height, job.controller.signal)
      } : undefined
      try {
        const value = await renderRefinePreview(draftSelection, imageWidth, imageHeight, draftParameters, cap, job, readSource)
        if (value && !job.cancelled && cap >= renderedCap) {
          renderedCap = cap
          setRefinePreview({ draft: draftSelection, params: draftParameters, revision, value })
        }
      } catch {
        if (job.cancelled) return
        // The alpha preview still works when the color source is unreadable.
        const value = await renderRefinePreview(draftSelection, imageWidth, imageHeight, draftParameters, cap, job)
        if (value && !job.cancelled && cap >= renderedCap) {
          renderedCap = cap
          setRefinePreview({ draft: draftSelection, params: draftParameters, revision, value })
        }
        if (!job.cancelled && !sourceWarning) {
          sourceWarning = true
          message.warning('暂时无法预览去杂边，仍可查看选区边缘', { key: 'refine-preview' })
        }
      }
    }
    const low = window.setTimeout(() => void runPreview(256), 0)
    const high = Math.max(imageWidth, imageHeight) > 256
      ? window.setTimeout(() => void runPreview(1024), 250) : undefined
    return () => { clearTimeout(low); clearTimeout(high); cancelRefinementJob(job) }
  }, [draftSelection, draftParameters, draftLayer, draftProcessing, documentId, imageWidth, imageHeight, revision])
  const pixelPreview = refinePreview && refinePreview.draft === draftSelection && refinePreview.params === draftParameters && refinePreview.revision === revision ? refinePreview.value : undefined

  useEffect(() => {
    if (!resizing) return
    const handleMove = (event: PointerEvent) => {
      const nextWidth = Math.min(maxInspectorWidth, Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - event.clientX))
      setInspectorWidth(nextWidth)
    }
    const stopResizing = () => setResizing(false)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stopResizing)
    window.addEventListener('pointercancel', stopResizing)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stopResizing)
      window.removeEventListener('pointercancel', stopResizing)
    }
  }, [resizing, maxInspectorWidth])

  useEffect(() => {
    const preventPageZoom = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault() }
    const preventGestureZoom = (event: Event) => event.preventDefault()
    window.addEventListener('wheel', preventPageZoom, { passive: false, capture: true })
    window.addEventListener('gesturestart', preventGestureZoom, { passive: false })
    window.addEventListener('gesturechange', preventGestureZoom, { passive: false })
    window.addEventListener('gestureend', preventGestureZoom, { passive: false })
    return () => { window.removeEventListener('wheel', preventPageZoom, true); window.removeEventListener('gesturestart', preventGestureZoom); window.removeEventListener('gesturechange', preventGestureZoom); window.removeEventListener('gestureend', preventGestureZoom) }
  }, [])

  const refining = !!selectionRefine
  useEffect(() => {
    if (!refining) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('[aria-modal="true"]')) return
      event.preventDefault()
      cancelSelectionRefine()
    }
    window.addEventListener('keydown', closeOnEscape, true)
    return () => window.removeEventListener('keydown', closeOnEscape, true)
  }, [refining, cancelSelectionRefine])

  const style = { '--inspector-width': `${inspectorWidth}px` } as CSSProperties
  const closeInspector = () => {
    setOverlayOpen(false)
    inspectorRail.current?.querySelector<HTMLButtonElement>('button[aria-expanded="true"]')?.focus()
  }
  const openSelectionRefine = () => {
    if (selectionRefine || !state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0) return
    refineAnchor.current = document.querySelector('.inspector') ?? document.querySelector('.tool-options-controls')
    setSelectionRefine({ selection: state.selection, previewMode: 'overlay', brushMode: 'add', brushSize: 80,
      parameters: initialRefineParameters, layerId: state.selectedLayerId })
  }
  const applySelectionRefine = async (selection: Selection, output: SelectionRefineOutput, parameters = initialRefineParameters) => {
    if (!selectionRefine || refineJob.current) return
    const targetLayerId = selectionRefine.layerId
    const targetLayer = state.layers.find(layer => layer.id === targetLayerId)
    try {
      if (targetLayer?.rasterRef) {
        assertRegionRasterCapability({ width: targetLayer.contentWidth ?? imageWidth, height: targetLayer.contentHeight ?? imageHeight, rasterRef: targetLayer.rasterRef, nativeTiles: false }, 'edit')
      }
      if (output === 'mask' && !targetLayer) throw new Error('请选择要应用蒙版的图层')
      if (imageWidth * imageHeight > 16_777_216) throw new Error('高清选区精修最多支持 1600 万像素')
    } catch (error) {
      message.error(error instanceof Error ? error.message : '当前图层无法精修')
      return
    }
    const job = createRefinementJob(documentId, revision)
    refineJob.current = job
    setSelectionRefine(current => current && { ...current, processing: true })
    try {
      // Let the window display its progress state before rasterizing the full selection.
      await new Promise<void>(resolve => setTimeout(resolve, 0))
      if (job.cancelled) return
      const result = await runFullResolution(selectionToAlpha(selection, imageWidth, imageHeight), imageWidth, imageHeight,
        selectionRefineParameters(selection, parameters), job)
      if (job.cancelled || refineJob.current !== job) return
      if (revisionRef.current !== job.revision) throw new Error('作品已更改，请重新应用选区精修')
      if (!result) throw new Error('高清选区计算失败，请重试')
      const refinedSelection = alphaToSelection(result, imageWidth, imageHeight, { ...selection, feather: 0 })
      dispatch(output === 'mask'
        ? { type: 'selection-to-mask', selection: refinedSelection, refinement: parameters, layerId: targetLayerId }
        : { type: 'commit-selection', selection: refinedSelection })
      setRefinePreview(null)
      setSelectionRefine(null)
    } catch (error) {
      if (job.cancelled) return
      message.error(error instanceof Error ? error.message : '无法应用选区精修')
      setSelectionRefine(current => current && { ...current, processing: false })
    } finally {
      if (refineJob.current === job) refineJob.current = null
    }
  }
  return <TransformToolbarProvider><div className={`app-shell ${resizing ? 'is-resizing' : ''}`} style={style} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={async event => {
    const files = Array.from(event.dataTransfer.files).filter(file => file.name.toLowerCase().endsWith('.draivio'))
    if (!files.length) return
    event.preventDefault()
    if(isTauri())return // Native OS drop grants opaque file tokens; no JS File path or full-buffer read.
    for (const file of files) {
      try { await openPickedProject(await readBrowserProjectFile(file)) }
      catch (error) { message.error(error instanceof Error ? error.message : '项目无法读取') }
    }
  }}><AppContextMenu /><MessageHost /><UpdateManager /><TopBar compact={compactWindow} /><div className="workspace" data-compact={compactWindow} data-inspector-open={overlayVisible}><ToolRail /><div className="canvas-workspace"><DocumentTabs />{state.activeTool === 'cutout' || state.activeTool === 'upscale' ? <EnhancementPanel kind={state.activeTool} onManage={setModelKind} onRun={(kind) => setEnhancementRequest({ kind, nonce: Date.now() })} /> : null}<div className="canvas-document-host"><ToolOptionsBar onOpenModelManager={setModelKind} onRunEnhancement={(kind) => setEnhancementRequest({ kind, nonce: Date.now() })} onOpenSelectionRefine={openSelectionRefine} /><div id="active-document-panel" role="tabpanel" className="active-document-panel"><CanvasViewport onOpenSelectionRefine={openSelectionRefine} enhancementRequest={enhancementRequest} refineSelection={selectionRefine?.selection} refinePreviewMode={selectionRefine?.previewMode} refinePreviewAlpha={pixelPreview} refineBrushMode={selectionRefine?.brushMode} refineBrushSize={selectionRefine?.brushSize} onRefineSelectionChange={(selection) => setSelectionRefine((current) => current ? { ...current, selection } : current)} /></div></div>{selectionRefine ? <SelectionRefinePanel anchor={refineAnchor} onParametersChange={parameters => setSelectionRefine(current => current && { ...current, parameters })} selection={selectionRefine.selection} previewMode={selectionRefine.previewMode} brushMode={selectionRefine.brushMode} brushSize={selectionRefine.brushSize} processing={selectionRefine.processing} onSelectionChange={(selection) => setSelectionRefine((current) => current ? { ...current, selection } : current)} onPreviewModeChange={(previewMode) => setSelectionRefine((current) => current ? { ...current, previewMode } : current)} onBrushModeChange={(brushMode) => setSelectionRefine((current) => current ? { ...current, brushMode } : current)} onBrushSizeChange={(brushSize) => setSelectionRefine((current) => current ? { ...current, brushSize } : current)} onApply={applySelectionRefine} onCancel={cancelSelectionRefine} /> : null}</div>{compactWindow ? <nav ref={inspectorRail} className="inspector-compact-rail" aria-label="面板快捷入口">
      {inspectorEntries.map(({ command, tab, label }) => <button key={command} type="button" aria-controls="workspace-inspector"
        aria-expanded={overlayVisible && state.inspectorTab === tab}
        onClick={() => overlayVisible && state.inspectorTab === tab ? closeInspector() : executeEditorCommand(command, state, dispatch)}>{label}</button>)}
    </nav> : null}
    <Inspector inspectorWidth={inspectorWidth} maxWidth={maxInspectorWidth} overlay={compactWindow}
      hidden={compactWindow && !overlayVisible} onClose={closeInspector} onResizeStart={() => setResizing(true)}
      onResizeBy={delta => setInspectorWidth(Math.min(maxInspectorWidth, Math.max(MIN_INSPECTOR_WIDTH, inspectorWidth + delta)))} /></div><StatusBar /><ImageImportControl /><ModelManagerDialog open={modelKind !== null} initialKind={modelKind ?? 'cutout'} onClose={() => setModelKind(null)} /></div></TransformToolbarProvider>
}
