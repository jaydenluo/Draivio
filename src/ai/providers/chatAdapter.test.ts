import { describe, expect, it, vi } from 'vitest'
import { parseChatResponse, parseJsonPlan, requestChatCompletion } from './chatAdapter'
import { requestProviderJson } from '../../lib/request'
vi.mock('../../lib/request', async () => { const actual = await vi.importActual<typeof import('../../lib/request')>('../../lib/request'); return { ...actual, requestProviderJson: vi.fn() } })
describe('chat adapter', () => {
  it('parses tool calls and schema checked plans without credentials', async () => {
    const result = parseChatResponse({ choices: [{ message: { content: '', tool_calls: [{ id: '1', function: { name: 'move', arguments: '{"dx":4,"dy":2}' } }] } }] })
    expect(result.toolCalls[0].arguments).toEqual({ dx: 4, dy: 2 })
    expect(parseJsonPlan('{"steps":[{"op":"move","dx":4}]}').steps).toHaveLength(1)
    expect(() => parseJsonPlan('{"steps":[{"op":"move","apiKey":"secret"}]}')).toThrow('凭据')
  })
  it('uses one shared provider request and never puts the key in the body', async () => {
    vi.mocked(requestProviderJson).mockResolvedValue({ status: 200, body: { choices: [{ message: { content: 'ok' } }] }, retryAfter: 1000 })
    await requestChatCompletion({ baseUrl: 'https://example.com/v1', apiKey: 'secret', model: 'reasoner', messages: [{ role: 'user', content: 'hi' }] })
    expect(requestProviderJson).toHaveBeenCalledWith(expect.objectContaining({ path: 'chat/completions', method: 'POST', apiKey: 'secret', body: expect.not.objectContaining({ apiKey: 'secret' }) }))
  })
})
