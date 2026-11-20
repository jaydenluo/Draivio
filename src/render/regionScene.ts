import type { PixelImage } from '../canvas/rasterTools'
import { compositeLayers, type RasterLayerInput } from '../engine/raster/composite'
import type { BlendMode } from './blendModes'

export type Region = { x: number; y: number; width: number; height: number }
export type Affine = [number, number, number, number, number, number]

/** A renderer-neutral scene node. Images are local source pixels; transforms stay in document coordinates. */
export type RegionSceneNode = {
  id: string
  parentId?: string
  kind: 'group' | 'raster' | 'text' | 'vector' | 'shape'
  image?: PixelImage
  opacity?: number
  blendMode?: BlendMode
  mask?: Uint8Array
  transform?: Affine
  clipBaseId?: string
  unsupportedEffect?: boolean
}

export type RegionPlanEntry = RegionSceneNode & { worldTransform: Affine; effectiveOpacity: number; clipIndex?: number }
export type RegionRenderPlan = { bounds: Region; entries: RegionPlanEntry[]; requiresFullSurface: false; maxBytes: number }

const identity: Affine = [1, 0, 0, 1, 0, 0]
function multiply(a: Affine, b: Affine): Affine {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
}
function validBounds(bounds: Region): Region {
  if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 1 || bounds.height < 1 || !Number.isSafeInteger(bounds.width) || !Number.isSafeInteger(bounds.height)) throw new Error('区域尺寸无效')
  return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
}

/** Resolves hierarchy transforms once. Group nodes are structural and never allocate a surface. */
export function createRegionRenderPlan(scene: readonly RegionSceneNode[], boundsInput: Region, options: { maxBytes?: number } = {}): RegionRenderPlan {
  const bounds = validBounds(boundsInput)
  const byId = new Map(scene.map(node => [node.id, node]))
  const cache = new Map<string, { transform: Affine; opacity: number }>()
  const resolve = (node: RegionSceneNode, seen = new Set<string>()): { transform: Affine; opacity: number } => {
    const cached = cache.get(node.id); if (cached) return cached
    if (seen.has(node.id)) throw new Error('场景层级存在循环')
    seen.add(node.id)
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    const parentState = parent ? resolve(parent, seen) : { transform: identity, opacity: 1 }
    const value = { transform: multiply(parentState.transform, node.transform ?? identity), opacity: parentState.opacity * Math.min(1, Math.max(0, node.opacity ?? 1)) }
    cache.set(node.id, value); return value
  }
  const entries: RegionPlanEntry[] = []
  const entryIndex = new Map(scene.filter(node => node.kind !== 'group').map((node, index) => [node.id, index]))
  for (const node of scene) {
    if (node.kind === 'group') continue
    if (node.unsupportedEffect) throw new Error(`图层 ${node.id} 的效果暂不支持区域合成`)
    const state = resolve(node)
    entries.push({ ...node, worldTransform: state.transform, effectiveOpacity: state.opacity, clipIndex: node.clipBaseId ? entryIndex.get(node.clipBaseId) : undefined })
  }
  const maxBytes = options.maxBytes ?? 64 * 1024 * 1024
  if (!Number.isSafeInteger(maxBytes) || maxBytes < bounds.width * bounds.height * 4) throw new Error('区域合成超出内存预算')
  return { bounds, entries, requiresFullSurface: false, maxBytes }
}

export async function renderRegion(plan: RegionRenderPlan, renderLeaf: (node: RegionPlanEntry, bounds: Region) => PixelImage | Promise<PixelImage>, options: { signal?: AbortSignal; background?: PixelImage } = {}): Promise<PixelImage> {
  const abort = () => { if (options.signal?.aborted) throw new DOMException('区域合成已取消', 'AbortError') }
  abort()
  const layers: RasterLayerInput[] = []
  for (const node of plan.entries) {
    abort()
    const image = await renderLeaf(node, plan.bounds)
    if (!image || image.width !== plan.bounds.width || image.height !== plan.bounds.height || image.data.length !== image.width * image.height * 4) throw new Error(`图层 ${node.id} 未返回区域像素`)
    if (node.mask && node.mask.length !== image.width * image.height) throw new Error(`图层 ${node.id} 蒙版尺寸无效`)
    layers.push({ image, opacity: node.effectiveOpacity, blendMode: node.blendMode, mask: node.mask })
  }
  abort()
  return compositeLayers(plan.bounds.width, plan.bounds.height, layers, options.background)
}

export type RegionRasterCapability = 'editable' | 'tile' | 'readonly'
const MAX_DIRECT_PIXELS = 16_777_216
type RasterCapabilityInput = { width: number; height: number; rasterRef?: { assetId: string; revision: number }; nativeTiles?: boolean; displayPreview?: string }
/** Display previews are never accepted as source pixels for unsafe operations. */
export function assertRegionRasterCapability(input: RasterCapabilityInput, operation: 'edit' | 'export' | 'ai'): RegionRasterCapability {
  const pixels = input.width * input.height
  if (!Number.isSafeInteger(pixels) || pixels < 1) throw new Error('栅格尺寸无效')
  const large = pixels > MAX_DIRECT_PIXELS
  if (large && !input.nativeTiles) throw new Error(`大图当前仅可只读预览；${operation} 需要 native tile 消费能力，禁止使用 display preview`)
  if (large) return 'tile'
  return 'editable'
}
