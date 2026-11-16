/** CMYK document primitives. Values are device channels, 0..255 (8 bit). */
export type CmykPixel = readonly [number, number, number, number]
export type CmykProfile = { id: string; name: string; iccBytes?: Uint8Array; totalInkLimit: number }
export type CmykDocument = {
  colorModel: 'cmyk'
  width: number
  height: number
  pixels: Uint8Array
  profile: CmykProfile
  /** Original RGB is retained when conversion is destructive or approximate. */
  sourceRgb?: Uint8ClampedArray
}

export type CmykConversion = { pixels: Uint8Array; warnings: string[]; reversible: boolean; method: 'icc' | 'fallback' }

const byte = (value: number, name: string) => {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0 || value > 255) throw new Error(`${name} 必须是 0–255 的整数`)
  return value
}

export function validateCmykPixel(pixel: CmykPixel): CmykPixel {
  if (!Array.isArray(pixel) || pixel.length !== 4) throw new Error('CMYK 必须包含四个通道')
  return pixel.map((value, index) => byte(value, ['C', 'M', 'Y', 'K'][index])) as unknown as CmykPixel
}

export function totalInk(pixel: CmykPixel): number {
  const [c, m, y, k] = validateCmykPixel(pixel)
  return (c + m + y + k) / 255
}

export function enforceInkLimit(pixel: CmykPixel, limit: number): CmykPixel {
  if (!Number.isFinite(limit) || limit <= 0 || limit > 4) throw new Error('总墨量限制必须在 0–400%')
  const current = totalInk(pixel)
  if (current <= limit) return pixel
  const scale = limit / current
  return pixel.map(channel => Math.round(channel * scale)) as unknown as CmykPixel
}

export function createCmykDocument(width: number, height: number, pixels: Uint8Array, profile: CmykProfile): CmykDocument {
  if (!Number.isInteger(width) || width <= 0 || !Number.isInteger(height) || height <= 0) throw new Error('CMYK 文档尺寸无效')
  if (pixels.length !== width * height * 4) throw new Error('CMYK 像素长度与尺寸不匹配')
  if (!profile?.id || !Number.isFinite(profile.totalInkLimit) || profile.totalInkLimit <= 0 || profile.totalInkLimit > 4) throw new Error('CMYK 配置文件或总墨量限制无效')
  for (let i = 0; i < pixels.length; i++) byte(pixels[i], 'CMYK 通道')
  return { colorModel: 'cmyk', width, height, pixels: new Uint8Array(pixels), profile: { ...profile, iccBytes: profile.iccBytes && new Uint8Array(profile.iccBytes) } }
}

/** Device-independent fallback used only when a native CMYK ICC link is unavailable. */
export function convertRgbToCmyk(rgb: Uint8ClampedArray, width: number, height: number, profile: CmykProfile): CmykConversion {
  if (rgb.length !== width * height * 4) throw new Error('RGB 像素长度与尺寸不匹配')
  const out = new Uint8Array(width * height * 4)
  const warnings = ['当前使用近似 CMYK 转换；需要原生 ICC/设备链接才能获得印刷级色彩准确性']
  for (let i = 0; i < width * height; i++) {
    const r = rgb[i * 4] / 255, g = rgb[i * 4 + 1] / 255, b = rgb[i * 4 + 2] / 255
    const k = 1 - Math.max(r, g, b)
    const denominator = 1 - k || 1
    const raw: CmykPixel = [(1 - r - k) / denominator * 255, (1 - g - k) / denominator * 255, (1 - b - k) / denominator * 255, k * 255].map(Math.round) as unknown as CmykPixel
    out.set(enforceInkLimit(raw, profile.totalInkLimit), i * 4)
  }
  return { pixels: out, warnings, reversible: false, method: 'fallback' }
}

export function unsupportedRgbWorkingCopy(reason: string) {
  return { mode: 'rgb-copy' as const, warning: `${reason}：已创建 RGB 工作副本，CMYK 文档模式未改变` }
}
