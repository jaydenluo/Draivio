import { describe, expect, it } from 'vitest'
import { SYSTEM_FONT_PRESETS, fontChoices, normalizeFontFamily } from './systemFonts'

describe('commercial system font presets', () => {
  it('contains only redistributable license families and useful language groups', () => {
    expect(SYSTEM_FONT_PRESETS.length).toBeGreaterThan(8)
    expect(new Set(SYSTEM_FONT_PRESETS.map((font) => font.family)).size).toBe(SYSTEM_FONT_PRESETS.length)
    expect(new Set(SYSTEM_FONT_PRESETS.map((font) => font.category))).toEqual(new Set(['中文', '西文', '等宽']))
    expect(SYSTEM_FONT_PRESETS.every((font) => font.license === 'SIL OFL 1.1')).toBe(true)
  })

  it('returns CSS-safe options and keeps a fallback stack', () => {
    const choices = fontChoices({ 'Noto Sans SC': true, Inter: false })
    expect(choices.find((choice) => choice.value === 'Noto Sans SC')?.available).toBe(true)
    expect(choices.find((choice) => choice.value === 'Inter')?.available).toBe(false)
    expect(normalizeFontFamily('Noto Sans SC')).toContain('sans-serif')
    expect(normalizeFontFamily('Unknown')).toBe('Unknown, sans-serif')
  })
})
