import { beforeEach, expect, test, vi } from 'vitest'
import { loadConnections, saveConnections, validateConnection, testConnection, type ServiceConnection } from './serviceConnections'

const connection: ServiceConnection = { id: 'custom-1', provider: 'OpenAI', name: '个人', baseUrl: 'https://example.com/v1', apiKey: 'test-only-key', protocol: 'openai_compatible', models: ['image-a'], enabled: true }
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); vi.unstubAllEnvs() })
test('persists multiple accounts without merging by provider', async () => {
  await saveConnections([connection, { ...connection, id: 'custom-2', name: '工作' }])
  expect(await loadConnections()).toHaveLength(2)
})
test('validates endpoint, credentials and models', () => {
  expect(validateConnection({ ...connection, baseUrl: 'file:///tmp/key' })).toBeTruthy()
  expect(validateConnection({ ...connection, apiKey: '' })).toBeTruthy()
  expect(validateConnection({ ...connection, models: [''] })).toBeTruthy()
  expect(validateConnection(connection)).toBe('')
})
test('tests the model list without submitting generation or following redirects', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'image-a' }] })))
  expect(await testConnection(connection)).toContain('模型列表可访问')
  expect(fetcher).toHaveBeenCalledWith('https://example.com/v1/models', expect.objectContaining({ method: 'GET', redirect: 'error' }))
})
test('reports authentication errors without leaking credentials', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('test-only-key', { status: 401 }))
  await expect(testConnection(connection)).rejects.toThrow('密钥无效或无访问权限')
})

test('tests Gemini with its own authentication and response shape', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ models: [{ name: 'models/image' }] })))
  await expect(testConnection({ ...connection, protocol: 'gemini' })).resolves.toContain('模型列表可访问')
  expect(fetcher).toHaveBeenCalledWith('https://example.com/v1/models', expect.objectContaining({ headers: { 'x-goog-api-key': 'test-only-key' } }))
})
test('rejects unsupported free tests without making a request', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch')
  await expect(testConnection({ ...connection, protocol: 'bfl' })).rejects.toThrow('不提供免费模型列表测试')
  expect(fetcher).not.toHaveBeenCalled()
})
test('roundtrips new protocols and preserves legacy native configurations', async () => {
  for (const protocol of ['gemini', 'volcengine', 'dashscope', 'bfl', 'stability', 'native'] as const) {
    await saveConnections([{ ...connection, protocol }])
    expect((await loadConnections())[0].protocol).toBe(protocol)
  }
})

test('fetches model IDs before selecting models and follows OpenAI pagination without redirects', async () => {
  const { fetchConnectionModels } = await import('./serviceConnections')
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({data:[{id:'image-a'}],has_more:true,last_id:'image-a'}))).mockResolvedValueOnce(new Response(JSON.stringify({data:[{id:'image-b'},{id:'image-a'}],has_more:false})))
  expect(await fetchConnectionModels({...connection,models:[],name:''})).toEqual(['image-a','image-b'])
  expect(fetcher.mock.calls[1][0]).toBe('https://example.com/v1/models?after=image-a')
})
test('normalizes Gemini names and follows page tokens', async () => {
  const { fetchConnectionModels }=await import('./serviceConnections')
  const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({models:[{name:'models/gemini-image'}],nextPageToken:'next token'}))).mockResolvedValueOnce(new Response(JSON.stringify({models:[{name:'models/other'}]})))
  expect(await fetchConnectionModels({...connection,protocol:'gemini',models:[]})).toEqual(['gemini-image','other'])
  expect(fetcher.mock.calls[1][0]).toBe('https://example.com/v1/models?pageToken=next+token')
})
test('allows saving a source before choosing models',async()=>{
 await saveConnections([{...connection,models:[]}])
 expect((await loadConnections())[0].models).toEqual([])
})

test('uses the local relay for model lists in browser development', async () => {
  vi.stubEnv('MODE', 'development')
  vi.stubEnv('DEV', true)
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ id: 'image-a' }] })))
  await testConnection(connection)
  const url = new URL(fetcher.mock.calls[0][0] as string, location.href)
  expect(url.pathname).toBe('/__draivio/models')
  expect(url.searchParams.get('baseUrl')).toBe(connection.baseUrl)
  expect(url.search).not.toContain(connection.apiKey)
})

test('distinguishes a timeout from a network or CORS failure', async () => {
  vi.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('timed out', 'TimeoutError'))
  await expect(testConnection(connection)).rejects.toThrow('模型列表请求超时')
})
test('browser storage never persists api keys and migrates legacy plaintext once', async () => {
 await saveConnections([connection])
 const stored = localStorage.getItem('draivio-service-connections-v1')!
 expect(stored).not.toContain(connection.apiKey)
 expect(JSON.parse(stored)[0].apiKey).toBe('')
 const legacy={...connection,apiKey:'legacy-secret'}
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([legacy]))
 const loaded=await loadConnections()
 expect(loaded[0].apiKey).toBe('legacy-secret')
 expect(localStorage.getItem('draivio-service-connections-v1')).not.toContain('legacy-secret')
})
