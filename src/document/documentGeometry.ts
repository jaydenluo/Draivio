import type { EditorState, Layer } from '../state/editor'
import { transformSelection, type SelectionRect } from '../canvas/selectionGeometry'

export type DocumentAnchor = 'top-left' | 'top' | 'top-right' | 'left' | 'center' | 'right' | 'bottom-left' | 'bottom' | 'bottom-right'
export const MAX_DOCUMENT_PIXELS = 32 * 1024 * 1024
export function dimensionError(width: number, height: number): string | null {
  if (![width, height].every((value) => Number.isInteger(value) && value >= 1 && value <= 16384)) return '文档尺寸必须为 1–16384 的整数像素'
  return width * height > MAX_DOCUMENT_PIXELS ? '文档面积超出 32 百万像素渲染预算' : null
}
export function resizedDocument(state: EditorState, width: number, height: number, mode: 'canvas' | 'image', anchor: DocumentAnchor = 'center'): EditorState {
  const oldWidth = state.documentWidth, oldHeight = state.documentHeight
  const ax = anchor.includes('left') || anchor === 'left' ? 0 : anchor.includes('right') || anchor === 'right' ? 1 : .5
  const ay = anchor.includes('top') ? 0 : anchor.includes('bottom') ? 1 : .5
  const dx = (width - oldWidth) * ax, dy = (height - oldHeight) * ay
  const rect = (r: SelectionRect): SelectionRect => ({ x: (r.x * oldWidth / 100 + dx) / width * 100, y: (r.y * oldHeight / 100 + dy) / height * 100, width: r.width * oldWidth / width, height: r.height * oldHeight / height })
  const layers: Layer[] = state.layers.map((layer) => ({ ...layer, contentWidth: layer.contentWidth ?? oldWidth, contentHeight: layer.contentHeight ?? oldHeight, ...(mode === 'canvas' ? { transform: { kind: 'transform' as const, rotation: 0, flipX: false, flipY: false, ...layer.transform, rect: rect(layer.transform?.rect ?? { x: 0, y: 0, width: 100, height: 100 }) } } : {}) }))
  const selection = mode === 'canvas' ? transformSelection(state.selection, rect(state.selection.rect)) : state.selection
  return { ...state, documentWidth: width, documentHeight: height, layers, selection, selectionRect: selection.rect, cropRect: null }
}

/** Physical pixels per content pixel; independent from display zoom. */
export function layerPixelScale(layer: Layer | undefined, documentWidth: number, documentHeight: number) {
  const x = (layer?.transform?.rect.width ?? 100) / 100 * documentWidth / (layer?.contentWidth ?? documentWidth)
  const y = (layer?.transform?.rect.height ?? 100) / 100 * documentHeight / (layer?.contentHeight ?? documentHeight)
  return { x: Math.max(.000001, x), y: Math.max(.000001, y), mean: Math.max(.000001, Math.sqrt(x * y)) }
}
