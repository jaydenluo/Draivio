export const COMPOSER_BOTTOM_GAP = 56
export type ComposerPosition = { x: number; y: number; snapped: boolean }
export function constrainComposerPosition(position: { x: number; y: number }, container: { width: number; height: number }, box: { width: number; height: number }): ComposerPosition {
  const bottom = Math.max(12, container.height - box.height - COMPOSER_BOTTOM_GAP)
  const snapped = position.y >= bottom - 24
  return { x: Math.max(12, Math.min(position.x, container.width - box.width - 12)), y: snapped ? bottom : Math.max(12, Math.min(position.y, bottom)), snapped }
}
