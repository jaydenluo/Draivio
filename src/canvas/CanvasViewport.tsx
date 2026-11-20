import { materializeColorAdjustments } from '../render/exportImage'
import { ObjectTransformOverlay } from './ObjectTransformOverlay'
import { selectedObjects, objectLocked } from './objectProperties'
import { createPortal } from 'react-dom'
import { bucketSelection, selectionInLayer, fillShapeAt } from './bucketFill'
import { toolCursor, isRoundBrush } from './toolCursor'
import { toolHint, toolUnavailableReason } from '../tools/toolHelp'
import { CanvasSelectionMenu } from './CanvasSelectionMenu'
import { useLayerStyleEditor, withLayerStylePreview } from '../layers/LayerStyleEditor'
import { useSmartFilterEditor } from '../layers/SmartFilterEditor'
import { SemanticSelectionWorkspace } from '../ai/vision/SemanticSelectionWorkspace'
import { tonalBrushPixels, tonalSourceIds, type TonalRange } from '../retouch/tonalBrush'
import { ContentFillWorkspace, CONTENT_FILL_EVENT, type FillResult } from '../retouch/ContentFillWorkspace'
import { brushMask } from '../retouch/contentFill'
import { contentRevision } from '../ai/context/editorContext'
import type { PixelImage } from './rasterTools'
import { FloatingSurface } from '../ui/FloatingSurface'
import { effectiveLayerState, layerSubtreeIds } from '../state/layerHierarchy'
import { retouchScopeSvg, retouchParentId } from './retouchScope'
import { layerPixelScale } from '../document/documentGeometry'
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useEditor, neutralAdjustments, type EditorAction } from '../state/editor'
import { ResultStage } from '../creation/ResultStage'
import { AIComposer } from '../creation/AIComposer'
import { CANVAS_FIT_EVENT, TOOL_CANCEL_EVENT } from '../tools/useToolShortcuts'
import { SelectionOverlay, maskDefinitions } from './SelectionOverlay'
import { combineSelection, createSelection, selectionContains, drawSelectionRect, moveSelection, pathSelection, type Selection, type SelectionPoint } from './selectionGeometry'
import { layerPoint, layerMatrix, selectionToLayer } from './layerCoordinates'
import { addAnchor, closePath, moveControl, type EditorPath } from './pathGeometry'
import { PathOverlay } from './PathOverlay'
import { appendBrushPoint, createBrushStroke, type BrushStroke } from './BrushEngine'
import { documentPointToLayerLocal, layerWorldPixelMatrix } from './layerWorldMatrix'
import { pointerInput } from './pointerPressure'
import { CanvasSceneView } from './CanvasScene'
import { TransformOverlay, type TransformDraft } from './TransformOverlay'
import { GuideOverlay } from './GuideOverlay'
import { RulerOverlay, rulerWidth } from './RulerOverlay'
import { GuideControls } from '../components/GuideControls'
import { TextObject, type CanvasTextObject } from './TextObject'
import type { CanvasShape, LayerMask } from './documentTypes'
import { canvasCloudServices } from './cloudToolServices'
import { contiguousMagicSelection, eraseBackground, sampleCanvasColor, serializeSvg, rasterizeSvg, rasterizeSvgPixels, imageToPng, perspectiveWarp, clonePixels, smudgePixels } from './rasterTools'
import { paintBrushStroke } from './rasterBrush'
import { rasterizeSelectionMask } from './selectionRaster'
import { PerspectiveOverlay, type PerspectiveQuad } from './PerspectiveOverlay'
import { fitViewportZoom } from './viewportFit'
import { healPixels, patchPixels, repairDeltaPixels, repairCoveragePath, resolveSampleScope, type SampleScope } from '../retouch/cloneHeal'
import { useDocumentWorkspace } from '../document/DocumentWorkspaceProvider'
import { removeBackground, upscalePixels } from '../imaging/enhancement'
import { ensureModelInstalled } from '../models/modelApi'
import { snapBounds, type SnapIndex, type SnapHits } from '../document/snapping'
import { editorSnapIndex, snapLayerTransform } from './snapTransform'
import { useRasterHitTest } from './useRasterHitTest'
import { chooseMoveTargets, hitMoveTarget, moveSnapIndex, moveTargetBounds, translateMoveTargets, type MoveTarget } from './moveTargets'
import type { SelectionRefineBrushMode, SelectionRefinePreviewMode } from '../components/SelectionRefinePanel'

type Point = SelectionPoint
type Touches = { length: number; [index: number]: { clientX: number; clientY: number } }
const distance = (t: Touches) => Math.hypot(t[1].clientX - t[0].clientX, t[1].clientY - t[0].clientY)
const freshId = () => crypto.randomUUID()
const fullRect = { x: 0, y: 0, width: 100, height: 100 }
const defaultTransform = (): TransformDraft => ({ kind: 'transform', rect: { ...fullRect }, rotation: 0, flipX: false, flipY: false })
const fullQuad: PerspectiveQuad = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }]
const inputTarget = (target: EventTarget | null) => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')
type Gesture = { pointerId: number; start: Point; client: Point; previous: Selection | null; selection?: Selection; stroke?: BrushStroke; shape?: CanvasShape; offset: Point; transform?: TransformDraft; layerId?: string; moveTargets?: MoveTarget[]; moveBounds?: typeof fullRect; snapIndex?: SnapIndex; snapHits?: SnapHits; pathIndex?: number; points: Point[]; rotation: number }
type RefineGesture = { pointerId: number; selection: Selection; mode: SelectionRefineBrushMode }
type TextGesture = { pointerId: number; start: Point; object: CanvasTextObject; moved: boolean }

function SelectionRefinePreview({ selection, mode }: { selection: Selection; mode: SelectionRefinePreviewMode }) {
  const id = `selection-refine-${useId().replace(/:/g, '')}`
  const fill = mode === 'black' ? '#050608' : mode === 'white' ? '#f8f6f0' : mode === 'transparent' ? '#10141a' : '#ff765f'
  const opacity = mode === 'black' || mode === 'white' ? .78 : mode === 'transparent' ? .28 : .46
  return <svg className="selection-refine-preview" aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none">
    <defs>
      {maskDefinitions(selection.path, `${id}-selection`)}
      <mask id={`${id}-outside`} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100" style={{ maskType: 'luminance' }}>
        <rect width="100" height="100" fill="white" />
        <rect width="100" height="100" fill="black" mask={`url(#${id}-selection)`} />
      </mask>
    </defs>
    <rect width="100" height="100" fill={fill} opacity={opacity} mask={`url(#${id}-outside)`} />
  </svg>
}

function SelectionRefinePixelPreview({ preview, mode }: { preview: { alpha: Uint8Array; width: number; height: number; rgba?: Uint8ClampedArray }; mode: SelectionRefinePreviewMode }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    canvas.width = preview.width; canvas.height = preview.height
    const context = canvas.getContext('2d')
    if (!context) return
    const pixels = context.createImageData(preview.width, preview.height)
    const overlay = mode === 'overlay'
    const color = mode === 'black' ? [5, 6, 8] : mode === 'white' ? [248, 246, 240] : [255, 77, 91]
    for (let index = 0; index < preview.alpha.length; index++) {
      const offset = index * 4
      const selected = preview.alpha[index] / 255
      const outsideColor = mode === 'transparent'
        ? Array(3).fill((Math.floor((index % preview.width) / 8) + Math.floor(index / preview.width / 8)) % 2 ? 85 : 124)
        : color
      const corrected = preview.rgba && selected > 0 && selected < .98 ? preview.rgba : undefined
      const correction = corrected ? corrected[offset + 3] / 255 * selected : 0
      const cover = (1 - selected) * (overlay ? .46 : 1)
      const opacity = cover + correction * (1 - cover)
      for (let channel = 0; channel < 3; channel++) {
        const foreground = corrected ? corrected[offset + channel] : 0
        pixels.data[offset + channel] = opacity ? (outsideColor[channel] * cover + foreground * correction * (1 - cover)) / opacity : 0
      }
      pixels.data[offset + 3] = opacity * 255
    }
    context.putImageData(pixels, 0, 0)
  }, [preview, mode])
  return <canvas ref={ref} data-refinement-preview-pixels="true" aria-label="选区精修预览" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', imageRendering: 'auto' }} />
}

export function CanvasViewport({ enhancementRequest, refineSelection, refinePreviewMode, refinePreviewAlpha, refineBrushMode, refineBrushSize = 80, onRefineSelectionChange, onOpenSelectionRefine }: { enhancementRequest?: { kind: 'cutout' | 'upscale'; nonce: number }; refineSelection?: Selection; refinePreviewMode?: SelectionRefinePreviewMode; refinePreviewAlpha?: { alpha: Uint8Array; width: number; height: number; rgba?: Uint8ClampedArray }; refineBrushMode?: SelectionRefineBrushMode; refineBrushSize?: number; onRefineSelectionChange?: (selection: Selection) => void; onOpenSelectionRefine?: () => void }) {
  const { state, dispatch, documentId, viewInitialized, curveDraft } = useEditor()
  const { draft: layerStyleDraft } = useLayerStyleEditor()
  const { preview: filterPreview } = useSmartFilterEditor()
  const sourceHit = useRasterHitTest(state)
  const { dispatchWorkspace } = useDocumentWorkspace()
  const artboardRef = useRef<HTMLDivElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const refineGesture = useRef<RefineGesture | null>(null)
  const textGesture = useRef<TextGesture | null>(null)
  const pinchStart = useRef<{ distance: number; zoom: number } | null>(null)
  const [preview, setPreview] = useState<Selection | null>(null)
  const [path, setPath] = useState<EditorPath | null>(null)
  const pathRef = useRef<EditorPath | null>(null)
  const [strokePreview, setStrokePreview] = useState<BrushStroke | null>(null)
  const [shapePreview, setShapePreview] = useState<CanvasShape | null>(null)
  const [textPreview, setTextPreview] = useState<CanvasTextObject | null>(null)
  const [textEditingId, setTextEditingId] = useState<string | null>(null)
  const [textObjectPreview, setTextObjectPreview] = useState<CanvasTextObject | null>(null)
  const [selectedTextId, setSelectedTextId] = useState<string | null>(null)
  const [snapHits, setSnapHits] = useState<SnapHits>({})
  const moveTargets = state.selectedCanvasTargets ?? []
  const setMoveTargets = (targets:MoveTarget[]) => dispatch({type:'select-canvas-targets',targets})
  const [movePreview, setMovePreview] = useState<{ targets: MoveTarget[]; delta: Point } | null>(null)
  const [objectShapePreview,setObjectShapePreview]=useState<CanvasShape|null>(null)
  const sceneState = useMemo(() => {const base=movePreview ? translateMoveTargets(state, movePreview.targets, movePreview.delta) : state;return objectShapePreview?{...base,canvasShapes:base.canvasShapes.map(s=>s.id===objectShapePreview.id?objectShapePreview:s)}:base}, [state, movePreview,objectShapePreview])
  const editableSelection=selectedObjects(sceneState)
  const selectedShape=editableSelection.length===1&&editableSelection[0].kind==='shape'?editableSelection[0].object:null
  const curveSceneState = useMemo(() => curveDraft && curveDraft.layerId === state.selectedLayerId && state.curvePreviewOffLayerId !== curveDraft.layerId
    ? { ...sceneState, layers: sceneState.layers.map(layer => layer.id === curveDraft.layerId ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, ...(curveDraft.curves ? { curves: curveDraft.curves } : {}), ...(curveDraft.levels ? { levels: curveDraft.levels } : {}) } } : layer) }
    : sceneState, [sceneState, curveDraft, state.selectedLayerId, state.curvePreviewOffLayerId])
  const styleSceneState = useMemo(() => withLayerStylePreview(curveSceneState, layerStyleDraft), [curveSceneState, layerStyleDraft])
  const movingLayerId = movePreview?.targets.length === 1 && movePreview.targets[0].kind === 'layer' ? movePreview.targets[0].layerId : null
  const displaySceneState = movingLayerId ? state : styleSceneState
  const filterSceneState = useMemo(() => filterPreview ? {
    ...displaySceneState,
    layers: displaySceneState.layers.map(layer => layer.id === filterPreview.layerId
      ? { ...layer, smartFilters: filterPreview.chain } : layer),
  } : displaySceneState, [displaySceneState, filterPreview])
  const movementBounds = useMemo(() => moveTargetBounds(sceneState, moveTargets), [sceneState, moveTargets])
  const [transform, setTransform] = useState<TransformDraft | null>(null)
  const transformSnapIndex = useMemo(() => editorSnapIndex(state, state.selectedLayerId), [state.layers, state.guideSettings, state.selectedLayerId, state.documentWidth, state.documentHeight])
  const [quad, setQuad] = useState<PerspectiveQuad | null>(null)
  const [maskPreview, setMaskPreview] = useState<LayerMask | null>(null)
  const cloneSource = useRef<Point | null>(null)
  const cloneAlignmentOrigin = useRef<Point | null>(null)
  const [busy, setBusy] = useState(false)
  const [pendingRepair, setPendingRepair] = useState<Extract<EditorAction, { type: 'add-repair-layer' }> | null>(null)
  const [fillSession, setFillSession] = useState<{image:PixelImage; source:string; target:Uint8Array; revision:string; documentId:string; layerId:string; selection:Selection; parentId?:string; undoLength:number}|null>(null)
  const canvasMenuAnchor=useRef<HTMLElement>(null)
  const [fillMenu,setFillMenu]=useState<{x:number;y:number}|null>(null)
  const closeSelectionMenu=useCallback(()=>setFillMenu(null),[])
  useEffect(()=>setFillMenu(null),[documentId,state.selectedLayerId,state.selection,state.selectionVisible,busy,refineSelection])
  const fillLoadAbort=useRef<AbortController|null>(null)
  const latestDocumentId=useRef(documentId); latestDocumentId.current=documentId
  const processing = useRef(false)
  const processingAbort = useRef<AbortController | null>(null)
  const latestState = useRef(state)
  latestState.current = state
  const autoFit = useRef(!viewInitialized)
  const autoFitZoom = useRef<number | null>(null)
  useEffect(() => { dispatchWorkspace({ type: 'view-initialized', id: documentId }) }, [dispatchWorkspace, documentId])
  const crop = state.cropRect ?? fullRect
  const changePath = (next: EditorPath | null) => { pathRef.current = next; setPath(next) }
  const notice = (message: string) => dispatch({ type: 'set-notice', message })
  const zoom = useCallback((value: number) => {
    autoFit.current = false
    dispatch({ type: 'set-zoom', zoom: value })
  }, [dispatch])
  useEffect(() => {
    const canvas = canvasMenuAnchor.current
    if (!canvas) return

    // WebKit trackpad gestures report a scale relative to the start of the pinch.
    let startZoom: number | null = null
    const end = () => { startZoom = null }
    const start = (event: Event) => {
      end()
      const target = event.target
      if (!(target instanceof Element) || target.closest('.ai-composer, .zoom-control, [role="dialog"]') || inputTarget(target)) return
      startZoom = latestState.current.zoom
    }
    const change = (event: Event) => {
      const { scale } = event as Event & { scale?: number }
      if (startZoom === null || typeof scale !== 'number' || !Number.isFinite(scale) || scale <= 0) return
      zoom(startZoom * scale)
    }
    canvas.addEventListener('gesturestart', start)
    window.addEventListener('gesturechange', change)
    window.addEventListener('gestureend', end)
    window.addEventListener('blur', end)
    return () => {
      canvas.removeEventListener('gesturestart', start)
      window.removeEventListener('gesturechange', change)
      window.removeEventListener('gestureend', end)
      window.removeEventListener('blur', end)
    }
  }, [zoom])
  const fitToViewport = useCallback((explicit = false) => {
    const current = latestState.current
    if (!explicit && (!autoFit.current || (autoFitZoom.current !== null && Math.abs(current.zoom - autoFitZoom.current) > .1))) {
      autoFit.current = false
      return
    }
    const canvas = artboardRef.current?.closest('.canvas-area') as HTMLElement | null
    if (!canvas?.clientWidth || !canvas.clientHeight) return
    const visible = current.cropRect ?? fullRect
    const composer = canvas.querySelector<HTMLElement>('.ai-composer[data-placement="floating"]')
    const composerHeight = composer?.getBoundingClientRect().height ?? 0
    const history = composer?.querySelector<HTMLElement>('.composer-history')
    const historyStyle = history ? getComputedStyle(history) : null
    const editPreview = composer?.querySelector<HTMLElement>('.composer-edit-target-preview')
    const composerHistoryHeight = (history ? history.getBoundingClientRect().height + (parseFloat(historyStyle?.marginTop ?? '') || 0) + (parseFloat(historyStyle?.marginBottom ?? '') || 0) : 0) + (editPreview ? editPreview.getBoundingClientRect().height + 8 : 0)
    const inputHeight = Math.max(0,composerHeight-composerHistoryHeight)
    const fitted = fitViewportZoom({
      documentWidth: current.documentWidth * visible.width / 100,
      documentHeight: current.documentHeight * visible.height / 100,
      canvasWidth: canvas.clientWidth,
      canvasHeight: canvas.clientHeight,
      composerHeight,
      composerHistoryHeight,
    })
    autoFit.current = true
    autoFitZoom.current = fitted
    dispatch({ type: 'set-zoom', zoom: fitted })
    dispatch({ type: 'set-canvas-offset', x: 0, y: inputHeight ? -(inputHeight + 20) / 2 : 0 })
    if (explicit) dispatch({ type: 'set-canvas-rotation', rotation: 0 })
  }, [dispatch])
  const textLayerStyle = (layerId: string) => {
    const layer = sceneState.layers.find((item) => item.id === layerId)
    const width = layer?.contentWidth ?? state.documentWidth, height = layer?.contentHeight ?? state.documentHeight
    const m = layerWorldPixelMatrix(sceneState.layers, layerId, state.documentWidth, state.documentHeight)
    return { position: 'absolute' as const, left: 0, top: 0, width, height, zIndex: 5, pointerEvents: 'none' as const, transformOrigin: '0 0', transform: `matrix(${m.join(',')})` }
  }
  const selectedTransform = () => state.layers.find((layer) => layer.id === state.selectedLayerId)?.transform
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId)
  const { y: sourceScaleY, mean: sourcePixelScale } = layerPixelScale(selectedLayer, state.documentWidth, state.documentHeight)
  const localSelection = (selection: Selection) => ({ ...selectionToLayer(selection, selectedTransform(), state.documentWidth, state.documentHeight), feather: selection.feather / sourcePixelScale })
  const localPoint = (point: Point) => documentPointToLayerLocal(state.layers, state.selectedLayerId, point, state.documentWidth, state.documentHeight)
  const isLayerTool = (tool: string) => ['brush', 'gradient-brush', 'pencil', 'soft-brush', 'brush-line', 'smudge', 'eraser', 'background-eraser', 'healing', 'remove-object', 'clone-stamp', 'patch', 'mask', 'mask-quick', 'mask-gradient', 'gradient-fill', 'text', 'fill'].includes(tool)
  const option = (key: string, fallback: number) => typeof state.toolOptions[key] === 'number' ? state.toolOptions[key] as number : fallback
  const scene = () => artboardRef.current?.querySelector<SVGSVGElement>('.canvas-art') ?? null
  // Raster tools operate on the selected layer, so other layers remain editable.
  const layerScene = (sampleScope: SampleScope = 'current') => {
    const svg = scene()
    if (!svg) throw new Error('画布尚未就绪')
    return retouchScopeSvg(svg, state.layers, state.selectedLayerId, sampleScope)
  }
  const repairOutput = (before: import('./rasterTools').PixelImage, after: import('./rasterTools').PixelImage) => ({
    rootPlacement: !retouchParentId(state.layers, state.selectedLayerId, String(state.toolOptions.sampleScope ?? 'current') as SampleScope), placementParentId: retouchParentId(state.layers, state.selectedLayerId, String(state.toolOptions.sampleScope ?? 'current') as SampleScope), source: imageToPng(repairDeltaPixels(before, after)), repairCoverage: repairCoveragePath(before, after),
    repairSourceIds: resolveSampleScope(state.layers.map(layer => ({ id: layer.id, ...effectiveLayerState(state.layers, layer.id) })), state.selectedLayerId, String(state.toolOptions.sampleScope ?? 'current') as SampleScope),
  })
  const launchContentFill = async (stroke?: { points:Point[];size:number }) => {
    const basis=latestState.current, layerId=basis.selectedLayerId, layer=basis.layers.find(l=>l.id===layerId), rev=contentRevision(basis), docId=latestDocumentId.current
    if(!layer || layer.children || !effectiveLayerState(basis.layers,layerId).visible || effectiveLayerState(basis.layers,layerId).locked){notice('请选择可见且未锁定的普通图层进行内容识别填充');return}
    if(!stroke && (!basis.selectionVisible || basis.selection.rect.width<=0 || basis.selection.rect.height<=0)){notice('请先创建待填选区');return}
    fillLoadAbort.current?.abort();const controller=new AbortController();fillLoadAbort.current=controller;setBusy(true);setFillMenu(null)
    try { const svg=scene();if(!svg)throw new Error('画布尚未就绪');const image=await rasterizeSvgPixels(retouchScopeSvg(svg,basis.layers,layerId,'current'),controller.signal)
      if(controller.signal.aborted)return
      if(docId!==latestDocumentId.current||rev!==contentRevision(latestState.current)||layerId!==latestState.current.selectedLayerId||basis.selection!==latestState.current.selection){notice('文档或选区已更改，已放弃补洞准备');return}
      if(image.width*image.height>4_194_304)throw new Error('图像过大，请缩小图像后进行本地补洞')
      const target=stroke?brushMask(image.width,image.height,stroke.points,stroke.size):rasterizeSelectionMask(basis.selection,image.width,image.height)
      setFillSession({image,source:imageToPng(image),target,revision:rev,documentId:docId,layerId,selection:basis.selection,parentId:retouchParentId(basis.layers,layerId,'current'),undoLength:basis.undoStack.length})
    }catch(error){if(!controller.signal.aborted)notice(error instanceof Error?error.message:'无法准备补洞图像')}finally{if(fillLoadAbort.current===controller){fillLoadAbort.current=null;setBusy(false)}}
  }
  useEffect(()=>{const open=()=>{void launchContentFill()};window.addEventListener(CONTENT_FILL_EVENT,open);return()=>window.removeEventListener(CONTENT_FILL_EVENT,open)},[state,documentId])
  useEffect(()=>()=>{fillLoadAbort.current?.abort()},[])
  const confirmContentFill=(result:FillResult)=>{
    const session=fillSession;if(!session)return
    if(session.documentId!==latestDocumentId.current||session.revision!==contentRevision(latestState.current)||session.layerId!==latestState.current.selectedLayerId||session.selection!==latestState.current.selection){notice('文档或选区已更改，过期补洞结果未写入');setFillSession(null);return}
    const delta=repairDeltaPixels(session.image,result.image),coverage=repairCoveragePath(session.image,result.image)
    if(!coverage){notice('补洞没有变化，未写入结果');return}
    dispatch({type:'add-repair-layer',source:imageToPng(delta),name:'内容识别填充 · 本地',baseLayerId:session.layerId,baseContentRevision:session.revision,baseUndoLength:session.undoLength,rootPlacement:!session.parentId,placementParentId:session.parentId,repairCoverage:coverage,repairSourceIds:[session.layerId],contentFill:{...result.metadata,sampling:result.sampling,sourceRevision:session.revision,sourceLayerId:session.layerId}})
    setFillSession(null)
  }
  const perform = async (job: () => Promise<EditorAction>, successMessage?: string, onSuccess?: () => void, directRepair = false) => {
    if (processing.current) return
    const basis = latestState.current
    const basisDocumentId = latestDocumentId.current
    const controller = new AbortController(); processingAbort.current = controller
    processing.current = true
    setBusy(true)
    try {
      const action = await job()
      if (controller.signal.aborted) return
      if (latestDocumentId.current !== basisDocumentId) { notice('文档已更改，已放弃此次处理结果，请重新操作'); return }
      const current = latestState.current
      if (current.undoStack !== basis.undoStack || current.layers !== basis.layers || current.selectedLayerId !== basis.selectedLayerId || current.selection !== basis.selection || current.selectionVisible !== basis.selectionVisible) {
        notice('文档已更改，已放弃此次处理结果，请重新操作')
        return
      }
      if (action.type === 'add-repair-layer' && !directRepair) { setPendingRepair(action); return }
      dispatch(action)
      if (successMessage) notice(successMessage)
      onSuccess?.()
    } catch (error) { notice(error instanceof Error ? error.message : '操作失败，请重试') }
    finally { if (processingAbort.current === controller) processingAbort.current = null; processing.current = false; setBusy(false) }
  }
  const copySelection = () => void perform(async () => {
    const svg = artboardRef.current?.querySelector<SVGSVGElement>('.canvas-art, .canvas-filter-preview')
    if (!svg || !selectedLayer) throw new Error('当前图层尚未就绪')
    const sampled = retouchScopeSvg(svg, state.layers, selectedLayer.id, 'current', layerSubtreeIds(state.layers, selectedLayer.id), true)
    sampled.querySelectorAll('[data-editor-overlay]').forEach(node => node.remove())
    for (const child of Array.from(sampled.children)) {
      if (child.localName === 'rect') child.remove()
      else if (child.hasAttribute('data-color-preview-source')) child.removeAttribute('visibility')
    }

    // React writes a plain xmlns attribute. The serializer adds its namespaced form.
    sampled.removeAttribute('xmlns')
    const signal = processingAbort.current?.signal
    const source = await materializeColorAdjustments(serializeSvg(sampled).source, { signal })
    const isolated = new DOMParser().parseFromString(source, 'image/svg+xml').documentElement as unknown as SVGSVGElement
    const image = await rasterizeSvgPixels(isolated, signal)
    const coverage = rasterizeSelectionMask(state.selection, image.width, image.height)
    let hasPixels = false
    for (let index = 0; index < coverage.length; index++) {
      const alpha = index * 4 + 3
      image.data[alpha] *= coverage[index] / 255
      if (image.data[alpha]) hasPixels = true
    }
    if (!hasPixels) throw new Error('选区内没有可复制的图层像素')
    return { type: 'import-image', id: freshId(), name: `${selectedLayer.name} · 选区副本`, source: imageToPng(image) }
  }, '已将选区复制到新图层')

  useEffect(() => {
    const fill = (event:Event) => {
      if (processing.current) return
      const reason = toolUnavailableReason({...state, activeToolId:'fill'})
      if (reason) return notice(reason)
      const color = (event as CustomEvent<string>).detail === 'fillBackground' ? state.backgroundColor ?? '#ffffff' : state.brushColor
      dispatch({type:'add-shape',shape:{id:freshId(),layerId:state.selectedLayerId,kind:'fill',rect:fullRect,color,opacity:100,strokeWidth:0,selection:state.selectionVisible?selectionInLayer(state,state.selection):undefined}})
    }
    window.addEventListener('draivio:solid-fill',fill)
    return () => window.removeEventListener('draivio:solid-fill',fill)
  }, [state,dispatch])
  const brushRingRef = useRef<HTMLDivElement>(null)
  const unavailable = toolUnavailableReason(state)
  const cursor = toolCursor(state.activeToolId,!!unavailable,busy)
  const showBrushRing = (event:React.PointerEvent<HTMLDivElement>) => {
    const ring=brushRingRef.current
    if(!ring)return
    const visible=isRoundBrush(state.activeToolId)&&!unavailable&&!busy
    ring.style.display=visible?'block':'none'
    ring.style.left=`${event.clientX}px`;ring.style.top=`${event.clientY}px`
  }
  const confirmRepair = () => { if (!pendingRepair) return; dispatch(pendingRepair); setPendingRepair(null) }
  const cancelRepair = () => setPendingRepair(null)
  useEffect(() => {
    if (!enhancementRequest) return
    const kind = enhancementRequest.kind
    void perform(async () => {
      const modelId = kind === 'cutout' ? 'u2net' : 'realesrgan-x4plus'
      await ensureModelInstalled(modelId)
      const image = await rasterizeSvgPixels(layerScene())
      const result = kind === 'cutout' ? removeBackground(image, 28) : upscalePixels(image, 2)
      return { type: 'rasterize-layer', id: state.selectedLayerId, source: imageToPng(result) }
    }, kind === 'cutout' ? '扣图完成，已生成透明背景图层' : '超分完成，已生成 2x 图层')
  }, [enhancementRequest?.nonce])
  const clientPoint = (clientX: number, clientY: number, clamp = true): Point => {
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
    return clamp ? { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : { x, y }
  }
  const cancel = () => {
    setMovePreview(null); setSnapHits({}); processingAbort.current?.abort()
    const current = gesture.current
    if (current) {
      artboardRef.current?.releasePointerCapture?.(current.pointerId)
      if (state.activeTool === 'pan') dispatch({ type: 'set-canvas-offset', x: current.offset.x, y: current.offset.y })
      if (state.activeTool === 'rotate') dispatch({ type: 'set-canvas-rotation', rotation: current.rotation })
    }
    const refine = refineGesture.current
    if (refine) artboardRef.current?.releasePointerCapture?.(refine.pointerId)
    refineGesture.current = null
    const text = textGesture.current
    if (text) artboardRef.current?.releasePointerCapture?.(text.pointerId)
    textGesture.current = null
    gesture.current = null
    setPreview(null); setStrokePreview(null); setShapePreview(null); setTextPreview(null); setTextEditingId(null); setTextObjectPreview(null); setMaskPreview(null); setTransform(null); setQuad(null); changePath(null)
    if (state.activeTool === 'transform') dispatch({type:'select-tool', tool:'select'})
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
  const finishTransform = () => {
    setTransform(null)
    setSnapHits({})
    if (state.activeTool === 'transform') dispatch({type:'select-tool', tool:'select'})
  }
  const commitTransform = () => {
    if (!transform) return
    if (transform.kind === 'crop') {
      if (transform.rect.width < .2 || transform.rect.height < .2) return notice('裁剪范围太小')
      dispatch({ type: 'commit-crop', rect: transform.rect })
    } else dispatch({ type: 'commit-layer-transform', layerId: state.selectedLayerId, transform })
    finishTransform()
  }
  const commitPerspective = () => void perform(async () => {
    if (!quad) throw new Error('请先指定透视范围')
    const image = await rasterizeSvg(layerScene()), context = image.getContext('2d')
    if (!context) throw new Error('无法访问画布像素')
    const width = Math.max(1, Math.round(Math.max(Math.hypot((quad[1].x - quad[0].x) * state.documentWidth / 100, (quad[1].y - quad[0].y) * state.documentHeight / 100), Math.hypot((quad[2].x - quad[3].x) * state.documentWidth / 100, (quad[2].y - quad[3].y) * state.documentHeight / 100))))
    const height = Math.max(1, Math.round(Math.max(Math.hypot((quad[3].x - quad[0].x) * state.documentWidth / 100, (quad[3].y - quad[0].y) * state.documentHeight / 100), Math.hypot((quad[2].x - quad[1].x) * state.documentWidth / 100, (quad[2].y - quad[1].y) * state.documentHeight / 100))))
    const pixels = perspectiveWarp(context.getImageData(0, 0, image.width, image.height), width, height, quad)
    const out = document.createElement('canvas'); out.width = width; out.height = height
    const ctx = out.getContext('2d'); if (!ctx) throw new Error('无法创建裁剪结果')
    const data = ctx.createImageData(width, height); data.data.set(pixels.data); ctx.putImageData(data, 0, 0)
    return { type: 'rasterize-layer', id: state.selectedLayerId, source: out.toDataURL('image/png') }
  }, '透视已校正到当前图层，可撤销', () => setQuad(null))
  const selectionInteractive = state.activeToolGroup === 'selection'
  useEffect(() => {
    const onCancel = (event: Event) => {
      if (!processing.current && !gesture.current && !refineGesture.current && !pathRef.current && !transform && !quad) return
      event.preventDefault(); cancel()
    }
    const keyboard = (event: KeyboardEvent) => {
      if (document.querySelector('.result-stage') || inputTarget(event.target) || inputTarget(document.activeElement) || event.isComposing || event.defaultPrevented) return
      if (event.key === 'Escape') { onCancel(event); return }
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
    gesture.current = null; setMovePreview(null); setSnapHits({}); setPreview(null); setStrokePreview(null); setShapePreview(null); setMaskPreview(null)
    if (state.activeTool !== 'text') { textGesture.current = null; setTextPreview(null); setTextEditingId(null) }
    setTextObjectPreview(null)
  }, [state.activeTool])
  useEffect(() => {
    if (state.activeTool === 'pan') return
    if (!['lasso-select', 'polygon-select', 'bezier-select', 'pen'].includes(state.activeTool)) changePath(null)
    if (state.activeTool === 'transform'&&!selectedObjects(state).length) setTransform(state.layers.find((l) => l.id === state.selectedLayerId)?.transform ?? defaultTransform())
    else if (!gesture.current) setTransform(null)
    setQuad(state.activeTool === 'perspective-crop' ? fullQuad.map((p) => ({ ...p })) as PerspectiveQuad : null)
  }, [state.activeTool, state.selectedLayerId])
  useEffect(() => { setSelectedTextId(null) }, [documentId, state.activeTool])
  useEffect(() => {
    const ids = [...new Set(moveTargets.map(t => t.layerId))]
    if (ids.length !== state.selectedLayerIds.length || ids.some(id => !state.selectedLayerIds.includes(id))) { setMoveTargets([]); setSelectedTextId(null) }
  }, [state.selectedLayerIds])
  useEffect(() => {
    if (state.activeTool === 'dodge' || state.activeTool === 'burn') return () => cancel()
  }, [documentId, state.activeTool, state.selectedLayerId])
  useEffect(() => {
    let frame = 0
    const fitIfNeeded = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => fitToViewport())
    }
    const canvas = artboardRef.current?.closest('.canvas-area')
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fitIfNeeded)
    if (canvas) {
      observer?.observe(canvas)
      const composer = canvas.querySelector('.ai-composer')
      if (composer) observer?.observe(composer)
    }
    const fitRequested = () => fitToViewport(true)
    fitIfNeeded()
    window.addEventListener('resize', fitIfNeeded)
    window.addEventListener(CANVAS_FIT_EVENT, fitRequested)
    return () => { cancelAnimationFrame(frame); observer?.disconnect(); window.removeEventListener('resize', fitIfNeeded); window.removeEventListener(CANVAS_FIT_EVENT, fitRequested) }
  }, [crop.height, crop.width, fitToViewport, state.composerMinimized, state.composerPlacement, state.documentHeight, state.documentWidth])
  const brushSettings = () => ({ size: option('size', 20) / sourcePixelScale, hardness: state.activeTool === 'pencil' ? 100 : state.activeTool === 'soft-brush' ? 0 : option('hardness', 80), opacity: option('opacity', 100), flow: option('flow', 100), smoothing: state.activeTool === 'pencil' ? 0 : option('smoothing', 15), color: state.brushColor, ...(state.activeTool === 'gradient-brush' ? {endColor: String(state.toolOptions.gradientEndColor ?? state.backgroundColor ?? '#ffffff')} : {}) })
  const refineBrushSelection = (point: Point) => {
    const radiusX = Math.max(.1, refineBrushSize / Math.max(1, state.documentWidth) * 100 / 2)
    const radiusY = Math.max(.1, refineBrushSize / Math.max(1, state.documentHeight) * 100 / 2)
    const width = radiusX * 2, height = radiusY * 2
    return createSelection('ellipse', { x: Math.max(0, Math.min(100 - width, point.x - radiusX)), y: Math.max(0, Math.min(100 - height, point.y - radiusY)), width, height })
  }
  const createTextObject = (point: Point, layout: 'point' | 'paragraph', rect?: { x: number; y: number; width: number; height: number }): CanvasTextObject => {
    const id = freshId()
    const fontSize = option('fontSize', 24) / sourcePixelScale
    const width = rect ? rect.width * state.documentWidth / 100 : Math.max(80, fontSize * 8)
    const height = rect ? rect.height * state.documentHeight / 100 : Math.max(32, fontSize * 1.5)
    return { id, layerId: state.selectedLayerId, x: rect?.x ?? point.x, y: rect?.y ?? point.y, text: '', layout, width, height, fontFamily: String(state.toolOptions.fontFamily ?? 'sans-serif'), fontSize, fontWeight: String(state.toolOptions.fontWeight ?? '400'), color: String(state.toolOptions.textColor ?? state.brushColor), align: state.toolOptions.textAlign as 'left' | 'center' | 'right' || 'left', lineHeight: 1.4, letterSpacing: 0 }
  }
  const hitTextAt = (point: Point) => {
    const candidates = [...state.canvasTexts].reverse().filter((object) => effectiveLayerState(state.layers, object.layerId).visible && !effectiveLayerState(state.layers, object.layerId).locked)
    for (const object of candidates) {
      const layer = state.layers.find((item) => item.id === object.layerId)
      const local = layerPoint(point, layer?.transform, true, state.documentWidth, state.documentHeight)
      const layerWidth = layer?.contentWidth ?? state.documentWidth
      const layerHeight = layer?.contentHeight ?? state.documentHeight
      const lines = object.text.split('\n')
      const estimatedWidth = object.layout === 'paragraph' ? object.width ?? 160 : Math.max(24, ...lines.map((line) => Array.from(line).length * object.fontSize * .62 + Math.max(0, Array.from(line).length - 1) * (object.letterSpacing ?? 0)))
      const estimatedHeight = object.layout === 'paragraph' ? object.height ?? object.fontSize * (object.lineHeight ?? 1.4) : Math.max(object.fontSize * (object.lineHeight ?? 1.4), lines.length * object.fontSize * (object.lineHeight ?? 1.4))
      const width = estimatedWidth / layerWidth * 100, height = estimatedHeight / layerHeight * 100
      const paddingX = Math.max(.8, width * .04), paddingY = Math.max(.8, height * .1)
      if (local.x >= object.x - paddingX && local.x <= object.x + width + paddingX && local.y >= object.y - paddingY && local.y <= object.y + height + paddingY) return object
    }
    return undefined
  }
  const movementDelta = (g: Gesture, event: React.PointerEvent<HTMLDivElement>): Point => {
    const point = clientPoint(event.clientX, event.clientY, false)
    const delta = { x: point.x - g.start.x, y: point.y - g.start.y }
    const axis = event.shiftKey ? Math.abs(delta.x * state.documentWidth) >= Math.abs(delta.y * state.documentHeight) ? 'x' : 'y' : null
    if (axis === 'x') delta.y = 0
    if (axis === 'y') delta.x = 0
    const r = g.moveBounds!
    const proposed = { x: (r.x + delta.x) * state.documentWidth / 100, y: (r.y + delta.y) * state.documentHeight / 100, width: r.width * state.documentWidth / 100, height: r.height * state.documentHeight / 100 }
    const snapped = snapBounds(g.snapIndex!, proposed, { zoomPercent: state.zoom, mode: 'move', altKey: event.altKey, enabled: state.guideSettings.snapEnabled, previous: g.snapHits })
    if (axis) delete snapped.hits[axis === 'x' ? 'y' : 'x']
    g.snapHits = snapped.hits; setSnapHits(snapped.hits)
    return { x: delta.x + (axis === 'y' ? 0 : snapped.rect.x - proposed.x) / state.documentWidth * 100, y: delta.y + (axis === 'x' ? 0 : snapped.rect.y - proposed.y) / state.documentHeight * 100 }
  }
  const update = (event: React.PointerEvent<HTMLDivElement>) => {
    const refine = refineGesture.current
    if (refine) {
      const point = clientPoint(event.clientX, event.clientY)
      const brush = refineBrushSelection(point)
      const mode = event.shiftKey ? (refine.mode === 'add' ? 'subtract' : 'add') : refine.mode
      const next = combineSelection(refine.selection, brush, mode)
      refine.selection = next
      onRefineSelectionChange?.(next)
      return
    }
    const text = textGesture.current
    if (text) {
      const point = clientPoint(event.clientX, event.clientY)
      const delta = { x: point.x - text.start.x, y: point.y - text.start.y }
      if (Math.abs(delta.x) + Math.abs(delta.y) > .5) text.moved = true
      if (text.moved) {
        const rect = drawSelectionRect(text.start, point)
        setTextPreview({ ...text.object, layout: 'paragraph', x: rect.x, y: rect.y, width: rect.width * state.documentWidth / 100, height: Math.max(20, rect.height * state.documentHeight / 100) })
      }
      return
    }
    const g = gesture.current; if (!g) return
    const documentPoint = clientPoint(event.clientX, event.clientY), tool = state.activeTool
    const point = isLayerTool(tool) && !['healing', 'remove-object', 'patch', 'clone-stamp', 'smudge'].includes(tool) ? localPoint(documentPoint) : documentPoint
    if (tool === 'pan' || tool === 'rotate') autoFit.current = false
    const delta = { x: point.x - g.start.x, y: point.y - g.start.y }
    if (delta.x || delta.y) g.points.push(point)
    if (tool === 'pan') dispatch({ type: 'set-canvas-offset', x: g.offset.x + event.clientX - g.client.x, y: g.offset.y + event.clientY - g.client.y })
    else if (tool === 'rotate') dispatch({ type: 'set-canvas-rotation', rotation: g.rotation + event.clientX - g.client.x })
    else if (g.moveTargets) {
      const moved = Math.hypot(event.clientX - g.client.x, event.clientY - g.client.y) >= 3
      const next = moved ? movementDelta(g, event) : { x: 0, y: 0 }
      setMovePreview({ targets: g.moveTargets, delta: next })
    }
    else if (g.stroke) {
      const input = pointerInput(event)
      const brushPoint = { ...point, ...input }
      g.stroke = tool === 'brush-line' ? { ...g.stroke, points: [g.stroke.points[0], brushPoint] } : appendBrushPoint(g.stroke, brushPoint)
      g.points.push(point)
      if (tool === 'mask' || tool === 'mask-quick') setMaskPreview({ ...(state.layerMasks[state.selectedLayerId] ?? { strokes: [], inverted: false, applied: false }), applied: false, strokes: [...(state.layerMasks[state.selectedLayerId]?.strokes ?? []), g.stroke] })
      else if (tool !== 'dodge' && tool !== 'burn') setStrokePreview(g.stroke)
    } else if (tool === 'mask-gradient') setMaskPreview({ strokes: [], inverted: false, applied: false, gradient: { from: g.start, to: point } })
    else if (tool === 'lasso-select' && pathRef.current) changePath(addAnchor(pathRef.current, point))
    else if ((tool === 'bezier-select' || tool === 'pen') && pathRef.current && g.pathIndex !== undefined) {
      let next = moveControl(pathRef.current, g.pathIndex, 'out', point)
      next = moveControl(next, g.pathIndex, 'in', { x: 2 * g.start.x - point.x, y: 2 * g.start.y - point.y }); changePath(next)
    } else if (g.shape) {
      g.shape = { ...g.shape, rect: drawSelectionRect(g.start, point, { ratio: event.shiftKey ? 1 : null, fromCenter: event.altKey, artboardRatio: g.shape.kind === 'gradient' ? (selectedLayer?.contentWidth ?? state.documentWidth) / (selectedLayer?.contentHeight ?? state.documentHeight) : state.documentWidth / state.documentHeight }), from: g.start, to: point }; setShapePreview(g.shape)
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
    const tool = state.activeTool
    if(tool==='transform'&&selectedObjects(state).length)return
    if (refineSelection && refineBrushMode && onRefineSelectionChange) {
      const point = clientPoint(event.clientX, event.clientY)
      const mode = event.shiftKey ? (refineBrushMode === 'add' ? 'subtract' : 'add') : refineBrushMode
      const next = combineSelection(refineSelection, refineBrushSelection(point), mode)
      refineGesture.current = { pointerId: event.pointerId, selection: next, mode: refineBrushMode }
      onRefineSelectionChange(next)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    if (event.target instanceof Element && event.target.closest('.object-handle')) return
    if (event.target instanceof Element && event.target.closest('.path-actions,.transform-actions,.transform-window,.perspective-handle,.path-point,.selection-handle')) return
    if (event.target instanceof Element && event.target.closest('.selection-overlay') && !['select', 'move', 'fill'].includes(tool)) return
    const documentPoint = clientPoint(event.clientX, event.clientY, !['select', 'move'].includes(tool))
    if ((tool === 'dodge' || tool === 'burn') && (!selectedLayer || !effectiveLayerState(state.layers, selectedLayer.id).visible || effectiveLayerState(state.layers, selectedLayer.id).locked)) return notice('目标图层不可见或已锁定，未写入色调笔触')
    if (tool === 'text') {
      const hit = hitTextAt(documentPoint)
      if (hit) {
        setSelectedTextId(hit.id)
        dispatch({ type: 'select-layer', id: hit.layerId })
        setTextEditingId(hit.id)
        return
      }
      const object = createTextObject(documentPoint, 'point')
      textGesture.current = { pointerId: event.pointerId, start: documentPoint, object, moved: false }
      setTextPreview(object)
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    const point = isLayerTool(tool) && !['healing', 'remove-object', 'patch', 'clone-stamp', 'smudge'].includes(tool) ? localPoint(documentPoint) : documentPoint
    if (tool === 'zoom') { zoom(state.zoom * (event.altKey ? .8 : 1.25)); return }
    if (tool === 'picker') { const svg = scene(); if (svg) void perform(async () => ({ type: 'set-brush-color', color: await sampleCanvasColor(svg, documentPoint.x, documentPoint.y) })); return }
    if (tool === 'magic-wand') { const svg = scene(); if (svg) void perform(async () => ({ type: 'commit-selection', selection: combineSelection(state.selectionVisible ? state.selection : null, await contiguousMagicSelection(svg, documentPoint, option('tolerance', 32)), state.selection.mode) }), undefined, () => setPreview(null)); return }
    if (tool === 'subject-select' || tool === 'mask-subject') {
      const service = canvasCloudServices().selectSubject
      if (!service) return notice('主体识别服务尚未配置，请在接入云端模型后使用')
      void perform(async () => { const selection = await service(serializeSvg(layerScene()).source); return { type: tool === 'mask-subject' ? 'selection-to-mask' : 'commit-selection', selection } }); return
    }
    if (tool === 'background-eraser') { void perform(async () => ({ type: 'rasterize-layer', id: state.selectedLayerId, source: await eraseBackground(layerScene(), documentPoint, option('tolerance', 32)) })); return }
    if ((tool === 'clone-stamp' || tool === 'patch') && event.altKey) { cloneSource.current = documentPoint; cloneAlignmentOrigin.current = null; notice('已设置仿制源，拖动画布开始仿制'); return }
    if (tool === 'clone-stamp' && !cloneSource.current) return notice('请先按住 Alt 点击画布设置仿制源')
    if (tool === 'fill') {
      const reason = toolUnavailableReason(state)
      if (reason) return notice(reason)
      if (state.selectionVisible && !selectionContains(state.selection.path, documentPoint)) return notice('点击位置不在当前选区内')
      const shape = fillShapeAt(state, documentPoint)
      if (shape) {
        dispatch({ type:'update-shape', shape:{...shape, color:state.brushColor, strokeColor:shape.strokeColor??shape.color, fillEnabled:true} })
        return
      }
      void perform(async () => {
        const svg = scene()
        if (!svg) throw new Error('画布尚未就绪')
        const ids = state.toolOptions.fillSampleScope === 'all' ? state.layers.filter(l=>effectiveLayerState(state.layers,l.id).visible).map(l=>l.id) : [state.selectedLayerId]
        const sampled = retouchScopeSvg(svg,state.layers,state.selectedLayerId,'current',ids)
        // The document background is not paint on a sampled layer.
        Array.from(sampled.children).filter(node=>node.tagName.toLowerCase()==='rect').forEach(node=>node.remove())
        const image = await rasterizeSvgPixels(sampled, processingAbort.current?.signal)
        const region = bucketSelection(image, documentPoint, option('fillTolerance',32), state.toolOptions.fillContiguous !== false, state.selectionVisible ? state.selection : undefined)
        if (!region.rect.width || !region.rect.height) throw new Error('点击区域没有可填充内容')
        return { type:'add-shape', shape:{ id:freshId(), layerId:state.selectedLayerId, kind:'fill', rect:fullRect, color:state.brushColor, opacity:option('opacity',100), strokeWidth:0, selection:selectionInLayer(state,region) } }
      }, '已填充点击区域，可撤销')
      return
    }
    if (tool === 'select' || tool === 'move') {
      const hit = hitMoveTarget(state, documentPoint, sourceHit)
      if (!hit) { setMoveTargets([]); setSelectedTextId(null); dispatch({ type: 'select-layers', ids: [] }); return }
      const targets = chooseMoveTargets(state, moveTargets, hit, event.shiftKey)
      setMoveTargets(targets)
      setSelectedTextId(targets.length === 1 && targets[0].kind === 'text' ? targets[0].id : null)

      // Shift-click toggles selection; dragging begins only on a still-selected target.
      if (!targets.length || event.shiftKey) return
      const bounds = moveTargetBounds(state, targets)
      if (!bounds) return
      gesture.current = { pointerId: event.pointerId, start: documentPoint, client: { x: event.clientX, y: event.clientY }, previous: state.selectionVisible ? state.selection : null, offset: { ...state.canvasOffset }, points: [documentPoint], rotation: state.canvasRotation, moveTargets: targets, moveBounds: bounds, snapIndex: moveSnapIndex(state, targets) }
      event.currentTarget.setPointerCapture?.(event.pointerId)
      return
    }
    const g: Gesture = { pointerId: event.pointerId, start: point, client: { x: event.clientX, y: event.clientY }, previous: state.selectionVisible ? state.selection : null, offset: { ...state.canvasOffset }, points: [point], rotation: state.canvasRotation }
    if (state.activeToolGroup === 'brush' || ['eraser', 'mask', 'mask-quick', 'healing', 'remove-object', 'clone-stamp', 'patch', 'dodge', 'burn'].includes(tool)) {
      g.stroke = createBrushStroke(freshId(), tool === 'eraser' ? 'erase' : tool === 'mask' || tool === 'mask-quick' || tool === 'healing' ? 'mask' : 'paint', state.selectedLayerId, { ...point, ...pointerInput(event) }, { ...brushSettings(), ...(['healing', 'remove-object', 'patch', 'clone-stamp', 'smudge', 'dodge', 'burn'].includes(tool) ? { size: option('size', 20) } : {}), ...(['dodge', 'burn'].includes(tool) ? { smoothing: 0 } : {}) })
      if (tool === 'mask' || tool === 'mask-quick') setMaskPreview({ ...(state.layerMasks[state.selectedLayerId] ?? { strokes: [], inverted: false, applied: false }), applied: false, strokes: [...(state.layerMasks[state.selectedLayerId]?.strokes ?? []), g.stroke] })
      else if (tool !== 'dodge' && tool !== 'burn') setStrokePreview(g.stroke)
    }
    if (tool === 'lasso-select') changePath(addAnchor({ kind: 'freehand', anchors: [], closed: false }, point))
    if (['polygon-select', 'bezier-select', 'pen'].includes(tool)) {
      const previous = pathRef.current?.closed ? null : pathRef.current
      const next = addAnchor(previous ?? { kind: tool === 'polygon-select' ? 'polygon' : 'bezier', anchors: [], closed: false }, point)
      changePath(next); g.pathIndex = next.anchors.length - 1
    }
    if (['shape', 'shape-ellipse', 'shape-line', 'shape-arrow', 'gradient-fill'].includes(tool)) {
      const gradient = tool === 'gradient-fill'
      if (unavailable || state.rasterPreviewOnly) return notice(unavailable ?? '当前文档为只读预览')
      g.shape = { id: freshId(), layerId: gradient ? state.selectedLayerId : freshId(), kind: tool === 'shape-ellipse' ? 'ellipse' : tool === 'shape-line' ? 'line' : tool === 'shape-arrow' ? 'arrow' : tool === 'gradient-fill' ? 'gradient' : 'rectangle', rect: { ...point, width: 0, height: 0 }, color: state.brushColor, opacity: option('opacity', 100), endColor: String(state.toolOptions.gradientEndColor ?? state.backgroundColor ?? '#ffffff'), strokeWidth: option('shapeStrokeWidth', 3) / (gradient ? sourcePixelScale : 1), strokeColor:String(state.toolOptions.shapeStrokeColor??state.brushColor), fillEnabled:state.toolOptions.shapeFillEnabled!==false, cornerRadii:tool==='shape'?[0,1,2,3].map(()=>option('shapeCornerRadius',0)) as [number,number,number,number]:undefined, selection: state.selectionVisible && tool === 'gradient-fill' ? localSelection(state.selection) : undefined }
    }
    gesture.current = g; event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const up = (event: React.PointerEvent<HTMLDivElement>) => {
    const text = textGesture.current
    if (text) {
      const point = clientPoint(event.clientX, event.clientY)
      const delta = { x: point.x - text.start.x, y: point.y - text.start.y }
      const moved = text.moved || Math.abs(delta.x) + Math.abs(delta.y) > .5
      const rect = drawSelectionRect(text.start, point)
      const object = moved ? { ...text.object, layout: 'paragraph' as const, x: rect.x, y: rect.y, width: Math.max(20, rect.width * state.documentWidth / 100), height: Math.max(20, rect.height * state.documentHeight / 100) } : text.object
      textGesture.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      setTextPreview(object)
      setSelectedTextId(object.id)
      setTextEditingId(object.id)
      return
    }
    if (refineGesture.current) {
      update(event)
      refineGesture.current = null
      event.currentTarget.releasePointerCapture?.(event.pointerId)
      return
    }
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
      else if (tool === 'remove-object') {
        setStrokePreview(null); void launchContentFill({points:g.points,size:g.stroke.size})
      } else if (tool === 'dodge' || tool === 'burn') {
        const stroke = g.stroke
        void perform(async () => {
          const ids = tonalSourceIds(state.layers, state.selectedLayerId)
          const svg = scene(); if (!svg) throw new Error('画布尚未就绪')
          // Keep the real ancestor geometry/visibility; explicit content IDs
          // prune unrelated siblings without turning the target's groups off.
          const image = await rasterizeSvgPixels(retouchScopeSvg(svg, state.layers, state.selectedLayerId, 'current', ids), processingAbort.current?.signal)
          const mask = state.selectionVisible ? rasterizeSelectionMask(state.selection, image.width, image.height) : undefined
          const result = tonalBrushPixels(image, stroke.points, { mode: tool, range: String(state.toolOptions.tonalRange ?? 'midtones') as TonalRange, exposure: option('exposure', 20), size: stroke.size, hardness: stroke.hardness, flow: option('flow', 30), protectTones: state.toolOptions.protectTones !== false, signal: processingAbort.current?.signal }, mask)
          if (!repairCoveragePath(image, result)) throw new Error('此笔触未改变像素，请检查作用范围、曝光量或透明区')
          const parentId = retouchParentId(state.layers, state.selectedLayerId, 'current')
          return { type: 'add-repair-layer', baseLayerId: state.selectedLayerId, baseUndoLength: state.undoStack.length, name: tool === 'dodge' ? '减淡 · 局部曝光' : '加深 · 局部曝光', preserveSourceAlpha: true, rootPlacement: !parentId, placementParentId: parentId, source: imageToPng(repairDeltaPixels(image, result)), repairCoverage: repairCoveragePath(image, result), repairSourceIds: ids }
        }, '局部曝光已加入独立层，可调不透明度、蒙版或撤销', undefined, true)
      } else if (tool === 'healing') {
        const region = pathSelection({ kind: 'freehand', anchors: g.points, closed: true })
        void perform(async () => {
          const service = canvasCloudServices().heal
          const scope = String(state.toolOptions.sampleScope ?? 'current') as SampleScope
          const svg = layerScene(scope)
          const image = await rasterizeSvgPixels(svg, processingAbort.current?.signal)
          if (service) {
            try {
              const source = await service(serializeSvg(svg).source, region)
              const resultSvg = svg.cloneNode(false) as SVGSVGElement
              const resultImage = document.createElementNS('http://www.w3.org/2000/svg', 'image')
              resultImage.setAttribute('href', source); resultImage.setAttribute('width', String(image.width)); resultImage.setAttribute('height', String(image.height)); resultSvg.append(resultImage)
              const result = await rasterizeSvgPixels(resultSvg, processingAbort.current?.signal)
              return { type: 'add-repair-layer', baseLayerId: state.selectedLayerId, baseUndoLength: state.undoStack.length, name: '修复结果', ...repairOutput(image, result) }
            } catch (error) { throw new Error(`远程修复服务失败：${error instanceof Error ? error.message : '网络不可用'}；未写入文档`) }
          }
          const healed = healPixels(image, g.points, { size: g.stroke!.size, opacity: g.stroke!.opacity, signal: processingAbort.current?.signal })
          return { type: 'add-repair-layer', baseLayerId: state.selectedLayerId, baseUndoLength: state.undoStack.length, name: '修复结果', ...repairOutput(image, healed) }
        }, '修复完成，已写入当前图层，可撤销')
      } else if (tool === 'patch') void perform(async () => {
        if (!cloneSource.current) throw new Error('请先按住 Alt 点击画布设置修补源')
        if (!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0) throw new Error('请先创建目标选区，再拖动修补工具')
        const image = await rasterizeSvgPixels(layerScene(String(state.toolOptions.sampleScope ?? 'current') as SampleScope), processingAbort.current?.signal)
        const drag = g.points.length > 1 ? g.points.at(-1)! : cloneSource.current!
        const destination = { ...state.selection.rect, x: state.selection.rect.x + (drag.x - g.points[0].x), y: state.selection.rect.y + (drag.y - g.points[0].y) }
        const source = { ...destination, x: cloneSource.current!.x - destination.width / 2, y: cloneSource.current!.y - destination.height / 2 }
        return { type: 'add-repair-layer', baseLayerId: state.selectedLayerId, baseUndoLength: state.undoStack.length, name: '修补结果', ...repairOutput(image, patchPixels(image, source, destination, option('feather', 12), processingAbort.current?.signal)) }
      }, '修补完成，可撤销')
      else if (tool === 'clone-stamp' || tool === 'smudge') void perform(async () => {
        const image = await rasterizeSvgPixels(layerScene(String(state.toolOptions.sampleScope ?? 'current') as SampleScope), processingAbort.current?.signal)
        if (tool === 'clone-stamp' && !cloneAlignmentOrigin.current) cloneAlignmentOrigin.current = g.points[0]
        const result = tool === 'clone-stamp' ? clonePixels(image, g.points, cloneSource.current!, g.stroke!.size, { opacity: g.stroke!.opacity, hardness: g.stroke!.hardness, aligned: Boolean(state.toolOptions.cloneAligned ?? true), alignmentOrigin: cloneAlignmentOrigin.current ?? undefined }) : smudgePixels(image, g.points, g.stroke!.size, g.stroke!.opacity)
        return { type: 'add-repair-layer', baseLayerId: state.selectedLayerId, baseUndoLength: state.undoStack.length, name: tool === 'clone-stamp' ? '仿制修复结果' : '涂抹修复结果', ...repairOutput(image, result) }
      })
      else if (['brush', 'gradient-brush', 'pencil', 'soft-brush', 'brush-line', 'eraser'].includes(tool) && state.layers.find((layer) => layer.id === state.selectedLayerId)?.source && state.layers.find((layer) => layer.id === state.selectedLayerId)?.source !== 'fixture' && !state.layers.find((layer) => layer.id === state.selectedLayerId)?.transform) {
        const stroke = g.stroke
        void perform(async () => {
          const image = await rasterizeSvgPixels(layerScene(), processingAbort.current?.signal)
          const mask = state.selectionVisible ? rasterizeSelectionMask(localSelection(state.selection), image.width, image.height) : undefined
          return { type: 'rasterize-layer', id: state.selectedLayerId, source: imageToPng(paintBrushStroke(image, stroke, mask)) }
        }, tool === 'eraser' ? '已擦除当前图层像素，可撤销' : '已绘制到当前图层像素，可撤销')
      } else dispatch({ type: 'commit-brush-stroke', stroke: g.stroke })
      setStrokePreview(null); setMaskPreview(null)
    }
    if (tool === 'mask-gradient') { dispatch({ type: 'commit-mask', mask: { strokes: [], inverted: false, applied: false, gradient: { from: g.start, to: localPoint(clientPoint(event.clientX, event.clientY)) } } }); setMaskPreview(null) }
    if (tool === 'lasso-select' && pathRef.current) {
      const closed = closePath(pathRef.current)
      if (closed.closed) commitSelection(combineSelection(g.previous, pathSelection(closed, state.selection), state.selection.mode))
      changePath(null)
    }
    if (g.shape) {
      setShapePreview(null)
      if (g.shape.rect.width > .1 || g.shape.rect.height > .1) {
        if (g.shape.kind === 'gradient') dispatch({ type: 'add-shape', shape: { ...g.shape, rect: fullRect } })
        else dispatch({ type: 'create-shape-layer', shape: g.shape })
      }
    }
    if (g.moveTargets) {
      const moved = Math.hypot(event.clientX - g.client.x, event.clientY - g.client.y) >= 3
      if (moved) dispatch({ type: 'move-canvas-targets', targets: g.moveTargets, delta: movementDelta(g, event) })
      setMovePreview(null); setSnapHits({})
    }
  }
  return <section ref={canvasMenuAnchor} data-canvas-context-menu onContextMenu={event=>{if((event.target as Element).closest('input,textarea,select,[contenteditable="true"],[role="textbox"],button,[role="menu"],.ai-composer')&&!(event.target as Element).closest('.selection-overlay')){setFillMenu(null);return}if(!busy&&!refineSelection){event.preventDefault();event.stopPropagation();setFillMenu({x:event.clientX,y:event.clientY})}}} className="canvas-area" aria-label="主画布" aria-busy={busy} onWheel={(event) => { if (event.ctrlKey) { event.preventDefault(); zoom(state.zoom * Math.exp(-event.deltaY * .003)) } }} onTouchStart={(event) => { if (event.touches.length === 2) { cancel(); pinchStart.current = { distance: distance(event.touches), zoom: state.zoom } } }} onTouchMove={(event) => { if (pinchStart.current && event.touches.length === 2) { event.preventDefault(); zoom(pinchStart.current.zoom * distance(event.touches) / pinchStart.current.distance) } }} onTouchEnd={() => { pinchStart.current = null }} onTouchCancel={() => { pinchStart.current = null }}>
    {fillMenu ? <CanvasSelectionMenu anchor={canvasMenuAnchor.current} x={fillMenu.x} y={fillMenu.y} onClose={closeSelectionMenu} onContentFill={()=>void launchContentFill()} onCopySelection={copySelection} onRefine={onOpenSelectionRefine}/> : null}
    <SemanticSelectionWorkspace />
    {fillSession ? <ContentFillWorkspace key={`${fillSession.documentId}-${fillSession.revision}`} image={fillSession.image} source={fillSession.source} initialTarget={fillSession.target} onConfirm={confirmContentFill} onCancel={()=>setFillSession(null)}/> : null}
    {isRoundBrush(state.activeToolId) && !unavailable && !busy ? createPortal(<div ref={brushRingRef} className="brush-cursor-ring" style={{width:Math.max(1,option('size',20)*state.zoom/100),height:Math.max(1,option('size',20)*state.zoom/100)}}/>,document.body):null}
    <div className="canvas-grid" />
    {state.guideSettings.rulersVisible ? <RulerOverlay offset={state.canvasOffset} anchorRef={artboardRef} width={state.documentWidth} height={state.documentHeight} zoom={state.zoom} toPoint={(x, y) => clientPoint(x, y, false)} onCreate={(axis, position) => dispatch({ type: 'update-guide-settings', action: { type: 'add', guide: { id: freshId(), axis, position, locked: false } } })} /> : null}
    <div ref={artboardRef} className="artboard" data-active-tool={state.activeTool} style={{ width: state.documentWidth * crop.width / 100, maxWidth: 'none', flexShrink: 0, aspectRatio: `${state.documentWidth * crop.width}/${state.documentHeight * crop.height}`, transform: `translate(${state.canvasOffset.x}px,${state.canvasOffset.y}px) scale(${state.zoom / 100}) rotate(${state.canvasRotation}deg)` }} onPointerDown={down} onPointerMove={event=>{showBrushRing(event);update(event)}} onPointerLeave={()=>{if(brushRingRef.current)brushRingRef.current.style.display='none'}} onPointerUp={up} onPointerCancel={cancel} onDoubleClick={() => { if (pathRef.current) changePath(closePath(pathRef.current)) }}>
      <div className="canvas-crop-window"><div className="canvas-document" style={{ width: `${10000 / crop.width}%`, height: `${10000 / crop.height}%`, left: `${-crop.x / crop.width * 100}%`, top: `${-crop.y / crop.height * 100}%` }}>
        {filterPreview ? <div hidden><CanvasSceneView state={state} serializationOnly /></div> : null}
        <CanvasSceneView renderStatusTarget={canvasMenuAnchor} filterPreview={!!filterPreview} curveDraftBase={curveDraft ? { layerId: curveDraft.layerId, adjustments: { ...neutralAdjustments, ...state.layers.find(layer=>layer.id === curveDraft.layerId)?.adjustments } } : undefined} state={filterSceneState} strokePreview={strokePreview} shapePreview={shapePreview} maskPreview={maskPreview} editingTextId={textEditingId} textObjectPreview={textObjectPreview} transformPreview={movingLayerId ? { layerId: movingLayerId, draft: sceneState.layers.find(l => l.id === movingLayerId)!.transform ?? defaultTransform() } : transform?.kind === 'transform' ? { layerId: state.selectedLayerId, draft: transform } : null} />
        <div className="artboard-label-overlay" data-artboard-overlay="true" data-editor-overlay="true" style={{position:'absolute',inset:0,border:'1px dashed #7c8cff',pointerEvents:'none'}}><span style={{position:'absolute',left:8,bottom:'100%',color:'#7c8cff',fontSize:12,whiteSpace:'nowrap'}}>{state.artboards.find(board => board.id === state.activeArtboardId)?.name ?? '画板'} · {state.documentWidth}×{state.documentHeight}</span></div>
        {refineSelection && refinePreviewMode && !refinePreviewAlpha ? <SelectionRefinePreview selection={refineSelection} mode={refinePreviewMode} /> : null}
        {refinePreviewAlpha && refinePreviewMode ? <SelectionRefinePixelPreview preview={refinePreviewAlpha} mode={refinePreviewMode} /> : null}
        <div className="canvas-interaction" aria-label="画布交互层" style={{cursor}} />
        {!path && !transform && !quad && state.activeTool !== 'text' && !textEditingId && (state.selectionVisible || preview) ? <SelectionOverlay selection={preview ?? state.selection} clientPoint={clientPoint} onPreview={setPreview} onCommit={commitSelection} onCancel={() => setPreview(null)} interactive={selectionInteractive && !refineSelection} movable={state.selection.mode === 'new'} /> : null}
        {path ? <PathOverlay path={path} onChange={changePath} toPoint={clientPoint} onConvert={() => convertPath()} onMask={() => convertPath(true)} /> : null}
        {Object.keys(snapHits).length ? <div aria-label="吸附辅助线" data-export-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 24 }}>{(['x','y'] as const).map(axis => { const hit = snapHits[axis]; return hit ? <div key={axis} style={{ position: 'absolute', ...(axis === 'x' ? { left: `${hit.position / state.documentWidth * 100}%`, top: 0, bottom: 0, borderLeft: '1px solid #ed77ff' } : { top: `${hit.position / state.documentHeight * 100}%`, left: 0, right: 0, borderTop: '1px solid #ed77ff' }) }}><span style={{ color: '#ed77ff', fontSize: 10 }}>{Math.abs(hit.correction).toFixed(1)} px</span></div> : null })}</div> : null}
        <GuideOverlay settings={state.guideSettings} width={state.documentWidth} height={state.documentHeight} toPoint={(x, y) => clientPoint(x, y, false)} onMove={(id, position) => dispatch({ type: 'update-guide-settings', action: { type: 'move', id, position } })} onDelete={(id) => dispatch({ type: 'update-guide-settings', action: { type: 'delete', id } })} />
        {['select', 'move'].includes(state.activeTool) && movementBounds && !textEditingId && !selectedShape ? <div data-editor-overlay="true" aria-label="已选对象边框" style={{ position: 'absolute', pointerEvents: 'none', left: `${movementBounds.x}%`, top: `${movementBounds.y}%`, width: `${movementBounds.width}%`, height: `${movementBounds.height}%`, border: '1px solid #a79bff', zIndex: 4 }} /> : null}
        {transform ? <TransformOverlay draft={transform} interactive={!['select','move'].includes(state.activeTool)} onChange={setTransform} onCommit={commitTransform} onCancel={finishTransform} toPoint={clientPoint} artboardRatio={state.documentWidth / state.documentHeight} snapDraft={(draft, handle, altKey, previous) => { const result = snapLayerTransform(state, state.selectedLayerId, draft, transformSnapIndex, handle, altKey, previous); setSnapHits(result.hits); return result }} onGestureEnd={() => setSnapHits({})} /> : null}
        {quad ? <PerspectiveOverlay quad={quad} onChange={setQuad} toPoint={clientPoint} onCommit={commitPerspective} onCancel={() => setQuad(null)} /> : null}
        {selectedShape&&!objectLocked(state,selectedShape.layerId)&&['select','move','shape','shape-ellipse','shape-line','shape-arrow','pen','transform'].includes(state.activeTool)&&!transform?<div style={textLayerStyle(selectedShape.layerId)}><ObjectTransformOverlay key={`${documentId}-${selectedShape.id}`} shape={selectedShape} width={state.layers.find(l=>l.id===selectedShape.layerId)?.contentWidth??state.documentWidth} height={state.layers.find(l=>l.id===selectedShape.layerId)?.contentHeight??state.documentHeight} zoom={state.zoom} toPoint={(x,y)=>documentPointToLayerLocal(state.layers,selectedShape.layerId,clientPoint(x,y,false),state.documentWidth,state.documentHeight)} onPreview={setObjectShapePreview} onCommit={shape=>dispatch({type:'update-canvas-objects',shapes:[shape]})} editPath={state.activeTool==='pen'}/></div>:null}
        {['text', 'select', 'move','transform'].includes(state.activeTool) ? sceneState.canvasTexts.filter((object) => object.id !== textPreview?.id && effectiveLayerState(state.layers, object.layerId).visible && !effectiveLayerState(state.layers, object.layerId).locked).map((object) => <div key={object.id} style={textLayerStyle(object.layerId)}><TextObject delegateMove={state.activeTool !== 'text'} moving={!!movePreview && movePreview.targets.some(t => t.kind === 'text' && t.id === object.id) && Math.abs(movePreview.delta.x) + Math.abs(movePreview.delta.y) > .01} object={object} selected={selectedTextId === object.id || editableSelection.length===1&&editableSelection[0].kind==='text'&&editableSelection[0].object.id===object.id} autoEdit={textEditingId === object.id} editOnClick={state.activeTool !== 'move' && moveTargets.length <= 1} allowMoveOnSelect onPreview={setTextObjectPreview} onEditStart={() => {setTextEditingId(object.id);setMoveTargets([{kind:'text',id:object.id,layerId:object.layerId}])}} onEditEnd={() => setTextEditingId(null)} onSelect={() => { setSelectedTextId(object.id); setMoveTargets([{ kind: 'text', id: object.id, layerId: object.layerId }]) }} onCommit={(next) => dispatch({ type: 'upsert-text', object: next })} toPoint={(x, y) => documentPointToLayerLocal(sceneState.layers, object.layerId, clientPoint(x, y, false), state.documentWidth, state.documentHeight)} documentWidth={state.layers.find(l => l.id === object.layerId)?.contentWidth ?? state.documentWidth} documentHeight={state.layers.find(l => l.id === object.layerId)?.contentHeight ?? state.documentHeight} /></div>) : null}
        {textPreview ? <div className="canvas-text-preview" style={textLayerStyle(textPreview.layerId)}><TextObject key={textPreview.id} object={textPreview} selected autoEdit={textEditingId === textPreview.id} onCommit={(object) => { if (object.text.trim()) dispatch({ type: 'create-text-layer', object }) }} onEditEnd={() => { setTextPreview((current) => current?.id === textPreview.id ? null : current); setTextEditingId((current) => current === textPreview.id ? null : current) }} toPoint={clientPoint} documentWidth={state.documentWidth} documentHeight={state.documentHeight} /></div> : null}
      </div></div>
    </div>
    <ResultStage />
    {state.composerPlacement === 'floating' ? <AIComposer /> : null}
    <div className="canvas-hint" style={{left:state.guideSettings.rulersVisible?rulerWidth+12:18}}>{busy ? '正在处理画布…' : toolHint(state)}</div>{pendingRepair ? <FloatingSurface className="retouch-confirm" role="dialog" aria-label="确认修复结果" title="确认修复结果" onClose={cancelRepair}><span>{pendingRepair.name}已准备好，确认加入独立修复层？</span><button type="button" onClick={confirmRepair}>确认</button><button type="button" onClick={cancelRepair}>取消</button></FloatingSurface> : null}
    <div className={`zoom-control ${state.activeTool === 'rotate' ? 'is-rotate-control' : ''}`}>
      <GuideControls disabled={busy} />
      {state.activeTool === 'rotate' ? <>
        <span className="canvas-rotation-readout">画布旋转 {Math.round(state.canvasRotation)}°</span>
        <button disabled={busy} aria-label="逆时针旋转 15°" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: state.canvasRotation - 15 })}>↺</button>
        <button disabled={busy} aria-label="顺时针旋转 15°" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: state.canvasRotation + 15 })}>↻</button>
        <button disabled={busy} aria-label="重置画布旋转" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: 0 })}>重置</button>
      </> : null}
      <button disabled={busy} className="canvas-action-button" aria-label="撤销" onClick={() => { cancel(); dispatch({ type: 'undo' }) }}>↶</button><button disabled={busy} className="canvas-action-button" aria-label="重做" onClick={() => { cancel(); dispatch({ type: 'redo' }) }}>↷</button><span className="zoom-divider" aria-hidden="true" /><button disabled={busy} aria-label="缩小" onClick={() => zoom(state.zoom - 10)}>−</button><span>{Math.round(state.zoom)}%</span><button disabled={busy} aria-label="放大" onClick={() => zoom(state.zoom + 10)}>＋</button><button disabled={busy} aria-label="适应画布" onClick={() => fitToViewport(true)}>适应</button>
    </div>
  </section>
}
