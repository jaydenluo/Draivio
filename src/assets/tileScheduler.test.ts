import { describe, expect, it, vi } from 'vitest'
import { TileScheduler, computeTileRequest, routeImageCapability, type TileViewport } from './tileScheduler'

const viewport: TileViewport = { width: 801, height: 603, x: 0, y: 0, zoom: 0.25, rotation: 0, dpr: 2 }

describe('tile viewport scheduling', () => {
  it('covers an odd sized viewport with an overscan ring and level from device scale', () => {
    const request = computeTileRequest({ assetId: 'a', revision: 1, documentWidth: 5000, documentHeight: 3000, viewport, tileSize: 256, overscan: 1 })
    expect(request.level).toBe(1)
    expect(request.tiles.length).toBeGreaterThan(0)
    expect(request.tiles.some(tile => tile.x < 1 || tile.y < 1)).toBe(true)
  })

  it('accounts for rotation and non uniform transform in visible source bounds', () => {
    const request = computeTileRequest({ assetId: 'a', revision: 2, documentWidth: 1000, documentHeight: 1000, viewport: { ...viewport, width: 300, height: 200, zoom: 1, rotation: 45 }, sourceTransform: [2, 0, 0, 0.5, 0, 0], tileSize: 256, overscan: 0 })
    expect(request.tiles.length).toBeGreaterThan(1)
  })

  it('cancels obsolete generation and does not publish late tiles', async () => {
    const pending: Array<{ resolve: (value: unknown) => void; signal?: AbortSignal }> = []
    const scheduler = new TileScheduler({ maxInFlight: 2 })
    const fetchTile = vi.fn((_key: unknown, signal: AbortSignal) => new Promise(resolve => pending.push({ resolve, signal })))
    const first = scheduler.request({ assetId: 'a', revision: 1, documentWidth: 1000, documentHeight: 1000, viewport: { ...viewport, zoom: 1 }, tileSize: 2000, overscan: 0 }, fetchTile)
    const second = scheduler.request({ assetId: 'a', revision: 1, documentWidth: 1000, documentHeight: 1000, viewport: { ...viewport, zoom: 2 }, tileSize: 2000, overscan: 0 }, fetchTile)
    expect(pending[0].signal?.aborted).toBe(true)
    pending.forEach(item => item.resolve({ key: 'late' }))
    await expect(first).resolves.toEqual([])
    await expect(second).resolves.toHaveLength(1)
  })

  it('routes unsupported format or budget without allocating a full image', () => {
    expect(routeImageCapability({ width: 100000, height: 2000, format: 'tiff', editingSupported: true }, { maxWorkingBytes: 64 * 1024 * 1024 })).toBe('tile')
    expect(routeImageCapability({ width: 100000, height: 2000, format: 'png', editingSupported: false }, { maxWorkingBytes: 64 * 1024 * 1024 })).toBe('readonly')
    expect(routeImageCapability({ width: 100000, height: 2000, format: 'png', editingSupported: true }, { maxWorkingBytes: 1 })).toBe('unsupported')
  })
})
