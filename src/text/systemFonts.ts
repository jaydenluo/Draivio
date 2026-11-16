export type SystemFontCategory = '中文' | '西文' | '等宽'
export type SystemFontPreset = { family: string; label: string; category: SystemFontCategory; license: 'SIL OFL 1.1'; fallback: string }
export type FontChoice = SystemFontPreset & { value: string; available: boolean }

// These are names only. Draivio never bundles the files, so the user's own installation
// and its original license remain the source of truth for the rendered font.
export const SYSTEM_FONT_PRESETS: readonly SystemFontPreset[] = [
  { family: 'Noto Sans SC', label: 'Noto Sans SC', category: '中文', license: 'SIL OFL 1.1', fallback: 'sans-serif' },
  { family: 'Noto Serif SC', label: 'Noto Serif SC', category: '中文', license: 'SIL OFL 1.1', fallback: 'serif' },
  { family: 'Source Han Sans SC', label: '思源黑体', category: '中文', license: 'SIL OFL 1.1', fallback: 'sans-serif' },
  { family: 'Source Han Serif SC', label: '思源宋体', category: '中文', license: 'SIL OFL 1.1', fallback: 'serif' },
  { family: 'LXGW WenKai', label: '霞鹜文楷', category: '中文', license: 'SIL OFL 1.1', fallback: 'serif' },
  { family: 'Inter', label: 'Inter', category: '西文', license: 'SIL OFL 1.1', fallback: 'sans-serif' },
  { family: 'Source Sans 3', label: 'Source Sans 3', category: '西文', license: 'SIL OFL 1.1', fallback: 'sans-serif' },
  { family: 'IBM Plex Sans', label: 'IBM Plex Sans', category: '西文', license: 'SIL OFL 1.1', fallback: 'sans-serif' },
  { family: 'JetBrains Mono', label: 'JetBrains Mono', category: '等宽', license: 'SIL OFL 1.1', fallback: 'monospace' },
  { family: 'IBM Plex Mono', label: 'IBM Plex Mono', category: '等宽', license: 'SIL OFL 1.1', fallback: 'monospace' },
  { family: 'Source Code Pro', label: 'Source Code Pro', category: '等宽', license: 'SIL OFL 1.1', fallback: 'monospace' },
  { family: 'Fira Code', label: 'Fira Code', category: '等宽', license: 'SIL OFL 1.1', fallback: 'monospace' },
]

export function normalizeFontFamily(family: string) {
  const preset = SYSTEM_FONT_PRESETS.find((font) => font.family === family)
  if (preset) return `"${preset.family}", ${preset.fallback}`
  return family.includes(',') ? family : `${family}, sans-serif`
}

export function detectSystemFonts(): Record<string, boolean> {
  if (typeof document === 'undefined') return Object.fromEntries(SYSTEM_FONT_PRESETS.map((font) => [font.family, true]))
  const fontSet = document.fonts
  return Object.fromEntries(SYSTEM_FONT_PRESETS.map((font) => [font.family, fontSet ? fontSet.check(`12px "${font.family}"`) : true]))
}

export function fontChoices(availability: Record<string, boolean> = detectSystemFonts()): FontChoice[] {
  return SYSTEM_FONT_PRESETS.map((font) => ({ ...font, value: font.family, available: availability[font.family] !== false }))
}
