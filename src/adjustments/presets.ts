import { defaultColorBalance, defaultHsl, HSL_CHANNELS, type ColorBalanceSettings, type HslSettings } from './hsl'
import type { LayerAdjustments } from '../state/editor'
export type AdjustmentPreset = { version: 1; name: string; hsl: HslSettings; colorBalance: ColorBalanceSettings }
const MAX = 64 * 1024
function finite(v: unknown): v is number { return typeof v === 'number' && Number.isFinite(v) }
function validateValue(v: any) { return v && Object.keys(v).every((key) => ['hue','saturation','lightness','range'].includes(key)) && finite(v.hue) && Math.abs(v.hue) <= 180 && finite(v.saturation) && Math.abs(v.saturation) <= 100 && finite(v.lightness) && Math.abs(v.lightness) <= 100 && (v.range === undefined || (finite(v.range) && v.range > 0 && v.range <= 120)) }
export function normalizePreset(input: unknown): AdjustmentPreset {
  if (!input || typeof input !== 'object') throw new Error('预设文件无效')
  if (JSON.stringify(input).length > MAX) throw new Error('预设文件过大')
  const value = input as any; if (value.version !== 1 && value.version !== 0) throw new Error('预设版本不受支持')
  const allowed = new Set(['version', 'name', 'hsl', 'colorBalance']); if (Object.keys(value).some((key) => !allowed.has(key))) throw new Error('预设包含不支持字段')
  if (typeof value.name !== 'string' || value.name.length < 1 || value.name.length > 80) throw new Error('预设名称无效')
  const hsl = value.hsl ?? defaultHsl(), channels = hsl.channels ?? defaultHsl().channels
  if (Object.keys(hsl).some((key) => !['global','channels'].includes(key)) || Object.keys(channels).some((key) => !['red','orange','yellow','green','cyan','blue'].includes(key))) throw new Error('HSL 预设包含不支持字段')
  if (!validateValue(hsl.global) || !HSL_CHANNELS.every((channel) => validateValue(channels[channel]))) throw new Error('HSL 预设无效')
  const balance = value.colorBalance ?? defaultColorBalance(), tones = ['shadows', 'midtones', 'highlights'] as const
  if (Object.keys(balance).some((key) => !['shadows','midtones','highlights','preserveLuminosity'].includes(key))) throw new Error('色彩平衡预设包含不支持字段')
  if (!tones.every((tone) => balance[tone] && Object.keys(balance[tone]).every((key) => ['cyanRed','magentaGreen','yellowBlue'].includes(key)) && finite(balance[tone].cyanRed) && finite(balance[tone].magentaGreen) && finite(balance[tone].yellowBlue) && [balance[tone].cyanRed,balance[tone].magentaGreen,balance[tone].yellowBlue].every((v) => Math.abs(v) <= 100)) || typeof balance.preserveLuminosity !== 'boolean') throw new Error('色彩平衡预设无效')
  return { version: 1, name: value.name, hsl: { global: { ...hsl.global }, channels: Object.fromEntries(Object.entries(channels).map(([k, v]) => [k, { ...(v as any) }])) as any }, colorBalance: { ...balance, shadows: { ...balance.shadows }, midtones: { ...balance.midtones }, highlights: { ...balance.highlights } } }
}
export function exportPreset(preset: AdjustmentPreset): string { return JSON.stringify(normalizePreset(preset)) }
export function importPreset(serialized: string): AdjustmentPreset { try { return normalizePreset(JSON.parse(serialized)) } catch (error) { throw new Error(error instanceof Error ? error.message : '预设文件无效') } }
export function mergePreset(base: AdjustmentPreset, incoming: AdjustmentPreset): AdjustmentPreset { const a = normalizePreset(base), b = normalizePreset(incoming); return { ...b, name: a.name, hsl: b.hsl, colorBalance: b.colorBalance } }
export function createPreset(name: string, hsl: HslSettings = defaultHsl(), colorBalance: ColorBalanceSettings = defaultColorBalance()): AdjustmentPreset { return normalizePreset({ version: 1, name, hsl, colorBalance }) }
export function presetToAdjustments(preset: AdjustmentPreset, base: LayerAdjustments): LayerAdjustments { const normalized = normalizePreset(preset); return { ...base, hsl: normalized.hsl, colorBalance: normalized.colorBalance } }
export function applyPresetMode(current: LayerAdjustments, preset: AdjustmentPreset, mode: 'replace' | 'merge'): LayerAdjustments { const normalized = normalizePreset(preset); if (mode === 'replace') return { brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0,shadows:0,highlights:0,exposureEV:0,hsl: normalized.hsl,colorBalance:normalized.colorBalance }; return { ...current, hsl: normalized.hsl, colorBalance: normalized.colorBalance } }
export function createThumbnailTask<T>(work: () => Promise<T>, isCurrent: () => boolean) { let cancelled = false; const promise = Promise.resolve().then(() => cancelled || !isCurrent() ? undefined : work()).then((result) => cancelled || !isCurrent() ? undefined : result); return { promise, cancel: () => { cancelled = true } } }

/** Bounded thumbnail sampling: processing is capped at 96² pixels regardless of source size. */
export function samplePresetThumbnail(source: Uint8ClampedArray, width: number, height: number) {
  const scale = Math.min(1, 96 / Math.max(width, height)), w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale))
  const pixels = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const from = (Math.min(height - 1, Math.floor(y / h * height)) * width + Math.min(width - 1, Math.floor(x / w * width))) * 4; pixels.set(source.subarray(from, from + 4), (y * w + x) * 4) }
  return { pixels, width: w, height: h }
}
