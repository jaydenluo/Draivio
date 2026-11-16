import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeProject } from '../../../../src/document/projectFormat'

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

describe('independent F07 alignment fixture inputs', () => {
  for (const name of ['three-layers.draivio', 'negative-gaps.draivio', 'hierarchy-locks.draivio']) {
    it(`decodes ${name} using the real document schema`, () => {
      const { document } = decodeProject(read(name))
      expect([document.documentWidth, document.documentHeight]).toEqual([500, 400])
      expect(document.documentBackground).toBe('transparent')
      expect(document.selectedLayerIds?.length).toBeGreaterThanOrEqual(3)
      expect(document.canvasShapes?.length).toBe(3)
      expect(document.layers.every(layer => layer.visible)).toBe(true)
    })
  }
  it('records negative external gaps, fixed key and hierarchy invariants', () => {
    const manifest = JSON.parse(read('manifest.json'))
    const scenarios = manifest.scenarios
    expect(scenarios['negative-gaps'].distributionSelection.horizontal.gap).toBeLessThan(0)
    expect(scenarios['negative-gaps'].distributionSelection.vertical.gap).toBeLessThan(0)
    for (const delta of Object.values(scenarios['three-layers'].alignmentDeltasPx.key) as { green: { dx: number; dy: number } }[]) {
      expect(delta.green).toEqual({ dx: 0, dy: 0 })
    }
    expect(scenarios['hierarchy-locks'].deduplicatedMovableRoots).toEqual(['rotated-parent', 'free-peer'])
  })
})
