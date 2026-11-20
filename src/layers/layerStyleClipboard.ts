import { useSyncExternalStore } from 'react'
import { cloneEffects, type LayerEffects } from '../render/layerEffects'

// Session-only clipboard shared across layers and panel remounts.
let clipboard: LayerEffects | null = null
const listeners = new Set<() => void>()
export function copyLayerStyle(effects: LayerEffects) {
  clipboard = cloneEffects(effects)
  listeners.forEach(listener => listener())
}
export function useLayerStyleClipboard() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => clipboard, () => null)
}
