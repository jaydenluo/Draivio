import { useId, type CSSProperties, type ReactNode } from 'react'
import type { EditorState, Layer } from '../state/editor'
import { BrushScene } from './BrushScene'
import type { BrushStroke } from './BrushEngine'
import { CanvasFixtureContent } from './CanvasFixture'
import type { CanvasShape, LayerMask } from './documentTypes'
import { MaskDefinitions, MaskOverlay } from './MaskOverlay'
import type { CanvasTextObject } from './TextObject'
import type { TransformDraft } from './TransformOverlay'

export type CanvasSceneProps = {
  state: EditorState
  strokePreview?: BrushStroke | null
  shapePreview?: CanvasShape | null
  transformPreview?: { layerId: string; draft: TransformDraft } | null
  maskPreview?: LayerMask | null
}

/** Maps the untransformed document into a layer's percentage bounds. */
export function layerTransformValue(transform?: TransformDraft): string | undefined {
  if (!transform) return undefined
  const { rect, rotation, flipX, flipY } = transform
  const cx = (rect.x + rect.width / 2) * 5
  const cy = (rect.y + rect.height / 2) * 6.25
  return `translate(${cx} ${cy}) rotate(${rotation}) scale(${rect.width / 100 * (flipX ? -1 : 1)} ${rect.height / 100 * (flipY ? -1 : 1)}) translate(-250 -312.5)`
}

function Shape({ shape }: { shape: CanvasShape }) {
  const id = `shape-${useId().replaceAll(':', '')}`
  const { rect } = shape
  const x = rect.x * 5, y = rect.y * 6.25, width = rect.width * 5, height = rect.height * 6.25
  const from = shape.from ?? { x: rect.x, y: rect.y }
  const to = shape.to ?? { x: rect.x + rect.width, y: rect.y + rect.height }
  const x1 = from.x * 5, y1 = from.y * 6.25, x2 = to.x * 5, y2 = to.y * 6.25
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
      {shape.selection ? MaskDefinitions({ selection: shape.selection, strokes: [], inverted: false, applied: true }, `${id}-selection`) : null}
      {shape.kind === 'gradient' ? <linearGradient id={`${id}-gradient`} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}><stop stopColor={shape.color} /><stop offset="1" stopColor={shape.endColor ?? '#ffffff'} /></linearGradient> : null}
    </defs>
  </g>
}

function SceneText({ object }: { object: CanvasTextObject }) {
  const x = object.x * 5, y = object.y * 6.25
  return <text data-text={object.id} x={x} y={y} fill={object.color} fontFamily={object.fontFamily} fontSize={object.fontSize} fontWeight={object.fontWeight} textAnchor={object.align === 'center' ? 'middle' : object.align === 'right' ? 'end' : 'start'} dominantBaseline="hanging" xmlSpace="preserve">
    {object.text.split('\n').map((line, index) => <tspan key={index} x={x} dy={index === 0 ? 0 : object.fontSize * 1.4}>{line || ' '}</tspan>)}
  </text>
}

const blends: Record<string, CSSProperties['mixBlendMode']> = { '正常': 'normal', '正片叠底': 'multiply', '滤色': 'screen', '叠加': 'overlay', normal: 'normal', multiply: 'multiply', screen: 'screen', overlay: 'overlay' }

function SceneLayer({ layer, state, strokePreview, shapePreview, transformPreview, maskPreview }: CanvasSceneProps & { layer: Layer }) {
  const id = `layer-mask-${useId().replaceAll(':', '')}`
  const transform = transformPreview?.layerId === layer.id ? transformPreview.draft : layer.transform
  const mask = layer.id === state.selectedLayerId && maskPreview ? maskPreview : state.layerMasks[layer.id]
  const strokes = [...state.brushStrokes, ...(strokePreview ? [strokePreview] : [])].filter((stroke) => stroke.layerId === layer.id)
  const shapes = [...state.canvasShapes, ...(shapePreview ? [shapePreview] : [])].filter((shape) => shape.layerId === layer.id)
  const objects = [
    ...shapes.map((shape) => ({ id: shape.id, node: <Shape key={shape.id} shape={shape} /> })),
    ...state.canvasTexts.filter((object) => object.layerId === layer.id).map((object) => ({ id: object.id, node: <SceneText key={object.id} object={object} /> })),
  ]
  const base = layer.source === 'fixture' ? <CanvasFixtureContent /> : layer.source ? <image href={layer.source} width="500" height="625" preserveAspectRatio="xMidYMid meet" /> : null
  const order = [...state.sceneOrder, ...(strokePreview ? [strokePreview.id] : []), ...(shapePreview ? [shapePreview.id] : [])]
  return <g className="scene-layer" data-layer-id={layer.id} opacity={layer.opacity / 100} style={{ mixBlendMode: blends[layer.blendMode] ?? 'normal' }}>
    <g data-layer-transform={layer.id} transform={layerTransformValue(transform)}>
      <defs>{mask?.applied ? MaskDefinitions(mask, id) : null}</defs>
      <g data-layer-mask={layer.id} mask={mask?.applied ? `url(#${id})` : undefined}>
        <BrushScene strokes={strokes} baseByLayer={{ [layer.id]: base }} objectsByLayer={{ [layer.id]: objects }} order={order} />
      </g>
    </g>
  </g>
}

/** Exactly one exportable SVG. Editing overlays remain separate from its contents. */
export function CanvasScene(props: CanvasSceneProps) {
  const { state, maskPreview, transformPreview } = props
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId)
  const previewMask = maskPreview ?? state.layerMasks[state.selectedLayerId]
  const previewTransform = transformPreview?.layerId === state.selectedLayerId ? transformPreview.draft : selectedLayer?.transform
  return <>
    <svg className="canvas-art" viewBox="0 0 500 625" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="画布内容" style={{ isolation: 'isolate' }}>
      {[...state.layers].reverse().filter((layer) => layer.visible).map((layer) => <SceneLayer key={layer.id} {...props} layer={layer} />)}
    </svg>
    {selectedLayer?.visible && previewMask && !previewMask.applied && (state.activeToolGroup === 'mask' || maskPreview) ? <MaskOverlay mask={previewMask} transform={layerTransformValue(previewTransform)} /> : null}
  </>
}
