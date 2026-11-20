import { expect, test } from 'vitest'
import { filterImageParameters, imageCapabilitiesFor, imageSupports } from './imageEditCapabilities'
import { imageEditFormData, imageEditPayload } from './openaiImages'
import { generateOpenAIImages } from './openaiImages'
import type { ServiceConnection } from './serviceConnections'
import { vi } from 'vitest'

const input = { model: 'gpt-image-1', prompt: 'remove the sign', reference:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==', count: 1, size: '1024 × 1024', options: { multiImage: 'single' as const, concurrency: 1, sendSize: true, quality: 'high' as const } }

test('edit contract carries reference image, normalized size and supported quality', () => {
  expect(imageEditPayload(input)).toEqual({ model: 'gpt-image-1', prompt: 'remove the sign', image: input.reference, n: 1, size: '1024x1024', quality: 'high' })
  const form = imageEditFormData(input)
  expect(form.get('image')).toBeInstanceOf(File);expect((form.get('image') as File).type).toBe('image/png')
  expect(form.get('size')).toBe('1024x1024')
})

test('keeps the target as the first image and sends an additional reference separately', () => {
  const form=imageEditFormData({...input,mask:input.reference,additionalReference:input.reference})
  expect(form.getAll('image[]')).toHaveLength(2)
  expect(form.get('mask')).toBeInstanceOf(File)
  expect(form.get('additional_reference')).toBeNull()
})

test('sends target and reference in order for JSON edit contracts', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 const connection={id:'one',provider:'OpenAI',name:'test',baseUrl:'https://example.com/v1',apiKey:'test-only',protocol:'openai_compatible',enabled:true,models:['custom'],imageCapabilities:{custom:{generate:true,edit:true,reference:true,encoding:'base64-json'}}} as ServiceConnection
 await generateOpenAIImages(connection,{...input,model:'custom',intent:'reference',additionalReference:input.reference})
 const body=JSON.parse(fetcher.mock.calls[0][1]!.body as string)
 expect(body.image).toEqual([input.reference,input.reference])
 expect(body).not.toHaveProperty('additional_reference')
 vi.restoreAllMocks()
})

test('unsupported controls are filtered from both display contract and request', () => {
  const capabilities = { generate: true, edit: true, reference: true, encoding: 'multipart' as const, sizes: ['1024x1024'], quality: ['low'] as const, supportsSteps: false, supportsGuidance: false }
  expect(filterImageParameters({ size: '2048 × 2048', quality: 'high', steps: 30, guidance: 5, strength: 0.4 }, capabilities)).toEqual({})
  expect(imageEditPayload({ ...input, capabilities, parameters: { steps: 30, guidance: 5, strength: 0.4 } })).toEqual({ model: input.model, prompt: input.prompt, image: input.reference, n: 1, size:'1024x1024' })
})

test('protocol defaults allow documented OpenAI-compatible edit while unknown protocol stays generation-only', () => {
  const connection = { protocol: 'openai_compatible' } as any
  expect(imageSupports(imageCapabilitiesFor(connection, 'gpt-image-1'), 'edit')).toBe(true)
  expect(imageSupports({ generate: true, edit: false, reference: false, encoding: 'base64-json' }, 'edit')).toBe(false)
})

test('uses built-in presets for common provider image models', () => {
  expect(imageCapabilitiesFor({ protocol: 'openai_compatible' } as any, 'gpt-image-2.5-flare')).toMatchObject({ generate: true, edit: true, reference: true, encoding: 'multipart' })
  expect(imageCapabilitiesFor({ protocol: 'volcengine' } as any, 'doubao-seedream-5.0')).toMatchObject({ generate: true, edit: true, reference: true, encoding: 'base64-json' })
})

test('multipart capability uses FormData at the documented edit endpoint', async () => {
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] })))
  const connection: ServiceConnection = { id: 'edit', provider: 'OpenAI', name: '官方', baseUrl: 'https://api.example/v1', apiKey: 'secret', protocol: 'openai_compatible', models: ['gpt-image-1'], enabled: true, imageCapabilities: { 'gpt-image-1': { generate: true, edit: true, reference: true, encoding: 'multipart', quality: ['high'] } } }
  await generateOpenAIImages(connection, { ...input, intent: 'edit' })
  expect(String(fetcher.mock.calls[0][0])).toContain('/images/edits')
  expect(fetcher.mock.calls[0][1]?.body).toBeInstanceOf(FormData)
  vi.restoreAllMocks()
})
