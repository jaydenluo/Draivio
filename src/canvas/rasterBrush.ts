import { brushGradientAxis, type BrushStroke } from './BrushEngine'
import type { PixelImage } from './rasterTools'
import { pressureScale } from './pointerPressure'

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function validate(image: PixelImage) {
  if (!Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1) throw new Error('图像尺寸无效')
  if (image.data.length !== image.width * image.height * 4) throw new Error('图像像素长度与宽高不匹配')
}

function blendPixel(data: Uint8ClampedArray, offset: number, color: [number, number, number], alpha: number, erase: boolean) {
  const amount = clamp(alpha, 0, 1)
  if (!amount) return
  if (erase) {
    data[offset + 3] = Math.round(data[offset + 3] * (1 - amount))
    return
  }
  const destinationAlpha = data[offset + 3] / 255
  const outputAlpha = amount + destinationAlpha * (1 - amount)
  for (let channel = 0; channel < 3; channel++) {
    data[offset + channel] = outputAlpha ? Math.round((color[channel] * amount + data[offset + channel] * destinationAlpha * (1 - amount)) / outputAlpha) : 0
  }
  data[offset + 3] = Math.round(outputAlpha * 255)
}

function hexColor(value: string): [number, number, number] {
  const normalized = value.trim().replace(/^#/, '')
  if (!/^[\da-f]{6}$/i.test(normalized)) throw new Error('笔刷颜色必须是六位十六进制值')
  return [0, 2, 4].map((index) => Number.parseInt(normalized.slice(index, index + 2), 16)) as [number, number, number]
}

export function fillPixels(image: PixelImage, colorValue: string, mask?: Uint8Array): PixelImage {
  validate(image)
  if (mask && mask.length !== image.width * image.height) throw new Error('填充选区与图像尺寸不匹配')
  const color = hexColor(colorValue)
  const data = new Uint8ClampedArray(image.data)
  for (let index = 0; index < image.width * image.height; index++) {
    const amount = (mask?.[index] ?? 255) / 255
    if (!amount) continue
    blendPixel(data, index * 4, color, amount, false)
  }
  return { width: image.width, height: image.height, data }
}

function dab(image: PixelImage, data: Uint8ClampedArray, x: number, y: number, size: number, hardness: number, alpha: number, color: [number, number, number], erase: boolean, mask?: Uint8Array, gradientColor?: (x:number,y:number)=>[number,number,number]) {
  const radius = Math.max(.5, size / 2)
  const left = Math.max(0, Math.floor(x - radius - 1)), right = Math.min(image.width - 1, Math.ceil(x + radius + 1))
  const top = Math.max(0, Math.floor(y - radius - 1)), bottom = Math.min(image.height - 1, Math.ceil(y + radius + 1))
  const edge = clamp(hardness / 100, 0, 1)
  for (let py = top; py <= bottom; py++) for (let px = left; px <= right; px++) {
    const distance = Math.hypot(px + .5 - x, py + .5 - y) / radius
    if (distance >= 1) continue
    const falloff = edge >= 1 ? 1 : distance <= edge ? 1 : 1 - (distance - edge) / Math.max(.0001, 1 - edge)
    blendPixel(data, (py * image.width + px) * 4, gradientColor?.(px + .5, py + .5) ?? color, alpha * falloff * (mask ? mask[py * image.width + px] / 255 : 1), erase)
  }
}

/** Paints a stroke into an RGBA surface. The input image is never mutated. */
export function paintBrushStroke(image: PixelImage, stroke: BrushStroke, mask?: Uint8Array): PixelImage {
  validate(image)
  if (mask && mask.length !== image.width * image.height) throw new Error('笔刷选区与图像尺寸不匹配')
  if (!stroke.points.length) return { width: image.width, height: image.height, data: new Uint8ClampedArray(image.data) }
  if (!Number.isFinite(stroke.size) || stroke.size <= 0) throw new Error('笔刷大小必须大于 0')
  const data = new Uint8ClampedArray(image.data)
  const color = hexColor(stroke.color)
  const axis = brushGradientAxis(stroke, image.width - 1, image.height - 1)
  const endColor = axis ? hexColor(stroke.endColor!) : color
  const gradientColor = axis ? (x:number,y:number):[number,number,number] => {
    const dx=axis.to.x-axis.from.x,dy=axis.to.y-axis.from.y
    const t=clamp(((x-axis.from.x)*dx+(y-axis.from.y)*dy)/(dx*dx+dy*dy),0,1)
    return color.map((channel,i)=>Math.round(channel+(endColor[i]-channel)*t)) as [number,number,number]
  } : undefined
  const baseAlpha = clamp(stroke.opacity / 100, 0, 1) * clamp(stroke.flow / 100, 0, 1)
  const points = stroke.points.map((point) => ({ x: point.x / 100 * (image.width - 1), y: point.y / 100 * (image.height - 1), pressure: point.pressure ?? .5 }))
  const draw = (point: typeof points[number]) => {
    const scale = pressureScale(point.pressure)
    dab(image, data, point.x, point.y, stroke.size * scale, stroke.hardness, baseAlpha * scale, color, stroke.mode === 'erase', mask, gradientColor)
  }
  draw(points[0])
  for (let index = 1; index < points.length; index++) {
    const start = points[index - 1], end = points[index]
    const steps = Math.max(1, Math.ceil(Math.hypot(end.x - start.x, end.y - start.y) / Math.max(1, stroke.size / 4)))
    for (let step = 1; step <= steps; step++) draw({ x: start.x + (end.x - start.x) * step / steps, y: start.y + (end.y - start.y) * step / steps, pressure: start.pressure + (end.pressure - start.pressure) * step / steps })
  }
  return { width: image.width, height: image.height, data }
}
