export type RGBA = { r: number; g: number; b: number; a: number }
export type ColorAdjustments = { exposureEV?: number; temperature?: number; tint?: number; whiteBalance?: { r: number; g: number; b: number } }
const clamp = (v: number) => Math.max(0, Math.min(1, v))
export function srgbToLinear(value: number): number { const v = clamp(value); return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }
export function linearToSrgb(value: number): number { const v = Math.max(0, value); return v <= .0031308 ? v * 12.92 : 1.055 * (v ** (1 / 2.4)) - .055 }
export function applyColorAdjustments(pixel: RGBA, adjustments: ColorAdjustments = {}): RGBA {
  const exposure = 2 ** (Number.isFinite(adjustments.exposureEV) ? adjustments.exposureEV! : 0)
  const gains = adjustments.whiteBalance ? [adjustments.whiteBalance.r, adjustments.whiteBalance.g, adjustments.whiteBalance.b] : [1, 1, 1]
  const temperature = Math.max(-100, Math.min(100, adjustments.temperature ?? 0)) / 100
  const tint = Math.max(-100, Math.min(100, adjustments.tint ?? 0)) / 100
  const channels = [pixel.r, pixel.g, pixel.b].map((value, index) => {
    const warm = index === 0 ? 1 + temperature * .12 : index === 2 ? 1 - temperature * .12 : 1 + tint * .04
    return clamp(srgbToLinear(value) * exposure * gains[index] * warm)
  })
  return { r: clamp(linearToSrgb(channels[0])), g: clamp(linearToSrgb(channels[1])), b: clamp(linearToSrgb(channels[2])), a: clamp(pixel.a) }
}
export function whiteBalanceFromSample(sample: Pick<RGBA, 'r' | 'g' | 'b'>): { r: number; g: number; b: number } {
  const values = [srgbToLinear(sample.r), srgbToLinear(sample.g), srgbToLinear(sample.b)]; const mean = values.reduce((sum, value) => sum + value, 0) / 3; if (mean <= 0) return { r: 1, g: 1, b: 1 }
  return { r: mean / Math.max(.001, values[0]), g: mean / Math.max(.001, values[1]), b: mean / Math.max(.001, values[2]) }
}
export function applyColorPipeline(source: Uint8ClampedArray, width: number, height: number, adjustments: ColorAdjustments = {}): Uint8ClampedArray {
  if (source.length !== width * height * 4) throw new Error('Invalid RGBA dimensions')
  const output = source.slice(); for (let i = 0; i < output.length; i += 4) { const p = applyColorAdjustments({ r: output[i] / 255, g: output[i + 1] / 255, b: output[i + 2] / 255, a: output[i + 3] / 255 }, adjustments); output[i] = Math.round(p.r * 255); output[i + 1] = Math.round(p.g * 255); output[i + 2] = Math.round(p.b * 255) }
  return output
}
