import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { HistoryStrip } from '../components/HistoryStrip'
import { Inspector } from '../components/Inspector'
import { ToolRail } from '../components/ToolRail'
import { TopBar } from '../components/TopBar'
import { MessageHost } from '../components/MessageHost'
import { ToolOptionsBar } from '../components/ToolOptionsBar'
import { useEditor } from '../state/editor'
import type { Selection } from '../canvas/selectionGeometry'
import { SelectionRefinePanel, type SelectionRefineBrushMode, type SelectionRefineOutput, type SelectionRefinePreviewMode, type SelectionRefineParameters } from '../components/SelectionRefinePanel'
import { useToolShortcuts } from '../tools/useToolShortcuts'
import { DocumentTabs } from '../document/DocumentTabs'
import { useDocumentWorkspace } from '../document/DocumentWorkspaceProvider'
import { message } from '../ui/message'
import { ModelManagerDialog } from '../models/ModelManagerDialog'
import { EnhancementPanel } from '../components/EnhancementPanel'
import { alphaToSelection, cancelRefinementJob, createRefinementJob, refineAsync, selectionToAlpha } from '../masks/refineAsync'
import { rasterizeSvgPixels } from '../canvas/rasterTools'
import { AppContextMenu } from '../components/AppContextMenu'
import { UpdateManager } from '../update/UpdateManager'

const MIN_INSPECTOR_WIDTH = 240
const MAX_INSPECTOR_WIDTH = 520

export function layerOnlySvg(svg: SVGSVGElement, targetLayerId: string): SVGSVGElement {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-layer-id]').forEach(node => { if (node.getAttribute('data-layer-id') !== targetLayerId) node.remove() })
  clone.querySelectorAll('[data-mask-preview]').forEach(node => node.remove())
  return clone
}

export function AppShell() {
  const { state, dispatch, documentId } = useEditor()
  const { openSerialized } = useDocumentWorkspace()
  useToolShortcuts()
  const [inspectorWidth, setInspectorWidth] = useState(320)
  const [resizing, setResizing] = useState(false)
  const [modelKind, setModelKind] = useState<'cutout' | 'upscale' | null>(null)
  const [enhancementRequest, setEnhancementRequest] = useState<{ kind: 'cutout' | 'upscale'; nonce: number }>()
  const [selectionRefine, setSelectionRefine] = useState<{ selection: Selection; previewMode: SelectionRefinePreviewMode; brushMode: SelectionRefineBrushMode; brushSize: number; processing?: boolean; pixelPreview?: { alpha: Uint8Array; width: number; height: number; rgba?: Uint8ClampedArray } } | null>(null)
  const refineJob = useRef<ReturnType<typeof createRefinementJob> | null>(null)
  const revision = JSON.stringify({ documentWidth: state.documentWidth, documentHeight: state.documentHeight, history: state.history, selection: state.selection, selectedLayerId: state.selectedLayerId, layerMasks: state.layerMasks, layers: state.layers })
  const revisionRef = useRef(revision); revisionRef.current = revision

  useEffect(() => {
    if (!resizing) return
    const handleMove = (event: PointerEvent) => {
      const nextWidth = Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - event.clientX))
      setInspectorWidth(nextWidth)
    }
    const stopResizing = () => setResizing(false)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stopResizing)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stopResizing)
    }
  }, [resizing])

  useEffect(() => {
    const preventPageZoom = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault() }
    const preventGestureZoom = (event: Event) => event.preventDefault()
    window.addEventListener('wheel', preventPageZoom, { passive: false, capture: true })
    window.addEventListener('gesturestart', preventGestureZoom, { passive: false })
    window.addEventListener('gesturechange', preventGestureZoom, { passive: false })
    window.addEventListener('gestureend', preventGestureZoom, { passive: false })
    return () => { window.removeEventListener('wheel', preventPageZoom, true); window.removeEventListener('gesturestart', preventGestureZoom); window.removeEventListener('gesturechange', preventGestureZoom); window.removeEventListener('gestureend', preventGestureZoom) }
  }, [])

  useEffect(() => {
    if (!selectionRefine) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); if (refineJob.current) cancelRefinementJob(refineJob.current); refineJob.current = null; setSelectionRefine(null) } }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [selectionRefine])

  const style = { '--inspector-width': `${inspectorWidth}px` } as CSSProperties
  const openSelectionRefine = () => {
    if (!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0) return
    setSelectionRefine({ selection: state.selection, previewMode: 'overlay', brushMode: 'add', brushSize: 80 })
  }
  const applySelectionRefine = async (selection: Selection, output: SelectionRefineOutput, parameters?: SelectionRefineParameters) => {
    const targetLayerId = state.selectedLayerId
    const frozenSelection = structuredClone(selection)
    const startedRevision = revisionRef.current
    const job = createRefinementJob(documentId, startedRevision); refineJob.current = job
    const width = Math.max(1, Math.round(state.documentWidth)), height = Math.max(1, Math.round(state.documentHeight))
    const input = selectionToAlpha(frozenSelection, width, height)
    let sourceRgba: Uint8ClampedArray | undefined
    const svg = document.querySelector<SVGSVGElement>('.canvas-art')
    if (svg) { try {
      const layerSvg = layerOnlySvg(svg, targetLayerId)
      sourceRgba = (await rasterizeSvgPixels(layerSvg)).data
    } catch { sourceRgba = undefined } }
    setSelectionRefine(current => current ? { ...current, processing: true } : current)
    const result = await refineAsync(input, width, height, parameters ?? {}, job, () => ({ documentId, revision: revisionRef.current }), (alpha, previewWidth, previewHeight, rgba) => { setSelectionRefine(current => current ? { ...current, pixelPreview: { alpha, width: previewWidth, height: previewHeight, rgba } } : current) }, sourceRgba)
    if (result.cancelled || !result.result || job.cancelled || refineJob.current !== job || revisionRef.current !== startedRevision) { setSelectionRefine(null); return }
    const refinedSelection = alphaToSelection(result.result, width, height, frozenSelection)
    dispatch(output === 'mask' ? { type: 'selection-to-mask', selection: refinedSelection, refinement: parameters, layerId: targetLayerId } : { type: 'commit-selection', selection: refinedSelection })
    refineJob.current = null; setSelectionRefine(null)
  }
  const cancelSelectionRefine = () => { if (refineJob.current) cancelRefinementJob(refineJob.current); refineJob.current = null; setSelectionRefine(null) }
  return <div className={`app-shell ${resizing ? 'is-resizing' : ''} ${state.historyCollapsed ? 'history-collapsed' : ''}`} style={style} onDragOver={event => { if (event.dataTransfer.types.includes('Files')) event.preventDefault() }} onDrop={async event => {
    const files = Array.from(event.dataTransfer.files).filter(file => file.name.toLowerCase().endsWith('.draivio'))
    if (!files.length) return
    event.preventDefault()
    for (const file of files) {
      try { if (file.size > 256 * 1024 * 1024) throw new Error('项目文件超过 256MB'); openSerialized(await file.text(), { name: file.name }) }
      catch (error) { message.error(error instanceof Error ? error.message : '项目无法读取') }
    }
  }}><AppContextMenu /><MessageHost /><UpdateManager /><TopBar /><div className="workspace"><ToolRail /><div className="canvas-workspace"><ToolOptionsBar onOpenModelManager={setModelKind} onRunEnhancement={(kind) => setEnhancementRequest({ kind, nonce: Date.now() })} onOpenSelectionRefine={openSelectionRefine} />{state.activeTool === 'cutout' || state.activeTool === 'upscale' ? <EnhancementPanel kind={state.activeTool} onManage={setModelKind} onRun={(kind) => setEnhancementRequest({ kind, nonce: Date.now() })} /> : null}<div className="canvas-document-host"><DocumentTabs /><div id="active-document-panel" role="tabpanel" className="active-document-panel"><CanvasViewport enhancementRequest={enhancementRequest} refineSelection={selectionRefine?.selection} refinePreviewMode={selectionRefine?.previewMode} refinePreviewAlpha={selectionRefine?.pixelPreview} refineBrushMode={selectionRefine?.brushMode} refineBrushSize={selectionRefine?.brushSize} onRefineSelectionChange={(selection) => setSelectionRefine((current) => current ? { ...current, selection } : current)} /></div></div>{selectionRefine ? <SelectionRefinePanel selection={selectionRefine.selection} previewMode={selectionRefine.previewMode} brushMode={selectionRefine.brushMode} brushSize={selectionRefine.brushSize} processing={selectionRefine.processing} documentWidth={state.documentWidth} documentHeight={state.documentHeight} onSelectionChange={(selection) => setSelectionRefine((current) => current ? { ...current, selection } : current)} onPreviewModeChange={(previewMode) => setSelectionRefine((current) => current ? { ...current, previewMode } : current)} onBrushModeChange={(brushMode) => setSelectionRefine((current) => current ? { ...current, brushMode } : current)} onBrushSizeChange={(brushSize) => setSelectionRefine((current) => current ? { ...current, brushSize } : current)} onApply={applySelectionRefine} onCancel={cancelSelectionRefine} /> : null}</div><Inspector inspectorWidth={inspectorWidth} onResizeStart={() => setResizing(true)} onResizeBy={(delta) => setInspectorWidth((value) => Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, value + delta)))} /></div><HistoryStrip /><ModelManagerDialog open={modelKind !== null} initialKind={modelKind ?? 'cutout'} onClose={() => setModelKind(null)} /></div>
}
