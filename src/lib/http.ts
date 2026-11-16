export type RequestErrorKind = 'network' | 'timeout' | 'cancelled' | 'invalid-response' | 'native'
export class RequestError extends Error {
  constructor(public kind: RequestErrorKind, message: string) { super(message); this.name = 'RequestError' }
}
export type JsonResponse = { status: number; body: unknown; retryAfter: number }
export type JsonOptions = { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: unknown; timeoutMs?: number; signal?: AbortSignal; maxResponseBytes?: number }

function retryDelay(header: string | null) {
  const value = header && /^\d+(\.\d+)?$/.test(header) ? Number(header) * 1000 : header ? Date.parse(header) - Date.now() : 1000
  return Number.isFinite(value) ? Math.max(1000, Math.min(60000, value)) : 1000
}

/** No retries, supplier error bodies, credentials in logs, or redirect forwarding. */
export async function requestJson(url: string, options: JsonOptions = {}): Promise<JsonResponse> {
  const controller = new AbortController()
  const cancel = () => controller.abort(options.signal?.reason ?? new DOMException('Cancelled', 'AbortError'))
  options.signal?.addEventListener('abort', cancel, { once: true })
  if (options.signal?.aborted) cancel()
  const timer = setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), options.timeoutMs ?? 10000)
  try {
    const multipart = typeof FormData !== 'undefined' && options.body instanceof FormData
    const response = await fetch(url, {
      method: options.method ?? 'GET', headers: { ...(options.body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
      ...(options.body !== undefined ? { body: (multipart ? options.body : JSON.stringify(options.body)) as any } : {}),
      redirect: 'error', signal: controller.signal,
    })
    const relayError = response.headers.get('x-draivio-relay-error')
    if (relayError) throw new RequestError(relayError === 'timeout' ? 'timeout' : 'network', relayError === 'timeout' ? '请求超时，请稍后重试' : '本机无法连接供应商，请检查网络、接口地址或代理设置')
    const retryAfter = retryDelay(response.headers.get('Retry-After'))
    if (!response.ok) {
      // Keep structured provider error codes (for example `insufficient_quota`)
      // while bounding the body and never exposing arbitrary supplier text.
      const errorLimit = 8 * 1024
      let body: unknown = null
      try {
        const reader = response.body?.getReader()
        if (reader) {
          const chunks: Uint8Array[] = []; let size = 0
          const abortRead = () => { void reader.cancel().catch(() => {}) }
          controller.signal.addEventListener('abort', abortRead, { once: true })
          try {
            if (controller.signal.aborted) { abortRead(); throw controller.signal.reason }
            for (;;) {
              const { value, done } = await reader.read()
              if (controller.signal.aborted) throw controller.signal.reason
              if (done) break
              size += value.byteLength
              if (size > errorLimit) { void reader.cancel().catch(() => {}); break }
              chunks.push(value)
            }
            if (size <= errorLimit) {
              const text = new TextDecoder().decode(Uint8Array.from(chunks.flatMap(chunk => [...chunk])))
              try { body = JSON.parse(text) } catch { body = null }
            }
          } finally { controller.signal.removeEventListener('abort', abortRead); reader.releaseLock() }
        }
      } catch (reason) { if (controller.signal.aborted) throw reason; body = null }
      return { status: response.status, body, retryAfter }
    }
    const limit = options.maxResponseBytes ?? 64 * 1024 * 1024
    if (!Number.isSafeInteger(limit) || limit < 1) throw new RequestError('invalid-response', '响应体限制无效')
    if (Number(response.headers.get('Content-Length')) > limit) {
      await response.body?.cancel()
      throw new RequestError('invalid-response', '接口响应过大')
    }
    let body: unknown = null
    if (response.status !== 204) {
      const reader = response.body?.getReader()
      if (!reader) throw new RequestError('invalid-response', '接口返回格式无效，请核对地址和协议')
      const chunks: Uint8Array[] = []; let size = 0
      const abortRead = () => { void reader.cancel().catch(() => {}) }
      controller.signal.addEventListener('abort', abortRead, { once: true })
      try {
        for (;;) {
          if (controller.signal.aborted) throw controller.signal.reason
          const { value, done } = await reader.read()
          if (controller.signal.aborted) throw controller.signal.reason
          if (done) break
          size += value.byteLength
          if (size > limit) { await reader.cancel(); throw new RequestError('invalid-response', '接口响应过大') }
          chunks.push(value)
        }
        const bytes = new Uint8Array(size); let at = 0
        for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length }
        try { body = JSON.parse(new TextDecoder().decode(bytes)) }
        catch { throw new RequestError('invalid-response', '接口返回格式无效，请核对地址和协议') }
      } finally { controller.signal.removeEventListener('abort', abortRead); reader.releaseLock() }
    }
    return { status: response.status, body, retryAfter }
  } catch (reason) {
    if (reason instanceof RequestError) throw reason
    if (controller.signal.aborted && controller.signal.reason?.name !== 'TimeoutError') throw new RequestError('cancelled', '请求已取消')
    if (controller.signal.reason?.name === 'TimeoutError') throw new RequestError('timeout', '请求超时，请稍后重试')
    if (reason && typeof reason === 'object' && 'name' in reason && reason.name === 'TimeoutError') throw new RequestError('timeout', '请求超时，请稍后重试')
    throw new RequestError('network', '网络连接失败，请检查网络或跨域设置')
  } finally { clearTimeout(timer); options.signal?.removeEventListener('abort', cancel) }
}

