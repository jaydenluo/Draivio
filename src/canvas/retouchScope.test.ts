import { expect, test } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { retouchScopeSvg } from './retouchScope'
import { serializeSvg } from './rasterTools'
import type { Layer } from '../state/editor'

test('nested SVG sampling preserves ancestor transforms and excludes hidden and locked branches in real RGBA pixels', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 12 8')
  svg.innerHTML = '<g data-layer-id="group" transform="translate(2 1)"><rect width="10" height="7" fill="#ffff00"/><g data-layer-id="selected"><rect width="2" height="2" fill="#ff0000"/></g><g data-layer-id="below" transform="translate(3 0)"><rect width="2" height="2" fill="#0000ff"/></g><g data-layer-id="hidden"><rect width="10" height="7" fill="#00ff00"/></g><g data-layer-id="locked"><rect width="10" height="7" fill="#ff00ff"/></g></g>'
  const layer = (id: string, extra = {}): Layer => ({ id, name: id, visible: true, opacity: 100, blendMode: '正常', className: '', ...extra })
  const layers = [layer('group', { children: ['selected', 'below', 'hidden', 'locked'] }), layer('selected', { groupId: 'group' }), layer('below', { groupId: 'group' }), layer('hidden', { groupId: 'group', visible: false }), layer('locked', { groupId: 'group', locked: true })]
  const rgba = (scope: 'current' | 'below' | 'visible') => new Resvg(serializeSvg(retouchScopeSvg(svg, layers, 'selected', scope)).source, { font: { loadSystemFonts: false } }).render().pixels
  const pixel = (data: Uint8Array, x: number, y: number) => Array.from(data.slice((y * 12 + x) * 4, (y * 12 + x) * 4 + 4))
  const current = rgba('current'), below = rgba('below'), visible = rgba('visible')
  expect(pixel(current, 2, 1)).toEqual([255, 0, 0, 255])
  expect(pixel(current, 5, 1)).toEqual([0, 0, 0, 0])
  expect(pixel(below, 2, 1)).toEqual([255, 0, 0, 255])
  expect(pixel(below, 5, 1)).toEqual([0, 0, 255, 255])
  expect(pixel(below, 9, 5)).toEqual([0, 0, 0, 0])
  expect(pixel(visible, 9, 5)).toEqual([255, 255, 0, 255])
  layers[0].locked = true
  const locked = new Resvg(serializeSvg(retouchScopeSvg(svg, layers, 'selected', 'visible')).source, { font: { loadSystemFonts: false } }).render().pixels
  expect(pixel(locked, 2, 1)).toEqual([0, 0, 0, 0])
})

test('transparent repair deltas preserve untouched translucent pixels and upper-layer pixels in final compositing', async () => {
  const { repairDeltaPixels } = await import('../retouch/cloneHeal')
  const before = { width: 4, height: 1, data: new Uint8ClampedArray([255, 0, 0, 128, 0, 0, 255, 255, 255, 0, 0, 128, 255, 0, 0, 128]) }
  const after = { ...before, data: new Uint8ClampedArray(before.data) }
  after.data.set([0, 255, 0, 255], 4)
  const delta = repairDeltaPixels(before, after)
  expect(Array.from(delta.data)).toEqual([0, 0, 0, 0, 0, 255, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0])
  const rectangles = (pixels: Uint8ClampedArray) => Array.from({ length: 4 }, (_, x) => `<rect x="${x}" width="1" height="1" fill="rgb(${pixels[x * 4]},${pixels[x * 4 + 1]},${pixels[x * 4 + 2]})" opacity="${pixels[x * 4 + 3] / 255}"/>`).join('')
  const render = (repair = '') => new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="4" height="1">${rectangles(before.data)}<rect x="3" width="1" height="1" fill="blue"/>${repair}</svg>`, { font: { loadSystemFonts: false } }).render().pixels
  const baseline = render(), repaired = render(rectangles(delta.data))
  expect(Array.from(repaired.slice(0, 4))).toEqual(Array.from(baseline.slice(0, 4)))
  expect(Array.from(repaired.slice(8))).toEqual(Array.from(baseline.slice(8)))
  expect(Array.from(repaired.slice(4, 8))).toEqual([0, 255, 0, 255])
})

test('copying a smart object retains its embedded document without copying sibling layers', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 4 2')
  svg.innerHTML = '<g data-layer-id="smart"><svg data-smart-source="embedded"><g data-layer-id="nested"><rect data-repair-id="nested" width="2" height="2" fill="red"/></g></svg></g><g data-layer-id="sibling"><svg data-smart-source="other"><g data-layer-id="smart"><rect x="2" width="2" height="2" fill="blue"/></g></svg></g>'
  const layers: Layer[] = ['smart', 'sibling'].map(id => ({id, name:id, className:'', visible:true, opacity:100, blendMode:'正常'}))
  const scoped = retouchScopeSvg(svg, layers, 'smart', 'current', ['smart'], true)
  const pixels = new Resvg(serializeSvg(scoped).source).render().pixels
  expect(Array.from(pixels.slice(0,4))).toEqual([255,0,0,255])
  expect(Array.from(pixels.slice(8,12))).toEqual([0,0,0,0])
})
