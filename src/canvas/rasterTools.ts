import { createSelection, type Selection, type SelectionPoint } from './selectionGeometry'

/** Structural ImageData makes the image operations pure and usable without a DOM. */
export type PixelImage = { width: number; height: number; data: Uint8ClampedArray }
export type PerspectiveQuad = readonly [SelectionPoint, SelectionPoint, SelectionPoint, SelectionPoint]
const MAX_PIXELS = 16_777_216

function validateDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > MAX_PIXELS) throw new Error('图像尺寸必须是正整数，且不超过 16777216 像素')
}
function validateImage(image: PixelImage) {
  validateDimensions(image.width, image.height)
  if (image.data.length !== image.width * image.height * 4) throw new Error('图像像素长度与宽高不匹配')
}
function validatePoint(point: SelectionPoint) {
  if (![point.x, point.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) throw new Error('坐标必须位于画板的 0–100% 范围内')
}
function pointIndex(image: Pick<PixelImage, 'width' | 'height'>, point: SelectionPoint) {
  validatePoint(point)
  const x = Math.min(image.width - 1, Math.floor(point.x / 100 * image.width))
  const y = Math.min(image.height - 1, Math.floor(point.y / 100 * image.height))
  return y * image.width + x
}

/** Four-connected flood, comparing each RGBA channel with the original seed.
 * Tolerance is an absolute channel difference from 0 through 255.
 */
export function floodPixels(image: PixelImage, point: SelectionPoint, tolerance: number): Uint8Array {
  validateImage(image)
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new Error('颜色容差必须在 0–255 之间')
  const seed = pointIndex(image, point)
  const count = image.width * image.height
  const mask = new Uint8Array(count)
  const visited = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0; let tail = 1
  queue[0] = seed; visited[seed] = 1
  const enqueue = (index: number) => {
    if (!visited[index]) { visited[index] = 1; queue[tail++] = index }
  }
  while (head < tail) {
    const index = queue[head++]
    const offset = index * 4
    const transparent = image.data[offset + 3] === 0 && image.data[seed * 4 + 3] === 0
    if (!transparent && [0, 1, 2, 3].some((channel) => Math.abs(image.data[offset + channel] - image.data[seed * 4 + channel]) > tolerance)) continue
    mask[index] = 1
    const x = index % image.width
    if (x > 0) enqueue(index - 1)
    if (x + 1 < image.width) enqueue(index + 1)
    if (index >= image.width) enqueue(index - image.width)
    if (index + image.width < count) enqueue(index + image.width)
  }
  return mask
}

export function samplePixelColor(image: PixelImage, xPct: number, yPct: number): string {
  validateImage(image)
  const index = pointIndex(image, { x: xPct, y: yPct }) * 4
  return `#${[0, 1, 2].map((channel) => image.data[index + channel].toString(16).padStart(2, '0')).join('')}`
}

export function maskToSelection(mask: Uint8Array, width: number, height: number): Selection {
  validateDimensions(width, height)
  if (mask.length !== width * height) throw new Error('选区位图长度与宽高不匹配')
  const rows: string[] = []; const commands: string[] = []
  let minX = width; let maxX = 0; let minY = height; let maxY = 0
  for (let y = 0; y < height; y++) {
    let row = ''; let run = -1
    for (let x = 0; x <= width; x++) {
      const selected = x < width && mask[y * width + x] !== 0
      if (x < width) row += selected ? '1' : '0'
      if (selected) {
        if (run < 0) run = x
        minX = Math.min(minX, x); maxX = Math.max(maxX, x + 1); minY = Math.min(minY, y); maxY = Math.max(maxY, y + 1)
      } else if (run >= 0) {
        commands.push(`M${run / width * 100},${y / height * 100}h${(x - run) / width * 100}v${100 / height}h${-(x - run) / width * 100}Z`)
        run = -1
      }
    }
    rows.push(row)
  }
  const rect = maxX ? { x: minX / width * 100, y: minY / height * 100, width: (maxX - minX) / width * 100, height: (maxY - minY) / height * 100 } : { x: 0, y: 0, width: 0, height: 0 }
  return { ...createSelection('rectangle', rect), path: { type: 'raster', rows, d: commands.join('') } }
}

export function eraseFloodPixels(image: PixelImage, point: SelectionPoint, tolerance: number): PixelImage {
  const mask = floodPixels(image, point, tolerance)
  const data = new Uint8ClampedArray(image.data)
  for (let index = 0; index < mask.length; index++) if (mask[index]) data[index * 4 + 3] = 0
  return { width: image.width, height: image.height, data }
}

export function serializeSvg(svg: SVGElement): { source: string; width: number; height: number } {
  if (svg.localName !== 'svg') throw new Error('需要完整的 SVG 画布元素')
  const viewBox = svg.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  const rect = svg.getBoundingClientRect()
  const numericLength = (name: string) => {
    const value = svg.getAttribute(name) ?? ''
    return /^\d+(?:\.\d+)?(?:px)?$/.test(value) ? parseFloat(value) : 0
  }
  const width = Math.round(viewBox?.length === 4 && viewBox[2] > 0 ? viewBox[2] : numericLength('width') || rect.width)
  const height = Math.round(viewBox?.length === 4 && viewBox[3] > 0 ? viewBox[3] : numericLength('height') || rect.height)
  validateDimensions(width, height)
  const clone = svg.cloneNode(true) as SVGElement
  clone.setAttributeNS('http://www.w3.org/2000/xmlns/', 'xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height))
  return { source: new XMLSerializer().serializeToString(clone), width, height }
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('当前环境无法创建 2D 画布')
  return context
}

export async function rasterizeSvg(svg: SVGElement): Promise<HTMLCanvasElement> {
  const { source, width, height } = serializeSvg(svg)
  const canvas = document.createElement('canvas')
  canvas.width = width; canvas.height = height
  const context = context2d(canvas)
  const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { image.onload = null; image.onerror = null; reject(new Error('SVG 图像解码超时')) }, 15000)
      image.onload = () => { clearTimeout(timer); resolve() }
      image.onerror = () => { clearTimeout(timer); reject(new Error('SVG 图像无法解码')) }
      image.src = url
    })
    context.drawImage(image, 0, 0, width, height)
    return canvas
  } finally { URL.revokeObjectURL(url) }
}

export function readCanvasPixels(canvas: HTMLCanvasElement): ImageData {
  try { return context2d(canvas).getImageData(0, 0, canvas.width, canvas.height) }
  catch (cause) { throw new Error('无法读取画布像素；图像可能含有不允许读取的跨域内容', { cause }) }
}

export async function rasterizeSvgPixels(svg: SVGElement): Promise<PixelImage> {
  const canvas = await rasterizeSvg(svg)
  const pixels = readCanvasPixels(canvas)
  return { width: pixels.width, height: pixels.height, data: new Uint8ClampedArray(pixels.data) }
}

export function encodePng(canvas: HTMLCanvasElement, image: PixelImage): string {
  const context = context2d(canvas)
  const output = context.createImageData(image.width, image.height)
  output.data.set(image.data)
  context.putImageData(output, 0, 0)
  const url = canvas.toDataURL('image/png')
  if (!url.startsWith('data:image/png')) throw new Error('无法将处理结果编码为 PNG 图像')
  return url
}

export function imageToPng(image: PixelImage): string {
  validateImage(image)
  const canvas = document.createElement('canvas')
  canvas.width = image.width; canvas.height = image.height
  return encodePng(canvas, image)
}

export async function sampleCanvasColor(svg: SVGElement, xPct: number, yPct: number): Promise<string> {
  validatePoint({ x: xPct, y: yPct })
  return samplePixelColor(readCanvasPixels(await rasterizeSvg(svg)), xPct, yPct)
}

export async function contiguousMagicSelection(svg: SVGElement, point: SelectionPoint, tolerance: number): Promise<Selection> {
  const image = readCanvasPixels(await rasterizeSvg(svg))
  return maskToSelection(floodPixels(image, point, tolerance), image.width, image.height)
}

export async function eraseBackground(svg: SVGElement, point: SelectionPoint, tolerance: number): Promise<string> {
  const canvas = await rasterizeSvg(svg)
  const image = readCanvasPixels(canvas)
  return encodePng(canvas, eraseFloodPixels(image, point, tolerance))
}

/** Projectively maps TL/TR/BR/BL source corners onto a rectangular output.
 * Width and height are the output pixel dimensions; corners are source percentages.
 * Bilinear interpolation uses premultiplied alpha to avoid colored fringes.
 */
export function perspectiveWarp(image: PixelImage, width: number, height: number, quad: PerspectiveQuad): PixelImage {
  validateImage(image); validateDimensions(width, height)
  if (quad.length !== 4) throw new Error('透视裁剪需要四个顶点')
  quad.forEach(validatePoint)
  const signs = quad.map((a, index) => {
    const b = quad[(index + 1) % 4]; const c = quad[(index + 2) % 4]
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
  })
  if (signs.some((value) => Math.abs(value) < 1e-8) || !signs.every((value) => value * signs[0] > 0)) throw new Error('透视裁剪区域必须是非退化的凸四边形，按左上、右上、右下、左下排列')
  const p = quad.map((point) => ({ x: point.x / 100 * (image.width - 1), y: point.y / 100 * (image.height - 1) }))
  // Solve in percentage space so a one-pixel source dimension remains well-defined.
  const [q0, q1, q2, q3] = quad
  const dx1 = q1.x - q2.x; const dx2 = q3.x - q2.x; const dx3 = q0.x - q1.x + q2.x - q3.x
  const dy1 = q1.y - q2.y; const dy2 = q3.y - q2.y; const dy3 = q0.y - q1.y + q2.y - q3.y
  const denominator = dx1 * dy2 - dx2 * dy1
  const g = (dx3 * dy2 - dx2 * dy3) / denominator
  const h = (dx1 * dy3 - dx3 * dy1) / denominator
  const a = p[1].x - p[0].x + g * p[1].x; const b = p[3].x - p[0].x + h * p[3].x
  const d = p[1].y - p[0].y + g * p[1].y; const e = p[3].y - p[0].y + h * p[3].y
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = width === 1 ? .5 : x / (width - 1); const v = height === 1 ? .5 : y / (height - 1)
    const divisor = g * u + h * v + 1
    if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-12) throw new Error('透视变换矩阵无法求值')
    const sx = Math.min(image.width - 1, Math.max(0, (a * u + b * v + p[0].x) / divisor))
    const sy = Math.min(image.height - 1, Math.max(0, (d * u + e * v + p[0].y) / divisor))
    const x0 = Math.floor(sx); const y0 = Math.floor(sy); const tx = sx - x0; const ty = sy - y0
    const indexes = [y0 * image.width + x0, y0 * image.width + Math.min(image.width - 1, x0 + 1), Math.min(image.height - 1, y0 + 1) * image.width + x0, Math.min(image.height - 1, y0 + 1) * image.width + Math.min(image.width - 1, x0 + 1)]
    const weights = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]
    const alpha = indexes.reduce((sum, index, i) => sum + image.data[index * 4 + 3] * weights[i], 0)
    const output = (y * width + x) * 4
    data[output + 3] = alpha
    for (let channel = 0; channel < 3; channel++) data[output + channel] = alpha ? indexes.reduce((sum, index, i) => sum + image.data[index * 4 + channel] * image.data[index * 4 + 3] * weights[i], 0) / alpha : 0
  }
  return { width, height, data }
}

function brushDabs(image: PixelImage, points: SelectionPoint[], size: number): SelectionPoint[] {
  validateImage(image)
  if (!points.length) throw new Error('笔触至少需要一个坐标点')
  if (!Number.isFinite(size) || size <= 0 || size > 2048) throw new Error('笔刷直径必须大于 0，且不超过 2048 像素')
  points.forEach(validatePoint)
  const pixelPoints = points.map((point) => ({ x: point.x / 100 * (image.width - 1), y: point.y / 100 * (image.height - 1) }))
  const dabs: SelectionPoint[] = []
  const append = (x: number, y: number) => {
    x = Math.round(x); y = Math.round(y)
    if (dabs.at(-1)?.x !== x || dabs.at(-1)?.y !== y) dabs.push({ x, y })
  }
  append(pixelPoints[0].x, pixelPoints[0].y)
  for (let index = 1; index < pixelPoints.length; index++) {
    const start = pixelPoints[index - 1]; const end = pixelPoints[index]
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / Math.max(.5, size / 4)))
    for (let step = 1; step <= steps; step++) append(start.x + (end.x - start.x) * step / steps, start.y + (end.y - start.y) * step / steps)
  }
  return dabs
}

function brushOffsets(size: number): SelectionPoint[] {
  const radius = size / 2
  const offsets: SelectionPoint[] = []
  for (let y = -Math.floor(radius); y <= radius; y++) for (let x = -Math.floor(radius); x <= radius; x++) if (x * x + y * y <= radius * radius) offsets.push({ x, y })
  return offsets
}
function pixelOffset(image: PixelImage, x: number, y: number): number {
  return x >= 0 && y >= 0 && x < image.width && y < image.height ? (y * image.width + x) * 4 : -1
}

/** Carries a circular patch along the interpolated stroke; strength is 0–100%. */
export function smudgePixels(image: PixelImage, points: SelectionPoint[], size: number, strength: number): PixelImage {
  const dabs = brushDabs(image, points, size)
  if (!Number.isFinite(strength) || strength < 0 || strength > 100) throw new Error('涂抹强度必须在 0–100% 之间')
  const data = new Uint8ClampedArray(image.data)
  const output = { width: image.width, height: image.height, data }
  if (!strength) return output
  const offsets = brushOffsets(size)
  const carry = new Uint8ClampedArray(offsets.length * 4)
  offsets.forEach((offset, index) => {
    const source = pixelOffset(image, dabs[0].x + offset.x, dabs[0].y + offset.y)
    if (source >= 0) carry.set(image.data.subarray(source, source + 4), index * 4)
  })
  const blend = strength / 100
  for (const dab of dabs.slice(1)) {
    offsets.forEach((offset, index) => {
      const target = pixelOffset(image, dab.x + offset.x, dab.y + offset.y)
      if (target < 0) return
      const from = index * 4
      const carriedAlpha = carry[from + 3] * blend
      const targetAlpha = data[target + 3] * (1 - blend)
      const alpha = carriedAlpha + targetAlpha
      for (let channel = 0; channel < 3; channel++) data[target + channel] = alpha ? (carry[from + channel] * carriedAlpha + data[target + channel] * targetAlpha) / alpha : 0
      data[target + 3] = alpha
      carry.set(data.subarray(target, target + 4), from)
    })
  }
  return output
}

/** Samples only the original image, maintaining the initial source offset at every dab. */
export function clonePixels(image: PixelImage, points: SelectionPoint[], source: SelectionPoint, size: number): PixelImage {
  const dabs = brushDabs(image, points, size)
  validatePoint(source)
  const sourceX = Math.round(source.x / 100 * (image.width - 1)); const sourceY = Math.round(source.y / 100 * (image.height - 1))
  const dx = sourceX - dabs[0].x; const dy = sourceY - dabs[0].y
  const offsets = brushOffsets(size)
  const data = new Uint8ClampedArray(image.data)
  for (const dab of dabs) for (const offset of offsets) {
    const x = dab.x + offset.x; const y = dab.y + offset.y
    const target = pixelOffset(image, x, y)
    const from = pixelOffset(image, x + dx, y + dy)
    if (target >= 0 && from >= 0) data.set(image.data.subarray(from, from + 4), target)
  }
  return { width: image.width, height: image.height, data }
}

export async function smudgeImage(svg: SVGElement, points: SelectionPoint[], size: number, strength: number): Promise<string> {
  const canvas = await rasterizeSvg(svg)
  return encodePng(canvas, smudgePixels(readCanvasPixels(canvas), points, size, strength))
}

export async function cloneImage(svg: SVGElement, points: SelectionPoint[], source: SelectionPoint, size: number): Promise<string> {
  const canvas = await rasterizeSvg(svg)
  return encodePng(canvas, clonePixels(readCanvasPixels(canvas), points, source, size))
}
