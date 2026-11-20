import { expect, test } from 'vitest'
import { assistantModels, selectedAssistant, selectAssistant, capabilitiesFor } from './modelCapabilities'
import type { ServiceConnection } from '../../creation/serviceConnections'
const connection = (id: string): ServiceConnection => ({ id, provider: 'OpenAI', name: id, baseUrl: 'https://example.com/v1', apiKey: 'key', protocol: 'openai_compatible', enabled: true, models: ['image-z', 'shared', 'image-a'] })
test('legacy image models never become assistant models implicitly', () => {
 const c = connection('one')
 expect(capabilitiesFor(c, 'shared')).toEqual({ image: false, text: false, vision: false })
 expect(assistantModels([c])).toEqual([])
 expect(selectedAssistant([c])).toBeNull()
})
test('explicit capability and stable account ID select an assistant without changing image ordering', () => {
 const a = connection('personal'), b = connection('work')
 a.modelCapabilities = { shared: { image: false, text: true, vision: true } }
 b.modelCapabilities = { shared: { image: true, text: true, vision: false } }
 const next = selectAssistant([a,b], { sourceId: 'work', model: 'shared' })
 expect(assistantModels(next).map(m=>[m.sourceId,m.model])).toEqual([['personal','shared'],['work','shared']])
 expect(selectedAssistant(next)?.sourceId).toBe('work')
 expect(next.map(c=>c.models)).toEqual([a.models,b.models])
 expect(next.map(c=>c.id)).toEqual(['personal','work'])
 expect(a.assistantModel).toBeUndefined()
 expect(selectedAssistant(next.map(c=>({...c,enabled:false})))).toBeNull()
 expect(assistantModels([{...a, apiKey:''}])).toEqual([])
 expect(()=>selectAssistant([a],{sourceId:'personal',model:'image-z'})).toThrow()
})

test('rejects malformed declarations and stale model references at persistence boundary', async () => {
 const { decodeConnections, saveConnections } = await import('../../creation/serviceConnections')
 const c=connection('one')
 for(const modelCapabilities of [{shared:{image:true,text:'yes',vision:false}},{unknown:{image:true,text:true,vision:false}},{shared:{image:true,text:true,vision:false,tools:true}}]) {
  expect(()=>decodeConnections([{...c,modelCapabilities}])).toThrow(/损坏/)
 }
 await expect(saveConnections([{...c,assistantModel:'shared'}])).rejects.toThrow(/能力/)
})

test('image picker consumes image capability only while keeping original model order', async()=>{
 const {getModelsForSource}=await import('../../creation/modelSources')
 const c=connection('ordered')
 c.modelCapabilities={shared:{image:false,text:true,vision:true}}
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([c]))
 expect(getModelsForSource('ordered').map(model=>model.code)).toEqual(['image-z','image-a'])
 localStorage.clear()
})


test('classifies GPT text separately from image output without assuming vision input', async () => {
 const { getAvailableSources } = await import('../../creation/modelSources')
 const c = { ...connection('gpt'), models: ['gpt-6.5-sol', 'gpt-4o', 'o3-mini', 'gpt-image-2.5-flare', 'dall-e-3', 'gemini-2.5-flash', 'gemini-2.5-flash-image', 'qwen-vl-plus', 'private-deployment', 'text-embedding-3-small', 'gpt-4o-mini-tts'] }
 expect(capabilitiesFor(c, 'gpt-6.5-sol')).toEqual({ image: false, text: true, vision: false })
 expect(capabilitiesFor(c, 'gpt-4o')).toEqual({ image: false, text: true, vision: false })
 expect(capabilitiesFor(c, 'gpt-image-2.5-flare')).toEqual({ image: true, text: false, vision: false })
 expect(capabilitiesFor(c, 'private-deployment')).toEqual({ image: false, text: false, vision: false })
 localStorage.setItem('draivio-service-connections-v1', JSON.stringify([c]))
 expect(getAvailableSources('text').find(s => s.id === c.id)?.models.map(m => m.code)).toEqual(['gpt-6.5-sol','gpt-4o','o3-mini','gemini-2.5-flash','qwen-vl-plus'])
 expect(getAvailableSources('image').find(s => s.id === c.id)?.models.map(m => m.code)).toEqual(['gpt-image-2.5-flare','dall-e-3','gemini-2.5-flash-image'])
 expect(c.modelCapabilities).toBeUndefined()
 localStorage.clear()
})

test('honors explicit usage per source and does not infer a private cloud catalog', () => {
 const a = { ...connection('one'), models: ['gpt-4o'], modelCapabilities: { 'gpt-4o': { image: true, text: false, vision: false } } }
 const b = { ...connection('two'), models: ['gpt-4o'] }
 expect(capabilitiesFor(a, 'gpt-4o').text).toBe(false)
 expect(capabilitiesFor(b, 'gpt-4o').image).toBe(false)
 expect(assistantModels([a,b]).map(m=>m.sourceId)).toEqual(['two'])
 expect(capabilitiesFor({ ...b, id: 'draivio-cloud' }, 'gpt-4o')).toEqual({ image: false, text: false, vision: false })
})
