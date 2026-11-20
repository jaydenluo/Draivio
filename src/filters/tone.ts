import { checkFilterAbort, type WorkOptions } from './common'

export const toneFilterNames = {
  grayscale: '黑白',
  sepia: '复古棕色',
  invert: '反相',
  posterize: '色调分离',
  threshold: '二值化',
  emboss: '浮雕',
  edges: '查找边缘',
  duotone: '双色调',
} as const

export const duotoneDefaults = { shadowColor: '#15253d', highlightColor: '#ffdbad' } as const

export type ToneFilterKind = keyof typeof toneFilterNames

export function isToneFilter(kind: string): kind is ToneFilterKind {
  return Object.hasOwn(toneFilterNames, kind)
}

const luma = (r: number, g: number, b: number) => .2126 * r + .7152 * g + .0722 * b
const limit = (value: number) => Math.max(0, Math.min(255, value))
const channels = (hex: string) => [1, 3, 5].map(index => Number.parseInt(hex.slice(index, index + 2), 16))

function edgeStrength(source: Uint8ClampedArray, width: number, height: number, x: number, y: number, center: number) {
  const sample = (dx: number, dy: number) => {
    const px = Math.max(0, Math.min(width - 1, x + dx))
    const py = Math.max(0, Math.min(height - 1, y + dy))
    const i = (py * width + px) * 4
    return center + (luma(source[i], source[i + 1], source[i + 2]) - center) * source[i + 3] / 255
  }
  const topLeft = sample(-1, -1), topRight = sample(1, -1)
  const bottomLeft = sample(-1, 1), bottomRight = sample(1, 1)
  const horizontal = topRight - topLeft + 2 * (sample(1, 0) - sample(-1, 0)) + bottomRight - bottomLeft
  const vertical = bottomLeft - topLeft + 2 * (sample(0, 1) - sample(0, -1)) + bottomRight - topRight
  return Math.hypot(horizontal, vertical) / 4
}

/** RGB effects preserve source alpha, including transparent edge pixels. */
export async function applyToneFilter(
  source: Uint8ClampedArray,
  width: number,
  height: number,
  filter: { kind: ToneFilterKind; amount: number; threshold?: number; size?: number; shadowColor?: string; highlightColor?: string },
  options: WorkOptions,
) {
  const output = source.slice()
  const { kind, amount } = filter
  const levels = (filter.size ?? 4) - 1
  const spacing = 255 / levels
  const threshold = filter.threshold ?? 128
  const shadows = channels(filter.shadowColor ?? duotoneDefaults.shadowColor)
  const highlights = channels(filter.highlightColor ?? duotoneDefaults.highlightColor)
  for (let y = 0; y < height; y++) {
    if (y % 32 === 0) {
      checkFilterAbort(options.signal)
      await (options.yield?.() ?? new Promise<void>(resolve => setTimeout(resolve, 0)))
      checkFilterAbort(options.signal)
    }
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      if (source[i + 3] === 0) continue
      const r = source[i], g = source[i + 1], b = source[i + 2]
      let red: number, green: number, blue: number
      switch (kind) {
        case 'grayscale':
          red = green = blue = luma(r, g, b)
          break
        case 'sepia':
          red = .393 * r + .769 * g + .189 * b
          green = .349 * r + .686 * g + .168 * b
          blue = .272 * r + .534 * g + .131 * b
          break
        case 'invert':
          red = 255 - r
          green = 255 - g
          blue = 255 - b
          break
        case 'posterize':
          red = Math.round(r / spacing) * spacing
          green = Math.round(g / spacing) * spacing
          blue = Math.round(b / spacing) * spacing
          break
        case 'threshold':
          red = green = blue = luma(r, g, b) >= threshold ? 255 : 0
          break
        case 'edges':
          red = green = blue = edgeStrength(source, width, height, x, y, luma(r, g, b))
          break
        case 'duotone': {
          const tone = luma(r, g, b) / 255
          red = shadows[0] + (highlights[0] - shadows[0]) * tone
          green = shadows[1] + (highlights[1] - shadows[1]) * tone
          blue = shadows[2] + (highlights[2] - shadows[2]) * tone
          break
        }
        case 'emboss': {
          const before = (Math.max(0, y - 1) * width + Math.max(0, x - 1)) * 4
          const after = (Math.min(height - 1, y + 1) * width + Math.min(width - 1, x + 1)) * 4
          const center = luma(r, g, b)
          const difference = (luma(source[after], source[after + 1], source[after + 2]) - center) * source[after + 3] / 255
            - (luma(source[before], source[before + 1], source[before + 2]) - center) * source[before + 3] / 255
          red = green = blue = 128 + difference
          break
        }
      }
      output[i] = r + (limit(red) - r) * amount
      output[i + 1] = g + (limit(green) - g) * amount
      output[i + 2] = b + (limit(blue) - b) * amount
    }
  }
  checkFilterAbort(options.signal)
  return output
}
