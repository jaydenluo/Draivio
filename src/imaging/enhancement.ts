import type { PixelImage } from '../canvas/rasterTools'

function validate(image: PixelImage, factor = 1) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1 || image.data.length !== image.width * image.height * 4) throw new Error('图像像素数据无效')
  if (!Number.isInteger(factor) || factor < 1 || factor > 4) throw new Error('放大倍数必须是 1–4')
}

export function removeBackground(image: PixelImage, tolerance = 24): PixelImage {
  validate(image)
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 255) throw new Error('扣图容差必须在 0–255 之间')
  const mask = new Uint8Array(image.width * image.height)
  const seen = new Uint8Array(mask.length)
  const queue: number[] = []
  for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) if (x === 0 || y === 0 || x === image.width - 1 || y === image.height - 1) { const index = y * image.width + x; if (!seen[index]) { seen[index] = 1; queue.push(index) } }
  const seed = queue.length ? queue[0] * 4 : 0
  while (queue.length) {
    const index = queue.shift()!
    const offset = index * 4
    if ([0, 1, 2].some((channel) => Math.abs(image.data[offset + channel] - image.data[seed + channel]) > tolerance) || image.data[offset + 3] === 0) continue
    mask[index] = 1
    const x = index % image.width; const y = Math.floor(index / image.width)
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) if (nx >= 0 && ny >= 0 && nx < image.width && ny < image.height) { const next = ny * image.width + nx; if (!seen[next]) { seen[next] = 1; queue.push(next) } }
  }
  const data = new Uint8ClampedArray(image.data)
  for (let index = 0; index < mask.length; index++) if (mask[index]) data[index * 4 + 3] = 0
  return { ...image, data }
}

export function upscalePixels(image: PixelImage, factor: 2 | 4): PixelImage {
  validate(image, factor)
  const width = image.width * factor; const height = image.height * factor; const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const source = (Math.floor(y / factor) * image.width + Math.floor(x / factor)) * 4; const target = (y * width + x) * 4; data.set(image.data.slice(source, source + 4), target) }
  return { width, height, data }
}
