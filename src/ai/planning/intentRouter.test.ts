import { describe, expect, it } from 'vitest'
import { inferAIIntent, type IntentContext } from './intentRouter'

const context = (overrides: Partial<IntentContext> = {}): IntentContext => ({
  selectionVisible: false,
  selectedLayerId: 'title',
  selectedLayerIds: ['title'],
  layers: [
    { id: 'title', name: '标题', className: 'layer-text' },
    { id: 'background', name: '背景', className: 'layer-art' },
  ],
  ...overrides,
})

describe('自动识别 AI 操作意图', () => {
  it('把图层移动和排版指令路由到智能计划并锁定当前图层', () => {
    const result = inferAIIntent('把标题移到左上角并缩小 10%', context())

    expect(result.kind).toBe('smart-plan')
    expect(result.scopeIds).toEqual(['title'])
    expect(result.confidence).toBe('high')
  })

  it('把确定性的颜色调整交给本地智能计划', () => {
    const result = inferAIIntent('在选区降低高光', context({ selectionVisible: true }))

    expect(result.kind).toBe('smart-plan')
    expect(result.confidence).toBe('high')
  })

  it('把画面内容修改路由到图片编辑并优先使用当前选区', () => {
    const result = inferAIIntent('把天空改成黄昏', context({ selectionVisible: true }))

    expect(result.kind).toBe('image-edit')
    expect(result.scopeIds).toEqual(['title'])
    expect(result.confidence).toBe('high')
  })

  it('把没有选区的创作描述路由到文生图', () => {
    const result = inferAIIntent('生成一张安静的咖啡店海报', context({ selectedLayerId: '', selectedLayerIds: [] }))

    expect(result.kind).toBe('generate')
    expect(result.scopeIds).toEqual([])
    expect(result.confidence).toBe('high')
  })

  it('recognizes common English generation prompts as image generation', () => {
    expect(inferAIIntent('new image', context({ selectedLayerId: '', selectedLayerIds: [] })).kind).toBe('generate')
  })

  it('对无法确定目标的模糊输入降低置信度并保留候选对象', () => {
    const result = inferAIIntent('让它更好看一点', context({ selectedLayerId: '', selectedLayerIds: [] }))

    expect(result.kind).toBe('smart-plan')
    expect(result.confidence).toBe('low')
    expect(result.scopeIds).toEqual(['title', 'background'])
    expect(result.reason).toContain('无法确定')
  })
})
