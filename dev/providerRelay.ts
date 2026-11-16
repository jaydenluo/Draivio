import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { RequestError, requestJson } from '../src/lib/http.ts'

const loopback = (host: string) => ['localhost', '127.0.0.1', '[::1]', '::1', '::ffff:127.0.0.1'].includes(host)

// Development-only, same-origin loopback endpoint. Never forwards cookies or redirects.
export async function providerRelay(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = new URL(req.url ?? '/', 'http://localhost')
  const generation = path.pathname === '/__draivio/images/generations'
  if (!generation && path.pathname !== '/__draivio/models') return next()
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
    res.end(JSON.stringify(body))
  }
  let host: string
  try { host = new URL(`http://${req.headers.host}`).hostname } catch { return reply(403, {}) }
  if (!loopback(req.socket.remoteAddress ?? '') || !loopback(host) || req.headers['sec-fetch-site'] !== 'same-origin') return reply(403, {})
  if (req.method !== (generation ? 'POST' : 'GET')) return reply(405, {})
  let base: URL
  try { base = new URL(path.searchParams.get('baseUrl') ?? '') } catch { return reply(400, {}) }
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) return reply(400, {})
  const protocol = path.searchParams.get('protocol')
  if (!['openai_compatible', 'volcengine', 'gemini'].includes(protocol ?? '')) return reply(400, {})
  const gemini = protocol === 'gemini'
  if (generation && gemini) return reply(400, {})
  const auth = req.headers[gemini ? 'x-goog-api-key' : 'authorization']
  if (typeof auth !== 'string' || !auth.trim()) return reply(400, {})
  const url = new URL(`${base.toString().replace(/\/+$/, '')}/${generation ? 'images/generations' : 'models'}`)
  const cursorName = gemini ? 'pageToken' : 'after'
  const cursor = path.searchParams.get(cursorName)
  if (cursor && !generation) url.searchParams.set(cursorName, cursor)
  let payload: unknown
  if (generation) {
    // Bound body size before submitting a potentially billable upstream request.
    let size = 0
    const chunks: Buffer[] = []
    try {
      for await (const chunk of req) {
        const bytes = Buffer.from(chunk); size += bytes.length
        if (size > 1024 * 1024) return reply(413, {})
        chunks.push(bytes)
      }
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return reply(400, {})
    } catch { return reply(400, {}) }
  }
  try {
    const response = await requestJson(url.toString(), {
      method: generation ? 'POST' : 'GET', headers: gemini ? { 'x-goog-api-key': auth } : { Authorization: auth },
      body: payload, timeoutMs: generation ? 180000 : 10000,
    })
    res.setHeader('Retry-After', String(response.retryAfter / 1000))
    reply(response.status, response.body)
  } catch (reason) {
    const kind = reason instanceof RequestError && reason.kind === 'timeout' ? 'timeout' : 'network'
    res.setHeader('x-draivio-relay-error', kind)
    reply(502, { relayError: kind })
  }
}

export function providerRelayPlugin(): Plugin {
  return { name: 'draivio-local-provider-relay', apply: 'serve', configureServer(server) {
    server.middlewares.use((req, res, next) => { void providerRelay(req, res, next) })
  } }
}
