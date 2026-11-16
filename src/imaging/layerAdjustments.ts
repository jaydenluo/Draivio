import type { LayerAdjustments } from '../state/editor'
import { linearToSrgb, srgbToLinear } from '../adjustments/colorPipeline'
import { buildCurvesLevelsLUT, defaultCurves } from '../adjustments/curves'
import { defaultLevels } from '../adjustments/levels'
import { applyColorBalancePixel, applyHslPixel, defaultColorBalance, defaultHsl, type ColorBalanceSettings, type HslSettings } from '../adjustments/hsl'
import { clonePixelBuffer, createPixelBuffer, readNormalized, writeNormalized, type PixelBuffer } from '../render/pixelBuffer'

export const CLARITY_SIGMA = 6
export const CLARITY_GAIN = 0.8

const clamp = (value: number) => Math.max(0, Math.min(1, value))
const amount = (value: number) => Number.isFinite(value) ? Math.max(-100, Math.min(100, value)) / 100 : 0
export type AdjustmentPipeline = { tables: number[][]; saturation: number; clarity: number; blur: number }

/** Shared encoded-sRGB operations, in this exact order: transfer, saturation, clarity, blur. */
export function adjustmentPipeline(adjustments?: LayerAdjustments): AdjustmentPipeline | null {
  const curveActive = adjustments?.curves && JSON.stringify(adjustments.curves) !== JSON.stringify(defaultCurves())
  const levelsActive = adjustments?.levels && JSON.stringify(adjustments.levels) !== JSON.stringify(defaultLevels())
  const hslActive = adjustments?.hsl && JSON.stringify(adjustments.hsl) !== JSON.stringify(defaultHsl())
  const balanceActive = adjustments?.colorBalance && JSON.stringify(adjustments.colorBalance) !== JSON.stringify(defaultColorBalance())
  if (!adjustments || Object.entries(adjustments).every(([key, value]) => key === 'whiteBalance' ? !value || Object.values(value).every(gain => gain === 1) : key === 'curves' ? !curveActive : key === 'levels' ? !levelsActive : key === 'hsl' ? !hslActive : key === 'colorBalance' ? !balanceActive : !amount(value as number))) return null
  const brightness = amount(adjustments.brightness), contrast = amount(adjustments.contrast)
  const warmth = amount(adjustments.temperature), tint = amount(adjustments.tint ?? 0), shadows = amount(adjustments.shadows), highlights = amount(adjustments.highlights)
  const curveLut = buildCurvesLevelsLUT(adjustments.curves ?? defaultCurves(), adjustments.levels ?? defaultLevels())
  const tables = [0, 1, 2].map((channel) => Array.from({ length: 256 }, (_, index) => {
    let value = index / 255
    if (curveActive || levelsActive) value = curveLut[['r','g','b'][channel] as 'r'|'g'|'b'][index * 16]
    if (adjustments.exposureEV) value = clamp(linearToSrgb(srgbToLinear(value) * 2 ** adjustments.exposureEV))
    if (adjustments.whiteBalance) { const gain = adjustments.whiteBalance[['r', 'g', 'b'][channel] as 'r'|'g'|'b']; value = clamp(linearToSrgb(srgbToLinear(value) * gain)) }
    // Opposite, multiplicative channel gains approximate white balance; green is stable.
    value = clamp(value * (1 + brightness))
    value = clamp((value - 0.5) * (1 + contrast) + 0.5)
    value = clamp(value * Math.pow(2, warmth * (channel === 0 ? 0.5 : channel === 2 ? -0.5 : 0)))
    // Tint shifts green against magenta in linear light while preserving red/blue balance.
    value = clamp(value * Math.pow(2, tint * (channel === 1 ? -0.5 : 0.25)))
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
  const pipeline = adjustmentPipeline(adjustments)
  if (!pipeline) return source.slice()
  let pixels: Float64Array = Float64Array.from(source, (value) => value / 255)
  for (let index = 0; index < pixels.length; index += 4) {
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = pipeline.tables[channel][source[index + channel]]
    const luma = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722
    for (let channel = 0; channel < 3; channel++) pixels[index + channel] = clamp(luma + pipeline.saturation * (pixels[index + channel] - luma))
    if (adjustments.hsl) { const rgb = applyHslPixel(pixels[index], pixels[index + 1], pixels[index + 2], adjustments.hsl); pixels[index] = rgb[0]; pixels[index + 1] = rgb[1]; pixels[index + 2] = rgb[2] }
    if (adjustments.colorBalance) { const rgb = applyColorBalancePixel(pixels[index], pixels[index + 1], pixels[index + 2], adjustments.colorBalance); pixels[index] = rgb[0]; pixels[index + 1] = rgb[1]; pixels[index + 2] = rgb[2] }
  }
  if (pipeline.clarity) {
    const low = smooth(pixels, width, height, CLARITY_SIGMA)
    pixels = pixels.map((value, index) => index % 4 === 3 ? value : clamp(value + pipeline.clarity * (value - low[index])))
  }
  if (pipeline.blur) pixels = smooth(pixels, width, height, pipeline.blur)
  return Uint8ClampedArray.from(pixels, (value) => value * 255)
}

/** Applies the same adjustment chain while retaining the source pixel storage format. */
export function applyLayerAdjustmentsToPixelBuffer(source: PixelBuffer, adjustments: LayerAdjustments): PixelBuffer {
  const pipeline = adjustmentPipeline(adjustments)
  if (!pipeline) return clonePixelBuffer(source)
  const pixels = new Float64Array(source.width * source.height * 4)
  for (let index = 0; index < source.width * source.height; index++) {
    const rgba = readNormalized(source, index)
    const offset = index * 4
    pixels.set(rgba, offset)
    for (let channel = 0; channel < 3; channel++) {
      const value = clamp(rgba[channel])
      pixels[offset + channel] = pipeline.tables[channel][Math.round(value * 255)]
    }
    const luma = pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = clamp(luma + pipeline.saturation * (pixels[offset + channel] - luma))
    if (adjustments.hsl) { const rgb = applyHslPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2], adjustments.hsl); pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2] }
    if (adjustments.colorBalance) { const rgb = applyColorBalancePixel(pixels[offset], pixels[offset + 1], pixels[offset + 2], adjustments.colorBalance); pixels[offset] = rgb[0]; pixels[offset + 1] = rgb[1]; pixels[offset + 2] = rgb[2] }
  }
  const output = createPixelBuffer(source.width, source.height, source.format)
  for (let index = 0; index < source.width * source.height; index++) writeNormalized(output, index, Array.from(pixels.subarray(index * 4, index * 4 + 4)))
  return output
}
