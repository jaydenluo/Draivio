import type { LayerMenuItem } from './LayerMenu'
import { createSmartFilter, MAX_FILTER_RADIUS, MAX_SMART_FILTERS, smartFilterNames, type SmartFilter, type SmartFilterChain, type SmartFilterKind } from '../render/filterPipeline'
import { DEFAULT_BLOOM_THRESHOLD, MAX_MEDIAN_RADIUS } from '../filters/neighborhood'
import { effectiveLayerState } from '../state/layerHierarchy'
import type { EditorState, Layer } from '../state/editor'

export type AddableFilter = Exclude<SmartFilterKind, 'color'>
const filterGroups = [
  { name: '模糊', kinds: ['gaussian', 'boxBlur', 'motion', 'radial'] },
  { name: '细节', kinds: ['sharpen', 'highpass', 'denoise', 'median', 'edges'] },
  { name: '色彩', kinds: ['grayscale', 'duotone', 'sepia', 'invert', 'posterize', 'threshold'] },
  { name: '风格', kinds: ['pixelate', 'grain', 'vignette', 'bloom', 'emboss'] },
] as const

export function filterAddItems(): LayerMenuItem[] {
  return filterGroups.flatMap(group => group.kinds.map(kind => ({
    id: `filter-add:${kind}`, label: smartFilterNames[kind], section: group.name,
  })))
}

const initialParameters: Record<AddableFilter, Partial<SmartFilter>> = {
  gaussian: { radius: 4 }, motion: { radius: 8 }, radial: { radius: 12 },
  boxBlur: { radius: 4 }, median: { radius: 1 }, edges: { amount: 1 },
  bloom: { radius: 5, amount: .65 }, duotone: { amount: 1 },
  sharpen: { radius: 1.5, amount: .8 }, highpass: { radius: 2, amount: 1 },
  denoise: { radius: 2, amount: .65, threshold: 25 },
  grayscale: { amount: 1 }, sepia: { amount: .75 }, invert: { amount: 1 },
  posterize: { amount: 1 }, threshold: { amount: 1 }, emboss: { amount: 1 },
  pixelate: { size: 8 }, grain: { amount: .22 }, vignette: { amount: .45 },
}

export const createInteractiveFilter = (kind: AddableFilter, id: string): SmartFilter =>
  ({ ...createSmartFilter(kind, id), ...initialParameters[kind] })

export function filterScopeLabel(chain: SmartFilterChain) {
  const maskLabel = chain.mask?.enabled ? (chain.mask.inverted ? '反向矩形' : '矩形') : ''
  return [chain.selection ? '选区' : '', maskLabel].filter(Boolean).join('与') || '全图层'
}

export function filterUnavailableReason(state: EditorState, layer: Layer | undefined): string | undefined {
  if (!layer || layer.children || layer.kind === 'adjustment') return '请选择可应用滤镜的图层'
  if (effectiveLayerState(state.layers, layer.id).locked) return '请先解锁图层'
  if (state.pixelFormat !== 'rgba8' || layer.highPrecision) return '请先将图层转换为 8 位'
}

export function filterAddUnavailableReason(state: EditorState, layer: Layer | undefined): string | undefined {
  return filterUnavailableReason(state, layer) ??
    ((layer?.smartFilters?.items.length ?? 0) >= MAX_SMART_FILTERS ? '最多添加 16 条智能滤镜' : undefined)
}

type FilterNumberKey = 'radius' | 'amount' | 'threshold' | 'angle' | 'size' | 'seed'
export type FilterParameter = { key: FilterNumberKey; label: string; min: number; max: number; step?: number; unit?: string; defaultValue?: number; scale?: number; slider?: boolean }

const radius: FilterParameter = { key: 'radius', label: '半径', min: 0, max: MAX_FILTER_RADIUS, step: .1, unit: 'px' }
const strength: FilterParameter = { key: 'amount', label: '强度', min: 0, max: 100, scale: 100, unit: '%' }
const threshold: FilterParameter = { key: 'threshold', label: '阈值', min: 0, max: 255 }

export const filterParameters: Record<SmartFilterKind, FilterParameter[]> = {
  gaussian: [radius],
  boxBlur: [{ ...radius, step: 1 }],
  median: [{ ...radius, max: MAX_MEDIAN_RADIUS, step: 1 }],
  edges: [strength],
  bloom: [strength, { ...radius, step: 1 }, { ...threshold, label: '高光阈值', defaultValue: DEFAULT_BLOOM_THRESHOLD }],
  duotone: [strength],
  motion: [radius, { key: 'angle', label: '方向', min: -360, max: 360 }],
  radial: [radius],
  sharpen: [{ ...strength, max: 500 }, radius, threshold],
  highpass: [radius, { ...strength, max: 500 }],
  denoise: [strength, { ...radius, max: 8 }, { ...threshold, max: 100 }],
  pixelate: [{ key: 'size', label: '像素块', min: 1, max: 64, defaultValue: 1, unit: 'px' }],
  grain: [strength, { key: 'seed', label: '随机种子', min: 0, max: 2147483647, slider: false }],
  vignette: [strength],
  grayscale: [strength],
  sepia: [strength],
  invert: [strength],
  posterize: [strength, { key: 'size', label: '色阶数', min: 2, max: 32, defaultValue: 4 }],
  threshold: [strength, { ...threshold, defaultValue: 128 }],
  emboss: [strength],
  color: [],
}

export function parameterValue(filter: SmartFilter, parameter: FilterParameter) {
  return (filter[parameter.key] ?? parameter.defaultValue ?? 0) * (parameter.scale ?? 1)
}

export function filterSummary(filter: SmartFilter) {
  const parameter = filterParameters[filter.kind][0]
  if (!parameter) return ''
  const value = Number(parameterValue(filter, parameter).toFixed(1))
  if (parameter.key === 'amount') return `强度 ${value}%`
  return `${value} px`
}
