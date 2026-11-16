import { createServer, request } from 'node:http'
import { afterEach, expect, test, vi } from 'vitest'
import { providerRelay } from './providerRelay'

afterEach(() => vi.restoreAllMocks())

async function probe(headers: Record<string, string>, query = '', route = 'models', body?: unknown) {
  const server = createServer((req, res) => { void providerRelay(req, res, () => { res.statusCode = 404; res.end() }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  try {
    return await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request({ host: '127.0.0.1', port: address.port, path: `/__draivio/${route}?${query}`, method: body === undefined ? 'GET' : 'POST', headers }, res => {
        let body = ''
        res.on('data', data => { body += data })
        res.on('end', () => resolve({ status: res.statusCode!, body }))
      })
      req.on('error', reject); req.end(body === undefined ? undefined : JSON.stringify(body))
    })
  } finally { await new Promise<void>(resolve => server.close(() => resolve())) }
}

test('relays only model GETs with authentication and pagination, without cookies or redirects', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'image-a' }] })))
  const result = await probe({ 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer test-only', Cookie: 'private-cookie' }, new URLSearchParams({ baseUrl: 'https://example.com/v1', protocol: 'openai_compatible', after: 'image-previous' }).toString())
  expect(result.status).toBe(200)
  expect(JSON.parse(result.body).data[0].id).toBe('image-a')
  expect(fetcher).toHaveBeenCalledWith('https://example.com/v1/models?after=image-previous', expect.objectContaining({ headers: { Authorization: 'Bearer test-only' }, redirect: 'error' }))
})

test('refuses cross-site access and invalid upstream URLs before making a request', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch')
  expect((await probe({ 'Sec-Fetch-Site': 'cross-site' })).status).toBe(403)
  expect((await probe({ 'Sec-Fetch-Site': 'same-origin' }, 'baseUrl=file:///tmp/private&protocol=openai_compatible')).status).toBe(400)
  expect(fetcher).not.toHaveBeenCalled()
})

test('returns a sanitized gateway error on network failure', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('secret upstream detail'))
  const result = await probe({ 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer test-only' }, 'baseUrl=https://example.com/v1&protocol=openai_compatible')
  expect(result.status).toBe(502)
  expect(result.body).not.toContain('secret')
})

test('relays image generation once with the JSON payload and retry delay', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('private upstream error', { status: 429, headers: { 'Retry-After': '3' } }))
  const payload = { model: 'image', prompt: 'draw' }
  const result = await probe({ 'Sec-Fetch-Site': 'same-origin', Authorization: 'Bearer test-only' }, 'baseUrl=https://example.com/v1&protocol=openai_compatible', 'images/generations', payload)
  expect(result.status).toBe(429)
  expect(result.body).not.toContain('private upstream error')
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect(fetcher).toHaveBeenCalledWith('https://example.com/v1/images/generations', expect.objectContaining({ method: 'POST', body: JSON.stringify(payload), redirect: 'error' }))
})
