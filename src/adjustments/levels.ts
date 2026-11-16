/** Levels operate on normalized, unpremultiplied sRGB channels; alpha is untouched. */
export type LevelsSettings = { inputBlack: number; inputWhite: number; gamma: number; outputBlack: number; outputWhite: number }
/** 16 subdivisions per 8-bit interval: every byte input is an exact node.
 * Arbitrary custom sizes interpolate between samples and may approximate steep
 * legal transitions; use this default for byte-exact raster/export agreement. */
export const DEFAULT_LUT_SIZE = 255 * 16 + 1
export function defaultLevels(): LevelsSettings { return { inputBlack: 0, inputWhite: 1, gamma: 1, outputBlack: 0, outputWhite: 1 } }
export function validateLevels(value: unknown): LevelsSettings {
  const keys = ['inputBlack', 'inputWhite', 'gamma', 'outputBlack', 'outputWhite'] as const
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k as typeof keys[number]))) throw new Error('色阶结构无效')
  const candidate = value as Record<string, unknown>
  if (!keys.every(k => typeof candidate[k] === 'number' && Number.isFinite(candidate[k]))) throw new Error('色阶参数必须是有限数值')
  const p = Object.fromEntries(keys.map(k => [k, candidate[k]])) as LevelsSettings
  if (p.inputBlack < 0 || p.inputWhite > 1 || p.inputBlack >= p.inputWhite || p.outputBlack < 0 || p.outputWhite > 1 || p.outputBlack > p.outputWhite || p.gamma < .01 || p.gamma > 100) throw new Error('色阶黑白场或中间调范围无效')
  return p
}
export function validateLUTSize(size: number): void {
  if (!Number.isInteger(size) || size < 2 || size > 65537) throw new Error('LUT 采样数必须为 2–65537 的整数')
}
export function createLevelsSampler(settings: LevelsSettings): (value: number) => number {
  const p = validateLevels(settings)
  return (value: number) => {
    if (!Number.isFinite(value)) throw new Error('色阶输入必须是有限数值')
    const normalized = Math.max(0, Math.min(1, (value - p.inputBlack) / (p.inputWhite - p.inputBlack)))
    return p.outputBlack + (p.outputWhite - p.outputBlack) * normalized ** (1 / p.gamma)
  }
}
export function buildLevelsLUT(settings: LevelsSettings, size = DEFAULT_LUT_SIZE): Float64Array {
  validateLUTSize(size)
  const sample = createLevelsSampler(settings)
  return Float64Array.from({ length: size }, (_, i) => sample(i / (size - 1)))
}
