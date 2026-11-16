import { afterEach, expect, test, vi } from 'vitest'
import { generateOpenAIImages } from './openaiImages'
import type { ServiceConnection } from './serviceConnections'
const connection: ServiceConnection = { id: 'a', provider: 'OpenAI', name: '代理', baseUrl: 'https://proxy.example/v1', apiKey: 'secret-only', protocol: 'openai_compatible', models: ['image'], enabled: true }
const options = { multiImage: 'split', concurrency: 2, sendSize: false, quality: 'omit' } as const
afterEach(() => vi.restoreAllMocks())
test('split requests omit unsupported optional parameters and decode actual results', async () => {
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] })))
 expect(await generateOpenAIImages(connection, { model: 'image', prompt: 'draw', count: 1, size: '1024 × 1024', options })).toEqual(['data:image/png;base64,aGVsbG8='])
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ model: 'image', prompt: 'draw' })
 expect(fetcher.mock.calls[0][1]).toMatchObject({ redirect: 'error', headers: { Authorization: 'Bearer secret-only' } })
})
test('native batch sends quantity, normalized size and explicit quality', async () => {
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'https://images.example/a.png' }] })))
 await generateOpenAIImages(connection, { model: 'image', prompt: 'draw', count: 4, size: '1536 × 1024', options: { ...options, multiImage: 'single', sendSize: true, quality: 'high' }, capabilities:{generate:true,edit:false,reference:false,encoding:'base64-json',quality:['high']} })
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toEqual({ model: 'image', prompt: 'draw', n: 4, size: '1536x1024', quality: 'high' })
})
test('distinguishes rejected requests, limits and uncertain network failures without leaking keys', async () => {
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret-only', { status: 429, headers: { 'Retry-After': '3' } }))
 await expect(generateOpenAIImages(connection, { model: 'image', prompt: 'draw', count: 1, size: 'auto', options })).rejects.toMatchObject({ status: 429, uncertain: false, retryAfter: 3000 })
 fetcher.mockRejectedValue(new Error('secret-only'))
 await expect(generateOpenAIImages(connection, { model: 'image', prompt: 'draw', count: 1, size: 'auto', options })).rejects.toMatchObject({ uncertain: true })
})
test('invalid successful responses are uncertain and unsupported protocols never send requests', async () => {
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ url: 'javascript:alert(1)' }] })))
 await expect(generateOpenAIImages(connection, { model: 'image', prompt: 'draw', count: 1, size: 'auto', options })).resolves.toEqual([null])
 fetcher.mockClear()
 await expect(generateOpenAIImages({ ...connection, protocol: 'gemini' }, { model: 'image', prompt: 'draw', count: 1, size: 'auto', options })).rejects.toThrow('尚未接入')
 expect(fetcher).not.toHaveBeenCalled()
})

test('preserves valid paid images when another response entry is malformed', async () => {
 vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }, { url: 'javascript:invalid' }] })))
 await expect(generateOpenAIImages(connection, { model: 'image', prompt: 'draw', count: 2, size: 'auto', options: { ...options, multiImage: 'single' } })).resolves.toEqual(['data:image/png;base64,aGVsbG8=', null])
})
test('surfaces structured image quota exhaustion', async () => {
 const connection:any={id:'quota',provider:'x',name:'x',baseUrl:'https://example.com/v1',apiKey:'k',protocol:'openai_compatible',models:['m'],enabled:true}
 vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:402}))
 await expect(generateOpenAIImages(connection,{model:'m',prompt:'x',count:1,size:'1024x1024',options:{sendSize:true,quality:'omit',multiImage:'single'},intent:'generate'} as any)).rejects.toThrow('额度不足')
})
