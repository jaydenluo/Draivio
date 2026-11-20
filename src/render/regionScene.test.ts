import { describe, expect, it } from 'vitest'
import { createRegionRenderPlan, renderRegion, assertRegionRasterCapability, type RegionSceneNode } from './regionScene'

const pixel = (r:number,g:number,b:number,a=255) => ({ width: 2, height: 2, data: new Uint8ClampedArray([r,g,b,a,r,g,b,a,r,g,b,a,r,g,b,a]) })

describe('region scene compositor', () => {
  it('keeps scene order, parent transform and masks while restricting output to the requested region', async () => {
    const scene: RegionSceneNode[] = [
      { id: 'group', kind: 'group', opacity: .5, transform: [1, 0, 0, 1, 3, 4] },
      { id: 'base', parentId: 'group', kind: 'raster', image: pixel(255, 0, 0), opacity: 1 },
      { id: 'top', parentId: 'group', kind: 'raster', image: pixel(0, 255, 0), opacity: .5, blendMode: 'screen', mask: new Uint8Array([255, 0, 255, 0]) },
    ]
    const plan = createRegionRenderPlan(scene, { x: 1, y: 2, width: 2, height: 2 })
    expect(plan.bounds).toEqual({ x: 1, y: 2, width: 2, height: 2 })
    expect(plan.entries.map(entry => entry.id)).toEqual(['base', 'top'])
    expect(plan.entries[0].worldTransform).toEqual([1, 0, 0, 1, 3, 4])
    const output = await renderRegion(plan, node => node.image!)
    expect(output.width).toBe(2)
    expect(output.height).toBe(2)
    expect(output.data.length).toBe(16)
  })

  it('rejects editing, export and AI operations when a large raster has no native tile consumer', () => {
    const raster = { rasterRef: { assetId: 'large', revision: 1 }, width: 12000, height: 9000, nativeTiles: false, displayPreview: 'blob:preview' }
    for (const operation of ['edit', 'export', 'ai'] as const) {
      expect(() => assertRegionRasterCapability(raster, operation)).toThrow(/只读|tile/i)
    }
    expect(assertRegionRasterCapability({ ...raster, nativeTiles: true }, 'edit')).toBe('tile')
    expect(assertRegionRasterCapability({ width: 64, height: 64, rasterRef: { assetId: 'small', revision: 1 }, nativeTiles: false }, 'edit')).toBe('editable')
    expect(() => assertRegionRasterCapability({ width: 12000, height: 9000 }, 'export')).toThrow(/native tile/)
  })

  it('resolves clipping against a later non-group layer', () => {
    const plan = createRegionRenderPlan([
      { id: 'paint', kind: 'raster', clipBaseId: 'base' },
      { id: 'group', kind: 'group' },
      { id: 'base', kind: 'raster', parentId: 'group' },
    ], { x: 0, y: 0, width: 2, height: 2 })
    expect(plan.entries[0].clipIndex).toBe(1)
  })
})
