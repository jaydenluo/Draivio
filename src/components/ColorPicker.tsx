import { useEffect, useMemo, useRef, useState } from 'react'

type RGB = { r: number; g: number; b: number }
type HSV = { h: number; s: number; v: number }
type CuratedColor = { hex: string; name: string; hue: number }

const curatedColors: CuratedColor[] = [
  { hex: '#FF6B5F', name: '珊瑚红', hue: 4 }, { hex: '#FF9F43', name: '杏橙', hue: 29 }, { hex: '#FFD166', name: '麦芽黄', hue: 43 },
  { hex: '#B8E35D', name: '青柠', hue: 78 }, { hex: '#51C878', name: '翡翠绿', hue: 141 }, { hex: '#4DD4C6', name: '薄荷青', hue: 174 },
  { hex: '#55C7E8', name: '天青蓝', hue: 190 }, { hex: '#5687F7', name: '钴蓝', hue: 224 }, { hex: '#8171E8', name: '鸢尾紫', hue: 248 },
  { hex: '#C66CE8', name: '兰紫', hue: 285 }, { hex: '#EC65BC', name: '玫红', hue: 316 }, { hex: '#FF8FA3', name: '樱粉', hue: 350 },
]
const curatedNeutrals = [{ hex: '#F5F1E8', name: '暖白' }, { hex: '#B5BBC4', name: '雾灰' }, { hex: '#27313D', name: '深石墨' }]

type ColorPickerProps = {
  label: string
  ariaLabel?: string
  value: string
  recentColors?: string[]
  onChange: (color: string) => void
  onRecentSelect?: (color: string) => void
}

function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)) }

function normalizeHex(value: string, fallback = '#ffffff') {
  const raw = value.trim().replace(/^#/, '')
  if (/^[0-9a-f]{3}$/i.test(raw)) return `#${raw.split('').map((part) => part + part).join('').toLowerCase()}`
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`
  return fallback
}

function hexToRgb(hex: string): RGB {
  const normalized = normalizeHex(hex)
  return { r: Number.parseInt(normalized.slice(1, 3), 16), g: Number.parseInt(normalized.slice(3, 5), 16), b: Number.parseInt(normalized.slice(5, 7), 16) }
}

function rgbToHex({ r, g, b }: RGB) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const red = r / 255, green = g / 255, blue = b / 255
  const max = Math.max(red, green, blue), min = Math.min(red, green, blue), delta = max - min
  let h = 0
  if (delta) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6)
    else if (max === green) h = 60 * ((blue - red) / delta + 2)
    else h = 60 * ((red - green) / delta + 4)
  }
  if (h < 0) h += 360
  return { h, s: max ? delta / max : 0, v: max }
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const chroma = v * s, x = chroma * (1 - Math.abs((h / 60) % 2 - 1)), m = v - chroma
  let red = 0, green = 0, blue = 0
  if (h < 60) [red, green, blue] = [chroma, x, 0]
  else if (h < 120) [red, green, blue] = [x, chroma, 0]
  else if (h < 180) [red, green, blue] = [0, chroma, x]
  else if (h < 240) [red, green, blue] = [0, x, chroma]
  else if (h < 300) [red, green, blue] = [x, 0, chroma]
  else [red, green, blue] = [chroma, 0, x]
  return { r: (red + m) * 255, g: (green + m) * 255, b: (blue + m) * 255 }
}

function PipetteIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="color-picker-pipette"><path d="m14.5 4.5 5 5M12 7l5 5M5 19l2.5-2.5M8 16l8-8a2.8 2.8 0 0 1 4 4l-8 8H8Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><circle cx="5" cy="19" r="1.8" fill="none" stroke="currentColor" strokeWidth="1.7" /></svg>
}

type EyeDropperWindow = Window & { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }

export function ColorPicker({ label, ariaLabel = label, value, recentColors = [], onChange, onRecentSelect }: ColorPickerProps) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(normalizeHex(value))
  const [rgb, setRgb] = useState(() => hexToRgb(value))
  const [hsv, setHsv] = useState(() => rgbToHsv(hexToRgb(value)))
  const anchorRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const satRef = useRef<HTMLDivElement>(null)
  const hueRef = useRef<HTMLDivElement>(null)
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 })

  useEffect(() => {
    const normalized = normalizeHex(value)
    setDraft(normalized)
    const nextRgb = hexToRgb(normalized)
    setRgb(nextRgb)
    setHsv(rgbToHsv(nextRgb))
  }, [value])

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!anchorRef.current?.contains(event.target as Node) && !panelRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => { document.removeEventListener('pointerdown', handlePointerDown); document.removeEventListener('keydown', handleKeyDown) }
  }, [open])

  useEffect(() => {
    if (!open || !anchorRef.current) return
    const updatePosition = () => {
      const rect = anchorRef.current!.getBoundingClientRect()
      const width = 270, height = panelRef.current?.offsetHeight || 455, gap = 8
      setPanelPosition({ left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8)), top: rect.bottom + gap + height <= window.innerHeight ? rect.bottom + gap : Math.max(8, rect.top - height - gap) })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => window.removeEventListener('resize', updatePosition)
  }, [open])

  const emit = (nextRgb: RGB, nextHsv = rgbToHsv(nextRgb)) => {
    const nextHex = rgbToHex(nextRgb)
    setRgb(nextRgb); setHsv(nextHsv); setDraft(nextHex); onChange(nextHex)
  }
  const updateFromPoint = (event: React.PointerEvent<HTMLDivElement>, target: 'sat' | 'hue') => {
    const element = target === 'sat' ? satRef.current : hueRef.current
    if (!element) return
    const rect = element.getBoundingClientRect()
    if (target === 'sat') {
      const nextHsv = { ...hsv, s: clamp((event.clientX - rect.left) / rect.width, 0, 1), v: clamp(1 - (event.clientY - rect.top) / rect.height, 0, 1) }
      emit(hsvToRgb(nextHsv), nextHsv)
    } else {
      const nextHsv = { ...hsv, h: clamp((event.clientY - rect.top) / rect.height, 0, 1) * 360 }
      emit(hsvToRgb(nextHsv), nextHsv)
    }
  }
  const pointerControl = (target: 'sat' | 'hue') => (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    updateFromPoint(event, target)
  }
  const updateChannel = (channel: keyof RGB, raw: string) => emit({ ...rgb, [channel]: clamp(Number.parseInt(raw || '0', 10) || 0, 0, 255) })
  const swatchLabel = useMemo(() => `${label} ${normalizeHex(value).toUpperCase()}`, [label, value])
  const recommendedColors = useMemo(() => {
    const distance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
    return [...curatedColors].sort((a, b) => distance(a.hue, hsv.h) - distance(b.hue, hsv.h)).slice(0, 7).concat(curatedNeutrals.map((color) => ({ ...color, hue: hsv.h })))
  }, [hsv.h])
  const pickWithEyeDropper = async () => {
    const EyeDropper = (window as EyeDropperWindow).EyeDropper
    if (!EyeDropper) return
    try {
      const result = await new EyeDropper().open()
      onChange(normalizeHex(result.sRGBHex, normalizeHex(value)))
    } catch {
      // Escape or browser cancellation leaves the current color unchanged.
    }
  }

  return <>
    <div ref={anchorRef} className="color-picker-anchor">
      <span className="color-picker-label">{label}</span>
      <button type="button" className="color-picker-trigger" aria-label={`打开颜色选择器：${label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span className="color-picker-swatch" style={{ backgroundColor: normalizeHex(value) }} aria-hidden="true" />
        <span className="color-picker-value">{normalizeHex(value).toUpperCase()}</span>
        <span className="color-picker-chevron" aria-hidden="true" />
      </button>
      <input className="color-picker-native-input" type="color" aria-label={ariaLabel} value={normalizeHex(value)} onChange={(event) => onChange(event.currentTarget.value)} />
    </div>
    {open ? <div ref={panelRef} className="color-picker-popover" role="dialog" aria-label={`${label}颜色选择器`} style={{ top: panelPosition.top, left: panelPosition.left }} onPointerDown={(event) => event.stopPropagation()}>
      <div className="color-picker-heading"><div><strong>{label}</strong><small>{swatchLabel}</small></div><button type="button" className="color-picker-eyedropper" aria-label="吸管取色" title="吸管取色" onClick={() => void pickWithEyeDropper()}><PipetteIcon /></button></div>
      <div className="color-picker-color-row"><div ref={satRef} className="color-picker-saturation" style={{ backgroundColor: `hsl(${hsv.h} 100% 50%)` }} onPointerDown={pointerControl('sat')} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPoint(event, 'sat') }}><span className="color-picker-cursor" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} /></div><div ref={hueRef} className="color-picker-hue" onPointerDown={pointerControl('hue')} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPoint(event, 'hue') }}><span className="color-picker-cursor color-picker-hue-cursor" style={{ top: `${(hsv.h / 360) * 100}%` }} /></div></div>
      <div className="color-picker-fields"><label>HEX<input aria-label={`${label} HEX`} value={draft} onChange={(event) => { setDraft(event.currentTarget.value); const next = normalizeHex(event.currentTarget.value, ''); if (next) emit(hexToRgb(next)) }} onBlur={() => setDraft(normalizeHex(draft, normalizeHex(value)))} /></label><div className="color-picker-rgb">{(['r', 'g', 'b'] as const).map((channel) => <label key={channel}>{channel.toUpperCase()}<input aria-label={`${label} ${channel.toUpperCase()}`} inputMode="numeric" value={rgb[channel]} onChange={(event) => updateChannel(channel, event.currentTarget.value)} /></label>)}</div></div>
      <div className="color-picker-recent"><div className="color-picker-section-label">最近使用</div>{recentColors.length ? <div className="color-picker-recent-grid">{recentColors.map((color) => <button key={color} type="button" aria-label={`最近颜色 ${color}`} title={color} style={{ backgroundColor: color }} onClick={() => { onRecentSelect?.(color); onChange(color); setOpen(false) }} />)}</div> : <small>取色后会保留最近 20 个颜色</small>}</div>
      <div className="color-picker-curated"><div className="color-picker-section-label">高级色 · 按当前色系推荐</div><div className="color-picker-curated-grid">{recommendedColors.map((color) => <button key={color.hex} type="button" aria-label={`推荐颜色 ${color.name} ${color.hex}`} title={`${color.name} ${color.hex}`} style={{ backgroundColor: color.hex }} onClick={() => { onChange(color.hex); setOpen(false) }} />)}</div></div>
    </div> : null}
  </>
}
