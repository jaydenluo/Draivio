import { requestImageData } from '../lib/http'

export type ImageExportFormat = 'png' | 'jpeg' | 'webp'
export type ImageExportOptions = { format: ImageExportFormat; width: number; height: number; background?: string; quality?: number; signal?: AbortSignal }
type Dimensions = { width: number; height: number }
type DecodedSvg = Dimensions & { image: CanvasImageSource; dispose?: () => void }
type ResourceDimensions = Dimensions & { dispose?: () => void }
type ExportDependencies = { decodeImage?: (source: string, signal: AbortSignal) => Promise<ResourceDimensions>; createCanvas?: () => HTMLCanvasElement; decodeSvg?: (source: string, signal: AbortSignal) => Promise<DecodedSvg>; requestImage?: (url: string, options?: {signal?: AbortSignal}) => Promise<string>; timeoutMs?: number }
export const MAX_EXPORT_DIMENSION = 16_384
export const MAX_EXPORT_PIXELS = 32_000_000

export function exportFormatMime(format: ImageExportFormat): string {
  if (!['png', 'jpeg', 'webp'].includes(format)) throw new Error('不支持的导出格式')
  return `image/${format}`
}
export function validateExportDimensions(width: number, height: number) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > MAX_EXPORT_DIMENSION || height > MAX_EXPORT_DIMENSION || width * height > MAX_EXPORT_PIXELS) throw new Error('输出尺寸超出安全范围（单边最大 16384，总像素不超过 32MP）')
}
function checkAbort(signal?: AbortSignal) { if (signal?.aborted) throw new Error('已取消导出') }

/** Bound every async phase, including injected decoders and canvas encoders. */
async function bounded<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal, timeoutMs = 30_000): Promise<T> {
  checkAbort(signal)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  let cancel: () => void = () => {}
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new Error('已取消导出')) }
    signal?.addEventListener('abort', cancel, { once: true })
    timer = setTimeout(() => { controller.abort(); reject(new Error('图像导出超时，请减小尺寸后重试')) }, timeoutMs)
  })
  try { return await Promise.race([work(controller.signal), interrupted]) }
  finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel) }
}

export async function prepareSvgExport(source: string, options: Dimensions & { signal?: AbortSignal; background?: string }, deps: ExportDependencies = {}): Promise<string> {
  validateExportDimensions(options.width, options.height)
  return bounded(async signal => {
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml')
    const svg = parsed.documentElement
    if (parsed.querySelector('parsererror') || svg.localName !== 'svg') throw new Error('画布 SVG 无效')
    svg.setAttribute('width', String(options.width)); svg.setAttribute('height', String(options.height))
    svg.setAttribute('color-interpolation', 'sRGB'); svg.setAttribute('color-interpolation-filters', 'sRGB')
    const cache = new Map<string, Promise<string>>()
    const resources = new Map<string, Promise<void>>()
    for (const image of svg.querySelectorAll('image')) {
      checkAbort(signal)
      const href = image.getAttribute('href') ?? image.getAttributeNS('http://www.w3.org/1999/xlink', 'href')
      if (!href) throw new Error('图片资源为空，无法导出')
      let embedded = href
      if (!/^data:image\/(png|jpeg|webp|gif|avif);base64,[A-Za-z0-9+/=\s]+$/i.test(href)) {
        if (!/^(https?:\/\/|blob:)/i.test(href)) throw new Error('图片地址不受支持，无法导出')
        if (!cache.has(href)) cache.set(href, (deps.requestImage ?? requestImageData)(href, { signal }))
        try { embedded = await cache.get(href)! }
        catch { checkAbort(signal); throw new Error('图片资源无法内嵌，请检查网络、跨域权限或图片是否失效') }
      }
      // SVG Image onload can succeed while silently omitting a damaged child image.
      // Validate the actual bytes independently before whole-scene decoding or SVG download.
      if (!resources.has(embedded)) resources.set(embedded, (async () => {
        let decoded: ResourceDimensions | undefined
        try {
          decoded = await (deps.decodeImage ?? defaultDecodeImage)(embedded, signal)
          checkAbort(signal)
          if (![decoded.width, decoded.height].every(value => Number.isSafeInteger(value) && value > 0)) throw new Error('invalid dimensions')
        } catch { checkAbort(signal); throw new Error('图片资源无法解码，无法导出，请替换损坏或不受支持的图片') }
        finally { decoded?.dispose?.() }
      })())
      await resources.get(embedded)!
      checkAbort(signal)
      image.setAttribute('href', embedded); image.removeAttributeNS('http://www.w3.org/1999/xlink', 'href')
    }
    checkAbort(signal)
    if (options.background && options.background !== 'transparent') {
      if (!/^#[0-9a-f]{6}$/i.test(options.background)) throw new Error('背景颜色无效')
      const rect = parsed.createElementNS('http://www.w3.org/2000/svg','rect')
      const viewBox = svg.getAttribute('viewBox')?.split(/[ ,]+/).map(Number)
      rect.setAttribute('x', String(viewBox?.[0] ?? 0)); rect.setAttribute('y', String(viewBox?.[1] ?? 0))
      rect.setAttribute('width', String(viewBox?.[2] ?? options.width)); rect.setAttribute('height', String(viewBox?.[3] ?? options.height)); rect.setAttribute('fill',options.background)
      svg.insertBefore(rect,svg.firstChild)
    }
    return new XMLSerializer().serializeToString(svg)
  }, options.signal, deps.timeoutMs)
}

function defaultDecodeImage(source: string, signal: AbortSignal): Promise<ResourceDimensions> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const cleanup = () => { image.onload = null; image.onerror = null; signal.removeEventListener('abort', abort); image.src = '' }
    const abort = () => { cleanup(); reject(new Error('已取消导出')) }
    image.onload = () => {
      const result = { width: image.naturalWidth, height: image.naturalHeight }
      cleanup(); resolve(result)
    }
    image.onerror = () => { cleanup(); reject(new Error('图片资源无法解码')) }
    if (signal.aborted) { abort(); return }
    signal.addEventListener('abort', abort, { once: true }); image.src = source
  })
}

function defaultDecodeSvg(source: string, signal: AbortSignal): Promise<DecodedSvg> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    const url = URL.createObjectURL(new Blob([source], {type:'image/svg+xml;charset=utf-8'}))
    const cleanup = () => { URL.revokeObjectURL(url); image.onload=null; image.onerror=null; signal.removeEventListener('abort',abort) }
    const abort = () => { cleanup(); image.src=''; reject(new Error('已取消导出')) }
    image.onload = () => { cleanup(); resolve({image,width:image.naturalWidth,height:image.naturalHeight,dispose:()=>{image.src=''}}) }
    image.onerror = () => {cleanup(); reject(new Error('SVG 无法解码，请检查图片或字体资源'))}
    signal.addEventListener('abort',abort,{once:true}); image.src=url
  })
}

export async function exportSvgImage(source: string, options: ImageExportOptions, deps: ExportDependencies = {}): Promise<Blob> {
  validateExportDimensions(options.width,options.height)
  const mime=exportFormatMime(options.format)
  if (options.quality !== undefined && (!Number.isFinite(options.quality) || options.quality < 1 || options.quality > 100)) throw new Error('导出质量必须为 1–100')
  if (options.background !== undefined && options.background !== 'transparent' && !/^#[0-9a-f]{6}$/i.test(options.background)) throw new Error('背景颜色无效')
  checkAbort(options.signal)
  const canvas=(deps.createCanvas ?? (()=>document.createElement('canvas')))()
  canvas.width=options.width; canvas.height=options.height
  let decoded: DecodedSvg | undefined
  try {
    const context=canvas.getContext('2d', {colorSpace:'srgb'})
    if (!context) throw new Error('当前环境不支持图像导出')
    const prepared=await prepareSvgExport(source,options,deps)
    return await bounded(async signal => {
      const result=await (deps.decodeSvg ?? defaultDecodeSvg)(prepared,signal)
      if (signal.aborted) { result.dispose?.(); checkAbort(signal) }
      decoded=result
      checkAbort(signal)
      if (!decoded.image || ![decoded.width,decoded.height].every(value=>Number.isFinite(value)&&value>0)) throw new Error('无法读取 SVG 图像')
      if (options.format==='jpeg' || (options.background && options.background!=='transparent')) {
        context.fillStyle=options.background && options.background!=='transparent' ? options.background : '#ffffff'
        context.fillRect(0,0,options.width,options.height)
      }
      context.drawImage(decoded.image,0,0,decoded.width,decoded.height,0,0,options.width,options.height)
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>{
        if (!value || !value.size) reject(new Error('图像编码失败：结果为空'))
        else if (value.type!==mime) reject(new Error('当前环境不支持此格式编码，请选择其他格式'))
        else resolve(value)
      },mime,options.format==='png'?undefined:(options.quality??90)/100))
      checkAbort(signal); return blob
    },options.signal,deps.timeoutMs)
  } finally { decoded?.dispose?.(); canvas.width=0; canvas.height=0 }
}
