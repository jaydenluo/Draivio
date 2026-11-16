import { afterEach, expect, test, vi } from 'vitest'
import { requestChatCompletion } from './chatAdapter'
import { requestProviderJson } from '../../lib/request'
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })
const input = { baseUrl: 'https://example.com/v1', apiKey: 'private-key', model: 'reasoner', messages: [{ role: 'user' as const, content: [{ type: 'image_url' as const, image_url: { url: 'data:image/png;base64,eA==' } }] }] }
const pendingFetch = () => vi.spyOn(globalThis, 'fetch').mockImplementation((_url, init) => new Promise((_resolve, reject) => { const signal = init!.signal!; signal.addEventListener('abort', () => reject(signal.reason)); if (signal.aborted) reject(signal.reason) }))
test('real provider chain forwards caller abort and keeps timeout active with caller signal', async () => {
  const fetcher = pendingFetch(); const caller = new AbortController()
  const cancelled = requestChatCompletion({ ...input, signal: caller.signal, timeoutMs: 1000 })
  const assertion = expect(cancelled).rejects.toMatchObject({ kind: 'cancelled' }); caller.abort(); await assertion
  const timed = requestChatCompletion({ ...input, signal: new AbortController().signal, timeoutMs: 5 })
  await expect(timed).rejects.toMatchObject({ kind: 'timeout' })
  expect(fetcher).toHaveBeenCalledTimes(2)
})
test('real fetch contract includes vision/auth and never retries 401 or 429', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('private-key', { status: 401 })).mockResolvedValueOnce(new Response('private-key', { status: 429 }))
  await expect(requestChatCompletion(input)).rejects.toThrow('权限')
  await expect(requestChatCompletion(input)).rejects.toThrow('频繁')
  expect(fetcher).toHaveBeenCalledTimes(2)
  const [url, init] = fetcher.mock.calls[0]
  expect(url).toBe('https://example.com/v1/chat/completions'); expect(url).not.toContain(input.apiKey)
  expect(init!.headers).toMatchObject({ Authorization: 'Bearer private-key' })
  const body = JSON.parse(init!.body as string); expect(body.messages).toEqual(input.messages); expect(JSON.stringify(body)).not.toContain(input.apiKey)
})
test('rejects both declared and streamed oversized responses without buffering the remainder', async () => {
  const cancel = vi.fn()
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}', { headers: { 'Content-Length': '100' } })).mockResolvedValueOnce(new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(20)) }, cancel })))
  const options = { baseUrl: input.baseUrl, apiKey: input.apiKey, protocol: 'openai_compatible', path: 'chat/completions' as const, maxResponseBytes: 10 }
  await expect(requestProviderJson(options)).rejects.toThrow('过大'); await expect(requestProviderJson(options)).rejects.toThrow('过大')
  expect(cancel).toHaveBeenCalled(); expect(fetcher).toHaveBeenCalledTimes(2)
})
test('caller cancellation interrupts response body consumption', async () => {
  const caller = new AbortController(); const cancel = vi.fn()
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('{')) }, cancel })))
  const pending = requestChatCompletion({ ...input, signal: caller.signal }); const check = expect(pending).rejects.toMatchObject({ kind: 'cancelled' })
  await new Promise(resolve => setTimeout(resolve, 5)); caller.abort(); await check; expect(cancel).toHaveBeenCalled()
})
test('surfaces structured quota exhaustion without leaking provider text', async () => {
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:{code:'insufficient_quota',message:'private provider detail'}}),{status:402}))
 await expect(requestChatCompletion(input)).rejects.toThrow('额度不足')
})
