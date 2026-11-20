import { materializeSmartFilters } from './materializeSmartFilters'
import { transformProfileRgba, defaultProfile, type IccProfile } from '../color/iccPipeline'
import { embedProfile } from '../color/iccEmbedding'
import { applyLayerAdjustments } from '../imaging/layerAdjustments'
import { defaultHsl, defaultColorBalance } from '../adjustments/hsl'
import type { LayerAdjustments } from '../state/editor'
import { invertMatrix, type AffineMatrix } from '../canvas/layerCoordinates'
export type ImageExportFormat = 'png' | 'jpeg' | 'webp'
export type ImageExportOptions = { renderingIntent?: import('../color/iccPipeline').RenderingIntent; profile?: IccProfile; format: ImageExportFormat; width: number; height: number; background?: string; quality?: number; postProcess?: (rgba: Uint8ClampedArray, width: number, height: number) => Uint8ClampedArray }
export type DecodedSvg = { image: CanvasImageSource; width: number; height: number }
export type ExportDependencies = { signal?: AbortSignal; createCanvas?: () => HTMLCanvasElement; decodeSvg?: (source: string) => Promise<DecodedSvg> }
const MAX_DIMENSION = 16_384
const MAX_PIXELS = 32_000_000
const nativeImageUrl = /^(?:draivio-image:\/\/localhost|https?:\/\/draivio-image\.localhost)\/[a-f0-9]{48}\/[a-f0-9]{48}\?revision=[1-9]\d*$/
const embeddedImage = /^data:image\/(png|jpeg|webp|gif);base64,/i
export function exportFormatMime(format: ImageExportFormat): string {
  if (!['png', 'jpeg', 'webp'].includes(format)) throw new Error('不支持的导出格式')
  return `image/${format}`
}
export function validateDimensions(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) throw new Error(`输出尺寸超出安全范围（最大 ${MAX_DIMENSION} × ${MAX_DIMENSION}，总像素不超过 32MP）`)
}
/** SVG image decoding cannot reliably load nested external resources. Reject them explicitly. */
export function validateExportResources(source: string) {
  if (!source.trim()) throw new Error('没有可导出的画布')
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'svg') throw new Error('SVG 内容无效')
  if (doc.querySelector('script, foreignObject, style')) throw new Error('导出包含不支持的外部样式或嵌入内容')
  for (const element of doc.querySelectorAll('*')) for (const attribute of element.attributes) {
    const value = attribute.value.trim()
    if (/^(href|xlink:href)$/i.test(attribute.name) && value && !value.startsWith('#') && !embeddedImage.test(value) &&
        !(element.localName === 'image' && nativeImageUrl.test(value))) throw new Error('画布包含外链图片或未内联资源，请先导入本地图片后重试')
    for (const match of value.matchAll(/url\(\s*['"]?([^)'"\s]+)['"]?\s*\)/gi)) if (!match[1].startsWith('#')) throw new Error('画布包含外链资源，请先内联后重试')
  }
}

export function hasNonSeparableAdjustments(settings: LayerAdjustments): boolean {
  return !!(settings.hsl && JSON.stringify(settings.hsl) !== JSON.stringify(defaultHsl()) ||
    settings.colorBalance && JSON.stringify(settings.colorBalance) !== JSON.stringify(defaultColorBalance()))
}

async function embedNativeImages(source: string, signal?: AbortSignal): Promise<string> {
  if (!source.includes('draivio-image')) return source
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const root = doc.documentElement
  const resources = new Map<string, string>()
  for (const image of root.querySelectorAll('image')) {
    const attribute = image.getAttributeNode('href') ?? image.getAttributeNode('xlink:href')
    const url = attribute?.value
    if (!attribute || !url || !nativeImageUrl.test(url)) continue
    let data = resources.get(url)
    if (!data) {
      signal?.throwIfAborted()
      const response = await fetch(url, { signal })
      if (!response.ok) throw new Error('无法读取本地图片预览')
      const imageBlob = await response.blob()
      data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(new Error('无法内联本地图片预览'))
        reader.readAsDataURL(imageBlob)
      })
      signal?.throwIfAborted()
      if (!imageBlob.size || !embeddedImage.test(data)) throw new Error('本地图片预览格式无效')
      resources.set(url, data)
    }
    attribute.value = data
  }
  return new XMLSerializer().serializeToString(root)
}
function defaultDecodeSvg(source: string): Promise<DecodedSvg> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }))
    image.onload = () => { URL.revokeObjectURL(url); resolve({ image, width: image.naturalWidth, height: image.naturalHeight }) }
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG 无法解码，请检查图片或资源')) }
    image.src = url
  })
}
/** Bake non-separable adjustments per layer, before opacity, masks on ancestors and blending.
 * The same helper is used for SVG downloads and bitmap export. */
export async function materializeColorAdjustments(source: string, deps: ExportDependencies = {}): Promise<string> {
  source = await embedNativeImages(source, deps.signal)
  source = await materializeSmartFilters(source, {decodeSvg:deps.decodeSvg??defaultDecodeSvg,createCanvas:deps.createCanvas??(()=>document.createElement('canvas'))},{signal:deps.signal})
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml'), root = doc.documentElement
  const view = (root.getAttribute('viewBox') ?? '').split(/[ ,]+/).map(Number)
  const viewportWidth = view[2] || Number(root.getAttribute('width')), viewportHeight = view[3] || Number(root.getAttribute('height'))
  const layers = [...root.querySelectorAll('[filter]')].reverse()
  for (const layer of layers) {
    const id = /^url\(#(.+)\)$/.exec(layer.getAttribute('filter') ?? '')?.[1]
    const filter = [...root.querySelectorAll('filter')].find(item => item.id === id)
    if (!filter?.hasAttribute('data-adjustments')) continue
    const settings = JSON.parse(filter.getAttribute('data-adjustments')!) as LayerAdjustments
    if (!hasNonSeparableAdjustments(settings)) continue
    const multiply = (a: AffineMatrix, b: AffineMatrix): AffineMatrix => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]]
    const parse = (text: string): AffineMatrix => {
      let matrix: AffineMatrix = [1,0,0,1,0,0]
      for (const match of text.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
        const n = match[2].trim().split(/[ ,]+/).map(Number), rad = n[0]*Math.PI/180
        let next: AffineMatrix = [1,0,0,1,0,0]
        if (match[1] === 'matrix') next = n as AffineMatrix
        if (match[1] === 'translate') next = [1,0,0,1,n[0],n[1]??0]
        if (match[1] === 'scale') next = [n[0],0,0,n[1]??n[0],0,0]
        if (match[1] === 'rotate') { next = [Math.cos(rad),Math.sin(rad),-Math.sin(rad),Math.cos(rad),0,0]; if(n.length===3) next=multiply(multiply([1,0,0,1,n[1],n[2]],next),[1,0,0,1,-n[1],-n[2]]) }
        if (match[1] === 'skewX') next = [1,0,Math.tan(rad),1,0,0]
        if (match[1] === 'skewY') next = [1,Math.tan(rad),0,1,0,0]
        matrix = multiply(matrix,next)
      }
      return matrix
    }
    const chain: Element[] = []; let ancestor: Element | null = layer
    while (ancestor && ancestor !== root) { chain.unshift(ancestor); ancestor=ancestor.parentElement }
    const inverse = invertMatrix(chain.reduce((matrix,node)=>multiply(matrix,parse(node.getAttribute('transform')??'')),[1,0,0,1,0,0] as AffineMatrix))
    const corners = [[view[0]||0,view[1]||0],[(view[0]||0)+viewportWidth,view[1]||0],[view[0]||0,(view[1]||0)+viewportHeight],[(view[0]||0)+viewportWidth,(view[1]||0)+viewportHeight]].map(([x,y])=>[inverse[0]*x+inverse[2]*y+inverse[4],inverse[1]*x+inverse[3]*y+inverse[5]])
    const support = Math.max(0,...chain.map(node=>Number(node.getAttribute('data-effect-padding'))||0))
    const padding = Math.ceil(support * Math.max(Math.hypot(inverse[0],inverse[2]),Math.hypot(inverse[1],inverse[3])))
    const x = Math.floor(Math.min(...corners.map(p=>p[0])))-padding, y = Math.floor(Math.min(...corners.map(p=>p[1])))-padding
    const width = Math.ceil(Math.max(...corners.map(p=>p[0])))+padding-x, height = Math.ceil(Math.max(...corners.map(p=>p[1])))+padding-y
    validateDimensions(width, height)
    const isolated = root.cloneNode(false) as Element
    isolated.setAttribute('viewBox',`${x} ${y} ${width} ${height}`)
    isolated.setAttribute('width', String(width)); isolated.setAttribute('height', String(height))
    // Preserve shared clipping/mask definitions, but never include sibling artwork.
    for (const defs of root.querySelectorAll('defs')) isolated.append(defs.cloneNode(true))
    const artwork = layer.cloneNode(true) as Element
    artwork.removeAttribute('filter'); artwork.removeAttribute('opacity'); artwork.removeAttribute('style')
    artwork.removeAttribute('transform'); artwork.removeAttribute('mask'); artwork.removeAttribute('clip-path')
    isolated.append(artwork)
    const decoded = await (deps.decodeSvg ?? defaultDecodeSvg)(new XMLSerializer().serializeToString(isolated))
    const canvas = (deps.createCanvas ?? (() => document.createElement('canvas')))()
    canvas.width = width; canvas.height = height
    const context = canvas.getContext('2d'); if (!context) throw new Error('当前环境不支持调整导出')
    context.drawImage(decoded.image, 0, 0, width, height)
    const pixels = context.getImageData(0, 0, width, height)
    pixels.data.set(applyLayerAdjustments(pixels.data, width, height, settings)); context.putImageData(pixels, 0, 0)
    const image = doc.createElementNS('http://www.w3.org/2000/svg', 'image')
    image.setAttribute('href', canvas.toDataURL('image/png')); image.setAttribute('x', String(x)); image.setAttribute('y', String(y)); image.setAttribute('width', String(width)); image.setAttribute('height', String(height))
    layer.replaceChildren(image); layer.removeAttribute('filter')
  }
  return new XMLSerializer().serializeToString(root)
}
export async function exportSvgImage(source: string, options: ImageExportOptions, deps: ExportDependencies = {}): Promise<Blob> {
  validateDimensions(options.width, options.height)
  validateExportResources(source)
  source = await materializeColorAdjustments(source, deps)
  const mime = exportFormatMime(options.format)
  const canvas = (deps.createCanvas ?? (() => document.createElement('canvas')))()
  canvas.width = options.width; canvas.height = options.height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('当前环境不支持图像导出')
  const decoded = await (deps.decodeSvg ?? defaultDecodeSvg)(source)
  if (![decoded.width, decoded.height].every(value => Number.isFinite(value) && value > 0) || !decoded.image) throw new Error('无法读取 SVG 尺寸')
  if (options.format === 'jpeg' || (options.background && options.background !== 'transparent')) {
    context.fillStyle = options.background && options.background !== 'transparent' ? options.background : '#ffffff'
    context.fillRect(0, 0, options.width, options.height)
  }
  context.drawImage(decoded.image, 0, 0, decoded.width, decoded.height, 0, 0, options.width, options.height)
  if (options.postProcess || options.profile) {
    const pixels = context.getImageData(0, 0, options.width, options.height)
    let processed = options.postProcess ? options.postProcess(new Uint8ClampedArray(pixels.data), options.width, options.height) : new Uint8ClampedArray(pixels.data)
    if (options.profile) processed = await transformProfileRgba(processed, options.width, options.height, defaultProfile(), options.profile, options.renderingIntent)
    if (processed.length !== pixels.data.length) throw new Error('像素后处理返回尺寸不匹配')
    pixels.data.set(processed); context.putImageData(pixels, 0, 0)
  }
  const blob = await new Promise<Blob>((resolve, reject) => {
    const quality = options.format === 'png' ? undefined : Math.max(0, Math.min(1, (options.quality ?? 90) / 100))
    canvas.toBlob(blob => {
      if (!blob || !blob.size || blob.type !== mime) reject(new Error('图像编码失败或浏览器不支持所选格式，请重试其他格式'))
      else resolve(blob)
    }, mime, quality)
  })
  if (!options.profile) return blob
  const bytes = await embedProfile(new Uint8Array(await blob.arrayBuffer()), options.profile, options.format)
  return new Blob([new Uint8Array(bytes)], { type: mime })
}
