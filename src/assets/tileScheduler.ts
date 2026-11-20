import type { TileKey, TileResponse } from './tileTypes'

export type TileViewport = { width: number; height: number; x?: number; y?: number; zoom: number; rotation?: number; dpr?: number }
export type Affine = [number, number, number, number, number, number]
export type TileRequest = { assetId: string; revision: number; documentWidth: number; documentHeight: number; viewport: TileViewport; tileSize?: number; overscan?: number; sourceTransform?: Affine; cacheVersion?: number }
export type ComputedTileRequest = { level: number; tiles: TileKey[]; bounds: { x: number; y: number; width: number; height: number } }

const finite = (n: number, fallback: number) => Number.isFinite(n) ? n : fallback
const singularScale = (m?: Affine) => {
  if (!m) return 1
  const [a,b,c,d] = m
  const s1 = a*a+b*b+c*c+d*d, det = a*d-b*c
  return Math.sqrt(Math.max(0, (s1 + Math.sqrt(Math.max(0, s1*s1 - 4*det*det))) / 2)) || 1
}
const inverse = (m: Affine): Affine => {
  const [a,b,c,d,e,f] = m, det = a*d-b*c
  if (Math.abs(det) < 1e-12) return [1,0,0,1,0,0]
  return [d/det,-b/det,-c/det,a/det,(c*f-d*e)/det,(b*e-a*f)/det]
}
const point = (m: Affine, x: number, y: number) => ({ x: m[0]*x + m[2]*y + m[4], y: m[1]*x + m[3]*y + m[5] })

/** Computes source-space tiles intersecting the rotated viewport plus an overscan ring. */
export function computeTileRequest(input: TileRequest): ComputedTileRequest {
  const tileSize = Math.max(1, Math.floor(input.tileSize ?? 256)), overscan = Math.max(0, Math.floor(input.overscan ?? 1))
  const w = Math.max(1, input.documentWidth), h = Math.max(1, input.documentHeight), v = input.viewport
  const dpr = Math.max(.01, finite(v.dpr ?? 1, 1)), zoom = Math.max(.0001, finite(v.zoom, 1)), rotation = finite(v.rotation ?? 0, 0) * Math.PI / 180
  const scale = zoom * dpr, maxScale = scale * singularScale(input.sourceTransform)
  const level = Math.max(0, Math.floor(Math.log2(1 / maxScale)))
  const center = { x: w / 2 + finite(v.x ?? 0, 0) / scale, y: h / 2 + finite(v.y ?? 0, 0) / scale }
  const cos = Math.cos(-rotation), sin = Math.sin(-rotation)
  const transformInverse = inverse(input.sourceTransform ?? [1,0,0,1,0,0])
  const corners = [[-v.width/2,-v.height/2],[v.width/2,-v.height/2],[v.width/2,v.height/2],[-v.width/2,v.height/2]].map(([sx,sy]) => {
    const rx = (sx*cos - sy*sin) / scale + center.x, ry = (sx*sin + sy*cos) / scale + center.y
    return point(transformInverse, rx, ry)
  })
  let minX = Math.max(0, Math.min(...corners.map(p => p.x))), maxX = Math.min(w, Math.max(...corners.map(p => p.x)))
  let minY = Math.max(0, Math.min(...corners.map(p => p.y))), maxY = Math.min(h, Math.max(...corners.map(p => p.y)))
  if (maxX < minX) [minX,maxX] = [maxX,minX]
  if (maxY < minY) [minY,maxY] = [maxY,minY]
  const factor = 2 ** level, span = tileSize * factor
  const x0 = Math.max(0, Math.floor(minX / span) - overscan), x1 = Math.min(Math.ceil(w / span) - 1, Math.floor(Math.max(minX, maxX - 1e-8) / span) + overscan)
  const y0 = Math.max(0, Math.floor(minY / span) - overscan), y1 = Math.min(Math.ceil(h / span) - 1, Math.floor(Math.max(minY, maxY - 1e-8) / span) + overscan)
  const tiles: TileKey[] = []
  for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++) tiles.push({ assetId: input.assetId, revision: input.revision, cacheVersion: input.cacheVersion ?? 1, level, x, y })
  return { level, tiles, bounds: { x:minX, y:minY, width:Math.max(0,maxX-minX), height:Math.max(0,maxY-minY) } }
}

export type CapabilityMetadata = { width: number; height: number; format: string; editingSupported: boolean }
export function routeImageCapability(meta: CapabilityMetadata, budget: { maxWorkingBytes: number }): 'tile'|'preview'|'readonly'|'unsupported' {
  const pixels = Math.max(0, meta.width) * Math.max(0, meta.height), rgbaBytes = pixels * 4
  if (!Number.isFinite(pixels) || !Number.isFinite(budget.maxWorkingBytes) || budget.maxWorkingBytes < 1) return 'unsupported'
  if (rgbaBytes <= budget.maxWorkingBytes && meta.editingSupported) return 'preview'
  if (meta.editingSupported && ['jpeg','png','tiff'].includes(meta.format) && budget.maxWorkingBytes >= 1024 * 1024) return 'tile'
  if (!meta.editingSupported && budget.maxWorkingBytes >= 1024 * 1024) return 'readonly'
  return 'unsupported'
}

type FetchTile = (key: TileKey, signal: AbortSignal) => Promise<TileResponse | unknown>
export class TileScheduler {
  private generation = 0
  private activeAbort: AbortController | null = null
  private cache = new Map<string, { value: TileResponse; bytes: number; used: number }>()
  private usedBytes = 0
  private clock = 0
  constructor(private readonly options: { maxInFlight?: number; maxBytes?: number } = {}) {}
  request(input: TileRequest, fetchTile: FetchTile): Promise<TileResponse[]> {
    this.activeAbort?.abort(); const abort = new AbortController(); this.activeAbort = abort
    const generation = ++this.generation, computed = computeTileRequest(input), max = Math.max(1, this.options.maxInFlight ?? 4), out: TileResponse[] = []
    const unique = computed.tiles.filter((key, i, all) => all.findIndex(other => this.key(other) === this.key(key)) === i)
    return new Promise(resolve => {
      let cursor = 0, running = 0, done = false
      const finish = () => { if (done || running || cursor < unique.length) return; done = true; abort.signal.removeEventListener('abort', cancelled); resolve(generation === this.generation ? out : []) }
      const cancelled = () => { if (done) return; done = true; resolve([]) }
      abort.signal.addEventListener('abort', cancelled, { once: true })
      const pump = () => {
        if (done) return
        if (abort.signal.aborted || generation !== this.generation) { done = true; resolve([]); return }
        while (running < max && cursor < unique.length) {
          const key = unique[cursor++], cached = this.get(key)
          if (cached) { out.push(cached); continue }
          running++
          fetchTile(key, abort.signal).then(value => { if (generation !== this.generation || abort.signal.aborted) return; if (value && typeof value === 'object') { const tile = value as TileResponse; out.push(tile); this.put(key,tile) } }).catch(() => {}).finally(() => { running--; pump() })
        }
        finish()
      }
      pump()
    })
  }
  dispose() { this.activeAbort?.abort(); this.activeAbort = null; this.cache.clear(); this.usedBytes = 0; this.generation++ }
  private key(k: TileKey) { return `${k.assetId}:${k.revision}:${k.cacheVersion}:${k.level}:${k.x}:${k.y}` }
  private get(k: TileKey) { const item = this.cache.get(this.key(k)); if (!item) return; item.used = ++this.clock; return item.value }
  private put(k: TileKey, value: TileResponse) { const bytes = Array.isArray(value.bytes) ? value.bytes.length : 0, max = this.options.maxBytes ?? 64 * 1024 * 1024; if (bytes > max) return; const key=this.key(k), old=this.cache.get(key); if(old)this.usedBytes-=old.bytes; this.cache.set(key,{value,bytes,used:++this.clock}); this.usedBytes+=bytes; while(this.usedBytes>max){const victim=[...this.cache.entries()].sort((a,b)=>a[1].used-b[1].used)[0];if(!victim)break;this.cache.delete(victim[0]);this.usedBytes-=victim[1].bytes} }
}
