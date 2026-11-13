import type { BrushStroke } from './BrushEngine'
import type { Selection, SelectionPoint, SelectionRect } from './selectionGeometry'

export type CanvasShape = {
  id: string; layerId: string; kind: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'fill' | 'gradient'
  rect: SelectionRect; color: string; endColor?: string; strokeWidth: number; opacity?: number
  from?: SelectionPoint; to?: SelectionPoint; selection?: Selection
}
export type LayerMask = {
  selection?: Selection; strokes: BrushStroke[]; inverted: boolean; applied: boolean
  gradient?: { from: SelectionPoint; to: SelectionPoint }
}
