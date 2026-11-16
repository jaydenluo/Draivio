import { selectionContains, type Selection } from './selectionGeometry'

function validate(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('选区位图尺寸无效')
}

/** Rasterizes any selection expression into an 8-bit alpha mask. */
export function rasterizeSelectionMask(selection: Selection, width: number, height: number): Uint8Array {
  validate(width, height)
  const mask = new Uint8Array(width * height)
  const samples = [.25, .75]
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let hits = 0
    for (const sy of samples) for (const sx of samples) if (selectionContains(selection.path, { x: (x + sx) / width * 100, y: (y + sy) / height * 100 })) hits++
    mask[y * width + x] = Math.round(hits / 4 * 255)
  }
  const radius = Math.max(0, Math.round(selection.feather))
  if (!radius) return mask
  return blurMask(mask, width, height, radius)
}

export function blurMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  validate(width, height)
  if (mask.length !== width * height) throw new Error('选区位图长度与尺寸不匹配')
  if (!Number.isInteger(radius) || radius < 0) throw new Error('选区羽化半径无效')
  if (!radius) return new Uint8Array(mask)
  const horizontal = new Uint8Array(mask.length)
  const output = new Uint8Array(mask.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dx = -radius; dx <= radius; dx++) { const px = x + dx; if (px >= 0 && px < width) { sum += mask[y * width + px]; count++ } }
    horizontal[y * width + x] = Math.round(sum / count)
  }
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dy = -radius; dy <= radius; dy++) { const py = y + dy; if (py >= 0 && py < height) { sum += horizontal[py * width + x]; count++ } }
    output[y * width + x] = Math.round(sum / count)
  }
  return output
}
