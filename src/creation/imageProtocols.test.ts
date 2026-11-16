import { expect, test } from 'vitest'
import { imageProtocols, switchProtocol } from './imageProtocols'

test('includes common image protocols with explicit request formats', () => {
  expect(imageProtocols.map(item => item.id)).toEqual(['openai_compatible', 'gemini', 'volcengine', 'dashscope', 'bfl', 'stability', 'native'])
  expect(imageProtocols.find(item => item.id === 'stability')?.format).toBe('multipart/form-data')
})
test('switches default addresses while preserving proxy addresses and other data', () => {
  expect(switchProtocol({ protocol: 'openai_compatible', baseUrl: 'https://api.openai.com/v1/' }, 'gemini').baseUrl).toContain('googleapis.com')
  expect(switchProtocol({ protocol: 'openai_compatible', baseUrl: 'https://proxy.example/v1' }, 'gemini').baseUrl).toBe('https://proxy.example/v1')
})
