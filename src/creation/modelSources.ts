export type ModelSourceId = 'draivio-cloud' | 'openai-custom' | 'volcengine-custom'
export type BillingMode = 'credits' | 'provider'

export type SourceModel = {
  code: string
  displayName: string
}

export type ModelSource = {
  id: ModelSourceId
  providerName: string
  summary: string
  billingMode: BillingMode
  billingLabel: string
  protocolLabel?: string
  models: SourceModel[]
}

export const modelSources: ModelSource[] = [
  {
    id: 'draivio-cloud', providerName: 'Draivio 云端', summary: 'Draivio 云端 · 使用登录积分', billingMode: 'credits', billingLabel: '使用登录积分',
    models: [{ code: 'image-pro', displayName: 'Image Pro' }, { code: 'image-fast', displayName: 'Image Fast' }, { code: 'image-detail', displayName: 'Image Detail' }],
  },
  {
    id: 'openai-custom', providerName: 'OpenAI', summary: 'OpenAI · 自定义密钥', billingMode: 'provider', billingLabel: '费用由 OpenAI 账户承担', protocolLabel: '官方 API',
    models: [{ code: 'gpt-image-2.5', displayName: 'gpt-image-2.5' }],
  },
  {
    id: 'volcengine-custom', providerName: '火山引擎', summary: '火山引擎 · OpenAI 兼容', billingMode: 'provider', billingLabel: '费用由火山引擎账户承担', protocolLabel: 'OpenAI 兼容',
    models: [{ code: 'gpt-image-2.5', displayName: 'gpt-image-2.5' }],
  },
]

export function getSourceById(sourceId: string): ModelSource | undefined {
  return modelSources.find((source) => source.id === sourceId)
}

export function getModelsForSource(sourceId: string): SourceModel[] {
  return getSourceById(sourceId)?.models ?? []
}
