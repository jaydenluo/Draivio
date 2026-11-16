import { afterEach, expect, test, vi } from 'vitest'
import { requestJson, requestProviderJson } from './request'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

test('does not retry paid POSTs or expose raw network errors', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('private-key and prompt'))
  await expect(requestJson('https://example.com', { method: 'POST', body: { prompt: 'draw' }, timeoutMs: 100 })).rejects.toMatchObject({ kind: 'network', message: '网络连接失败，请检查网络或跨域设置' })
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'POST' })
})

test('classifies timeout and invalid successful JSON', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
  await expect(requestJson('https://example.com')).rejects.toMatchObject({ kind: 'timeout' })
  fetcher.mockResolvedValue(new Response('<html>private-key</html>'))
  await expect(requestJson('https://example.com')).rejects.toMatchObject({ kind: 'invalid-response' })
})

test('discards supplier error bodies while preserving status and retry delay', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private-key', { status: 429, headers: { 'Retry-After': '3' } }))
  expect(await requestJson('https://example.com')).toMatchObject({ status: 429, body: null, retryAfter: 3000 })
})

test('routes development image requests through the same-origin relay without putting keys in URLs', async () => {
  vi.stubEnv('MODE', 'development'); vi.stubEnv('DEV', true)
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'))
  await requestProviderJson({ baseUrl: 'https://example.com/v1', apiKey: 'private-key', protocol: 'openai_compatible', path: 'images/generations', method: 'POST', body: { prompt: 'draw' }, timeoutMs: 180000 })
  const [url, init] = fetcher.mock.calls[0]
  expect(url).toContain('/__draivio/images/generations?')
  expect(url).not.toContain('private-key')
  expect(init).toMatchObject({ method: 'POST', body: JSON.stringify({ prompt: 'draw' }) })
})
