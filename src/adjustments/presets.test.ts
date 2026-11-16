import { describe, expect, it } from 'vitest'
import { createPreset, exportPreset, importPreset, normalizePreset, createThumbnailTask, applyPresetMode, samplePresetThumbnail } from './presets'
describe('adjustment presets', () => {
  it('round trips and strips private payloads', () => { const preset = createPreset('电影'); const restored = importPreset(exportPreset(preset)); expect(restored).toEqual(preset); expect(() => normalizePreset({ ...preset, image: 'data:image/png;base64,secret' })).toThrow() })
  it('migrates legacy version zero and rejects invalid/oversized input', () => { const preset = createPreset('旧'); expect(normalizePreset({ ...preset, version: 0 }).version).toBe(1); expect(() => importPreset('{"version":1,"name":"x","hsl":{}}')).toThrow(); expect(() => importPreset('x'.repeat(100000))).toThrow() })
  it('drops stale or cancelled thumbnail results without blocking', async () => { let current = true; const task = createThumbnailTask(async () => 'thumb', () => current); current = false; await expect(task.promise).resolves.toBeUndefined(); const ok = createThumbnailTask(async () => 'ok', () => true); await expect(ok.promise).resolves.toBe('ok'); const cancelled = createThumbnailTask(async () => 'no', () => true); cancelled.cancel(); await expect(cancelled.promise).resolves.toBeUndefined() })
  it('applies preset with explicit replace or merge mode', () => { const preset = createPreset('调色'); const current = { brightness: 12, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, blur: 0, shadows: 0, highlights: 0 }; expect(applyPresetMode(current, preset, 'replace').brightness).toBe(0); expect(applyPresetMode(current, preset, 'merge').hsl).toEqual(preset.hsl) })
})

it('rejects missing channels and unsafe numeric ranges', () => {
  const preset = createPreset('strict')
  expect(() => normalizePreset({ ...preset, hsl: { ...preset.hsl, channels: {} } })).toThrow()
  for (const value of [0, -1, 121]) expect(() => normalizePreset({ ...preset, hsl: { ...preset.hsl, global: { ...preset.hsl.global, range: value } } })).toThrow()
  expect(() => normalizePreset({ ...preset, hsl: { ...preset.hsl, global: { ...preset.hsl.global, saturation: 101 } } })).toThrow()
})
it('bounds thumbnail work and never starts cancelled work', async () => {
  const sample = samplePresetThumbnail(new Uint8ClampedArray(2000 * 1000 * 4), 2000, 1000)
  expect(sample.width).toBe(96); expect(sample.height).toBe(48); expect(sample.pixels.length).toBe(96 * 48 * 4)
  let calls = 0; const task = createThumbnailTask(async () => { calls++; return 'x' }, () => true); task.cancel(); await task.promise; expect(calls).toBe(0)
})
