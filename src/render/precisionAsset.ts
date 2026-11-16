import { createPixelBuffer, enforceBudget, readNormalized, writeNormalized, type PixelBuffer } from './pixelBuffer'

export type PrecisionAsset = { width: number; height: number; format: 'rgba16' | 'rgba32f'; data: string; encoding?: 'linear' | 'srgb' }
export const PRECISION_RESOURCE_BUDGET = 32 * 1024 * 1024

function dimensions(width: unknown, height: unknown, format: unknown): number {
  if (typeof width !== 'number' || typeof height !== 'number' || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > 16384 || height > 16384) throw new Error('高精度资源尺寸无效')
  if (format !== 'rgba16' && format !== 'rgba32f') throw new Error('高精度资源格式无效')
  enforceBudget(width, height, format, PRECISION_RESOURCE_BUDGET)
  return width * height * 4 * (format === 'rgba16' ? 2 : 4)
}

export function packPrecisionAsset(buffer: PixelBuffer, encoding: 'linear' | 'srgb' = 'linear'): PrecisionAsset {
  const length = dimensions(buffer.width, buffer.height, buffer.format)
  if (buffer.data.length !== buffer.width * buffer.height * 4) throw new Error('高精度资源长度无效')
  const bytes = new Uint8Array(length), view = new DataView(bytes.buffer), step = buffer.format === 'rgba16' ? 2 : 4
  for (let i = 0; i < buffer.data.length; i++) {
    const value = buffer.data[i]
    if (!Number.isFinite(value)) throw new Error('浮点资源包含非有限数值')
    if (step === 2) view.setUint16(i * step, value, true)
    else view.setFloat32(i * step, value, true)
  }
  const chunks: string[] = []
  for (let start = 0; start < length; start += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(start, start + 0x8000)))
  return {width: buffer.width, height: buffer.height, format: buffer.format as PrecisionAsset['format'], encoding, data: btoa(chunks.join(''))}
}

export function validatePrecisionAsset(value: unknown): PrecisionAsset {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('高精度资源无效')
  const asset = value as PrecisionAsset, length = dimensions(asset.width, asset.height, asset.format)
  if (asset.encoding !== undefined && asset.encoding !== 'linear' && asset.encoding !== 'srgb') throw new Error('高精度颜色编码无效')
  if (typeof asset.data !== 'string' || asset.data.length !== Math.ceil(length / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.data)) throw new Error('高精度资源长度或编码无效')
  const binary = atob(asset.data)
  if (binary.length !== length) throw new Error('高精度资源长度无效')
  if (asset.format === 'rgba32f') {
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0)), view = new DataView(bytes.buffer)
    for (let i = 0; i < length; i += 4) if (!Number.isFinite(view.getFloat32(i, true))) throw new Error('浮点资源包含非有限数值')
  }
  return {width: asset.width, height: asset.height, format: asset.format, data: asset.data, encoding: asset.encoding ?? 'linear'}
}

export function unpackPrecisionAsset(value: unknown): PixelBuffer {
  const asset = validatePrecisionAsset(value), binary = atob(asset.data)
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0)), view = new DataView(bytes.buffer)
  const buffer = createPixelBuffer(asset.width, asset.height, asset.format), step = asset.format === 'rgba16' ? 2 : 4
  for (let i = 0; i < buffer.data.length; i++) buffer.data[i] = step === 2 ? view.getUint16(i * step, true) : view.getFloat32(i * step, true)
  return buffer
}

/** Resource cap reserves sixteen raw-buffer equivalents for typed working buffers,
 * base64/string/JSON copies, IPC and native codec scratch under the 512 MiB budget.
 * Legacy assets were explicitly scene-linear and keep that interpretation. */
export function toLinearPrecision(value: PrecisionAsset): PixelBuffer {
  const source = unpackPrecisionAsset(value)
  if ((value.encoding ?? 'linear') === 'linear') return source
  const out = createPixelBuffer(source.width, source.height, 'rgba32f')
  for (let i = 0; i < source.width * source.height; i++) {
    const rgba = readNormalized(source, i)
    for (let c = 0; c < 3; c++) rgba[c] = rgba[c] <= .04045 ? rgba[c] / 12.92 : ((rgba[c] + .055) / 1.055) ** 2.4
    writeNormalized(out, i, rgba)
  }
  return out
}
export function srgbPrecisionBuffer(source: PixelBuffer): PixelBuffer {
  enforceBudget(source.width, source.height, 'rgba32f', PRECISION_RESOURCE_BUDGET)
  const out = createPixelBuffer(source.width, source.height, 'rgba32f')
  for (let i = 0; i < source.width * source.height; i++) {
    const rgba = readNormalized(source, i)
    for (let c = 0; c < 3; c++) rgba[c] = rgba[c] <= .0031308 ? 12.92 * rgba[c] : 1.055 * rgba[c] ** (1 / 2.4) - .055
    writeNormalized(out, i, rgba)
  }
  return out
}
