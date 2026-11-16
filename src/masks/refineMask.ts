/** Pure, non-destructive mask refinement utilities. Alpha is always clamped to [0,255]. */
export type RefineMaskParameters = {
  smooth?: number
  shift?: number
  feather?: number
  density?: number
  decontaminate?: number
  colorCorrection?: boolean
}

const clamp = (value: number, min = 0, max = 255) => Math.max(min, Math.min(max, Math.round(value)))
const radius = (value: number) => Math.max(0, Math.min(64, Math.round(value)))

export function blurAlpha(input: Uint8Array, width: number, height: number, amount: number): Uint8Array {
  if (input.length !== width * height) throw new Error('蒙版尺寸与像素长度不匹配')
  const r = radius(amount); if (!r) return new Uint8Array(input)
  const output = new Uint8Array(input.length)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let sum = 0, count = 0
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const px = x + dx, py = y + dy
      if (px >= 0 && px < width && py >= 0 && py < height) { sum += input[py * width + px]; count++ }
    }
    output[y * width + x] = clamp(sum / count)
  }
  return output
}

/** Shifts an alpha edge; positive expands and negative contracts. */
export function shiftAlpha(input: Uint8Array, width: number, height: number, amount: number): Uint8Array {
  if (input.length !== width * height) throw new Error('蒙版尺寸与像素长度不匹配')
  const r = Math.min(32, Math.abs(Math.round(amount))); if (!r) return new Uint8Array(input)
  const output = new Uint8Array(input.length), expand = amount > 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    let value = expand ? 0 : 255
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const px = x + dx, py = y + dy
      if (px >= 0 && px < width && py >= 0 && py < height) value = expand ? Math.max(value, input[py * width + px]) : Math.min(value, input[py * width + px])
    }
    output[y * width + x] = value
  }
  return output
}

/** Applies settings in the documented order: smooth → shift → feather → density. */
export function refineMaskAlpha(input: Uint8Array, width: number, height: number, parameters: RefineMaskParameters = {}): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || input.length !== width * height) throw new Error('蒙版尺寸无效')
  const smooth = Math.max(0, parameters.smooth ?? 0), shift = parameters.shift ?? 0, feather = Math.max(0, parameters.feather ?? 0)
  const density = Math.max(0, Math.min(200, parameters.density ?? 100)) / 100
  let output = smooth ? blurAlpha(input, width, height, smooth) : new Uint8Array(input)
  output = shift ? shiftAlpha(output, width, height, shift) : output
  output = feather ? blurAlpha(output, width, height, feather) : output
  if (density !== 1) output = Uint8Array.from(output, value => clamp(value * density))
  return output
}

/** Returns source pixels with optional fringe correction kept separate from alpha. */
export function decontaminateFringe(rgba: Uint8ClampedArray, alpha: Uint8Array, width: number, height: number, amount = 0, colorCorrection = true): Uint8ClampedArray {
  if (rgba.length !== width * height * 4 || alpha.length !== width * height) throw new Error('像素尺寸与蒙版长度不匹配')
  const output = new Uint8ClampedArray(rgba); if (!colorCorrection || amount <= 0) return output
  const strength = Math.max(0, Math.min(1, amount / 100))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x; if (alpha[index] >= 250 || alpha[index] === 0) continue
    let r = 0, g = 0, b = 0, count = 0
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const px = x + dx, py = y + dy; if (px < 0 || py < 0 || px >= width || py >= height) continue; const n = py * width + px; if (alpha[n] > 250) { r += output[n * 4]; g += output[n * 4 + 1]; b += output[n * 4 + 2]; count++ } }
    if (!count) continue; const p = index * 4; output[p] = Math.round(output[p] * (1 - strength) + r / count * strength); output[p + 1] = Math.round(output[p + 1] * (1 - strength) + g / count * strength); output[p + 2] = Math.round(output[p + 2] * (1 - strength) + b / count * strength)
  }
  return output
}
