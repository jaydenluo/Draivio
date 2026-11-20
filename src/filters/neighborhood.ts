import { checkFilterAbort, type WorkOptions } from './common'
import { detailYield } from './sharpen'

export const neighborhoodFilterNames = {
  boxBlur: '方框模糊',
  median: '中间值',
  bloom: '柔光发光',
} as const

type NeighborhoodKind = keyof typeof neighborhoodFilterNames
export const MAX_MEDIAN_RADIUS = 4
export const DEFAULT_BLOOM_THRESHOLD = 160

export function isNeighborhoodFilter(kind: string): kind is NeighborhoodKind {
  return Object.hasOwn(neighborhoodFilterNames, kind)
}

/** Running sums in premultiplied alpha keep cost independent of the radius. */
async function boxBlur(source: Uint8ClampedArray, width: number, height: number, radius: number, options: WorkOptions) {
  const stride = width * 4
  const horizontal = new Float32Array(source.length)
  for (let y = 0; y < height; y++) {
    await detailYield(y, options)
    const sum = new Float64Array(4)
    const row = y * stride
    const update = (x: number, sign: number) => {
      if (x < 0 || x >= width) return
      const i = row + x * 4
      const alpha = source[i + 3]
      for (let channel = 0; channel < 3; channel++) sum[channel] += sign * source[i + channel] * alpha
      sum[3] += sign * alpha
    }
    for (let x = 0; x < radius; x++) update(x, 1)
    for (let x = 0; x < width; x++) {
      update(x + radius, 1)
      horizontal.set(sum, row + x * 4)
      update(x - radius, -1)
    }
  }

  const output = new Uint8ClampedArray(source.length)
  const sum = new Float64Array(stride)
  const updateRow = (y: number, sign: number) => {
    if (y < 0 || y >= height) return
    const row = y * stride
    for (let i = 0; i < stride; i++) sum[i] += sign * horizontal[row + i]
  }
  const area = (radius * 2 + 1) ** 2
  for (let y = 0; y < radius; y++) updateRow(y, 1)
  for (let y = 0; y < height; y++) {
    await detailYield(y, options)
    updateRow(y + radius, 1)
    const row = y * stride
    for (let i = 0; i < stride; i += 4) {
      const alpha = sum[i + 3]
      output[row + i + 3] = alpha / area
      if (!output[row + i + 3]) continue
      for (let channel = 0; channel < 3; channel++) output[row + i + channel] = sum[i + channel] / alpha
    }
    updateRow(y - radius, -1)
  }
  return output
}

async function median(source: Uint8ClampedArray, width: number, height: number, radius: number, options: WorkOptions) {
  const output = source.slice()
  // The coarse histogram skips empty ranges when finding the exact byte median.
  const values = new Int16Array(3 * 256)
  const ranges = new Int16Array(3 * 16)
  for (let y = 0; y < height; y++) {
    await detailYield(y, options)
    values.fill(0)
    ranges.fill(0)
    let count = 0
    const top = Math.max(0, y - radius)
    const bottom = Math.min(height - 1, y + radius)
    const update = (x: number, sign: number) => {
      if (x < 0 || x >= width) return
      for (let row = top; row <= bottom; row++) {
        const i = (row * width + x) * 4
        if (!source[i + 3]) continue
        count += sign
        for (let channel = 0; channel < 3; channel++) {
          const byte = source[i + channel]
          values[channel * 256 + byte] += sign
          ranges[channel * 16 + (byte >> 4)] += sign
        }
      }
    }
    for (let x = 0; x < radius; x++) update(x, 1)
    for (let x = 0; x < width; x++) {
      update(x + radius, 1)
      const pixel = (y * width + x) * 4
      if (source[pixel + 3]) {
        for (let channel = 0; channel < 3; channel++) {
          let rank = Math.floor((count - 1) / 2)
          let range = channel * 16
          while (rank >= ranges[range]) rank -= ranges[range++]
          let bin = range * 16
          while (rank >= values[bin]) rank -= values[bin++]
          output[pixel + channel] = bin % 256
        }
      }
      update(x - radius, -1)
    }
  }
  return output
}

type NeighborhoodParameters = { kind: NeighborhoodKind; radius: number; amount: number; threshold?: number }

export async function applyNeighborhoodFilter(source: Uint8ClampedArray, width: number, height: number, filter: NeighborhoodParameters, options: WorkOptions) {
  if (filter.kind === 'boxBlur') return boxBlur(source, width, height, filter.radius, options)
  if (filter.kind === 'median') return median(source, width, height, filter.radius, options)

  const threshold = filter.threshold ?? DEFAULT_BLOOM_THRESHOLD
  if (threshold === 255) return source.slice()
  const highlights = source.slice()
  for (let y = 0; y < height; y++) {
    await detailYield(y, options)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const brightness = Math.max(source[i], source[i + 1], source[i + 2])
      const coverage = Math.max(0, brightness - threshold) / (255 - threshold)
      highlights[i + 3] = source[i + 3] * coverage
    }
  }
  const blurred = await boxBlur(highlights, width, height, filter.radius, options)
  const output = source.slice()
  for (let y = 0; y < height; y++) {
    await detailYield(y, options)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (!source[i + 3]) continue
      const strength = filter.amount * blurred[i + 3] / (255 * 255)
      for (let channel = 0; channel < 3; channel++) {
        const base = source[i + channel]
        output[i + channel] = base + (255 - base) * blurred[i + channel] * strength
      }
    }
  }
  checkFilterAbort(options.signal)
  return output
}
