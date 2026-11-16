import { describe, expect, it } from 'vitest'
import { applyColorBalancePixel, applyHslAndColorBalance, applyHslPixel, defaultColorBalance, defaultHsl, rgbToHsl } from './hsl'

describe('HSL and color balance', () => {
  it('preserves neutral gray hue while changing saturation elsewhere', () => {
    const settings = defaultHsl(); settings.global.saturation = 35; settings.channels.red.saturation = 50
    const gray = applyHslPixel(.5, .5, .5, settings); expect(Math.max(...gray) - Math.min(...gray)).toBeLessThan(1e-8)
    const red = applyHslPixel(1, 0, 0, settings); expect(rgbToHsl(...red)[1]).toBeGreaterThan(.9)
  })
  it('smoothly fades six-color boundaries and wraps hue', () => {
    const settings = defaultHsl(); settings.channels.red.hue = 30; settings.channels.red.range = 40
    const inside = applyHslPixel(1, .01, 0, settings), edge = applyHslPixel(1, .5, 0, settings)
    expect(Math.abs(rgbToHsl(...inside)[0] - rgbToHsl(1, .01, 0)[0])).toBeGreaterThan(Math.abs(rgbToHsl(...edge)[0] - rgbToHsl(1, .5, 0)[0]))
  })
  it('preserves luminosity for balance and leaves alpha unchanged', () => {
    const balance = defaultColorBalance(); balance.shadows.cyanRed = 50; balance.preserveLuminosity = true
    const before = .2126 * .2 + .7152 * .3 + .0722 * .4, next = applyColorBalancePixel(.2, .3, .4, balance), after = .2126 * next[0] + .7152 * next[1] + .0722 * next[2]
    expect(Math.abs(after - before)).toBeLessThan(1e-6)
    expect(applyHslAndColorBalance(new Uint8ClampedArray([255, 0, 0, 77]), 1, 1, defaultHsl(), balance)[3]).toBe(77)
  })
})
