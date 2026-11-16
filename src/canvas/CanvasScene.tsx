import { requiresCpuSmartFilters } from '../render/filterPipeline'
import { SmartFilterGraph } from '../render/SmartFilterGraph'
import { effectPadding } from '../render/layerEffects'
import { LayerEffectsFilter } from '../render/LayerEffectsFilter'
import { adjustmentPipeline } from '../imaging/layerAdjustments'
import { resolveBlendMode } from '../render/blendModes'
import { clippingSiblings } from '../state/clipping'
import { layerWorldPixelMatrix, isPixelAlignedUnitMatrix } from './layerWorldMatrix'
import { invertMatrix, layerMatrix, type AffineMatrix } from './layerCoordinates'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { memo, useId, useEffect, useRef, useState, useMemo, type ReactNode } from 'react'
import { materializeColorAdjustments, exportSvgImage } from '../render/exportImage'
import { renderSoftProof, type SoftProofReport } from '../color/softProof'
import { defaultHsl, defaultColorBalance } from '../adjustments/hsl'
import type { EditorState, Layer } from '../state/editor'
import { BrushScene } from './BrushScene'
import { AdjustmentFilter } from './AdjustmentFilter'
import type { BrushStroke } from './BrushEngine'
import { CanvasFixtureContent } from './CanvasFixture'
import type { CanvasShape, LayerMask } from './documentTypes'
import { MaskDefinitions, MaskOverlay } from './MaskOverlay'
import type { CanvasTextObject } from './TextObject'
import type { TransformDraft } from './TransformOverlay'
import { normalizeFontFamily } from '../text/systemFonts'
import { wrapParagraphLines } from '../text/paragraphLayout'
import { pathToSvg } from '../vector/pathGeometry'
import { smartObjectState, validateSmartObjectGraph } from '../document/smartObjects'

export function stripSoftProofOverlay(source: string): string {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  doc.querySelectorAll('[data-soft-proof]').forEach(node => node.remove())
  return new XMLSerializer().serializeToString(doc.documentElement)
}

export type CanvasSceneProps = {
  state: EditorState
  thumbnail?: boolean
  editingTextId?: string | null
  textObjectPreview?: CanvasTextObject | null
  strokePreview?: BrushStroke | null
  shapePreview?: CanvasShape | null
  transformPreview?: { layerId: string; draft: TransformDraft } | null
  maskPreview?: LayerMask | null
}

/** Maps the untransformed document into a layer's percentage bounds. */
export function layerTransformValue(transform?: TransformDraft, width = 500, height = 625, contentWidth = width, contentHeight = height): string | undefined {
  if (!transform) return contentWidth === width && contentHeight === height ? undefined : `scale(${width / contentWidth} ${height / contentHeight})`
  if (transform.affine) {
    const [a,b,c,d,e,f] = transform.affine
    return `matrix(${a} ${b*height/width} ${c*width/height} ${d} ${e*width/100} ${f*height/100}) ${layerTransformValue({ ...transform, affine: undefined },width,height,contentWidth,contentHeight)}`
  }
  const { rect, rotation, flipX, flipY } = transform
  const cx = (rect.x + rect.width / 2) * width / 100
  const cy = (rect.y + rect.height / 2) * height / 100
  return `translate(${cx} ${cy}) rotate(${rotation}) scale(${rect.width / 100 * width / contentWidth * (flipX ? -1 : 1)} ${rect.height / 100 * height / contentHeight * (flipY ? -1 : 1)}) translate(${-contentWidth / 2} ${-contentHeight / 2})`
}

function Shape({ shape, width: canvasWidth, height: canvasHeight }: { shape: CanvasShape; width: number; height: number }) {
  const id = `shape-${useId().replaceAll(':', '')}`
  const { rect } = shape
  const x = rect.x * canvasWidth / 100, y = rect.y * canvasHeight / 100, width = rect.width * canvasWidth / 100, height = rect.height * canvasHeight / 100
  const from = shape.from ?? { x: rect.x, y: rect.y }
  const to = shape.to ?? { x: rect.x + rect.width, y: rect.y + rect.height }
  const x1 = from.x * canvasWidth / 100, y1 = from.y * canvasHeight / 100, x2 = to.x * canvasWidth / 100, y2 = to.y * canvasHeight / 100
  let geometry: ReactNode
  if (shape.kind === 'ellipse') geometry = <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} fill={shape.color} />
  else if (shape.kind === 'line' || shape.kind === 'arrow') {
    const length = Math.hypot(x2 - x1, y2 - y1)
    const ux = length ? (x2 - x1) / length : 1, uy = length ? (y2 - y1) / length : 0
    const head = Math.min(length / 2, shape.strokeWidth * 3 + 8)
    geometry = <>
      <path d={`M ${x1} ${y1} L ${x2} ${y2}`} fill="none" stroke={shape.color} strokeWidth={shape.strokeWidth} strokeLinecap="round" />
      {shape.kind === 'arrow' && length > 0 ? <polygon points={`${x2},${y2} ${x2 - head * ux + head / 2 * uy},${y2 - head * uy - head / 2 * ux} ${x2 - head * ux - head / 2 * uy},${y2 - head * uy + head / 2 * ux}`} fill={shape.color} /> : null}
    </>
  } else if (shape.kind === 'path' && shape.path) geometry = <path transform={`scale(${canvasWidth / 100} ${canvasHeight / 100})`} d={pathToSvg(shape.path)} fillRule={shape.path.fillRule} fill={shape.fillEnabled===false?'none':shape.color} stroke={shape.strokeColor??shape.color} strokeWidth={shape.strokeWidth} strokeDasharray={shape.dashArray} strokeLinecap={shape.strokeLineCap??'round'} strokeLinejoin={shape.strokeLineJoin??'round'} vectorEffect={shape.scaleStroke===false?'non-scaling-stroke':undefined} />
  else if (shape.kind === 'boolean' && shape.boolean) {
    const b = shape.boolean, left = pathToSvg(b.left), right = pathToSvg(b.right)
    const maskId = `${id}-boolean`
    geometry = <g transform={`scale(${canvasWidth / 100} ${canvasHeight / 100})`}><defs><mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100"><path d={left} fill="white" fillRule={b.left.fillRule} />{b.mode === 'difference' ? <path d={right} fill="black" fillRule={b.right.fillRule} /> : b.mode === 'intersect' ? <><rect width="100" height="100" fill="black" /><path d={right} fill="white" fillRule={b.right.fillRule} /></> : null}</mask></defs>{b.mode === 'union' ? <><path d={left} fill={shape.color} fillRule={b.left.fillRule} /><path d={right} fill={shape.color} fillRule={b.right.fillRule} /></> : b.mode === 'exclude' ? <path d={`${left} ${right}`} fill={shape.color} fillRule="evenodd" /> : <path d={left} fill={shape.color} fillRule={b.left.fillRule} mask={`url(#${maskId})`} />}</g>
  }
  else geometry = <rect x={x} y={y} width={width} height={height} fill={shape.kind === 'gradient' ? `url(#${id}-gradient)` : shape.color} />
  return <g data-shape={shape.id} opacity={(shape.opacity ?? 100) / 100} mask={shape.selection ? `url(#${id}-selection)` : undefined}>
    {geometry}
    <defs>
      {shape.selection ? MaskDefinitions({ selection: shape.selection, strokes: [], inverted: false, applied: true }, `${id}-selection`, canvasWidth, canvasHeight) : null}
      {shape.kind === 'gradient' ? <linearGradient id={`${id}-gradient`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}><stop stopColor={shape.color} /><stop offset="1" stopColor={shape.endColor ?? '#ffffff'} /></linearGradient> : null}
    </defs>
  </g>
}

function SceneText({ object, width, height, hidden }: { object: CanvasTextObject; width: number; height: number; hidden?: boolean }) {
  const x = object.x * width / 100, y = object.y * height / 100
  const boxWidth = object.width ?? 160
  const anchorOffset = object.layout === 'paragraph' ? object.align === 'center' ? boxWidth / 2 : object.align === 'right' ? boxWidth : 0 : 0
  const anchorX = x + anchorOffset
  const letterSpacing = object.letterSpacing ?? 0
  const lines = object.layout === 'paragraph' ? wrapParagraphLines(object.text, boxWidth, object.fontSize, letterSpacing, object) : object.text.split('\n')
  const overflow = object.layout === 'paragraph' && object.height !== undefined && lines.length * object.fontSize * (object.lineHeight ?? 1.4) > object.height + 0.5
  let offset=0
  const styled=(line:string)=>{const start=offset;offset+=line.length;const pieces=[];let cursor=0;for(const run of object.runs??[]){const a=Math.max(0,run.start-start),b=Math.min(line.length,run.end-start);if(b<=a)continue;if(a>cursor)pieces.push(<tspan key={`${start}-${cursor}`} >{line.slice(cursor,a)}</tspan>);pieces.push(<tspan key={`${start}-${a}`} fill={run.color??object.color} fontFamily={run.fontFamily?normalizeFontFamily(run.fontFamily):undefined} fontSize={run.fontSize} fontWeight={run.fontWeight} stroke={run.stroke} paintOrder={run.stroke ? 'stroke' : 'normal'}>{line.slice(a,b)}</tspan>);cursor=b}if(cursor<line.length)pieces.push(<tspan key={`${start}-${cursor}-tail`}>{line.slice(cursor)}</tspan>);offset+=1;return pieces.length?pieces:line||' '}
  return <text data-text={object.id} data-text-overflow={overflow ? 'true' : undefined} data-editor-hidden={hidden ? 'true' : undefined} x={anchorX} y={y} fill={object.color} fontFamily={normalizeFontFamily(object.fontFamily)} fontSize={object.fontSize} fontWeight={object.fontWeight} letterSpacing={letterSpacing} textAnchor={object.align === 'center' ? 'middle' : object.align === 'right' ? 'end' : 'start'} dominantBaseline="hanging" xmlSpace="preserve" transform={object.rotation ? `rotate(${object.rotation} ${x} ${y})` : undefined}>
    {lines.map((line, index) => <tspan key={index} x={anchorX} dy={index === 0 ? 0 : object.fontSize * (object.lineHeight ?? 1.4)}>{object.runs?.length ? styled(line) : (line || ' ')}</tspan>)}
  </text>
}


function repairMaskMatrix(state: EditorState, layer: Layer, cancelParents = false): AffineMatrix {
  if (layer.documentSpace && !cancelParents) return [1, 0, 0, 1, 0, 0]
  const chain: Layer[] = []; const seen = new Set<string>(); let current: Layer | undefined = layer
  while (current && !seen.has(current.id)) { seen.add(current.id); chain.unshift(current); current = state.layers.find(item => item.id === layerParentId(state.layers, current!.id)) }
  const multiply = (a: AffineMatrix, b: AffineMatrix): AffineMatrix => [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]]
  let matrix: AffineMatrix = [1, 0, 0, 1, 0, 0]
  for (const item of chain) {
    const w = state.documentWidth, h = state.documentHeight, cw = item.contentWidth ?? w, ch = item.contentHeight ?? h
    const m = item.transform ? layerMatrix(item.transform, w, h) : [1, 0, 0, 1, 0, 0]
    matrix = multiply(matrix, [m[0]*w/cw, m[1]*h/cw, m[2]*w/ch, m[3]*h/ch, m[4]*w/100, m[5]*h/100])
  }
  return invertMatrix(matrix)
}

function repairMaskTransform(state: EditorState, layer: Layer, cancelParents = false): string { return `matrix(${repairMaskMatrix(state,layer,cancelParents).join(' ')})` }

function SceneLayer({ layer, state, strokePreview, shapePreview, transformPreview, maskPreview, editingTextId, textObjectPreview, children, maskOnly, suppressBlend, opaqueSource }: CanvasSceneProps & { layer: Layer; children?: ReactNode; maskOnly?: boolean; suppressBlend?: boolean; opaqueSource?: boolean }) {
  const id = `layer-mask-${useId().replaceAll(':', '')}`
  const width = layer.contentWidth ?? state.documentWidth, height = layer.contentHeight ?? state.documentHeight
  const transform = transformPreview?.layerId === layer.id ? transformPreview.draft : layer.transform
  const mask = layer.id === state.selectedLayerId && maskPreview ? maskPreview : state.layerMasks[layer.id]
  const smartSource = layer.smartObject ? state.smartObjectSources?.[layer.smartObject.sourceId] : undefined
  let smartValid = false
  if (smartSource) { try { validateSmartObjectGraph(state.smartObjectSources, smartSource.id); smartValid = true } catch { /* Invalid sources are rejected on import and mutation; never recurse here. */ } }
  const strokes = layer.smartObject ? [] : [...state.brushStrokes, ...(strokePreview ? [strokePreview] : [])].filter((stroke) => stroke.layerId === layer.id)
  const shapes = layer.smartObject ? [] : [...state.canvasShapes, ...(shapePreview ? [shapePreview] : [])].filter((shape) => shape.layerId === layer.id && !shape.hidden)
  const objects = [
    ...shapes.map((shape) => ({ id: shape.id, node: <Shape key={shape.id} shape={shape} width={width} height={height} /> })),
    ...state.canvasTexts.filter((object) => !layer.smartObject && object.layerId === layer.id).map((object) => ({ id: object.id, node: <SceneText key={object.id} object={textObjectPreview?.id === object.id ? textObjectPreview : object} width={width} height={height} hidden={editingTextId === object.id} /> })),
  ]
  const repairs = state.layers.filter(item => !item.preserveSourceAlpha && item.repairCoverage && item.repairSourceIds?.includes(layer.id) && effectiveLayerState(state.layers, item.id).visible)
  const replacementMaskId = `${id}-repair-replacement`
  // Mask backgrounds must cover the viewport, beyond transformed source edges.
  // A mask ending at the source edge applies its antialias coverage a second time.
  const maskMatrix = repairs.length ? repairMaskMatrix(state, layer) : [1,0,0,1,0,0]
  const corners = [[0,0],[state.documentWidth,0],[0,state.documentHeight],[state.documentWidth,state.documentHeight]].map(([x,y])=>({x:maskMatrix[0]*x+maskMatrix[2]*y+maskMatrix[4],y:maskMatrix[1]*x+maskMatrix[3]*y+maskMatrix[5]}))
  const maskX=Math.min(0,...corners.map(p=>p.x))-2, maskY=Math.min(0,...corners.map(p=>p.y))-2
  const maskWidth=Math.max(width,...corners.map(p=>p.x))-maskX+2, maskHeight=Math.max(height,...corners.map(p=>p.y))-maskY+2
  const base = layer.smartObject ? smartValid && smartSource ? <svg width={width} height={height} viewBox={`0 0 ${smartSource.width} ${smartSource.height}`} data-smart-source={smartSource.id} data-smart-revision={smartSource.revision}><CanvasScene thumbnail state={smartObjectState(state, smartSource)} /></svg> : <text fill="#ff5d5d" fontSize="14">智能对象源内容缺失</text> : layer.source === 'fixture' ? <g transform={`scale(${width / 500} ${height / 625})`}><CanvasFixtureContent /></g> : layer.source ? <image filter={opaqueSource ? `url(#${id}-opaque-source)` : undefined} imageRendering={layer.sourceInterpolation==='nearest' || layer.documentSpace || layer.mergeBatchId && isPixelAlignedUnitMatrix(layerWorldPixelMatrix(transformPreview ? state.layers.map(item => item.id === transformPreview.layerId ? {...item,transform:transformPreview.draft} : item) : state.layers,layer.id,state.documentWidth,state.documentHeight)) ? 'optimizeSpeed' : undefined} href={layer.source} width={width} height={height} preserveAspectRatio="xMidYMid meet" /> : null
  const order = [...state.sceneOrder, ...(strokePreview ? [strokePreview.id] : []), ...(shapePreview ? [shapePreview.id] : [])]
  const adjustments = layer.adjustments
  const filterId = adjustments && adjustmentPipeline(adjustments) ? `${id}-adjustments` : undefined
  const effectsId=layer.effects?.items.some(effect=>effect.enabled)?`${id}-effects`:undefined
  return <g data-effect-padding={layer.effects?effectPadding(layer.effects):undefined} data-warp-recipe={layer.warpRecipe ? JSON.stringify(layer.warpRecipe) : undefined} className={maskOnly ? undefined : "scene-layer"} data-layer-id={maskOnly ? undefined : layer.id} opacity={layer.opacity / 100} style={{ mixBlendMode: suppressBlend ? 'normal' : resolveBlendMode(layer.blendMode), isolation: children ? 'isolate' : undefined }} filter={effectsId?`url(#${effectsId})`:undefined}>{effectsId?<defs><LayerEffectsFilter id={effectsId} effects={layer.effects!} width={state.documentWidth} height={state.documentHeight}/></defs>:null}<g filter={filterId ? `url(#${filterId})` : undefined}>
    {layer.contentFill ? <metadata data-content-fill={layer.id}>{JSON.stringify(layer.contentFill)}</metadata> : null}
    {filterId ? <defs><AdjustmentFilter compareOriginal={state.curvePreviewOffLayerId===layer.id} id={filterId!} adjustments={adjustments} width={width} height={height} /></defs> : null}
    <g data-layer-transform={layer.id} transform={layer.documentSpace ? repairMaskTransform(state, layer, true) : layerTransformValue(transform, state.documentWidth, state.documentHeight, width, height)}>
      <defs>{opaqueSource ? <filter id={`${id}-opaque-source`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer></filter> : null}{mask?.applied ? MaskDefinitions(mask, id, width, height) : null}</defs>
      <g data-layer-mask={layer.id} mask={mask?.applied ? `url(#${id})` : undefined}>
        {repairs.length ? <defs><mask id={replacementMaskId} maskUnits="userSpaceOnUse" x={maskX} y={maskY} width={maskWidth} height={maskHeight} style={{ maskType: 'luminance' }}><rect x={maskX} y={maskY} width={maskWidth} height={maskHeight} fill="white" />{repairs.map(repair => {
          // Only suppress source pixels where the replacement's own mask retains them.
          const repairMask = repair.id === state.selectedLayerId && maskPreview ? maskPreview : state.layerMasks[repair.id]
          const repairMaskId = `${replacementMaskId}-${repair.id}-coverage`
          return <g key={repair.id} data-repair-id={repair.id} transform={repairMaskTransform(state, layer)}>{repairMask?.applied ? <defs>{MaskDefinitions(repairMask, repairMaskId, state.documentWidth, state.documentHeight)}</defs> : null}<path d={repair.repairCoverage} fill="black" opacity={repair.opacity / 100} mask={repairMask?.applied ? `url(#${repairMaskId})` : undefined} /></g>
        })}</mask></defs> : null}
        <SmartFilterGraph chain={layer.smartFilters} width={width} height={height}><g mask={repairs.length ? `url(#${replacementMaskId})` : undefined}><BrushScene strokes={strokes} baseByLayer={{ [layer.id]: base }} objectsByLayer={{ [layer.id]: objects }} order={order} width={width} height={height} /></g>{children}</SmartFilterGraph>
      </g>
    </g>
  </g></g>
}

/** Pointer previews leave document state immutable. Keep unaffected leaf content
 * (including SVG filters and fixture paths) cached while the active leaf moves.
 * Groups and repair layers stay conservative because their descendants/masks share geometry.
 */
const MemoSceneLayer = memo(SceneLayer, (a, b) => {
  if (a.suppressBlend !== b.suppressBlend || a.maskOnly !== b.maskOnly || a.children || b.children || a.layer.mergeBatchId || a.layer.repairCoverage || a.state.layers.some(layer => layer.repairCoverage)) return false
  return a.state === b.state && a.layer === b.layer && a.thumbnail === b.thumbnail && a.editingTextId === b.editingTextId && a.textObjectPreview === b.textObjectPreview && a.strokePreview === b.strokePreview && a.shapePreview === b.shapePreview && a.maskPreview === b.maskPreview && (a.transformPreview?.layerId === a.layer.id ? a.transformPreview.draft : undefined) === (b.transformPreview?.layerId === b.layer.id ? b.transformPreview.draft : undefined)
})

/** Serialization boundary: one SVG root, without editor messages or overlays. */
export function CanvasScene(props: CanvasSceneProps) { return <SceneRenderer {...props} editorUi={false} /> }
/** Interactive canvas: shares rendering, and keeps messages/mask previews outside the SVG. */
export function CanvasSceneView(props: CanvasSceneProps) { return <SceneRenderer {...props} editorUi={!props.thumbnail} /> }
function SceneRenderer(props: CanvasSceneProps & { editorUi: boolean }) {
  const originalState=props.state
  const hiddenSources=new Set<string>()
  let suppressBackground=false
  for(const layer of originalState.layers){if(hiddenSources.has(layer.id)||!effectiveLayerState(originalState.layers,layer.id).visible)continue;if(layer.maskedCompositeSourceIds){layer.maskedCompositeSourceIds.forEach(id=>hiddenSources.add(id));suppressBackground ||= !!layer.maskedCompositeBackground}}
  const resolvedState=hiddenSources.size||suppressBackground?{...originalState,layers:originalState.layers.filter(l=>!hiddenSources.has(l.id)),documentBackground:suppressBackground?'transparent':originalState.documentBackground}:originalState
  props={...props,state:resolvedState}
  const { state, maskPreview, transformPreview, thumbnail, strokePreview, shapePreview, textObjectPreview } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const previewToken = useMemo(() => ({}), [state, transformPreview, strokePreview, shapePreview, maskPreview, textObjectPreview, thumbnail])
  const [filterError,setFilterError]=useState<{token:object;message:string}|null>(null)
  const [colorPreview, setColorPreview] = useState<{ token: object; source: string } | null>(null)
  const [proofPreview, setProofPreview] = useState<{ token: object; source: string; report: SoftProofReport } | null>(null)
  useEffect(() => {
    let cancelled = false
    const controller=new AbortController()
    const svg = svgRef.current
    const active = state.layers.some(layer => {
      const a = layer.adjustments
      return requiresCpuSmartFilters(layer.smartFilters) || a?.hsl && JSON.stringify(a.hsl) !== JSON.stringify(defaultHsl()) || a?.colorBalance && JSON.stringify(a.colorBalance) !== JSON.stringify(defaultColorBalance())
    })
    if (!svg || !active) return
    const copy = svg.cloneNode(true) as SVGSVGElement
    copy.querySelectorAll('[data-color-preview]').forEach(node => node.remove())
    copy.querySelectorAll('[data-color-preview-source]').forEach(node => node.removeAttribute('visibility'))
    void materializeColorAdjustments(new XMLSerializer().serializeToString(copy),{signal:controller.signal}).then(source => {
      if (!cancelled) setColorPreview({ token: previewToken, source: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}` })
    }).catch(error => { if (!cancelled) {setColorPreview(null);setFilterError({token:previewToken,message:error instanceof Error?error.message:'滤镜预览失败，保留源图'})} })
    return () => { cancelled = true;controller.abort() }
  }, [previewToken])
  useEffect(() => {
    let cancelled=false
    const proof=state.proofSettings
    if(thumbnail || !proof?.enabled || !proof.targetProfile){ setProofPreview(null); return }
    const svg=svgRef.current; if(!svg){return}
    const controller=new AbortController()
    const targetProfile=proof.targetProfile
    const source=stripSoftProofOverlay(new XMLSerializer().serializeToString(svg))
    void exportSvgImage(source,{format:'png',width:state.documentWidth,height:state.documentHeight,profile:state.colorManagement.profile,renderingIntent:state.colorManagement.renderingIntent})
      .then(blob=>new Promise<ImageData>((resolve,reject)=>{const url=URL.createObjectURL(blob),img=new Image();img.onload=()=>{try{const c=document.createElement('canvas');c.width=state.documentWidth;c.height=state.documentHeight;const ctx=c.getContext('2d');if(!ctx)throw new Error('软打样画布不可用');ctx.drawImage(img,0,0,c.width,c.height);resolve(ctx.getImageData(0,0,c.width,c.height))}catch(e){reject(e)}finally{URL.revokeObjectURL(url)}};img.onerror=()=>reject(new Error('软打样源图读取失败'));img.src=url}))
      .then(image=>renderSoftProof(new Uint8ClampedArray(image.data),image.width,image.height,state.colorManagement.profile,targetProfile,proof))
      .then(result=>{if(cancelled)return;const c=document.createElement('canvas');c.width=result.rgba.length?state.documentWidth:1;c.height=state.documentHeight;const ctx=c.getContext('2d');if(!ctx)throw new Error('软打样画布不可用');ctx.putImageData(new ImageData(new Uint8ClampedArray(result.rgba).slice(),state.documentWidth,state.documentHeight),0,0);setProofPreview({token:previewToken,source:c.toDataURL('image/png'),report:result.report})})
      .catch(()=>{if(!cancelled)setProofPreview(null)})
    return()=>{cancelled=true;controller.abort()}
  },[previewToken,state.proofSettings,state.documentWidth,state.documentHeight,state.colorManagement])
  const proof = state.proofSettings
  const bakedPreview = colorPreview?.token === previewToken ? colorPreview.source : undefined
  const proofSource = proofPreview?.token === previewToken ? proofPreview.source : undefined
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId)
  const activeArtboard = state.artboards.find(board => board.id === state.activeArtboardId) ?? state.artboards[0]
  const boardLayerIds = state.artboards.length > 1 && activeArtboard ? new Set(activeArtboard.layerIds.flatMap(id => layerSubtreeIds(state.layers,id))) : null
  const previewMask = maskPreview ?? state.layerMasks[state.selectedLayerId]
  const previewTransform = transformPreview?.layerId === state.selectedLayerId ? transformPreview.draft : selectedLayer?.transform
  const scope = `clip-${useId().replaceAll(':', '')}`
  const renderChildren = (parentId?: string, ancestors = new Set<string>(), maskOnly = false): ReactNode[] => {
    const firstChild=parentId ? state.layers.find(l => layerParentId(state.layers,l.id)===parentId) : undefined
    if(parentId && !firstChild)return []
    const siblings = firstChild ? clippingSiblings(state.layers,firstChild.id) : state.layers.filter(l => !layerParentId(state.layers,l.id))
    const renderLayer = (layer:Layer, asMask = maskOnly, suppressBlend = false, opaqueSource = false) => {
      const nested = renderChildren(layer.id,new Set([...ancestors,layer.id]),asMask)
      return <MemoSceneLayer key={layer.id} {...props} layer={layer} maskOnly={asMask} suppressBlend={suppressBlend} opaqueSource={opaqueSource}>{nested.length ? nested : undefined}</MemoSceneLayer>
    }
    const rendered: ReactNode[] = []
    const renderedIds: string[] = []
    for (const layer of [...siblings].reverse()) {
      if (boardLayerIds && !boardLayerIds.has(layer.id) && !layer.children?.some(child => boardLayerIds.has(child))) continue
      if(ancestors.has(layer.id) || (!layer.visible)) continue
      if (layer.kind !== 'adjustment' && layer.clipBaseId) continue
      if (layer.kind === 'adjustment') {
        if (!rendered.length) continue
        const targetIndex = layer.clipBaseId ? renderedIds.indexOf(layer.clipBaseId) : -1
        const targetNodes = targetIndex >= 0 ? [rendered[targetIndex]] : rendered.slice()
        const below = targetNodes
        const filterId = `${scope}-adjustment-${layer.id.replace(/[^a-zA-Z0-9_-]/g, '')}`
        const mask = state.layerMasks[layer.id]
        const adjustmentNode = <g key={layer.id} data-adjustment-layer={layer.id} data-adjustment-clip-base={layer.clipBaseId} style={{ mixBlendMode: resolveBlendMode(layer.blendMode), isolation: 'isolate' }}>
          <defs><AdjustmentFilter id={filterId} adjustments={layer.adjustments} width={state.documentWidth} height={state.documentHeight} /></defs>
          <g>{below}</g>
          <g opacity={layer.opacity / 100} style={{ mixBlendMode: resolveBlendMode(layer.blendMode) }} filter={adjustmentPipeline(layer.adjustments) ? `url(#${filterId})` : undefined} mask={mask?.applied ? `url(#${filterId}-mask)` : undefined}>
            {mask?.applied ? <defs>{MaskDefinitions(mask, `${filterId}-mask`, state.documentWidth, state.documentHeight)}</defs> : null}
            {below}
          </g>
        </g>
        if (targetIndex >= 0) { rendered.splice(targetIndex, 1, adjustmentNode); renderedIds.splice(targetIndex, 1, layer.id) }
        else { rendered.splice(0, rendered.length, adjustmentNode); renderedIds.splice(0, renderedIds.length, layer.id) }
        continue
      }
      if (layer.preserveSourceAlpha && layer.opacity === 0) continue
      if (layer.preserveSourceAlpha && layer.repairCoverage && layer.repairSourceIds?.length) {
        const targetIndex = renderedIds.indexOf(layer.repairSourceIds[0])
        if (targetIndex >= 0) {
          // Tonal exposure changes RGB only. Composite opaque RGB, then restore
          // the sampled source alpha once so opacity/mask edits cannot punch holes.
          const target = rendered[targetIndex]
          const id = `${scope}-tonal-${layer.id}`
          const node = <g key={layer.id} data-tonal-layer={layer.id} mask={`url(#${id}-alpha)`}>
            <defs><g id={`${id}-source`}>{target}</g><mask id={`${id}-alpha`} maskUnits="objectBoundingBox" x="0" y="0" width="1" height="1" mask-type="alpha" style={{maskType:'alpha'}}><use href={`#${id}-source`} /></mask><filter id={`${id}-opaque`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer></filter><clipPath id={`${id}-coverage`}><path d={layer.repairCoverage} transform={repairMaskTransform(state,layer,true)}/></clipPath></defs>
            <g filter={`url(#${id}-opaque)`}><use href={`#${id}-source`} /></g>
            <g clipPath={`url(#${id}-coverage)`}>{renderLayer(layer, maskOnly, false, true)}</g>
          </g>
          rendered.splice(targetIndex,1,node); renderedIds.splice(targetIndex,1,layer.id)
          continue
        }
      }
      const clips=siblings.filter(l=>l.clipBaseId===layer.id && l.visible)
      if(!clips.length){ rendered.push(renderLayer(layer)); renderedIds.push(layer.id); continue }
      // A clipping chain has the base's alpha exactly once, even when the base is
      // semi-transparent. Blend each clipped sibling onto the opaque base RGB,
      // then apply the original base alpha to the entire isolated chain.
      const id=`${scope}-${Array.from(layer.id).map(c=>c.codePointAt(0)!.toString(16)).join('-')}`
      rendered.push(<g key={layer.id} data-clipping-base={layer.id} style={{mixBlendMode:resolveBlendMode(layer.blendMode)}} mask={`url(#${id}-alpha)`}>
        <defs>
          <g id={`${id}-source`}>{renderLayer(layer,true,true)}</g>
          <mask id={`${id}-alpha`} maskUnits="objectBoundingBox" x="0" y="0" width="1" height="1" mask-type="alpha" style={{maskType:'alpha'}}><use href={`#${id}-source`} /></mask>
          <filter id={`${id}-opaque`} filterUnits="objectBoundingBox" x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB"><feComponentTransfer><feFuncA type="linear" slope="0" intercept="1" /></feComponentTransfer></filter>
        </defs>
        <g style={{isolation:'isolate'}}>
          <g className={maskOnly?undefined:'scene-layer'} data-layer-id={maskOnly?undefined:layer.id} filter={`url(#${id}-opaque)`}><use href={`#${id}-source`} /></g>
          {[...clips].reverse().map(clip=>renderLayer(clip))}
        </g>
      </g>)
      renderedIds.push(layer.id)
    }
    return rendered
  }
  return <>
    <svg ref={svgRef} className={thumbnail ? 'layer-thumbnail-art' : 'canvas-art'} viewBox={`0 0 ${state.documentWidth} ${state.documentHeight}`} overflow="hidden" xmlns="http://www.w3.org/2000/svg" role={thumbnail ? 'presentation' : 'img'} aria-label={thumbnail ? undefined : '画布内容'} aria-hidden={thumbnail || undefined} style={{ isolation: 'isolate', ...(thumbnail ? { width: '100%', height: '100%', display: 'block' } : {}) }}>
      {state.documentBackground !== 'transparent' ? <rect width={state.documentWidth} height={state.documentHeight} fill={state.documentBackground} /> : null}
      <g data-color-preview-source="true" visibility={bakedPreview || proofSource ? 'hidden' : undefined}>{renderChildren()}</g>
      {bakedPreview ? <image data-color-preview="true" data-editor-overlay="true" href={bakedPreview} width={state.documentWidth} height={state.documentHeight} /> : null}{proofSource ? <image data-soft-proof="true" data-editor-overlay="true" href={proofSource} width={state.documentWidth} height={state.documentHeight} /> : null}

    </svg>

    {props.editorUi && state.layers.some(layer=>requiresCpuSmartFilters(layer.smartFilters))&&!bakedPreview&&filterError?.token!==previewToken?<span role="status">滤镜预览计算中，暂时显示源内容…</span>:null}
    {props.editorUi && proof?.enabled && !proof.targetProfile ? <span role="status">软打样不可用：请选择目标 ICC。</span> : null}{props.editorUi && proofSource && proofPreview?.token===previewToken ? <span role="status">软打样：{proofPreview.report.profileName} · ICC {proofPreview.report.profileChecksum} · 超色域 {proofPreview.report.outOfGamutPixels}/{proofPreview.report.pixels} · 最大总墨量 {proofPreview.report.maxInkPercent.toFixed(1)}%{proofPreview.report.warning ? ` · ${proofPreview.report.warning}` : ''}</span> : null}{props.editorUi && filterError?.token===previewToken?<span role="alert">{filterError.message}，未更改源图。</span>:null}
    {props.editorUi && !thumbnail && selectedLayer && effectiveLayerState(state.layers, selectedLayer.id).visible && previewMask && !previewMask.applied && (state.activeToolGroup === 'mask' || maskPreview) ? <MaskOverlay mask={previewMask} transform={layerTransformValue(previewTransform, state.documentWidth, state.documentHeight, selectedLayer.contentWidth ?? state.documentWidth, selectedLayer.contentHeight ?? state.documentHeight)} width={state.documentWidth} height={state.documentHeight} contentWidth={selectedLayer.contentWidth ?? state.documentWidth} contentHeight={selectedLayer.contentHeight ?? state.documentHeight} /> : null}
  </>
}
