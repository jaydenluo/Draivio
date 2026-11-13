/** Product presets. Model adapters must validate supported sizes before making requests. */
export const outputFormats = [
  { ratio: '1:1', name: '方形', sizes: ['1024 × 1024', '1536 × 1536', '2048 × 2048'] },
  { ratio: '4:3', name: '横向', sizes: ['1024 × 768', '1440 × 1080', '2048 × 1536'] },
  { ratio: '3:4', name: '竖向', sizes: ['768 × 1024', '1080 × 1440', '1536 × 2048'] },
  { ratio: '3:2', name: '横向', sizes: ['1536 × 1024', '1920 × 1280', '2400 × 1600'] },
  { ratio: '2:3', name: '竖向', sizes: ['1024 × 1536', '1280 × 1920', '1600 × 2400'] },
  { ratio: '16:9', name: '宽屏', sizes: ['1280 × 720', '1920 × 1080', '2560 × 1440'] },
  { ratio: '9:16', name: '竖屏', sizes: ['720 × 1280', '1080 × 1920', '1440 × 2560'] },
  { ratio: '4:5', name: '海报', sizes: ['1024 × 1280', '1440 × 1800', '2048 × 2560'] },
] as const

export type OutputRatio = typeof outputFormats[number]['ratio'] | 'auto'

export function isValidOutputFormat(ratio: string, size: string) {
  if (ratio === 'auto') return size === 'auto'
  const preset = outputFormats.find((format) => format.ratio === ratio)
  return Boolean(preset && (size === 'auto' || (preset.sizes as readonly string[]).includes(size)))
}

export function outputFormatLabel(ratio: string, size: string) {
  if (ratio === 'auto') return 'Auto'
  return `${ratio} · ${size === 'auto' ? 'Auto' : size}`
}
