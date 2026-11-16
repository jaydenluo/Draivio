export type HslChannel = 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue'
export type HslValue = { hue: number; saturation: number; lightness: number; range?: number }
export type HslSettings = { global: HslValue; channels: Record<HslChannel, HslValue> }
export type BalanceTone = { cyanRed: number; magentaGreen: number; yellowBlue: number }
export type ColorBalanceSettings = { shadows: BalanceTone; midtones: BalanceTone; highlights: BalanceTone; preserveLuminosity: boolean }

export const HSL_CHANNELS: HslChannel[] = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue']
export const neutralHslValue = (): HslValue => ({ hue: 0, saturation: 0, lightness: 0, range: 30 })
export const defaultHsl = (): HslSettings => ({ global: neutralHslValue(), channels: Object.fromEntries(HSL_CHANNELS.map((channel) => [channel, neutralHslValue()])) as Record<HslChannel, HslValue> })
export const defaultColorBalance = (): ColorBalanceSettings => ({ shadows: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, midtones: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, highlights: { cyanRed: 0, magentaGreen: 0, yellowBlue: 0 }, preserveLuminosity: true })
const clamp = (v: number, min = 0, max = 1) => Math.max(min, Math.min(max, v))
const wrapHue = (v: number) => ((v % 360) + 360) % 360

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, l = (max + min) / 2
  if (d === 0) return [0, 0, l]
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = wrapHue(h * 60)
  return [h, s, l]
}
export function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const hue = wrapHue(h), c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((hue / 60) % 2 - 1)), m = l - c / 2
  const [r, g, b] = hue < 60 ? [c, x, 0] : hue < 120 ? [x, c, 0] : hue < 180 ? [0, c, x] : hue < 240 ? [0, x, c] : hue < 300 ? [x, 0, c] : [c, 0, x]
  return [r + m, g + m, b + m]
}
function hueDistance(a: number, b: number) { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d) }
function channelCenter(channel: HslChannel) { return ({ red: 0, orange: 30, yellow: 60, green: 120, cyan: 180, blue: 240 })[channel] }
function smoothWeight(hue: number, center: number, range: number) { const d = hueDistance(hue, center), width = clamp(range / 60, .05, 2); return d >= range ? 0 : (1 - d / range) ** 2 * (3 - 2 * (1 - d / range)) * width }

export function applyHslPixel(r: number, g: number, b: number, settings: HslSettings): [number, number, number] {
  let [h, s, l] = rgbToHsl(clamp(r), clamp(g), clamp(b)); const values = [settings.global]
  for (const channel of HSL_CHANNELS) { const value = settings.channels[channel]; const weight = smoothWeight(h, channelCenter(channel), value.range ?? 30); values.push({ hue: value.hue * weight, saturation: value.saturation * weight, lightness: value.lightness * weight }) }
  const hueShift = values.reduce((sum, value) => sum + value.hue, 0), satShift = values.reduce((sum, value) => sum + value.saturation, 0), lightShift = values.reduce((sum, value) => sum + value.lightness, 0)
  h = s < 1e-6 ? 0 : wrapHue(h + hueShift); s = s < 1e-6 ? 0 : clamp(s + satShift / 100); l = clamp(l + lightShift / 100)
  return hslToRgb(h, s, l)
}
function toneWeight(luma: number, tone: 'shadows' | 'midtones' | 'highlights') {
  if (tone === 'shadows') return (1 - luma) ** 2
  if (tone === 'highlights') return luma ** 2
  return Math.max(0, 1 - Math.abs(luma - .5) * 2)
}
export function applyColorBalancePixel(r: number, g: number, b: number, settings: ColorBalanceSettings): [number, number, number] {
  const luma = .2126 * r + .7152 * g + .0722 * b, original = [r, g, b]
  for (const tone of ['shadows', 'midtones', 'highlights'] as const) {
    const w = toneWeight(luma, tone), v = settings[tone]
    r += (v.cyanRed / 100) * w * .5; g += (v.magentaGreen / 100) * w * .5; b += (v.yellowBlue / 100) * w * .5
    r -= (v.cyanRed / 100) * w * .25; g -= (v.magentaGreen / 100) * w * .25; b -= (v.yellowBlue / 100) * w * .25
  }
  if (settings.preserveLuminosity) { const next = .2126 * r + .7152 * g + .0722 * b, delta = luma - next; r += delta; g += delta; b += delta }
  return [clamp(r), clamp(g), clamp(b)].map((value, i) => clamp(value + (original[i] - value) * 0)) as [number, number, number]
}
export function applyHslAndColorBalance(source: Uint8ClampedArray, width: number, height: number, hsl?: HslSettings, colorBalance?: ColorBalanceSettings): Uint8ClampedArray {
  if (source.length !== width * height * 4) throw new Error('Invalid RGBA dimensions')
  const output = source.slice(); for (let i = 0; i < source.length; i += 4) { let [r, g, b] = [source[i] / 255, source[i + 1] / 255, source[i + 2] / 255]; if (hsl) [r, g, b] = applyHslPixel(r, g, b, hsl); if (colorBalance) [r, g, b] = applyColorBalancePixel(r, g, b, colorBalance); output[i] = Math.round(r * 255); output[i + 1] = Math.round(g * 255); output[i + 2] = Math.round(b * 255) }
  return output
}
