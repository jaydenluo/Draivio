import { afterEach, describe, expect, it, vi } from 'vitest'
import { cloneImage, clonePixels, contiguousMagicSelection, eraseBackground, eraseFloodPixels, floodPixels, maskToSelection, perspectiveWarp, rasterizeSvg, sampleCanvasColor, samplePixelColor, serializeSvg, smudgeImage, smudgePixels, type PixelImage } from './rasterTools'
import { selectionContains } from './selectionGeometry'

function pixels(rows: number[][]): PixelImage {
  return { width: rows[0].length, height: rows.length, data: new Uint8ClampedArray(rows.flatMap((row) => row.flatMap((red) => [red, 0, 0, 255]))) }
}
function svg() {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  node.setAttribute('viewBox', '0 0 500 625')
  node.innerHTML = '<rect width="500" height="625" fill="#dd806d" />'
  return node
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('pure pixel tools', () => {
  it('floods only the four-connected seed-color region within tolerance', () => {
    const image = pixels([[10, 15, 200, 10], [10, 20, 200, 10], [200, 200, 10, 10]])
    expect([...floodPixels(image, { x: 0, y: 0 }, 5)]).toEqual([1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])
    expect([...floodPixels(image, { x: 0, y: 0 }, 10)]).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0])
    expect([...floodPixels(image, { x: 100, y: 100 }, 0)]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 1])
  })
  it('samples percentage coordinates, including the last pixel, as padded hex', () => {
    const image = pixels([[10, 255], [0, 16]])
    expect(samplePixelColor(image, 0, 0)).toBe('#0a0000')
    expect(samplePixelColor(image, 100, 100)).toBe('#100000')
  })
  it('converts a nonrectangular flood mask to actual selectable geometry', () => {
    const image = pixels([[10, 10, 200], [10, 200, 10], [10, 10, 200]])
    const selection = maskToSelection(floodPixels(image, { x: 0, y: 0 }, 0), image.width, image.height)
    expect(selection.path.type).toBe('raster')
    expect(selectionContains(selection.path, { x: 15, y: 50 })).toBe(true)
    expect(selectionContains(selection.path, { x: 50, y: 50 })).toBe(false)
    expect(selectionContains(selection.path, { x: 85, y: 50 })).toBe(false)
    expect(selection.rect.width).toBeCloseTo(200 / 3)
    expect(selection.rect.height).toBe(100)
  })
  it('erases only the connected background and preserves original image data', () => {
    const image = pixels([[10, 10, 200, 10], [10, 200, 200, 10]])
    const erased = eraseFloodPixels(image, { x: 0, y: 0 }, 0)
    expect([...erased.data].filter((_, index) => index % 4 === 3)).toEqual([0, 0, 255, 255, 0, 255, 255, 255])
    expect(image.data[3]).toBe(255)
    expect(erased.data[0]).toBe(10)
  })
  it('handles transparent pixels by visible alpha and never wraps at row boundaries', () => {
    const transparent: PixelImage = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 0, 0, 255, 0, 0]) }
    expect([...floodPixels(transparent, { x: 0, y: 0 }, 0)]).toEqual([1, 1])
    expect([...floodPixels(pixels([[200, 10], [10, 200]]), { x: 100, y: 0 }, 0)]).toEqual([0, 1, 0, 0])
  })
  it('rejects invalid image buffers, coordinates, tolerances and mask dimensions', () => {
    expect(() => floodPixels({ width: 2, height: 2, data: new Uint8ClampedArray(3) }, { x: 0, y: 0 }, 0)).toThrow(Error)
    expect(() => floodPixels(pixels([[0]]), { x: NaN, y: 0 }, 0)).toThrow(Error)
    expect(() => floodPixels(pixels([[0]]), { x: 0, y: 0 }, -1)).toThrow(Error)
    expect(() => samplePixelColor(pixels([[0]]), 101, 0)).toThrow(Error)
    expect(() => maskToSelection(new Uint8Array(1), 2, 2)).toThrow(Error)
  })
})

describe('SVG rasterization', () => {
  it('serializes an independent SVG with explicit intrinsic width and height', () => {
    const node = svg()
    const result = serializeSvg(node)
    expect(result.width).toBe(500)
    expect(result.height).toBe(625)
    expect(result.source).toContain('width="500"')
    expect(result.source).toContain('height="625"')
    expect(result.source).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(node.hasAttribute('width')).toBe(false)
    expect(() => serializeSvg(document.createElementNS('http://www.w3.org/2000/svg', 'g'))).toThrow(Error)
  })
  it('rejects unavailable canvas support rather than returning invented pixels or selections', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(rasterizeSvg(svg())).rejects.toThrow(Error)
    await expect(sampleCanvasColor(svg(), 20, 20)).rejects.toThrow(Error)
    await expect(contiguousMagicSelection(svg(), { x: 20, y: 20 }, 20)).rejects.toThrow(Error)
    await expect(eraseBackground(svg(), { x: 20, y: 20 }, 20)).rejects.toThrow(Error)
  })
  it('uses the browser image/canvas pipeline and revokes decoded SVG resources', async () => {
    const image = pixels([[10, 10], [200, 10]])
    const context = {
      drawImage: vi.fn(), getImageData: vi.fn(() => image),
      createImageData: vi.fn(() => ({ width: 2, height: 2, data: new Uint8ClampedArray(16) })),
      putImageData: vi.fn(),
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,verified-by-platform-boundary')
    const revoke = vi.fn()
    const BaseUrl = URL
    vi.stubGlobal('URL', class extends BaseUrl { static createObjectURL = vi.fn(() => 'blob:raster-test'); static revokeObjectURL = revoke })
    vi.stubGlobal('Image', class {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    })
    const node = svg(); node.setAttribute('viewBox', '0 0 2 2')
    const canvas = await rasterizeSvg(node)
    expect(canvas.width).toBe(2); expect(canvas.height).toBe(2)
    expect(context.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 2, 2)
    expect(revoke).toHaveBeenCalledWith('blob:raster-test')
    expect(await sampleCanvasColor(node, 0, 0)).toBe('#0a0000')
    const selection = await contiguousMagicSelection(node, { x: 0, y: 0 }, 0)
    expect(selectionContains(selection.path, { x: 25, y: 75 })).toBe(false)
    expect(await eraseBackground(node, { x: 0, y: 0 }, 0)).toMatch(/^data:image\/png/)
    const written = context.putImageData.mock.calls[0][0] as unknown as PixelImage
    expect([written.data[3], written.data[7], written.data[11], written.data[15]]).toEqual([0, 0, 255, 0])
    expect(await smudgeImage(node, [{ x: 0, y: 0 }, { x: 100, y: 100 }], 1, 50)).toMatch(/^data:image\/png/)
    expect(await cloneImage(node, [{ x: 0, y: 0 }], { x: 100, y: 100 }, 1)).toMatch(/^data:image\/png/)
    context.getImageData.mockImplementation(() => { throw new Error('SecurityError') })
    await expect(sampleCanvasColor(node, 0, 0)).rejects.toThrow('无法读取画布像素')
  })
  it('rejects image decoding failure and revokes its object URL', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D)
    const revoke = vi.fn()
    const BaseUrl = URL
    vi.stubGlobal('URL', class extends BaseUrl { static createObjectURL = () => 'blob:broken-svg'; static revokeObjectURL = revoke })
    vi.stubGlobal('Image', class {
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onerror?.()) }
    })
    await expect(rasterizeSvg(svg())).rejects.toThrow('SVG 图像无法解码')
    expect(revoke).toHaveBeenCalledWith('blob:broken-svg')
  })
})

describe('perspective image correction', () => {
  const full = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] as const
  it('preserves identity pixels and maps a crop to the output rectangle', () => {
    const image = pixels([[0, 10, 20], [30, 40, 50], [60, 70, 80]])
    expect(perspectiveWarp(image, 3, 3, full)).toEqual(image)
    const crop = [{ x: 50, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 50, y: 100 }] as const
    expect(perspectiveWarp(image, 2, 3, crop)).toEqual(pixels([[10, 20], [40, 50], [70, 80]]))
  })
  it('uses a projective mapping for a trapezoid rather than its bounding box', () => {
    const image = pixels([[0, 10, 20], [30, 40, 50], [60, 70, 80]])
    const quad = [{ x: 25, y: 0 }, { x: 75, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] as const
    const warped = perspectiveWarp(image, 3, 3, quad)
    expect(warped.data[0]).toBe(5)
    expect(warped.data[8]).toBe(15)
    expect(warped.data[16]).toBe(30)
    expect(warped.data[24]).toBe(60)
  })
  it('interpolates in premultiplied alpha and rejects degenerate or crossed quads', () => {
    const image: PixelImage = { width: 2, height: 1, data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]) }
    expect([...perspectiveWarp(image, 3, 1, full).data.slice(4, 8)]).toEqual([255, 0, 0, 128])
    expect(() => perspectiveWarp(image, 0, 1, full)).toThrow(Error)
    expect(() => perspectiveWarp(image, 1, 1, [full[0], full[2], full[1], full[3]])).toThrow(Error)
    expect(() => perspectiveWarp(image, 1, 1, [full[0], full[0], full[0], full[0]])).toThrow(Error)
  })
})

describe('smudge and clone pixels', () => {
  it('carries the previous brush color across an interpolated path without changing input', () => {
    const image = pixels([[200, 0, 0, 0, 0]])
    const smeared = smudgePixels(image, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 1, 100)
    expect([...smeared.data].filter((_, i) => i % 4 === 0)).toEqual([200, 200, 200, 200, 200])
    expect([...smudgePixels(image, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 1, 50).data].filter((_, i) => i % 4 === 0)).toEqual([200, 100, 50, 25, 12])
    expect(smudgePixels(image, [{ x: 0, y: 0 }, { x: 100, y: 0 }], 1, 0)).toEqual(image)
    expect(image.data[4]).toBe(0)
  })
  it('clones from the original snapshot with a fixed source/destination offset', () => {
    const image = pixels([[10, 20, 30, 40, 50]])
    const cloned = clonePixels(image, [{ x: 25, y: 0 }, { x: 100, y: 0 }], { x: 0, y: 0 }, 1)
    expect([...cloned.data].filter((_, i) => i % 4 === 0)).toEqual([10, 10, 20, 30, 40])
    expect(image.data[4]).toBe(20)
  })
  it('uses a circular brush and safely clips sources and destinations at the edge', () => {
    const image = pixels([[255, 255, 255, 0, 0], [255, 255, 255, 0, 0], [255, 255, 255, 0, 0]])
    const clone = clonePixels(image, [{ x: 100, y: 50 }], { x: 25, y: 50 }, 2)
    expect(clone.data[(1 * 5 + 4) * 4]).toBe(255)
    expect(clone.data[(0 * 5 + 3) * 4]).toBe(0)
    expect(clone.data.length).toBe(image.data.length)
  })
  it('rejects invalid paths, brush sizes and strengths', async () => {
    const image = pixels([[0]])
    expect(() => smudgePixels(image, [], 1, 50)).toThrow(Error)
    expect(() => smudgePixels(image, [{ x: 0, y: 0 }], 0, 50)).toThrow(Error)
    expect(() => smudgePixels(image, [{ x: 0, y: 0 }], 1, 101)).toThrow(Error)
    expect(() => clonePixels(image, [{ x: 0, y: 0 }], { x: NaN, y: 0 }, 1)).toThrow(Error)
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(smudgeImage(svg(), [{ x: 0, y: 0 }], 1, 50)).rejects.toThrow(Error)
    await expect(cloneImage(svg(), [{ x: 0, y: 0 }], { x: 0, y: 0 }, 1)).rejects.toThrow(Error)
  })
})
