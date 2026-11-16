export type Histogram = { red: number[]; green: number[]; blue: number[]; luma: number[]; alpha: number[]; samples: number; clipped: { shadows: number; highlights: number } }
export type HistogramOptions = { selection?: { x: number; y: number; width: number; height: number }; mask?: Uint8Array; includeTransparent?: boolean }
const bins = () => Array.from({ length: 256 }, () => 0)
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
export function histogramRGBA(source: Uint8ClampedArray, width: number, height: number, options: HistogramOptions = {}): Histogram {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || source.length !== width * height * 4) throw new Error('直方图输入尺寸无效')
  const red = bins(), green = bins(), blue = bins(), luma = bins(), alpha = bins(); const selection = options.selection
  const x0 = selection ? clamp(Math.floor(selection.x), 0, width) : 0, y0 = selection ? clamp(Math.floor(selection.y), 0, height) : 0
  const x1 = selection ? clamp(Math.ceil(selection.x + selection.width), x0, width) : width, y1 = selection ? clamp(Math.ceil(selection.y + selection.height), y0, height) : height
  let samples = 0, shadows = 0, highlights = 0
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = (y * width + x) * 4; if (options.mask && options.mask[y * width + x] === 0) continue; const a = source[i + 3]; alpha[a]++; if (!options.includeTransparent && a === 0) continue; const r = source[i], g = source[i + 1], b = source[i + 2]; red[r]++; green[g]++; blue[b]++; const y8 = Math.round(.2126 * r + .7152 * g + .0722 * b); luma[y8]++; samples++; if (r <= 1 || g <= 1 || b <= 1) shadows++; if (r >= 254 || g >= 254 || b >= 254) highlights++ }
  return { red, green, blue, luma, alpha, samples, clipped: { shadows, highlights } }
}
export function clippingWarning(histogram: Histogram, threshold = 1): { shadows: boolean; highlights: boolean; message: string | null } { const shadows = histogram.clipped.shadows >= threshold, highlights = histogram.clipped.highlights >= threshold; return { shadows, highlights, message: shadows || highlights ? `存在${shadows ? '暗部' : ''}${shadows && highlights ? '和' : ''}${highlights ? '高光' : ''}剪裁（仅预览提示）` : null } }
