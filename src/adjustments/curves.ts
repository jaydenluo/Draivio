import { createLevelsSampler, DEFAULT_LUT_SIZE, defaultLevels, validateLUTSize, type LevelsSettings } from './levels'

/** All anchors use normalized sRGB coordinates. Endpoints x=0/1 are required;
 * y is nondecreasing, so arbitrary oscillating/freehand curves are rejected. */
export const MIN_CURVE_ANCHOR_GAP = 1e-6
export type CurvePoint = { x: number; y: number }
export type CurveChannel = 'rgb' | 'r' | 'g' | 'b'
export type CurvesSettings = Record<CurveChannel, CurvePoint[]>
export type CurvesLevelsLUT = { r: Float64Array; g: Float64Array; b: Float64Array }
export function defaultCurves(): CurvesSettings {
  const identity = () => [{ x: 0, y: 0 }, { x: 1, y: 1 }]
  return { rgb: identity(), r: identity(), g: identity(), b: identity() }
}
export function validateCurve(value: unknown): CurvePoint[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > 64) throw new Error('曲线需要 2–64 个锚点')
  const points = value.map(p => {
    if (!p || typeof p !== 'object' || Array.isArray(p) || Object.keys(p).some(k => k !== 'x' && k !== 'y') || typeof p.x !== 'number' || typeof p.y !== 'number' || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) throw new Error('曲线锚点必须为 0–1 范围内的有限坐标')
    return { x: p.x as number, y: p.y as number }
  })
  if (points[0].x !== 0 || points[points.length - 1].x !== 1 || points.some((p, i) => i > 0 && (p.x - points[i - 1].x < MIN_CURVE_ANCHOR_GAP || p.y < points[i - 1].y))) throw new Error('曲线端点必须覆盖 0–1，锚点横坐标间距至少 0.000001 且纵坐标不可倒序')
  return points
}
export function validateCurves(value: unknown): CurvesSettings {
  const channels = ['rgb', 'r', 'g', 'b'] as const
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !channels.includes(k as CurveChannel))) throw new Error('曲线通道结构无效')
  const p = value as Record<string, unknown>
  return { rgb: validateCurve(p.rgb), r: validateCurve(p.r), g: validateCurve(p.g), b: validateCurve(p.b) }
}
/** Shape-preserving PCHIP: harmonic interior derivatives and limited endpoints.
 * Compilation copies parameters; sampling never recalculates spline tangents. */
export function createCurveSampler(value: unknown): (x: number) => number {
  const p = validateCurve(value), n = p.length
  const h = p.slice(1).map((point, i) => point.x - p[i].x)
  const slope = h.map((width, i) => (p[i + 1].y - p[i].y) / width)
  const derivative = Array<number>(n)
  if (n === 2) derivative.fill(slope[0])
  else {
    const endpoint = (h0: number, h1: number, d0: number, d1: number) => {
      const m = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1)
      return m <= 0 ? 0 : Math.min(m, 3 * d0)
    }
    derivative[0] = endpoint(h[0], h[1], slope[0], slope[1])
    derivative[n - 1] = endpoint(h[n - 2], h[n - 3], slope[n - 2], slope[n - 3])
    for (let i = 1; i < n - 1; i++) {
      const a = slope[i - 1], b = slope[i]
      const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]
      derivative[i] = a === 0 || b === 0 ? 0 : (w1 + w2) / (w1 / a + w2 / b)
    }
  }
  return (x: number) => {
    if (!Number.isFinite(x)) throw new Error('曲线输入必须是有限数值')
    if (x <= 0) return p[0].y
    if (x >= 1) return p[n - 1].y
    let lo = 0, hi = n - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (p[mid].x <= x) lo = mid; else hi = mid }
    const t = (x - p[lo].x) / h[lo], t2 = t * t, t3 = t2 * t
    const y = (2 * t3 - 3 * t2 + 1) * p[lo].y + (t3 - 2 * t2 + t) * h[lo] * derivative[lo] + (-2 * t3 + 3 * t2) * p[hi].y + (t3 - t2) * h[lo] * derivative[hi]
    return Math.max(p[lo].y, Math.min(p[hi].y, y))
  }
}
export function buildCurveLUT(points: unknown, size = DEFAULT_LUT_SIZE): Float64Array {
  validateLUTSize(size)
  const sample = createCurveSampler(points)
  return Float64Array.from({ length: size }, (_, i) => sample(i / (size - 1)))
}
function lookup(lut: Float64Array, value: number): number {
  const index = Math.max(0, Math.min(1, value)) * (lut.length - 1), low = Math.floor(index), high = Math.min(lut.length - 1, low + 1)
  return lut[low] + (lut[high] - lut[low]) * (index - low)
}
function validateLUT(lut: Float64Array) {
  if (!(lut instanceof Float64Array)) throw new Error('LUT 类型无效')
  validateLUTSize(lut.length)
  if (lut.some(v => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error('LUT 包含无效值')
}
export function sampleLUT(lut: Float64Array, value: number): number {
  validateLUT(lut)
  if (!Number.isFinite(value)) throw new Error('LUT 输入必须是有限数值')
  return lookup(lut, value)
}
/** Fixed order: levels → master RGB → per-channel curves, with no intermediate
 * byte rounding. Call once per parameter revision and reuse for every pixel. */
export function buildCurvesLevelsLUT(curves: CurvesSettings = defaultCurves(), levels: LevelsSettings = defaultLevels(), size = DEFAULT_LUT_SIZE): CurvesLevelsLUT {
  validateLUTSize(size)
  const p = validateCurves(curves), level = createLevelsSampler(levels), master = createCurveSampler(p.rgb)
  const build = (channel: 'r' | 'g' | 'b') => {
    const sample = createCurveSampler(p[channel])
    return Float64Array.from({ length: size }, (_, i) => sample(master(level(i / (size - 1)))))
  }
  return { r: build('r'), g: build('g'), b: build('b') }
}
export function applyCurvesLevels(source: Uint8ClampedArray, lut: CurvesLevelsLUT): Uint8ClampedArray {
  if (!(source instanceof Uint8ClampedArray) || source.length % 4 !== 0) throw new Error('RGBA 数据无效')
  for (const channel of ['r', 'g', 'b'] as const) validateLUT(lut[channel])
  const output = new Uint8ClampedArray(source.length)
  for (let i = 0; i < source.length; i += 4) {
    output[i] = Math.round(lookup(lut.r, source[i] / 255) * 255)
    output[i + 1] = Math.round(lookup(lut.g, source[i + 1] / 255) * 255)
    output[i + 2] = Math.round(lookup(lut.b, source[i + 2] / 255) * 255)
    output[i + 3] = source[i + 3]
  }
  return output
}
