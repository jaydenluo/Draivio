export type RGB = { r: number; g: number; b: number }
export type WhiteBalanceGains = RGB
export const clamp01 = (value: number) => Math.max(0, Math.min(1, value))
export function srgbToLinear(value: number): number {
  const v = clamp01(value); return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
}
export function linearToSrgb(value: number): number {
  const v = clamp01(value); return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055
}
export function applyExposureLinear(source: Uint8ClampedArray, ev = 0): Uint8ClampedArray {
  if (!Number.isFinite(ev) || source.length % 4 !== 0) throw new Error('曝光参数或 RGBA 数据无效')
  const gain = 2 ** ev, output = new Uint8ClampedArray(source.length)
  for (let i = 0; i < source.length; i += 4) {
    output[i] = Math.round(linearToSrgb(srgbToLinear(source[i] / 255) * gain) * 255)
    output[i + 1] = Math.round(linearToSrgb(srgbToLinear(source[i + 1] / 255) * gain) * 255)
    output[i + 2] = Math.round(linearToSrgb(srgbToLinear(source[i + 2] / 255) * gain) * 255)
    output[i + 3] = source[i + 3]
  }
  return output
}
export function whiteBalanceGains(sample: RGB, target = 0.5): WhiteBalanceGains {
  if (![sample.r, sample.g, sample.b, target].every(Number.isFinite) || [sample.r, sample.g, sample.b].some(v => v <= 0) || target <= 0) throw new Error('白平衡取样无效')
  const linear = { r: srgbToLinear(sample.r), g: srgbToLinear(sample.g), b: srgbToLinear(sample.b) }
  const neutral = srgbToLinear(target)
  return { r: neutral / linear.r, g: neutral / linear.g, b: neutral / linear.b }
}
export function applyWhiteBalanceLinear(source: Uint8ClampedArray, gains: WhiteBalanceGains): Uint8ClampedArray {
  if (source.length % 4 !== 0 || ![gains.r, gains.g, gains.b].every(v => Number.isFinite(v) && v > 0)) throw new Error('白平衡参数或 RGBA 数据无效')
  const output = new Uint8ClampedArray(source.length)
  for (let i = 0; i < source.length; i += 4) {
    output[i] = Math.round(linearToSrgb(srgbToLinear(source[i] / 255) * gains.r) * 255)
    output[i + 1] = Math.round(linearToSrgb(srgbToLinear(source[i + 1] / 255) * gains.g) * 255)
    output[i + 2] = Math.round(linearToSrgb(srgbToLinear(source[i + 2] / 255) * gains.b) * 255)
    output[i + 3] = source[i + 3]
  }
  return output
}
export function applyLinearColorPipeline(source: Uint8ClampedArray, options: { exposureEV?: number; whiteBalance?: WhiteBalanceGains } = {}): Uint8ClampedArray {
  const exposed = applyExposureLinear(source, options.exposureEV ?? 0)
  return options.whiteBalance ? applyWhiteBalanceLinear(exposed, options.whiteBalance) : exposed
}
