import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { decodeProject } from '../../../../src/document/projectFormat'

const read = (name: string) => readFileSync(fileURLToPath(new URL(name, import.meta.url)), 'utf8')

describe('independent F03 export inputs', () => {
  for (const name of ['color-blocks.draivio', 'effects.draivio']) {
    it(`decodes ${name} with the real project schema`, () => {
      const { document } = decodeProject(read(name))
      expect([document.documentWidth, document.documentHeight]).toEqual([128, 128])
      expect(document.documentBackground).toBe('transparent')
      expect(document.selection?.kind).toBe('ellipse')
      expect(document.layers.length).toBeGreaterThan(0)
      for (const layer of document.layers) {
        if (layer.source) expect(layer.source.startsWith('data:image/png;base64,')).toBe(true)
      }
    })
  }
})
