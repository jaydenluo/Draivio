import { requestJson, RequestError, type JsonResponse, type JsonOptions } from './http'
export { requestJson, RequestError } from './http'

export type ProviderRequest = JsonOptions & { baseUrl: string; apiKey: string; protocol: string; path: 'models' | 'images/generations' | 'images/edits' | 'chat/completions'; query?: Record<string, string> }
export async function requestProviderJson(options: ProviderRequest): Promise<JsonResponse> {
  const allowedPaths = new Set<ProviderRequest['path']>(['models', 'images/generations', 'images/edits', 'chat/completions'])
  if (!allowedPaths.has(options.path) || options.path.includes('..') || options.path.includes('://')) throw new RequestError('invalid-response', '不允许的供应商请求路径')
  const base = new URL(options.baseUrl)
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new RequestError('invalid-response', '请填写有效的 HTTP(S) 接口地址')
  const localRelay = import.meta.env.DEV && import.meta.env.MODE !== 'test' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
  const query = new URLSearchParams(options.query)
  const direct = `${options.baseUrl.replace(/\/+$/, '')}/${options.path}${query.size ? `?${query}` : ''}`
  const relay = new URLSearchParams({ baseUrl: options.baseUrl, protocol: options.protocol, ...options.query })
  return requestJson(localRelay ? `/__draivio/${options.path}?${relay}` : direct, {
    method: options.method, body: options.body, signal: options.signal, maxResponseBytes: options.maxResponseBytes, timeoutMs: (options.timeoutMs ?? 10000) + (localRelay ? 2000 : 0),
    headers: options.protocol === 'gemini' ? { 'x-goog-api-key': options.apiKey } : { Authorization: `Bearer ${options.apiKey}` },
  })
}
