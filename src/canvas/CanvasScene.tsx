import { effectiveLayerState, layerParentId } from '../state/layerHierarchy'
import { useId, type CSSProperties, type ReactNode } from 'react'
import type { EditorState, Layer } from '../state/editor'
import { BrushScene } from './BrushScene'
import type { BrushStroke } from './BrushEngine'
import { CanvasFixtureContent } from './CanvasFixture'
import type { CanvasShape, LayerMask } from './documentTypes'
import { MaskDefinitions, MaskOverlay } from './MaskOverlay'
import type { CanvasTextObject } from './TextObject'
import type { TransformDraft } from './TransformOverlay'
import { AdjustmentFilter } from './AdjustmentFilter'
import { adjustmentPipeline } from '../imaging/layerAdjustments'
import { normalizeFontFamily } from '../text/systemFonts'

export type CanvasSceneProps = {
  state: EditorState
  thumbnail?: boolean
  strokePreview?: BrushStroke | null
  shapePreview?: CanvasShape | null
  transformPreview?: { layerId: string; draft: TransformDraft } | null
  maskPreview?: LayerMask | null
}

/** Maps the untransformed document into a layer's percentage bounds. */
export function layerTransformValue(transform?: TransformDraft, width = 500, height = 625, contentWidth = width, contentHeight = height): string | undefined {
  if (!transform) return contentWidth === width && contentHeight === height ? undefined : `scale(${width / contentWidth} ${height / contentHeight})`
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
  } else geometry = <rect x={x} y={y} width={width} height={height} fill={shape.kind === 'gradient' ? `url(#${id}-gradient)` : shape.color} />
  return <g data-shape={shape.id} opacity={(shape.opacity ?? 100) / 100} mask={shape.selection ? `url(#${id}-selection)` : undefined}>
    {geometry}
    <defs>
      {shape.selection ? MaskDefinitions({ selection: shape.selection, strokes: [], inverted: false, applied: true }, `${id}-selection`, canvasWidth, canvasHeight) : null}
      {shape.kind === 'gradient' ? <linearGradient id={`${id}-gradient`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}><stop stopColor={shape.color} /><stop offset="1" stopColor={shape.endColor ?? '#ffffff'} /></linearGradient> : null}
    </defs>
  </g>
}

function SceneText({ object, width, height }: { object: CanvasTextObject; width: number; height: number }) {
  const x = object.x * width / 100, y = object.y * height / 100
  return <text data-text={object.id} x={x} y={y} fill={object.color} fontFamily={normalizeFontFamily(object.fontFamily)} fontSize={object.fontSize} fontWeight={object.fontWeight} textAnchor={object.align === 'center' ? 'middle' : object.align === 'right' ? 'end' : 'start'} dominantBaseline="hanging" xmlSpace="preserve">
    {object.text.split('\n').map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : object.fontSize * 1.4}>{line || ' '}</tspan>)}
  </text>
}

const blends: Record<string, CSSProperties['mixBlendMode']> = { '正常': 'normal', '正片叠底': 'multiply', '滤色': 'screen', '叠加': 'overlay', normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay' }

function SceneLayer({ layer, state, strokePreview, shapePreview, transformPreview, maskPreview, children }: CanvasSceneProps & { layer: Layer; children?: ReactNode }) {
  const id = `layer-mask-${useId().replaceAll(':', '')}`
  const width = layer.contentWidth ?? state.documentWidth, height = layer.contentHeight ?? state.documentHeight
  const transform = transformPreview?.layerId === layer.id ? transformPreview.draft : layer.transform
  const mask = layer.id === state.selectedLayerId && maskPreview ? maskPreview : state.layerMasks[layer.id]
  const strokes = [...state.brushStrokes, ...(strokePreview ? [strokePreview] : [])].filter((stroke) => stroke.layerId === layer.id)
  const shapes = [...state.canvasShapes, ...(shapePreview ? [shapePreview] : [])].filter((shape) => shape.layerId === layer.id)
  const objects = [
    ...shapes.map((shape) => ({ id: shape.id, node: <Shape key={shape.id} shape={shape} width={width} height={height} /> })),
    ...state.canvasTexts.filter((object) => object.layerId === layer.id).map((object) => ({ id: object.id, node: <SceneText key={object.id} object={object} width={width} height={height} /> })),
  ]
  const base = layer.source === 'fixture' ? <g transform={`scale(${width / 500} ${height / 625})`}><CanvasFixtureContent /></g> : layer.source ? <image href={layer.source} width={width} height={height} preserveAspectRatio="xMidYMid meet" /> : null
  const order = [...state.sceneOrder, ...(strokePreview ? [strokePreview.id] : []), ...(shapePreview ? [shapePreview.id] : [])]
  const adjustments = layer.adjustmentsEnabled === false ? undefined : layer.adjustments
  const filterId = `${id}-adjustments`
  const filter = adjustmentPipeline(adjustments) ? `url(#${filterId})` : undefined
  return <g className="scene-layer" data-layer-id={layer.id} opacity={layer.opacity / 100} filter={filter} style={{ mixBlendMode: blends[layer.blendMode] ?? 'normal', isolation: children ? 'isolate' : undefined }}>
    <defs><AdjustmentFilter id={filterId} adjustments={adjustments} width={state.documentWidth} height={state.documentHeight} /></defs>
    <g data-layer-transform={layer.id} transform={layerTransformValue(transform, state.documentWidth, state.documentHeight, width, height)}>
      <defs>{mask?.applied ? MaskDefinitions(mask, id, width, height) : null}</defs>
      <g data-layer-mask={layer.id} mask={mask?.applied ? `url(#${id})` : undefined}>
        <BrushScene strokes={strokes} baseByLayer={{ [layer.id]: base }} objectsByLayer={{ [layer.id]: objects }} order={order} width={width} height={height} />
        {children}
      </g>
    </g>
  </g>
}

/** Exactly one exportable SVG. Editing overlays remain separate from its contents. */
export function CanvasScene(props: CanvasSceneProps) {
  const { state, maskPreview, transformPreview, thumbnail } = props
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId)
  const previewMask = maskPreview ?? state.layerMasks[state.selectedLayerId]
  const previewTransform = transformPreview?.layerId === state.selectedLayerId ? transformPreview.draft : selectedLayer?.transform
  const renderChildren = (parentId?: string, ancestors = new Set<string>()): ReactNode[] => [...state.layers].reverse()
    .filter((layer) => layerParentId(state.layers, layer.id) === parentId && layer.visible && !ancestors.has(layer.id))
    .map((layer) => {
      const nested = renderChildren(layer.id, new Set([...ancestors, layer.id]))
      return <SceneLayer key={layer.id} {...props} layer={layer}>{nested.length ? nested : undefined}</SceneLayer>
    })
  return <>
    <svg className={thumbnail ? 'layer-thumbnail-art' : 'canvas-art'} viewBox={`0 0 ${state.documentWidth} ${state.documentHeight}`} xmlns="http://www.w3.org/2000/svg" role={thumbnail ? 'presentation' : 'img'} aria-label={thumbnail ? undefined : '画布内容'} aria-hidden={thumbnail || undefined} style={{ isolation: 'isolate', ...(thumbnail ? { width: '100%', height: '100%', display: 'block' } : {}) }}>
      {state.documentBackground !== 'transparent' ? <rect width={state.documentWidth} height={state.documentHeight} fill={state.documentBackground} /> : null}
      {renderChildren()}
    </svg>
    {!thumbnail && selectedLayer && effectiveLayerState(state.layers, selectedLayer.id).visible && previewMask && !previewMask.applied && (state.activeToolGroup === 'mask' || maskPreview) ? <MaskOverlay mask={previewMask} transform={layerTransformValue(previewTransform, state.documentWidth, state.documentHeight, selectedLayer.contentWidth ?? state.documentWidth, selectedLayer.contentHeight ?? state.documentHeight)} width={state.documentWidth} height={state.documentHeight} contentWidth={selectedLayer.contentWidth ?? state.documentWidth} contentHeight={selectedLayer.contentHeight ?? state.documentHeight} /> : null}
  </>
}
