import { useEffect, useRef } from 'react'
import type { EditorState } from '../state/editor'
import type { SelectionPoint } from './selectionGeometry'

type SourceAlpha = { width: number; height: number; aspect: number; alpha: Uint8Array }
/** Cache only alpha for picking; this never modifies, uploads, or resamples document assets. */
export function useRasterHitTest(state: EditorState) {
  const cache = useRef(new Map<string, SourceAlpha>())
  const sources = [...new Set(state.layers.flatMap(l => l.source && l.source !== 'fixture' ? [l.source] : []))]
  const sourceKey = JSON.stringify(sources)
  useEffect(() => {
    let disposed = false
    const needed = new Set(sources)
    for (const source of cache.current.keys()) if (!needed.has(source)) cache.current.delete(source)
    const pending: HTMLImageElement[] = []
    for (const source of sources) {
      if (cache.current.has(source)) continue
      const image = new Image()
      pending.push(image)
      image.crossOrigin = 'anonymous'
      image.onload = () => {
        if (disposed || !image.naturalWidth || !image.naturalHeight) return
        try {
          const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight))
          const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale))
          const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
          const context = canvas.getContext('2d', { willReadFrequently: true })
          if (!context) return
          context.drawImage(image, 0, 0, width, height)
          const pixels = context.getImageData(0, 0, width, height).data
          const alpha = Uint8Array.from({ length: width * height }, (_, i) => pixels[i * 4 + 3])
          cache.current.set(source, { width, height, aspect: image.naturalWidth / image.naturalHeight, alpha })
        } catch { /* Unreadable external images retain rectangular picking. */ }
      }
      image.src = source
    }
    return () => { disposed = true; pending.forEach(image => { image.onload = null; image.onerror = null }) }
  }, [sourceKey])
  return (layerId: string, point: SelectionPoint): boolean => {
    const layer = state.layers.find(l => l.id === layerId)
    const data = layer?.source ? cache.current.get(layer.source) : undefined
    if (!data || !layer) return true
    const width = layer.contentWidth ?? state.documentWidth, height = layer.contentHeight ?? state.documentHeight
    const fittedWidth = Math.min(width, height * data.aspect), fittedHeight = fittedWidth / data.aspect
    const x = (point.x * width / 100 - (width - fittedWidth) / 2) / fittedWidth
    const y = (point.y * height / 100 - (height - fittedHeight) / 2) / fittedHeight
    if (x < 0 || y < 0 || x >= 1 || y >= 1) return false
    return data.alpha[Math.floor(y * data.height) * data.width + Math.floor(x * data.width)] > 0
  }
}
