import { normalizeFontFamily } from './systemFonts'

/** Shared line breaks for the SVG scene and its invisible interaction bounds. */
export function graphemeSegments(text: string): string[] {
  const Segmenter = (Intl as typeof Intl & { Segmenter?: new (locale?: string, options?: { granularity: 'grapheme' }) => { segment(value: string): Iterable<{ segment: string }> } }).Segmenter
  if (Segmenter) return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text), item => item.segment)
  return Array.from(text)
}
export type TextRunRange = { start: number; end: number; [key: string]: unknown }
export function shiftTextRunRanges<T extends TextRunRange>(runs: T[] | undefined, index: number, removed: number, inserted: number): T[] | undefined {
  if (!runs) return undefined
  const delta = inserted - removed, end = index + removed
  return runs.flatMap(run => {
    if (run.end <= index) return [run]
    if (run.start >= end) return [{ ...run, start: run.start + delta, end: run.end + delta }]
    const nextStart = Math.min(run.start, index), nextEnd = Math.max(nextStart, run.end + delta)
    return nextEnd > nextStart ? [{ ...run, start: nextStart, end: nextEnd }] : []
  })
}
export type ParagraphFont = { fontFamily: string; fontWeight?: string }

// One typography contract is used by the poster planner, SVG and interaction bounds.
// Measure whole candidates so kerning, fallback glyphs and bold faces are included.
export function paragraphMeasurer(fontSize: number, letterSpacing: number, font?: ParagraphFont) {
  let context: CanvasRenderingContext2D | null = null
  if (typeof document !== 'undefined' && typeof CanvasRenderingContext2D !== 'undefined') {
    try {
      context = document.createElement('canvas').getContext('2d')
      if (context) {
        context.font = '1px sans-serif'
        context.font = `${font?.fontWeight ?? '400'} ${fontSize}px ${normalizeFontFamily(font?.fontFamily ?? 'sans-serif')}`
        // Invalid CSS fonts leave the previous font unchanged; never measure at 1px.
        if (fontSize !== 1 && context.font === '1px sans-serif') context = null
      }
    } catch { context = null }
  }
  return (value: string) => {
    const glyphs = graphemeSegments(value)
    // SSR/no canvas has no reliable font metrics. Use conservative widths rather
    // than the old .6em Latin guess; account for unshaped ZWJ emoji fallbacks too.
    const envelope = glyphs.reduce((sum, glyph) => {
      const visible = Array.from(glyph).filter(char => !/[\p{Mark}\u200d\ufe0f]/u.test(char))
      const ems = visible.reduce((n, char) => n + (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\u3000-\u303f\uff01-\uff60\uffe0-\uffe6]/u.test(char) ? 1 : 1.25), 0)
      return sum + Math.max(1, fontSize * ems + letterSpacing)
    }, 0)
    if (context) {
      const metrics = context.measureText(value)
      const ink = (metrics.actualBoundingBoxLeft || 0) + (metrics.actualBoundingBoxRight || 0)
      const measured = Math.max(metrics.width, ink) + glyphs.length * letterSpacing
      // Canvas and SVG/PNG engines can resolve different fallback fonts (notably
      // emoji and generic monospace). Keep the conservative envelope in both.
      if (Number.isFinite(measured) && metrics.width > 0) return Math.max(measured, envelope)
    }
    return envelope
  }
}

export function wrapParagraphLines(text: string, width: number, fontSize: number, letterSpacing: number, font?: ParagraphFont) {
  const measure = paragraphMeasurer(fontSize, letterSpacing, font)
  return text.split('\n').flatMap(line => {
    const characters = graphemeSegments(line)
    if (!characters.length) return [' ']
    const lines: string[] = []; let current = ''
    for (const character of characters) {
      if (current && measure(current + character) > width) { lines.push(current); current = '' }
      current += character
    }
    if (current) lines.push(current)
    return lines
  })
}
