export type RawFormat = 'dng' | 'cr2' | 'cr3' | 'nef' | 'arw' | 'orf' | 'raf' | 'rw2' | 'unknown'
export type RawMetadata = { format: RawFormat; orientation: 1|2|3|4|5|6|7|8; width?: number; height?: number; make?: string; model?: string }
export type DevelopSettings = { exposureEV: number; whiteBalance: { r: number; g: number; b: number }; highlightRecovery: number }
export type RawSource = { bytes: Uint8Array; metadata: RawMetadata; settings: DevelopSettings; checksum: string }
/** JSON-safe project representation. Raw bytes are deliberately copied as an
 * integer array so a project round-trip cannot silently drop the original. */
export type RawSourceRecord = { bytes: number[]; metadata: RawMetadata; settings: DevelopSettings; checksum: string }

const MAX_RAW_BYTES = 16 * 1024 * 1024

export const RAW_SUPPORT_MATRIX = Object.freeze({
  dng: { decode: false, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' }, cr2: { decode: true, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' }, cr3: { decode: false, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' },
  nef: { decode: true, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' }, arw: { decode: true, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' }, orf: { decode: false, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' }, raf: { decode: false, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' }, rw2: { decode: false, reason: '需本地 rawpy/LibRaw；具体相机以实测矩阵为准' },
})
const EXTENSIONS: Record<string, RawFormat> = { dng:'dng', cr2:'cr2', cr3:'cr3', nef:'nef', arw:'arw', orf:'orf', raf:'raf', rw2:'rw2' }
const DEFAULT_SETTINGS = (): DevelopSettings => ({ exposureEV: 0, whiteBalance: { r: 1, g: 1, b: 1 }, highlightRecovery: 0 })
export function detectRawFormat(name: string, bytes?: Uint8Array): RawFormat {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (EXTENSIONS[ext]) return EXTENSIONS[ext]
  if (bytes && bytes.length >= 4 && bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0) return 'unknown'
  if (bytes && bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0 && bytes[3] === 0x2a) return 'unknown'
  return 'unknown'
}
export function validateRawBytes(format: RawFormat, bytes: Uint8Array): void {
  if (format === 'unknown' || bytes.length < 16) throw new Error('不支持或损坏的 RAW 文件')
  if (bytes[0] === 0xff && bytes[1] === 0xd8) throw new Error('仅检测到 JPEG，不是完整 RAW 文件')
  if (!RAW_SUPPORT_MATRIX[format].decode) throw new Error(`${format.toUpperCase()} 暂不支持真实 RAW 解码：${RAW_SUPPORT_MATRIX[format].reason}`)
}
export function validateDevelopSettings(settings: DevelopSettings): DevelopSettings {
  const finite = (v: number) => Number.isFinite(v)
  if (!settings || !settings.whiteBalance || !finite(settings.exposureEV) || settings.exposureEV < -8 || settings.exposureEV > 8 || !finite(settings.highlightRecovery) || settings.highlightRecovery < 0 || settings.highlightRecovery > 1 || ![settings.whiteBalance.r,settings.whiteBalance.g,settings.whiteBalance.b].every(v => finite(v) && v > 0 && v <= 16)) throw new Error('RAW 显影参数无效')
  return structuredClone(settings)
}
export function toRawSourceRecord(source: RawSource): RawSourceRecord {
  validateRawSourceRecord({ ...source, bytes: Array.from(source.bytes) })
  return { bytes: Array.from(source.bytes), metadata: structuredClone(source.metadata), settings: validateDevelopSettings(source.settings), checksum: source.checksum }
}
export function fromRawSourceRecord(record: RawSourceRecord): RawSource {
  validateRawSourceRecord(record)
  return { bytes: Uint8Array.from(record.bytes), metadata: structuredClone(record.metadata), settings: validateDevelopSettings(record.settings), checksum: record.checksum }
}
export function validateRawSourceRecord(value: unknown): asserts value is RawSourceRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('RAW 源记录无效')
  const source = value as Partial<RawSourceRecord>
  if (!Array.isArray(source.bytes) || source.bytes.length === 0 || source.bytes.length > MAX_RAW_BYTES || !source.bytes.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) throw new Error('RAW 原始字节无效')
  if (!source.metadata || typeof source.metadata !== 'object' || !Object.hasOwn(RAW_SUPPORT_MATRIX, (source.metadata as RawMetadata).format) || ![1,2,3,4,5,6,7,8].includes((source.metadata as RawMetadata).orientation)) throw new Error('RAW 元数据无效')
  const metadata = source.metadata as RawMetadata
  for (const key of ['width', 'height'] as const) if (metadata[key] !== undefined && (!Number.isInteger(metadata[key]) || metadata[key]! < 1 || metadata[key]! > 100000)) throw new Error('RAW 元数据尺寸无效')
  for (const key of ['make', 'model'] as const) if (metadata[key] !== undefined && (typeof metadata[key] !== 'string' || metadata[key].length > 512)) throw new Error('RAW 元数据文本无效')
  if (typeof source.checksum !== 'string' || !/^[a-f0-9]{8,128}$/i.test(source.checksum)) throw new Error('RAW 校验和无效')
  validateDevelopSettings(source.settings as DevelopSettings)
}
export function defaultDevelopSettings(): DevelopSettings { return DEFAULT_SETTINGS() }
export function cacheKey(checksum: string, settings: DevelopSettings, width: number, height: number): string { return `${checksum}:${width}x${height}:${JSON.stringify(validateDevelopSettings(settings))}` }
export function applyDevelopSettings(rgba: Uint8ClampedArray, settings: DevelopSettings, signal?: AbortSignal): Uint8ClampedArray {
  const s = validateDevelopSettings(settings); const out = rgba.slice(); const gain = 2 ** s.exposureEV
  for (let i = 0; i < out.length; i += 4) { if (signal?.aborted) throw new DOMException('取消 RAW 显影','AbortError'); const lum = (out[i]*.2126+out[i+1]*.7152+out[i+2]*.0722)/255; for (const [offset,key] of [[0,'r'],[1,'g'],[2,'b'] ] as const) { const value = out[i+offset] / 255 * gain * s.whiteBalance[key]; const recovered = s.highlightRecovery * Math.max(0, value - 1); out[i+offset] = Math.round(Math.max(0, Math.min(1, value - recovered * (1 - lum))) * 255) } }
  return out
}
export async function decodeRaw(source: RawSource, signal?: AbortSignal): Promise<RawDecodeResult> { return developRaw(toRawSourceRecord(source), signal) }

export type RawDecodeResult = { asset: import('../render/precisionAsset').PrecisionAsset; preview: string; orientation: RawMetadata['orientation']; checksum: string; backend: string; peakRss: number; cameraWhiteBalance: number[] }
const decodedRawCache = new Map<string, RawDecodeResult>()
export async function developRaw(record: RawSourceRecord, signal?: AbortSignal): Promise<RawDecodeResult> {
  validateRawSourceRecord(record)
  if (record.bytes.length > 16 * 1024 * 1024) throw new Error('RAW超过16MiB原始资源预算')
  if (signal?.aborted) throw new DOMException('已取消RAW显影', 'AbortError')
  validateRawBytes(record.metadata.format, Uint8Array.from(record.bytes))
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', Uint8Array.from(record.bytes)))).map(v => v.toString(16).padStart(2, '0')).join('')
  if (hash !== record.checksum) throw new Error('RAW原始字节校验和不匹配')
  const key = cacheKey(record.checksum, record.settings, 0, 0) + ':rawpy-half-v1'
  const cached = decodedRawCache.get(key)
  if (cached) return cached
  const { invokeCommand } = await import('../lib/native')
  if (signal?.aborted) throw new DOMException('已取消RAW显影', 'AbortError')
  const id = crypto.randomUUID(), cancel = () => { void invokeCommand('raw_cancel', { id }).catch(() => {}) }
  signal?.addEventListener('abort', cancel, { once: true })
  const chunks: string[] = []
  for (let i = 0; i < record.bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...record.bytes.slice(i, i + 0x8000)))
  try {
    const result = await invokeCommand<RawDecodeResult>('raw_decode', { id, request: { data: btoa(chunks.join('')), settings: validateDevelopSettings(record.settings) } })
    if (signal?.aborted) throw new DOMException('已取消RAW显影', 'AbortError')
    const { validatePrecisionAsset } = await import('../render/precisionAsset')
    validatePrecisionAsset(result.asset)
    if (!result.preview.startsWith('data:image/png;base64,') || result.checksum !== record.checksum) throw new Error('RAW后端结果校验失败')
    decodedRawCache.clear(); decodedRawCache.set(key, result)
    return result
  } finally { signal?.removeEventListener('abort', cancel) }
}
