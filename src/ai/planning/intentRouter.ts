export type IntentLayer = {
  id: string
  name: string
  className?: string
  visible?: boolean
  locked?: boolean
}

export type IntentContext = {
  selectionVisible: boolean
  selectedLayerId: string
  selectedLayerIds: string[]
  layers: readonly IntentLayer[]
}

export type AIIntentKind = 'generate' | 'image-edit' | 'smart-plan'
export type AIIntentConfidence = 'high' | 'medium' | 'low'
export type AIIntent = {
  kind: AIIntentKind
  confidence: AIIntentConfidence
  scopeIds: string[]
  reason: string
}

const imageEditWords = /改成|换成|重绘|局部重绘|生成填充|填充|去掉背景|移除背景|抠图|修复|风格|色调|色温|曝光|天空|人物|背景|画面|图像|图片|清晰度|超分|扩展画布|补全|重新生成|润色/
const imageGenerationWords = /^(?:请)?(?:生成|画|创作|绘制|做|来)(?:一张|一个|一幅)?|文生图|生成一张|生成海报|^(?:new|create|generate)\s+(?:an?\s+)?(?:image|picture)/i
const layoutWords = /图层|选中|当前对象|标题|文字|移动|向左|向右|向上|向下|旋转|缩放|缩小|放大字体|对齐|分组|重命名|改名|透明度|不透明度|排序|锁定|解锁|复制|删除当前|隐藏|显示/
const visualObjectWords = /天空|背景|人物|画面|图片|图像|照片|颜色|色调|风格|光线|细节/
const deterministicEditWords = /降低|提高|调整|设为|高光|阴影|曝光|饱和度|亮度|对比度|色阶|曲线|色温|暖一点|冷一点|锐化|降噪|模糊|不透明度/
const wholeDocumentWords = /整个文档|整个画布|全图|所有图层|全部图层|所有对象|全部对象/

function selectedScope(context: IntentContext): string[] {
  const selected = context.selectedLayerIds.filter(id => context.layers.some(layer => layer.id === id))
  if (selected.length) return [...new Set(selected)]
  return context.selectedLayerId && context.layers.some(layer => layer.id === context.selectedLayerId) ? [context.selectedLayerId] : []
}

function mentionedScope(input: string, context: IntentContext): string[] {
  if (wholeDocumentWords.test(input)) return context.layers.map(layer => layer.id)
  const matches = context.layers.filter(layer => input.includes(layer.name) || input.includes(layer.id))
  if (matches.length) return [...new Set(matches.map(layer => layer.id))]
  return selectedScope(context)
}

export function inferAIIntent(input: string, context: IntentContext): AIIntent {
  const prompt = input.trim()
  const scopeIds = mentionedScope(prompt, context)
  const hasVisualEdit = imageEditWords.test(prompt) && visualObjectWords.test(prompt)
  const hasLayoutInstruction = layoutWords.test(prompt)
  const hasDeterministicEdit = deterministicEditWords.test(prompt)
  const asksToGenerate = imageGenerationWords.test(prompt) || (/^(?:一张|一幅|一个)/.test(prompt) && !/改成|换成|修改|重绘|编辑/.test(prompt))

  if (hasDeterministicEdit && !asksToGenerate) {
    return {
      kind: 'smart-plan',
      confidence: context.selectionVisible || scopeIds.length > 0 ? 'high' : 'medium',
      scopeIds: scopeIds.length ? scopeIds : context.layers.map(layer => layer.id),
      reason: context.selectionVisible ? '根据当前选区执行确定性调整' : '根据当前图层执行确定性调整',
    }
  }

  if (hasVisualEdit && !asksToGenerate) {
    return {
      kind: 'image-edit',
      confidence: context.selectionVisible || scopeIds.length > 0 ? 'high' : 'medium',
      scopeIds,
      reason: context.selectionVisible ? '根据当前选区修改画面' : scopeIds.length ? '根据当前图层修改画面' : '根据输入判断为图片修改',
    }
  }

  if (asksToGenerate || (!hasLayoutInstruction && /海报|插画|摄影|场景|头像|封面/.test(prompt))) {
    return { kind: 'generate', confidence: 'high', scopeIds: [], reason: '根据输入判断为生成新图片' }
  }

  if (hasLayoutInstruction) {
    return {
      kind: 'smart-plan',
      confidence: scopeIds.length || context.selectionVisible ? 'high' : 'medium',
      scopeIds: scopeIds.length ? scopeIds : context.layers.map(layer => layer.id),
      reason: context.selectionVisible ? '根据当前选区和图层操作' : scopeIds.length ? '根据当前选中图层操作' : '根据输入中的对象名称操作',
    }
  }

  return {
    kind: 'smart-plan',
    confidence: 'low',
    scopeIds: context.layers.map(layer => layer.id),
    reason: '无法确定要修改的对象，请从候选对象中确认',
  }
}
