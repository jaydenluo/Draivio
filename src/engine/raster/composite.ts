import { blendColor, resolveBlendMode, type BlendMode } from '../../render/blendModes'
import type { PixelImage } from '../../canvas/rasterTools'

export type RasterBlendMode = BlendMode
export type RasterLayerInput = { image: PixelImage; opacity?: number; blendMode?: RasterBlendMode; mask?: Uint8Array }

function validateImage(image: PixelImage) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) throw new Error('栅格尺寸无效')
  if (image.data.length !== image.width * image.height * 4) throw new Error('栅格像素长度与尺寸不匹配')
}

function compositePixel(destination: Uint8ClampedArray, targetOffset: number, source: Uint8ClampedArray, sourceOffset: number, opacity: number, mode: RasterBlendMode, maskValue = 255) {
  const sourceAlpha = source[sourceOffset + 3] / 255 * opacity * (maskValue / 255)
  if (!sourceAlpha) return
  const destinationAlpha = destination[targetOffset + 3] / 255
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)
  // Avoid allocating RGB arrays for the common source-over case. Keep exactly
  // the same straight-alpha expression/rounding as the general blend path.
  const blended = mode === 'normal' ? undefined : blendColor([destination[targetOffset]/255,destination[targetOffset+1]/255,destination[targetOffset+2]/255],[source[sourceOffset]/255,source[sourceOffset+1]/255,source[sourceOffset+2]/255],mode)
  for (let channel = 0; channel < 3; channel++) {
    const base = destination[targetOffset + channel] / 255
    const color = source[sourceOffset + channel] / 255
    destination[targetOffset + channel] = outputAlpha ? ((sourceAlpha * (1-destinationAlpha) * color + sourceAlpha * destinationAlpha * (blended ? blended[channel] : color) + base * destinationAlpha * (1 - sourceAlpha)) / outputAlpha) * 255 : 0
  }
  destination[targetOffset + 3] = outputAlpha * 255
}

/** Validated compositing session shared by full-resolution export and the
 * cooperative preview scheduler. A range never allocates a temporary image. */
export function createRasterComposite(width: number, height: number, layers: readonly RasterLayerInput[], background?: PixelImage) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) throw new Error('合成尺寸无效')
  const prepared = layers.map(layer => {
    validateImage(layer.image)
    if (layer.image.width !== width || layer.image.height !== height) throw new Error('图层尺寸与合成尺寸不一致')
    if (layer.mask && layer.mask.length !== width * height) throw new Error('图层蒙版尺寸与合成尺寸不一致')
    if (layer.opacity !== undefined && !Number.isFinite(layer.opacity)) throw new Error('图层不透明度无效')
    return { ...layer, opacity: Math.min(1, Math.max(0, layer.opacity ?? 1)), mode: resolveBlendMode(layer.blendMode ?? 'normal') }
  })
  if (background) {
    validateImage(background)
    if (background.width !== width || background.height !== height) throw new Error('背景尺寸与合成尺寸不一致')
  }
  const data = new Uint8ClampedArray(width * height * 4)
  if (background) data.set(background.data)
  const image = { width, height, data }
  return { image, layerCount: prepared.length, compositeRange(layerIndex: number, start: number, end: number, deadline?: number) {
    const layer = prepared[layerIndex]
    if (!layer || !Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > width * height || end < start) throw new Error('合成区间无效')
    const source = layer.image.data
    // A single opaque normal layer still scans alpha (mixed transparency is
    // legal). Copy four bytes directly only when the mathematical result is
    // exactly the source; transparent pixels retain destination semantics.
    for (let index = start; index < end; index++) {
      // A cold or expensive blend may exceed the last slice's throughput.
      // Stop inside the range; the scheduler resumes at this exact pixel.
      // Full-resolution synchronous callers omit the deadline and keep math.
      if (deadline !== undefined && index > start && (index - start) % 2048 === 0 && performance.now() >= deadline) return index
      const offset = index * 4
      if (layer.mode === 'normal' && layer.opacity === 1 && !layer.mask && source[offset + 3] === 255) {
        data[offset] = source[offset]; data[offset + 1] = source[offset + 1]; data[offset + 2] = source[offset + 2]; data[offset + 3] = 255
      } else compositePixel(data, offset, source, offset, layer.opacity, layer.mode, layer.mask?.[index])
    }
    return end
  } }
}

export function compositeLayers(width: number, height: number, layers: readonly RasterLayerInput[], background?: PixelImage): PixelImage {
  const session = createRasterComposite(width, height, layers, background)
  for (let layer = 0; layer < session.layerCount; layer++) session.compositeRange(layer, 0, width * height)
  return session.image
}

export function solidImage(width: number, height: number, color: [number, number, number, number]): PixelImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('栅格尺寸无效')
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index++) data.set(color, index * 4)
  return { width, height, data }
}
