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

for (const kind of ['timeout', 'cancelled'] as const) {
  test(`settles a stalled error response as ${kind} without waiting for supplier EOF`, async () => {
    let streamController!: ReadableStreamDefaultController<Uint8Array>
    const cancelled = vi.fn()
    const stream = new ReadableStream<Uint8Array>({ start(controller) { streamController = controller }, cancel: cancelled })
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(stream, { status: 402 }))
    const controller = new AbortController()
    let settled: unknown
    const pending = requestJson('https://example.com', { timeoutMs: kind === 'timeout' ? 5 : 1000, signal: controller.signal })
      .then(value => { settled = value }, error => { settled = error })
    if (kind === 'cancelled') {
      await new Promise(resolve => setTimeout(resolve, 5))
      controller.abort(new DOMException('private-key supplier text', 'AbortError'))
    }
    await new Promise(resolve => setTimeout(resolve, 40))
    const beforeEof = settled
    // Also finish the baseline implementation so a failing regression never leaves work hanging.
    if (!cancelled.mock.calls.length) streamController.close()
    await pending
    expect(beforeEof).toMatchObject({ kind, message: kind === 'timeout' ? '请求超时，请稍后重试' : '请求已取消' })
    expect(cancelled).toHaveBeenCalledOnce()
    expect(JSON.stringify(beforeEof)).not.toContain('private-key')
  })
}

test('keeps error JSON bounded to 8KB while retaining a short quota code', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'insufficient_quota' } }), { status: 402 }))
  expect(await requestJson('https://example.com')).toMatchObject({ status: 402, body: { error: { code: 'insufficient_quota' } } })
  fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'insufficient_quota', message: 'private-key'.repeat(900) } }), { status: 402 }))
  expect(await requestJson('https://example.com')).toMatchObject({ status: 402, body: null })
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
