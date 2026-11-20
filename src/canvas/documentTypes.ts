import type { BrushStroke } from './BrushEngine'
import type { Selection, SelectionPoint, SelectionRect } from './selectionGeometry'
import type { EditablePath } from '../vector/pathGeometry'
import type { BooleanShape } from '../vector/booleanShapes'

export type CanvasShape = {
  id: string; layerId: string; kind: 'rectangle' | 'ellipse' | 'line' | 'arrow' | 'fill' | 'gradient' | 'path' | 'boolean'
  rect: SelectionRect; color: string; endColor?: string; strokeWidth: number; opacity?: number
  rotation?: number; flipX?: boolean; flipY?: boolean; cornerRadii?: [number,number,number,number]; arrowStart?: boolean; arrowEnd?: boolean; arrowLength?: number; arrowWidth?: number;
  from?: SelectionPoint; to?: SelectionPoint; selection?: Selection; hidden?: boolean; path?: EditablePath; boolean?: BooleanShape; strokeColor?: string; fillEnabled?: boolean; dashArray?: string; strokeLineCap?: 'butt'|'round'|'square'; strokeLineJoin?: 'miter'|'round'|'bevel'; scaleStroke?: boolean
}
export type LayerMask = {
  selection?: Selection; strokes: BrushStroke[]; inverted: boolean; applied: boolean; disabled?: boolean
  gradient?: { from: SelectionPoint; to: SelectionPoint }
  /** Non-destructive edge refinement settings. Kept alongside the source selection. */
  refinement?: {
    smooth: number
    shift: number
    feather: number
    density: number
    decontaminate: number
    colorCorrection: boolean
  }
}
