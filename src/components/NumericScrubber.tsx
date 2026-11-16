import { useEffect, useRef, useState } from 'react'

type NumericScrubberProps = {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  unit?: string
  ariaLabel?: string
  onChange: (value: number) => void
  className?: string
  disabled?: boolean
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
const decimalPlaces = (value: number) => {
  const text = String(value)
  const point = text.indexOf('.')
  return point < 0 ? 0 : Math.min(6, text.length - point - 1)
}
const formatValue = (value: number, step: number) => Number(value.toFixed(decimalPlaces(step))).toString()

export function NumericScrubber({ label, value, min = 0, max = 100, step = 1, unit, ariaLabel, onChange, className = '', disabled = false }: NumericScrubberProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragRef = useRef<{ pointerId: number; startX: number; startValue: number } | null>(null)
  const [draft, setDraft] = useState(() => formatValue(value, step))

  useEffect(() => {
    if (!dragRef.current && document.activeElement !== inputRef.current) setDraft(formatValue(value, step))
  }, [value, step])

  const emit = (next: number, syncDraft = true) => {
    const clamped = clamp(next, min, max)
    if (syncDraft) setDraft(formatValue(clamped, step))
    onChange(clamped)
  }
  const nudge = (direction: 1 | -1, multiplier = 1) => {
    const current = Number(draft)
    emit((Number.isFinite(current) ? current : value) + direction * step * multiplier)
  }
  const handleInput = (event: React.ChangeEvent<HTMLInputElement>) => {
    const raw = event.currentTarget.value
    setDraft(raw)
    if (raw !== '' && Number.isFinite(event.currentTarget.valueAsNumber)) {
      const next = clamp(event.currentTarget.valueAsNumber, min, max)
      setDraft(event.currentTarget.valueAsNumber === next ? raw : formatValue(next, step))
      onChange(next)
    }
  }
  const commitInput = () => {
    const parsed = Number(draft)
    emit(Number.isFinite(parsed) ? parsed : value)
  }
  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      nudge(event.key === 'ArrowUp' ? 1 : -1, event.shiftKey ? 10 : 1)
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault()
      nudge(event.key === 'PageUp' ? 1 : -1, 10)
    } else if (event.key === 'Enter') {
      event.preventDefault(); commitInput(); event.currentTarget.blur()
    } else if (event.key === 'Escape') {
      event.preventDefault(); setDraft(formatValue(value, step)); event.currentTarget.blur()
    }
  }
  const handleWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    event.preventDefault()
    nudge(event.deltaY < 0 ? 1 : -1, event.shiftKey ? 10 : 1)
  }
  const handleScrubDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startValue: value }
  }
  const handleScrubMove = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const multiplier = event.shiftKey ? 10 : 1
    emit(drag.startValue + Math.round((event.clientX - drag.startX) / 2) * step * multiplier)
  }
  const handleScrubUp = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
  }

  return <div className={`numeric-scrubber ${className}`.trim()}>
    <button type="button" className="numeric-scrubber-label" aria-label={`拖动调整${label}`} title={`拖动调整${label}`} disabled={disabled} onPointerDown={handleScrubDown} onPointerMove={handleScrubMove} onPointerUp={handleScrubUp} onPointerCancel={handleScrubUp}>{label}</button>
    <span className="numeric-scrubber-control">
      <input ref={inputRef} className="numeric-scrubber-input" type="number" aria-label={ariaLabel ?? label} min={min} max={max} step={step} value={draft} disabled={disabled} onChange={handleInput} onBlur={commitInput} onKeyDown={handleKeyDown} onWheel={handleWheel} />
      <span className="numeric-scrubber-stepper"><button type="button" aria-label={`增加${label}`} tabIndex={-1} disabled={disabled} onClick={() => nudge(1)}>＋</button><button type="button" aria-label={`减少${label}`} tabIndex={-1} disabled={disabled} onClick={() => nudge(-1)}>−</button></span>
    </span>
    {unit ? <small className="numeric-scrubber-unit">{unit}</small> : null}
  </div>
}
