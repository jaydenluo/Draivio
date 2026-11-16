export type Histogram = { red: number[]; green: number[]; blue: number[]; luminance: number[]; transparent: number; clipped: { shadows: number; highlights: number }; samples: number }
export function histogramRGBA(source: Uint8ClampedArray, width: number, height: number, selection?: { x: number; y: number; width: number; height: number }): Histogram {
  if (source.length !== width * height * 4) throw new Error('Invalid RGBA dimensions')
  const result: Histogram = { red: Array(256).fill(0), green: Array(256).fill(0), blue: Array(256).fill(0), luminance: Array(256).fill(0), transparent: 0, clipped: { shadows: 0, highlights: 0 }, samples: 0 }
  const rect = selection ? { left: Math.max(0, Math.floor(selection.x)), top: Math.max(0, Math.floor(selection.y)), right: Math.min(width, Math.ceil(selection.x + selection.width)), bottom: Math.min(height, Math.ceil(selection.y + selection.height)) } : { left: 0, top: 0, right: width, bottom: height }
  for (let y = rect.top; y < rect.bottom; y++) for (let x = rect.left; x < rect.right; x++) { const i = (y * width + x) * 4; const a = source[i + 3]; result.samples++; if (!a) { result.transparent++; continue } const r = source[i], g = source[i + 1], b = source[i + 2]; result.red[r]++; result.green[g]++; result.blue[b]++; const l = Math.round(.2126 * r + .7152 * g + .0722 * b); result.luminance[l]++; if (l <= 0) result.clipped.shadows++; if (l >= 255) result.clipped.highlights++ }
  return result
}
