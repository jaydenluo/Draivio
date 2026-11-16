import type { LayerAdjustments } from '../state/editor'
import { applyColorPipeline } from '../adjustments/colorPipeline'

export const CLARITY_SIGMA = 6
export const CLARITY_GAIN = 0.8

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const amount = (value: number) => Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) / 100 : 0
export type AdjustmentPipeline = { tables: number[][]; saturation: number; clarity: number; blur: number }

/** Shared encoded-sRGB operations, in this exact order: transfer, saturation, clarity, blur. */
export function adjustmentPipeline(adjustments?: LayerAdjustments): AdjustmentPipeline | null {
  if (!adjustments || Object.values(adjustments).every((value) => !amount(value))) return null
  const brightness = amount(adjustments.brightness), contrast = amount(adjustments.contrast)
  const warmth = amount(adjustments.temperature), shadows = amount(adjustments.shadows), highlights = amount(adjustments.highlights)
  const tables = [0, 1, 2].map((channel) => Array.from({ length: 256 }, (_, index) => {
    let value = index / 255
    // Opposite, multiplicative channel gains approximate white balance; green is stable.
    value = clamp(value * (1 + brightness))
    value = clamp((value - 0.5) * (1 + contrast) + 0.5)
    value = clamp(value * Math.pow(2, warmth * (channel === 0 ? 0.5 : channel === 2 ? -0.5 : 0)))
    // Disjoint soft supports leave the other half of the tonal range untouched.
    const shadowWeight = Math.pow(Math.max(0, 1 - 2 * value), 2)
    const highlightWeight = Math.pow(Math.max(0, 2 * value - 1), 2)
    return clamp(value + 0.5 * shadows * shadowWeight + 0.5 * highlights * highlightWeight)
  }))
  return { tables, saturation: 1 + amount(adjustments.saturation), clarity: CLARITY_GAIN * amount(adjustments.sharpness), blur: Math.max(0, amount(adjustments.blur)) * 3 }
}

/** Shared normalized 1-D finite Gaussian, used along each axis without intermediate normalization. */
export function gaussianAxisKernel(sigma: number): number[] {
  const radius = Math.max(1, Math.ceil(sigma * 2))
  const weights = Array.from({ length: radius * 2 + 1 }, (_, index) => Math.exp(-((index - radius) ** 2) / (2 * sigma ** 2)))
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map((weight) => weight / sum)
}

/** Dense outer product retained for diagnostics/reference fixtures. */
export function gaussianKernel(sigma: number): { order: number; weights: number[] } {
  const axis = gaussianAxisKernel(sigma)
  return { order: axis.length, weights: axis.flatMap((y) => axis.map((x) => x * y)) }
}

/** Separable premultiplied convolution; normalize color only after both axes, restore original alpha. */
function smooth(pixels: Float64Array, width: number, height: number, sigma: number): Float64Array {
  const weights = gaussianAxisKernel(sigma), radius = (weights.length - 1) / 2
  const horizontal = new Float64Array(pixels.length), vertical = new Float64Array(pixels.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const target = (y * width + x) * 4
    weights.forEach((weight, offset) => {
      const sx = x + offset - radius
      if (sx < 0 || sx >= width) return
      const source = (y * width + sx) * 4, alphaWeight = pixels[source + 3] * weight
      for (let channel = 0; channel < 3; channel++) horizontal[target + channel] += pixels[source + channel] * alphaWeight
      horizontal[target + 3] += alphaWeight
    })
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const target = (y * width + x) * 4
    weights.forEach((weight, offset) => {
      const sy = y + offset - radius
      if (sy < 0 || sy >= height) return
      const source = (sy * width + x) * 4
      for (let channel = 0; channel < 4; channel++) vertical[target + channel] += horizontal[source + channel] * weight
    })
  }
  const output = pixels.slice()
  for (let index = 0; index < pixels.length; index += 4) if (vertical[index + 3] > 0) {
    for (let channel = 0; channel < 3; channel++) output[index + channel] = vertical[index + channel] / vertical[index + 3]
  }
  return output
}

/** CPU reference; never mutates source; no rounding between stages. */
export function applyLayerAdjustments(source: Uint8ClampedArray, width: number, height: number, adjustments: LayerAdjustments): Uint8ClampedArray {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || source.length !== width * height * 4) throw new Error('Invalid RGBA dimensions')
  const colorAdjusted = adjustments.exposureEV || adjustments.tint ? applyColorPipeline(source, width, height, { exposureEV: adjustments.exposureEV, tint: adjustments.tint, temperature: adjustments.temperature }) : source
  const pipeline = adjustmentPipeline(adjustments)
  if (!pipeline) return colorAdjusted.slice()
  let pixels: Float64Array = Float64Array.from(colorAdjusted, (value) => value / 255)
  for (let index = 0; index < pixels.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = pipeline.tables[channel][source[index + channel]]
    const luma = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = clamp(luma + pipeline.saturation * (pixels[index + channel] - luma))
  }
  if (pipeline.clarity) {
    const low = smooth(pixels, width, height, CLARITY_SIGMA)
    pixels = pixels.map((value, index) => index % 4 === 3 ? value : clamp(value + pipeline.clarity * (value - low[index])))
  }
  if (pipeline.blur) pixels = smooth(pixels, width, height, pipeline.blur)
  return Uint8ClampedArray.from(pixels, (value) => value * 255)
}
