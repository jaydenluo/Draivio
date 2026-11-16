import type { TransformDraft } from './TransformOverlay'
import { type Selection, type SelectionPath, type SelectionPoint } from './selectionGeometry'
export type { TransformDraft } from './TransformOverlay'

export type AffineMatrix = [number, number, number, number, number, number]
export type LayerAffine = { type: 'affine'; source: SelectionPath; matrix: AffineMatrix }

const EPSILON = 1e-8
const validatePoint = (point: SelectionPoint) => {
  if (![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) throw new Error('画布坐标必须在 0–100% 范围内')
}
const validateTransform = (transform: TransformDraft) => {
  const { rect, rotation } = transform
  if (![rect.x, rect.y, rect.width, rect.height, rotation].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) throw new Error('图层变换必须具有有限的非零尺寸')
}

export function multiplyPoint(matrix: AffineMatrix, point: SelectionPoint): SelectionPoint {
  return { x: matrix[0] * point.x + matrix[2] * point.y + matrix[4], y: matrix[1] * point.x + matrix[3] * point.y + matrix[5] }
}
export function invertMatrix(matrix: AffineMatrix): AffineMatrix {
  const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2]
  if (!Number.isFinite(determinant) || Math.abs(determinant) < EPSILON) throw new Error('图层变换矩阵不可逆')
  const a = matrix[3] / determinant; const b = -matrix[1] / determinant; const c = -matrix[2] / determinant; const d = matrix[0] / determinant
  return [a, b, c, d, -a * matrix[4] - c * matrix[5], -b * matrix[4] - d * matrix[5]]
}

/** Matches CanvasScene.layerTransformValue in the supplied document pixel space. */
export function layerMatrix(transform: TransformDraft, width = 500, height = 625): AffineMatrix {
  validateTransform(transform)
  const { rect, rotation, flipX, flipY } = transform
  const theta = rotation * Math.PI / 180
  const cos = Math.cos(theta); const sin = Math.sin(theta)
  const sx = rect.width / 100 * (flipX ? -1 : 1); const sy = rect.height / 100 * (flipY ? -1 : 1)
  const m00 = cos * sx; const m01 = -sin * sy; const m10 = sin * sx; const m11 = cos * sy
  const px = width / 100, py = height / 100
  const cx = (rect.x + rect.width / 2) * px; const cy = (rect.y + rect.height / 2) * py
  const tx = cx - m00 * width / 2 - m01 * height / 2; const ty = cy - m10 * width / 2 - m11 * height / 2
  // convert physical SVG coordinates into percentage coordinates without losing the 4:5 aspect ratio
  return [m00, m10 * px / py, m01 * py / px, m11, tx / px, ty / py]
}

/** Default maps layer/document-local points to canvas coordinates; inverse maps canvas to local. */
export function layerPoint(point: SelectionPoint, transform?: TransformDraft, inverse = false, width = 500, height = 625): SelectionPoint {
  validatePoint(point)
  if (!transform) return { ...point }
  const matrix = layerMatrix(transform, width, height)
  return multiplyPoint(inverse ? invertMatrix(matrix) : matrix, point)
}

function boundsOf(points: SelectionPoint[]) {
  return { x: Math.min(...points.map((point) => point.x)), y: Math.min(...points.map((point) => point.y)), width: Math.max(...points.map((point) => point.x)) - Math.min(...points.map((point) => point.x)), height: Math.max(...points.map((point) => point.y)) - Math.min(...points.map((point) => point.y)) }
}

/** Stores the inverse layer matrix so a canvas selection can be rendered inside a transformed layer. */
export function selectionToLayer(selection: Selection, transform?: TransformDraft, width = 500, height = 625): Selection {
  if (!transform) return selection
  const inverse = invertMatrix(layerMatrix(transform, width, height))
  const rect = selection.rect
  const corners = [{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }, { x: rect.x, y: rect.y + rect.height }].map((point) => multiplyPoint(inverse, point))
  return { ...selection, rect: boundsOf(corners), path: { type: 'affine', source: selection.path, matrix: inverse } }
}
