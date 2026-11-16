import { describe, it, expect } from 'vitest'
import { serializeExport } from './serializeExport'
import { createSelection } from '../canvas/selectionGeometry'
function fixture() {
 const doc = new DOMParser().parseFromString('<svg viewBox="0 0 800 600"><rect width="800" height="600" fill="white"/><g class="scene-layer" data-layer-id="parent" opacity=".5"><g><g class="scene-layer" data-layer-id="chosen"><rect fill="red"/></g><g class="scene-layer" data-layer-id="sibling"/></g></g><g class="scene-layer" data-layer-id="other"/></svg>', 'image/svg+xml')
 const svg = doc.documentElement as unknown as SVGSVGElement
 Object.defineProperty(svg, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: 800, height: 600 } } })
 return svg
}
describe('export serialization', () => {
 it('retains ancestor compositing and selected subtree but removes unrelated layers and document background', () => {
  const result = new DOMParser().parseFromString(serializeExport(fixture(), { range: 'layer', selectedLayerId: 'chosen' }), 'image/svg+xml')
  expect(result.querySelector('[data-layer-id="parent"]')?.getAttribute('opacity')).toBe('.5')
  expect(result.querySelector('[data-layer-id="chosen"]')).not.toBeNull()
  expect(result.querySelector('[data-layer-id="sibling"]')).toBeNull()
  expect(result.querySelector('[data-layer-id="other"]')).toBeNull()
  expect(result.documentElement.children[0].localName).toBe('g')
 })
 it('masks an elliptical selection rather than exporting its rectangular bounds', () => {
  const result = serializeExport(fixture(), { range: 'selection', selection: createSelection('ellipse', { x: 25, y: 25, width: 50, height: 50 }) })
  expect(result).toContain('<ellipse')
  expect(result).toContain('mask="url(#export-selection)"')
  expect(result).toContain('viewBox="200 150 400 300"')
 })
})
