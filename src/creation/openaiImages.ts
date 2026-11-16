import { isTauri } from '@tauri-apps/api/core'
import { invokeCommand } from '../lib/native'
import { requestProviderJson } from '../lib/request'
import type { ServiceConnection } from './serviceConnections'
import type { GenerationOptions } from './generationOptions'

export class ImageRequestError extends Error {
  constructor(message: string, public uncertain: boolean, public status?: number, public retryAfter = 1000) { super(message) }
}
export type ImageInput = { model: string; prompt: string; count: number; size: string; options: GenerationOptions }
export function imagePayload(input: ImageInput) {
  return { model: input.model, prompt: input.prompt,
    ...(input.options.multiImage === 'single' ? { n: input.count } : {}),
    ...(input.options.sendSize ? { size: input.size.replace(/\s/g, '').replace('×', 'x') } : {}),
    ...(input.options.quality !== 'omit' ? { quality: input.options.quality } : {}),
  }
}
export type ImageResults = (string | null)[]
export function parseImageResponse(value: unknown): ImageResults {
  const data = (value as { data?: unknown })?.data
  if (!Array.isArray(data) || !data.length) throw new ImageRequestError('接口未返回图片，结果未知，请先检查供应商记录', true)
  return data.map(item => {
    if (typeof item?.b64_json === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(item.b64_json)) return `data:image/png;base64,${item.b64_json}`
    if (typeof item?.url === 'string') {
      try { const url = new URL(item.url); if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password) return item.url } catch { /* invalid result */ }
    }
    return null
  })
}
export async function generateOpenAIImages(connection: ServiceConnection, input: ImageInput): Promise<ImageResults> {
  if (!['openai_compatible', 'volcengine'].includes(connection.protocol)) throw new ImageRequestError('该协议尚未接入真实生图', false)
  const payload = imagePayload(input)
  let response: { status: number; body: unknown; retryAfter?: number }
  if (isTauri()) {
    try { response = await invokeCommand('generate_openai_images', { connectionId: connection.id, payload }) }
    catch { throw new ImageRequestError('请求中断或超时，结果未知，请先检查供应商记录', true) }
  } else {
    try {
      response = await requestProviderJson({ ...connection, path: 'images/generations', method: 'POST', body: payload, timeoutMs: 180000 })
    } catch { throw new ImageRequestError('网络、跨域或超时导致结果未知，请先检查供应商记录', true) }
  }
  if (response.status === 429) throw new ImageRequestError('请求受限，已降低并发，请稍后重试失败项', false, 429, response.retryAfter)
  if ([401, 403].includes(response.status)) throw new ImageRequestError('密钥无效或无生图权限', false, response.status)
  if (response.status < 200 || response.status >= 300) throw new ImageRequestError(`生图请求失败（HTTP ${response.status}）${response.status >= 500 ? '，结果未知，请先检查供应商记录' : '，请核对参数和模型'}`, response.status >= 500 || response.status === 408, response.status)
  return parseImageResponse(response.body)
}
