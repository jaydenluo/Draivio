import { afterEach, expect, it, vi } from 'vitest'
import { requestImageData } from './http'
afterEach(() => vi.unstubAllGlobals())
it('uses bounded credential-free image requests and rejects non-image data', async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response('not an image', { headers: { 'content-type': 'text/html' } }))
  vi.stubGlobal('fetch', fetcher)
  await expect(requestImageData('https://example.invalid/image')).rejects.toThrow('图片')
  expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit', redirect: 'error' })
})
it('rejects an oversized image before reading its body', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { headers: { 'content-type': 'image/png', 'content-length': String(33 * 1024 * 1024) } })))
  await expect(requestImageData('https://example.invalid/image')).rejects.toThrow('32MB')
})
it('embeds downloaded bytes exactly', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/png' } })))
  expect(await requestImageData('https://example.invalid/image')).toBe('data:image/png;base64,AQID')
})
it('embeds a local blob through the same bounded image reader', async () => {
  const fetcher=vi.fn().mockResolvedValue(new Response(new Uint8Array([1,2,3]),{headers:{'content-type':'image/png'}}))
  vi.stubGlobal('fetch',fetcher)
  expect(await requestImageData(`blob:${location.origin}/fixture`)).toBe('data:image/png;base64,AQID')
  expect(fetcher.mock.calls[0][0]).toBe(`blob:${location.origin}/fixture`)
})
it('propagates caller cancellation to the image request', async () => {
  const controller=new AbortController(); controller.abort()
  const fetcher=vi.fn(async (_url:string,options:RequestInit)=>{expect(options.signal?.aborted).toBe(true); throw new DOMException('Aborted','AbortError')})
  vi.stubGlobal('fetch',fetcher)
  await expect(requestImageData('https://example.invalid/image',{signal:controller.signal})).rejects.toThrow('图片下载失败')
})
it('rejects blob URLs from another origin before requesting',async()=>{
 const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher)
 await expect(requestImageData('blob:https://other.invalid/fixture')).rejects.toThrow('图片地址')
 expect(fetcher).not.toHaveBeenCalled()
})
