import { invoke, isTauri } from '@tauri-apps/api/core'
import { validatePrecisionAsset, packPrecisionAsset, toLinearPrecision, srgbPrecisionBuffer, PRECISION_RESOURCE_BUDGET, type PrecisionAsset } from './precisionAsset'

import { convertPrecision } from './precisionPipeline'

export type PrecisionCodec = 'png16' | 'tiff16' | 'exr32f'
export function nativePrecisionAvailable() { return isTauri() }

export async function decodePrecisionFile(file: File, codec: PrecisionCodec, signal?: AbortSignal): Promise<PrecisionAsset> {
  if (!nativePrecisionAvailable()) throw new Error('高精度文件解码需要桌面原生编解码器；浏览器导入会降位深，已拒绝')
  if (signal?.aborted) throw new DOMException('已取消高精度导入', 'AbortError')
  if (file.size > PRECISION_RESOURCE_BUDGET) throw new Error('文件超过 32 MiB 编解码传输预算')
  const bytes = new Uint8Array(await file.arrayBuffer()), chunks: string[] = []
  for (let i = 0; i < bytes.length; i += 0x8000) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 0x8000)))
  const asset = await invoke<unknown>('image_decode_precision', {encoded: btoa(chunks.join('')), codec})
  if (signal?.aborted) throw new DOMException('已取消高精度导入', 'AbortError')
  return validatePrecisionAsset(asset)
}

export async function encodePrecisionFile(asset: PrecisionAsset, codec: PrecisionCodec, signal?: AbortSignal): Promise<Blob> {
  if (!nativePrecisionAvailable()) throw new Error('高精度文件导出需要桌面原生编解码器')
  if (signal?.aborted) throw new DOMException('已取消高精度导出', 'AbortError')
  let raster = validatePrecisionAsset(asset)
  if ((raster.format === 'rgba32f') !== (codec === 'exr32f')) throw new Error('导出格式与位深不兼容，请显式转换')
  if (codec !== 'exr32f' && raster.encoding !== 'srgb') raster = packPrecisionAsset(await convertPrecision(srgbPrecisionBuffer(toLinearPrecision(raster)), 'rgba16', {signal}), 'srgb')
  if (codec === 'exr32f' && raster.encoding === 'srgb') raster = packPrecisionAsset(toLinearPrecision(raster), 'linear')
  const encoded = await invoke<string>('image_encode_precision', {raster, codec})
  if (signal?.aborted) throw new DOMException('已取消高精度导出', 'AbortError')
  if (encoded.length > Math.ceil(PRECISION_RESOURCE_BUDGET / 3) * 4) throw new Error('编码结果超出传输预算')
  const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0))
  return new Blob([bytes], {type: codec === 'png16' ? 'image/png' : codec === 'tiff16' ? 'image/tiff' : 'image/x-exr'})
}
