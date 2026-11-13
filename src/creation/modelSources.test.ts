import { describe, expect, it } from 'vitest'
import { getModelsForSource, getSourceById, modelSources } from './modelSources'

describe('model sources', () => {
  it('exposes stable source labels and billing modes', () => {
    expect(modelSources.map((source) => source.id)).toEqual(['draivio-cloud', 'openai-custom', 'volcengine-custom'])
    expect(getSourceById('openai-custom')?.summary).toBe('OpenAI · 自定义密钥')
    expect(getSourceById('volcengine-custom')?.protocolLabel).toBe('OpenAI 兼容')
    expect(getSourceById('draivio-cloud')?.billingMode).toBe('credits')
  })

  it('filters models by selected source', () => {
    expect(getModelsForSource('openai-custom').map((model) => model.code)).toEqual(['gpt-image-2.5'])
    expect(getModelsForSource('draivio-cloud')[0]?.displayName).toBe('Image Pro')
  })
})
