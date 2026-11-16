export type PointerInput = {
  pressure: number
  tiltX: number
  tiltY: number
  pointerType: string
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Normalizes browser pointer data for the brush engine.
 * Mice report zero pressure even while drawing, so they use the Photoshop-like
 * half-pressure fallback. Pens and touch retain their reported pressure.
 */
export function pointerInput(event: Pick<PointerEvent, 'pressure' | 'tiltX' | 'tiltY' | 'pointerType'>): PointerInput {
  const reported = Number.isFinite(event.pressure) ? event.pressure : 0
  const pressure = event.pointerType === 'mouse' ? (reported > 0 ? clamp(reported, 0, 1) : .5) : clamp(reported > 0 ? reported : .5, 0, 1)
  return { pressure, tiltX: clamp(Number(event.tiltX) || 0, -90, 90), tiltY: clamp(Number(event.tiltY) || 0, -90, 90), pointerType: event.pointerType || 'mouse' }
}

export function pressureScale(pressure: number, minimum = .35): number {
  return minimum + (1 - minimum) * clamp(Number.isFinite(pressure) ? pressure : .5, 0, 1)
}
