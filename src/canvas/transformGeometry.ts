import type { SelectionPoint, SelectionRect } from './selectionGeometry'

/** Resize in object axes, then rotate the center displacement to keep the opposite handle fixed.
 * Percent coordinates are converted to physical axes before rotation on a nonsquare artboard.
 */
export function resizeTransformRect(rect: SelectionRect, handle: string, delta: SelectionPoint, rotation: number, keepRatio: boolean, artboardRatio = .8): SelectionRect {
  const radians = rotation * Math.PI / 180
  const cos = Math.cos(radians), sin = Math.sin(radians)
  const dx = (delta.x * artboardRatio * cos + delta.y * sin) / artboardRatio
  const dy = -delta.x * artboardRatio * sin + delta.y * cos
  const sx = handle.includes('w') ? -1 : handle.includes('e') ? 1 : 0
  const sy = handle.includes('n') ? -1 : handle.includes('s') ? 1 : 0
  let width = Math.max(.2, rect.width + sx * dx)
  let height = Math.max(.2, rect.height + sy * dy)
  const unrotated = Math.abs(sin) < 1e-10 && cos > 0
  const maxWidth = unrotated ? sx < 0 ? rect.x + rect.width : 100 - rect.x : Infinity
  const maxHeight = unrotated ? sy < 0 ? rect.y + rect.height : 100 - rect.y : Infinity
  if (keepRatio && sx && sy && rect.width > 0 && rect.height > 0) {
    const changeX = (width - rect.width) / rect.width
    const changeY = (height - rect.height) / rect.height
    const scale = Math.min(maxWidth / rect.width, maxHeight / rect.height,
      Math.max(.2 / rect.width, .2 / rect.height, 1 + (Math.abs(changeX) >= Math.abs(changeY) ? changeX : changeY)))
    width = rect.width * scale; height = rect.height * scale
  } else {
    width = Math.min(width, maxWidth); height = Math.min(height, maxHeight)
  }
  const localX = sx * (width - rect.width) * artboardRatio / 2
  const localY = sy * (height - rect.height) / 2
  return {
    x: rect.x + (rect.width - width) / 2 + (localX * cos - localY * sin) / artboardRatio,
    y: rect.y + (rect.height - height) / 2 + localX * sin + localY * cos,
    width, height,
  }
}
