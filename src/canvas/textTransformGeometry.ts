import type { CanvasTextObject } from './TextObject'

/** Deltas and bounds are in the text layer's unscaled pixel coordinates. */
export function resizeTextObject(object: CanvasTextObject, handle: string, delta: { x: number; y: number }, bounds: { width: number; height: number }, documentWidth: number, documentHeight: number): CanvasTextObject {
  const width = Math.max(1, bounds.width), height = Math.max(1, bounds.height)
  const angle = (object.rotation ?? 0) * Math.PI / 180
  const cos = Math.cos(angle), sin = Math.sin(angle)
  const dx = cos * delta.x + sin * delta.y, dy = -sin * delta.x + cos * delta.y
  const dw = handle.includes('w') ? -dx : handle.includes('e') ? dx : 0
  const dh = handle.includes('n') ? -dy : handle.includes('s') ? dy : 0
  const scalesText = object.layout !== 'paragraph' || handle.length === 2
  let nextWidth: number, nextHeight: number, scale = 1
  if (scalesText) {
    // Choose the axis with the larger relative change, including inward drags.
    const changeX = dw / width, changeY = dh / height
    scale = Math.max(1 / Math.max(1, object.fontSize), 1 + (Math.abs(changeX) >= Math.abs(changeY) ? changeX : changeY))
    nextWidth = width * scale; nextHeight = height * scale
  } else {
    nextWidth = Math.max(1, width + dw); nextHeight = Math.max(1, height + dh)
  }
  const offsetX = handle.includes('w') ? width - nextWidth : 0
  const offsetY = handle.includes('n') ? height - nextHeight : 0
  return {
    ...object, width: nextWidth, height: nextHeight,
    x: object.x + (cos * offsetX - sin * offsetY) / documentWidth * 100,
    y: object.y + (sin * offsetX + cos * offsetY) / documentHeight * 100,
    fontSize: scalesText ? object.fontSize * scale : object.fontSize,
    ...(scalesText && object.letterSpacing !== undefined ? { letterSpacing: object.letterSpacing * scale } : {}),
  }
}
