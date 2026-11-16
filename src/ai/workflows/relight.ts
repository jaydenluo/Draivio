import { editorReducer, neutralAdjustments, type EditorState, type LayerAdjustments } from '../../state/editor'
import { defaultEffect, validateEffects, type LayerEffects } from '../../render/layerEffects'

export type RelightDirection = 'left' | 'right' | 'top'
export type RelightSettings = {
  direction: RelightDirection
  intensity: number
  temperature: number
  backgroundMatch: number
  contactShadow: number
  shadowDistance: number
  shadowBlur: number
  enabled: boolean
}

export type RelightPlan = {
  settings: RelightSettings
  adjustments: LayerAdjustments
  effects: LayerEffects
  unsupportedGeneration: string
}

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))
export const defaultRelightSettings = (): RelightSettings => ({ direction: 'left', intensity: 35, temperature: 0, backgroundMatch: 25, contactShadow: 25, shadowDistance: 8, shadowBlur: 12, enabled: true })

export function validateRelightSettings(value: unknown): RelightSettings {
  if (!value || typeof value !== 'object') throw new Error('布光参数无效')
  const s = value as RelightSettings
  if (!['left', 'right', 'top'].includes(s.direction)) throw new Error('布光方向必须是左、右或顶部')
  for (const [key, min, max] of [['intensity', 0, 100], ['temperature', -100, 100], ['backgroundMatch', 0, 100], ['contactShadow', 0, 100], ['shadowDistance', 0, 512], ['shadowBlur', 0, 128] ] as const) {
    const v = s[key as keyof RelightSettings]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) throw new Error(`布光参数 ${key} 超出范围`)
  }
  if (typeof s.enabled !== 'boolean') throw new Error('布光开关无效')
  return { ...s }
}

export function buildRelightPlan(input: RelightSettings, existing?: LayerEffects): RelightPlan {
  const settings = validateRelightSettings(input)
  const sign = settings.direction === 'right' ? -1 : 1
  const top = settings.direction === 'top' ? settings.intensity : settings.intensity * .35
  const adjustment: LayerAdjustments = {
    ...neutralAdjustments,
    temperature: clamp(settings.temperature + sign * settings.intensity * .35, -100, 100),
    exposureEV: clamp((settings.intensity / 100) * .7, -8, 8),
    highlights: clamp(top * .45, -100, 100),
    shadows: clamp(-settings.intensity * .18, -100, 100),
    saturation: clamp((settings.backgroundMatch - 50) * .18, -100, 100),
  }
  const effect = { ...defaultEffect('shadow'), enabled: settings.enabled && settings.contactShadow > 0, opacity: settings.contactShadow, distance: settings.shadowDistance, blur: settings.shadowBlur, angle: settings.direction === 'left' ? 180 : settings.direction === 'right' ? 0 : 90 }
  const prior = existing?.items.filter(item => item.kind !== 'shadow') ?? []
  const effects = validateEffects({ version: 1, items: [...prior, effect] })
  return { settings, adjustments: adjustment, effects, unsupportedGeneration: '生成式布光需要已配置的模型和服务；当前使用可撤销的有限光照调整。' }
}

export function applyRelight(state: EditorState, layerId: string, settings: RelightSettings): EditorState {
  const layer = state.layers.find(item => item.id === layerId)
  if (!layer) throw new Error('布光目标图层不存在')
  if (layer.locked) throw new Error('布光目标图层已锁定')
  if (layer.kind === 'text' || layer.kind === 'shape' || layer.kind === 'group' || layer.kind === 'mask') throw new Error('布光只支持图片内容图层，文字和几何保持不变')
  const plan = buildRelightPlan(settings, layer.effects)
  if (!settings.enabled) return editorReducer(state, { type: 'set-layer-effects', id: layerId, effects: { version: 1, items: layer.effects?.items.filter(item => item.kind !== 'shadow') ?? [] } })
  const adjusted = editorReducer(state, { type: 'set-layer-adjustments', id: layerId, adjustments: { ...layer.adjustments, ...plan.adjustments } })
  return editorReducer(adjusted, { type: 'set-layer-effects', id: layerId, effects: plan.effects })
}
