import type { PixelImage } from '../../canvas/rasterTools'

export type RasterBlendMode = 'normal' | 'multiply' | 'screen' | 'overlay'
export type RasterLayerInput = { image: PixelImage; opacity?: number; blendMode?: RasterBlendMode; mask?: Uint8Array }

function validateImage(image: PixelImage) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) throw new Error('栅格尺寸无效')
  if (image.data.length !== image.width * image.height * 4) throw new Error('栅格像素长度与尺寸不匹配')
}

function blendChannel(base: number, source: number, mode: RasterBlendMode): number {
  if (mode === 'multiply') return base * source
  if (mode === 'screen') return 1 - (1 - base) * (1 - source)
  if (mode === 'overlay') return base < .5 ? 2 * base * source : 1 - 2 * (1 - base) * (1 - source)
  return source
}

function compositePixel(destination: Uint8ClampedArray, targetOffset: number, source: Uint8ClampedArray, sourceOffset: number, opacity: number, mode: RasterBlendMode, maskValue = 255) {
  const sourceAlpha = source[sourceOffset + 3] / 255 * opacity * (maskValue / 255)
  if (!sourceAlpha) return
  const destinationAlpha = destination[targetOffset + 3] / 255
  const outputAlpha = sourceAlpha + destinationAlpha * (1 - sourceAlpha)
  for (let channel = 0; channel < 3; channel++) {
    const base = destination[targetOffset + channel] / 255
    const color = source[sourceOffset + channel] / 255
    const blended = blendChannel(base, color, mode)
    destination[targetOffset + channel] = outputAlpha ? ((blended * sourceAlpha + base * destinationAlpha * (1 - sourceAlpha)) / outputAlpha) * 255 : 0
  }
  destination[targetOffset + 3] = outputAlpha * 255
}

export function compositeLayers(width: number, height: number, layers: readonly RasterLayerInput[], background?: PixelImage): PixelImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('合成尺寸无效')
  const data = new Uint8ClampedArray(width * height * 4)
  if (background) {
    validateImage(background)
    if (background.width !== width || background.height !== height) throw new Error('背景尺寸与合成尺寸不一致')
    data.set(background.data)
  }
  for (const layer of layers) {
    validateImage(layer.image)
    if (layer.image.width !== width || layer.image.height !== height) throw new Error('图层尺寸与合成尺寸不一致')
    if (layer.mask && layer.mask.length !== width * height) throw new Error('图层蒙版尺寸与合成尺寸不一致')
    const opacity = Math.min(1, Math.max(0, layer.opacity ?? 1))
    const mode = layer.blendMode ?? 'normal'
    for (let index = 0; index < width * height; index++) compositePixel(data, index * 4, layer.image.data, index * 4, opacity, mode, layer.mask?.[index])
  }
  return { width, height, data }
}

export function solidImage(width: number, height: number, color: [number, number, number, number]): PixelImage {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('栅格尺寸无效')
  const data = new Uint8ClampedArray(width * height * 4)
  for (let index = 0; index < width * height; index++) data.set(color, index * 4)
  return { width, height, data }
}
