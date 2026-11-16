import { defaultColorBalance, defaultHsl, type ColorBalanceSettings, type HslSettings } from '../../adjustments/hsl'
import { defaultCurves, type CurvesSettings } from '../../adjustments/curves'
import { defaultLevels } from '../../adjustments/levels'
import { createSmartFilter, type SmartFilterChain } from '../../render/filterPipeline'
import type { Layer, LayerAdjustments } from '../../state/editor'
import type { Recipe } from './schema'

export type CinematicStyle = 'warm' | 'cool' | 'monochrome' | 'vintage'
export type CinematicRecipe = { style: CinematicStyle; intensity: number; adjustments: LayerAdjustments; smartFilters: SmartFilterChain; reference?: ReferenceStats }
export type ReferenceStats = { averageLuma: number; averageWarmth: number; contrast: number }

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))
const blend = (a: number, b: number, t: number) => a + (b - a) * t
const curve = (rgb: Array<{ x: number; y: number }>): CurvesSettings => ({ rgb, r: [{ x: 0, y: 0 }, { x: 1, y: 1 }], g: [{ x: 0, y: 0 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
const identity = () => ({ ...defaultCurves(), ...{ levels: defaultLevels() } })
const blendCurve = (points: Array<{ x: number; y: number }>, intensity: number) => points.map(point => ({ x: point.x, y: point.x + (point.y - point.x) * intensity }))

export function cinematicStyles(): readonly CinematicStyle[] { return ['warm', 'cool', 'monochrome', 'vintage'] }

/** Recipe-engine definition used by the production RecipeWorkspace picker. */
export function cinematicRecipeDefinition(style: CinematicStyle): Recipe {
  const values = ({
    warm: { contrast: 8, saturation: 8, temperature: 18, grain: .05, vignette: .2 },
    cool: { contrast: 8, saturation: 8, temperature: -16, grain: .05, vignette: .1 },
    monochrome: { contrast: 12, saturation: -100, temperature: 0, grain: .05, vignette: .1 },
    vintage: { contrast: 8, saturation: -18, temperature: 18, grain: .18, vignette: .2 },
  } as const)[style]
  const name = ({ warm: '暖色电影', cool: '冷色电影', monochrome: '黑白电影', vintage: '复古电影' } as const)[style]
  const target = { layerId: { $input: 'target' } }
  return { schemaVersion: 1, id: `cinematic-${style}`, version: 1, name, inputs: [{ id: 'target', required: true }], parameters: {
    contrast: { type: 'number', default: values.contrast, min: -100, max: 100 }, saturation: { type: 'number', default: values.saturation, min: -100, max: 100 }, temperature: { type: 'number', default: values.temperature, min: -100, max: 100 }, grain: { type: 'number', default: values.grain, min: 0, max: 1 }, vignette: { type: 'number', default: values.vignette, min: 0, max: 1 },
  }, steps: [
    { id: 'contrast', tool: 'adjustment', args: { ...target, key: 'contrast', value: { $parameter: 'contrast' } } },
    { id: 'saturation', tool: 'adjustment', args: { ...target, key: 'saturation', value: { $parameter: 'saturation' } } },
    { id: 'temperature', tool: 'adjustment', args: { ...target, key: 'temperature', value: { $parameter: 'temperature' } } },
    { id: 'grain', tool: 'filter', args: { ...target, kind: 'grain', amount: { $parameter: 'grain' }, radius: 0, seed: 2401 } },
    { id: 'vignette', tool: 'filter', args: { ...target, kind: 'vignette', amount: { $parameter: 'vignette' }, radius: 24, seed: 2401 } },
  ] }
}

export function cinematicRecipe(style: CinematicStyle, intensity = 1, reference?: ReferenceStats): CinematicRecipe {
  if (!cinematicStyles().includes(style)) throw new Error('未知电影风格')
  if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) throw new Error('风格强度必须为 0–1')
  const t = intensity
  const adjustments: LayerAdjustments = { ...identity(), ...defaultColorBalance(), ...defaultHsl(), brightness: 0, contrast: blend(0, style === 'monochrome' ? 12 : 8, t), saturation: blend(0, style === 'monochrome' ? -100 : style === 'vintage' ? -18 : 8, t), temperature: blend(0, style === 'warm' || style === 'vintage' ? 18 : -16, t), sharpness: 0, blur: 0, shadows: blend(0, style === 'vintage' ? 8 : -4, t), highlights: blend(0, style === 'warm' ? -8 : 3, t), exposureEV: 0 }
  const balance: ColorBalanceSettings = defaultColorBalance()
  if (style === 'warm' || style === 'vintage') { balance.shadows.yellowBlue = -18 * t; balance.highlights.cyanRed = 12 * t; balance.midtones.yellowBlue = -8 * t }
  if (style === 'cool') { balance.shadows.cyanRed = -15 * t; balance.highlights.yellowBlue = 18 * t; balance.midtones.cyanRed = -8 * t }
  if (style === 'monochrome') { balance.shadows.cyanRed = 3 * t; balance.highlights.yellowBlue = -3 * t }
  adjustments.colorBalance = balance
  const curvePoints = style === 'vintage' ? [{ x: 0, y: .06 }, { x: .25, y: .22 }, { x: .75, y: .78 }, { x: 1, y: .94 }] : style === 'monochrome' ? [{ x: 0, y: 0 }, { x: .25, y: .2 }, { x: .75, y: .82 }, { x: 1, y: 1 }] : [{ x: 0, y: 0 }, { x: .35, y: .32 }, { x: .7, y: .74 }, { x: 1, y: 1 }]
  adjustments.curves = t === 0 ? defaultCurves() : curve(blendCurve(curvePoints, t))
  const grain = createSmartFilter('grain', `cinematic-grain-${style}`); grain.amount = (style === 'vintage' ? .18 : .05) * t; grain.seed = 2401
  const vignette = createSmartFilter('vignette', `cinematic-vignette-${style}`); vignette.amount = (style === 'vintage' || style === 'warm' ? .2 : .1) * t; vignette.radius = 24
  return { style, intensity: t, adjustments, smartFilters: { items: [grain, vignette] }, ...(reference ? { reference } : {}) }
}

export function applyCinematicRecipe(layer: Layer, recipe: CinematicRecipe): Layer {
  const parsed = cinematicRecipe(recipe.style, recipe.intensity, recipe.reference)
  return { ...layer, adjustments: { ...layer.adjustments, ...parsed.adjustments }, smartFilters: parsed.smartFilters }
}

/** Extracts bounded luminance/warmth statistics only; reference pixels are never copied. */
export function analyzeCinematicReference(rgba: Uint8ClampedArray, width: number, height: number): ReferenceStats {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || rgba.length !== width * height * 4) throw new Error('参考图像素尺寸无效')
  let luma = 0, warmth = 0, variance = 0, n = width * height
  for (let i = 0; i < rgba.length; i += 4) { const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255; const y = .2126 * r + .7152 * g + .0722 * b; luma += y; warmth += r - b; variance += y * y }
  const averageLuma = luma / n, averageWarmth = clamp(warmth / n, -1, 1), contrast = clamp(Math.sqrt(Math.max(0, variance / n - averageLuma ** 2)) * 4)
  return { averageLuma, averageWarmth, contrast }
}

export function styleFromReference(stats: ReferenceStats): { style: CinematicStyle; intensity: number } {
  if (![stats.averageLuma, stats.averageWarmth, stats.contrast].every(Number.isFinite)) throw new Error('参考统计无效')
  const style: CinematicStyle = stats.contrast < .12 ? 'monochrome' : stats.averageWarmth > .08 ? 'warm' : stats.averageWarmth < -.08 ? 'cool' : 'vintage'
  return { style, intensity: clamp(Math.max(Math.abs(stats.averageWarmth) * 2, stats.contrast)) }
}
