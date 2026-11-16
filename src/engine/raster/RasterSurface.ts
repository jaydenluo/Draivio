import { processRaster, disposeRaster, type ProcessingOptions } from '../../ai/imaging/processingScheduler'
import type { PixelImage } from '../../canvas/rasterTools'
import { compositeLayers, type RasterBlendMode, type RasterLayerInput } from './composite'

export class RasterSurface {
  readonly width: number
  readonly height: number
  private revision = 0
  private readonly pixels: Uint8ClampedArray

  constructor(width: number, height: number, data?: Uint8ClampedArray) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new Error('栅格尺寸无效')
    if (data && data.length !== width * height * 4) throw new Error('栅格像素长度与尺寸不匹配')
    this.width = width; this.height = height; this.pixels = data ? new Uint8ClampedArray(data) : new Uint8ClampedArray(width * height * 4)
  }

  static from(image: PixelImage) { return new RasterSurface(image.width, image.height, image.data) }
  static blank(width: number, height: number) { return new RasterSurface(width, height) }
  toImage(): PixelImage { return { width: this.width, height: this.height, data: new Uint8ClampedArray(this.pixels) } }
  clone() { return new RasterSurface(this.width, this.height, this.pixels) }
  clear() { this.revision++; this.pixels.fill(0); return this }
  composite(layers: readonly RasterLayerInput[], background?: PixelImage) { this.revision++; const next = compositeLayers(this.width, this.height, layers, background); this.pixels.set(next.data); return this }
  /** Atomic async alternative for interactive consumers. Results of a stale
   * computation cannot overwrite a clear/draw/newer composition. */
  async compositeAsync(layers: readonly RasterLayerInput[], options: ProcessingOptions = {}) {
    const revision = ++this.revision
    const result = await processRaster({ width: this.width, height: this.height, layers: [...layers] }, options)
    try {
      if (revision !== this.revision) throw new Error('栅格已更改，旧预览未写入')
      this.pixels.set(result.image.data)
      return this
    } finally { disposeRaster(result.image) }
  }
  draw(image: PixelImage, options: { opacity?: number; blendMode?: RasterBlendMode; mask?: Uint8Array } = {}) { this.composite([{ image, ...options }]); return this }
}
