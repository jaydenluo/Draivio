type ViewportFitInput = {
  documentWidth: number
  documentHeight: number
  canvasWidth: number
  canvasHeight: number
  composerHeight?: number
  horizontalMargin?: number
  verticalMargin?: number
  composerGap?: number
}

/** Calculates a display zoom without changing the document's pixel dimensions. */
export function fitViewportZoom({ documentWidth, documentHeight, canvasWidth, canvasHeight, composerHeight = 0, horizontalMargin = 32, verticalMargin = 32, composerGap = 20 }: ViewportFitInput): number {
  if (![documentWidth, documentHeight, canvasWidth, canvasHeight, composerHeight].every(Number.isFinite) || documentWidth <= 0 || documentHeight <= 0) return 10
  const availableWidth = Math.max(1, canvasWidth - horizontalMargin)
  const availableHeight = Math.max(1, canvasHeight - verticalMargin - Math.max(0, composerHeight) - (composerHeight > 0 ? composerGap : 0))
  return Math.min(100, Math.max(10, Math.min(availableWidth / documentWidth, availableHeight / documentHeight) * 100))
}
