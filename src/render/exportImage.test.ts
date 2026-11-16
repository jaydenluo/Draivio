import { describe, expect, it, vi } from 'vitest'
import { exportSvgImage } from './exportImage'
import { decontaminateFringe } from '../masks/refineMask'
import { defaultProfile } from '../color/iccPipeline'
import { inflateSync, deflateSync } from 'node:zlib'

const pngCrc = (bytes: Uint8Array) => {
  let c = 0xffffffff
  for (const x of bytes) { c ^= x; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0) }
  return (c ^ 0xffffffff) >>> 0
}
/** A tiny standards-compliant RGBA PNG encoder used to exercise export bytes. */
function encodeRgbaPng(rgba: Uint8Array, width: number, height: number) {
  const raw = new Uint8Array(height * (1 + width * 4))
  for (let y = 0; y < height; y++) { raw[y * (1 + width * 4)] = 0; raw.set(rgba.slice(y * width * 4, (y + 1) * width * 4), y * (1 + width * 4) + 1) }
  const text = new TextEncoder()
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array(4 + data.length), view = new DataView(body.buffer)
    body.set(text.encode(type), 0); body.set(data, 4)
    const out = new Uint8Array(12 + data.length), outView = new DataView(out.buffer)
    outView.setUint32(0, data.length); out.set(body, 4); outView.setUint32(out.length - 4, pngCrc(body)); return out
  }
  const ihdr = new Uint8Array(13), iv = new DataView(ihdr.buffer); iv.setUint32(0, width); iv.setUint32(4, height); ihdr[8] = 8; ihdr[9] = 6
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())], { type: 'image/png' })
}
function decodeRgbaPng(bytes: Uint8Array) {
  let off = 8, width = 0, height = 0, compressed: Uint8Array | undefined
  while (off + 12 <= bytes.length) { const n = new DataView(bytes.buffer, bytes.byteOffset + off, 4).getUint32(0); const type = new TextDecoder().decode(bytes.slice(off + 4, off + 8)); const data = bytes.slice(off + 8, off + 8 + n); if (type === 'IHDR') { width = new DataView(data.buffer, data.byteOffset).getUint32(0); height = new DataView(data.buffer, data.byteOffset + 4).getUint32(0) } if (type === 'IDAT') compressed = compressed ? new Uint8Array([...compressed, ...data]) : data; off += n + 12 }
  if (!compressed) throw new Error('PNG 缺少 IDAT')
  const raw = inflateSync(compressed), stride = width * 4, rgba = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) rgba.set(raw.slice(y * (stride + 1) + 1, y * (stride + 1) + stride + 1), y * stride)
  return { width, height, rgba }
}

function harness(blob: Blob | null = new Blob(['pixels'], { type: 'image/png' })) {
  const canvas = document.createElement('canvas')
  const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(), putImageData: vi.fn() }
  vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  vi.spyOn(canvas, 'toBlob').mockImplementation(callback => callback(blob))
  const image = document.createElement('canvas')
  const decodeSvg = vi.fn(async () => ({ image, width: 500, height: 625 }))
  return { canvas, context, image, decodeSvg, deps: { createCanvas: () => canvas, decodeSvg } }
}
describe('image export pipeline', () => {
  it.each([['png','image/png'],['jpeg','image/jpeg'],['webp','image/webp']] as const)('draws decoded pixels before encoding %s', async (format, mime) => {
    const h = harness(new Blob(['pixels'], { type: mime }))
    const result = await exportSvgImage('<svg/>', { format, width: 200, height: 100 }, h.deps)
    expect(result.type).toBe(mime)
    expect(h.context.drawImage).toHaveBeenCalledWith(h.image, 0, 0, 500, 625, 0, 0, 200, 100)
    expect(h.context.fillRect).toHaveBeenCalledTimes(format === 'jpeg' ? 1 : 0)
  })
  it('runs RGBA post processing after SVG rasterization', async () => {
    const h = harness()
    const pixels = new Uint8ClampedArray([255, 255, 255, 128])
    h.context.getImageData = vi.fn(() => ({ data: pixels }) as unknown as ImageData)
    h.context.putImageData = vi.fn()
    const postProcess = vi.fn((rgba: Uint8ClampedArray) => { rgba[0] = 17; return rgba })
    await exportSvgImage('<svg/>', { format: 'png', width: 1, height: 1, postProcess }, h.deps)
    expect(postProcess).toHaveBeenCalledWith(pixels, 1, 1)
    expect(h.context.putImageData).toHaveBeenCalled()
  })
  it('encodes converted RGBA into real PNG bytes and independently verifies ICC and pixels', async () => {
    const source = new Uint8ClampedArray([255, 0, 0, 255, 100, 1, 2, 0])
    let encoded: Blob | undefined
    const canvas = document.createElement('canvas')
    let pixels = new Uint8ClampedArray(source)
    const context = { fillStyle: '', fillRect: vi.fn(), drawImage: vi.fn(), getImageData: vi.fn(() => ({ data: pixels }) as unknown as ImageData), putImageData: vi.fn((image: ImageData) => { pixels = new Uint8ClampedArray(image.data) }) }
    vi.spyOn(canvas, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
    vi.spyOn(canvas, 'toBlob').mockImplementation(callback => { encoded = encodeRgbaPng(new Uint8Array(pixels), 2, 1); callback(encoded) })
    const result = await exportSvgImage('<svg/>', { format: 'png', width: 2, height: 1, profile: defaultProfile('display-p3') }, { createCanvas: () => canvas, decodeSvg: async () => ({ image: document.createElement('canvas'), width: 2, height: 1 }) })
    const out = new Uint8Array(await result.arrayBuffer()), decoded = decodeRgbaPng(out)
    expect(decoded.rgba.slice(0, 4)).toEqual(new Uint8Array([234, 51, 35, 255]))
    expect(decoded.rgba.slice(4, 8)).toEqual(new Uint8Array([100, 1, 2, 0]))
    let profile: Uint8Array | undefined; let at = 8
    while (at + 12 <= out.length) { const n = new DataView(out.buffer, out.byteOffset + at, 4).getUint32(0); const type = new TextDecoder().decode(out.slice(at + 4, at + 8)); if (type === 'iCCP') { const data = out.slice(at + 8, at + 8 + n); profile = new Uint8Array(inflateSync(data.slice(data.indexOf(0) + 2))) } at += n + 12 }
    expect(profile).toEqual(defaultProfile('display-p3').bytes)
    expect(encoded).toBeDefined()
  })
  it('keeps white-fringe correction equivalent to the shared mask helper', async () => {
    const h = harness()
    const rgba = new Uint8ClampedArray([255, 255, 255, 128, 20, 40, 60, 255])
    h.context.getImageData = vi.fn(() => ({ data: rgba }) as unknown as ImageData)
    const expected = decontaminateFringe(new Uint8ClampedArray(rgba), new Uint8Array([128, 255]), 2, 1, 100, true)
    let actual: Uint8ClampedArray | undefined
    await exportSvgImage('<svg/>', { format: 'png', width: 2, height: 1, postProcess: (pixels) => { actual = decontaminateFringe(pixels, new Uint8Array([128, 255]), 2, 1, 100, true); return actual } }, h.deps)
    expect(Array.from(actual ?? [])).toEqual(Array.from(expected))
  })
  it.each([null, new Blob([], { type: 'image/png' }), new Blob(['wrong'], { type: 'image/jpeg' })])('rejects failed, empty or wrong MIME encodings', async blob => {
    const h = harness(blob)
    await expect(exportSvgImage('<svg/>', { format: 'png', width: 10, height: 10 }, h.deps)).rejects.toThrow(/编码/)
  })
  it('rejects external resources before decoding instead of silently exporting missing pixels', async () => {
    const h = harness()
    await expect(exportSvgImage('<svg><image href="https://example.com/a.png"/></svg>', { format: 'png', width: 10, height: 10 }, h.deps)).rejects.toThrow(/外链/)
    expect(h.decodeSvg).not.toHaveBeenCalled()
  })
  it('requires a real canvas context even with an injected decoder', async () => {
    const h = harness(); vi.spyOn(h.canvas, 'getContext').mockReturnValue(null)
    await expect(exportSvgImage('<svg/>', { format: 'png', width: 10, height: 10 }, h.deps)).rejects.toThrow(/不支持/)
  })
  it('rejects unsafe output before allocating', async () => {
    const createCanvas = vi.fn()
    await expect(exportSvgImage('<svg/>', { format: 'png', width: 16385, height: 10 }, { createCanvas })).rejects.toThrow('输出尺寸')
    expect(createCanvas).not.toHaveBeenCalled()
  })
})
