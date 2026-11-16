import { expect, test } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { retouchScopeSvg, retouchParentId } from './retouchScope'
import { serializeSvg } from './rasterTools'
import { CanvasScene } from './CanvasScene'
import { editorReducer, initialEditorState, type EditorState } from '../state/editor'
import { encodeProject, decodeProject } from '../document/projectFormat'

const options = { font: { loadSystemFonts: false } }
const pixels = (state: EditorState) => {
  const host = document.createElement('div'); host.innerHTML = renderToStaticMarkup(<CanvasScene state={state} />)
  return new Resvg(host.querySelector('svg')!.outerHTML, options).render().pixels
}
const pixel = (data: Uint8Array, x: number, y: number) => Array.from(data.slice((y * 120 + x) * 4, (y * 120 + x) * 4 + 4))

test('coverage replacement preserves repaired alpha, unmodified upper content, hiding, undo and project reopening', async () => {
  const initial: EditorState = { ...structuredClone(initialEditorState), documentWidth: 120, documentHeight: 80, selectedLayerId: 'base', selectedLayerIds: ['base'], layers: [
    { id: 'upper', name: 'upper', className: '', visible: true, opacity: 100, blendMode: '正常' },
    { id: 'group', name: 'group', className: '', visible: true, opacity: 100, blendMode: '正常', children: ['base', 'lower'], transform: { kind: 'transform', rect: { x: 10, y: 10, width: 80, height: 80 }, rotation: 0, flipX: false, flipY: false } },
    { id: 'base', name: 'base', className: '', groupId: 'group', visible: true, opacity: 100, blendMode: '正常' },
    { id: 'lower', name: 'lower', className: '', groupId: 'group', visible: true, opacity: 100, blendMode: '正常' },
  ], brushStrokes: [], canvasTexts: [], layerMasks: {}, sceneOrder: [], canvasShapes: [
    { id: 'red', layerId: 'base', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#ff0000', opacity: 50, strokeWidth: 0 },
    { id: 'blue', layerId: 'upper', kind: 'rectangle', rect: { x: 75, y: 0, width: 25, height: 100 }, color: '#0000ff', opacity: 100, strokeWidth: 0 },
  ] }
  const baseline = pixels(initial)
  const png = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect x="30" y="20" width="10" height="10" fill="green" opacity="0.5"/></svg>', options).render().asPng()
  const source = `data:image/png;base64,${btoa(Array.from(png, byte => String.fromCharCode(byte)).join(''))}`
  const repaired = editorReducer(initial, { type: 'add-repair-layer', source, name: 'repair', baseLayerId: 'base', repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base'] })
  const actual = pixels(repaired)
  expect(pixel(baseline, 32, 22)[3]).toBe(128)
  expect(pixel(actual, 32, 22)).toEqual([0, 64, 0, 128])
  expect(pixel(actual, 50, 40)).toEqual(pixel(baseline, 50, 40))
  expect(pixel(actual, 100, 40)).toEqual([0, 0, 255, 255])
  const repairId = repaired.selectedLayerId
  expect(pixels(editorReducer(repaired, { type: 'toggle-layer', id: repairId }))).toEqual(baseline)
  expect(pixels(editorReducer(repaired, { type: 'undo' }))).toEqual(baseline)
  const reopened = decodeProject(await encodeProject(repaired, { id: 'repair-doc', name: 'repair' })).document
  expect(pixels({ ...repaired, ...reopened })).toEqual(actual)
  const withLower = { ...initial, canvasShapes: [...initial.canvasShapes, { id: 'lower-blue', layerId: 'lower', kind: 'rectangle' as const, rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#0000ff', opacity: 100, strokeWidth: 0 }] }
  const nestedRepair = editorReducer(withLower, { type: 'add-repair-layer', source, name: 'repair', baseLayerId: 'base', repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base'] })
  expect(pixel(pixels(nestedRepair), 32, 22)).toEqual([0, 64, 127, 255])
  expect(nestedRepair.layers.find(layer => layer.id === nestedRepair.selectedLayerId)?.groupId).toBe('group')
  const opaquePng = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect x="30" y="20" width="10" height="10" fill="green"/></svg>', options).render().asPng()
  const opaqueSource = `data:image/png;base64,${btoa(Array.from(opaquePng, byte => String.fromCharCode(byte)).join(''))}`
  const opaqueNested = editorReducer({ ...withLower, canvasShapes: withLower.canvasShapes.map(shape => ({ ...shape, opacity: 100 })) }, { type: 'add-repair-layer', source: opaqueSource, name: 'repair', baseLayerId: 'base', repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base'] })
  expect(pixel(pixels(opaqueNested), 32, 22)).toEqual([0, 128, 0, 255])
  const parentHalf = { ...withLower, layers: withLower.layers.map(layer => layer.id === 'group' ? { ...layer, opacity: 50 } : layer), canvasShapes: withLower.canvasShapes.map(shape => ({ ...shape, opacity: 100 })) }
  const localHost = document.createElement('div'); localHost.innerHTML = renderToStaticMarkup(<CanvasScene state={parentHalf} />)
  const localSample = new Resvg(serializeSvg(retouchScopeSvg(localHost.querySelector('svg')!, parentHalf.layers, 'base', 'current')).source, options).render().pixels
  expect(pixel(localSample, 32, 22)).toEqual([255, 0, 0, 255])
  const halfRepair = editorReducer(parentHalf, { type: 'add-repair-layer', source: opaqueSource, name: 'repair', baseLayerId: 'base', repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base'] })
  expect(pixel(pixels(halfRepair), 32, 22)).toEqual([0, 64, 0, 128])
  expect(pixels(editorReducer(halfRepair, { type: 'toggle-layer', id: halfRepair.selectedLayerId }))).toEqual(pixels(parentHalf))
  const acrossGroups = { ...parentHalf, canvasShapes: parentHalf.canvasShapes.map(shape => shape.id === 'blue' ? { ...shape, rect: { x: 0, y: 0, width: 100, height: 100 } } : shape) }
  const rootRepair = editorReducer(acrossGroups, { type: 'add-repair-layer', source: opaqueSource, name: 'visible repair', baseLayerId: 'base', rootPlacement: true, repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['upper', 'group', 'base', 'lower'] })
  expect(pixel(pixels(acrossGroups), 32, 22)).toEqual([0, 0, 255, 255])
  expect(pixel(pixels(rootRepair), 32, 22)).toEqual([0, 128, 0, 255])
  expect(pixel(pixels(rootRepair), 50, 40)).toEqual([0, 0, 255, 255])
  expect(rootRepair.layers.find(layer => layer.id === rootRepair.selectedLayerId)?.groupId).toBeUndefined()
  const rootHost = document.createElement('div'); rootHost.innerHTML = renderToStaticMarkup(<CanvasScene state={acrossGroups} />)
  const rootSample = new Resvg(serializeSvg(retouchScopeSvg(rootHost.querySelector('svg')!, acrossGroups.layers, 'base', 'visible')).source, options).render().pixels
  expect(pixel(rootSample, 32, 22)).toEqual([0, 0, 255, 255])
  const siblingUpper = { ...parentHalf, layers: parentHalf.layers.map(layer => layer.id === 'upper' ? { ...layer, groupId: 'group' } : layer.id === 'group' ? { ...layer, children: ['upper', 'base', 'lower'] } : layer), canvasShapes: parentHalf.canvasShapes.map(shape => shape.id === 'blue' ? { ...shape, rect: { x: 0, y: 0, width: 100, height: 100 } } : shape) }
  const belowParent = retouchParentId(siblingUpper.layers, 'base', 'below')
  expect(belowParent).toBe('group')
  const siblingRepair = editorReducer(siblingUpper, { type: 'add-repair-layer', source: opaqueSource, name: 'below repair', baseLayerId: 'base', placementParentId: belowParent, rootPlacement: !belowParent, repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base', 'lower'] })
  expect(pixel(pixels(siblingRepair), 32, 22)).toEqual(pixel(pixels(siblingUpper), 32, 22))
  const copied = editorReducer(repaired, { type: 'duplicate-layer', id: repairId })
  expect(copied.layers.find(layer => layer.id === copied.selectedLayerId)?.repairSourceIds).toEqual([])
  const locked = editorReducer({ ...initial, layers: initial.layers.map(layer => layer.id === 'group' ? { ...layer, locked: true } : layer) }, { type: 'add-repair-layer', source, name: 'repair', baseLayerId: 'base', repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base'] })
  expect(locked.layers).toHaveLength(initial.layers.length)
  const legacyLocked = editorReducer({ ...initial, layers: initial.layers.map(layer => layer.id === 'group' ? { ...layer, locked: true } : layer.id === 'base' ? { ...layer, groupId: undefined } : layer) }, { type: 'add-repair-layer', source, name: 'repair', baseLayerId: 'base', repairCoverage: 'M30 20h10v10H30Z', repairSourceIds: ['base'] })
  expect(legacyLocked.layers).toHaveLength(initial.layers.length)
  expect(legacyLocked.undoStack).toHaveLength(initial.undoStack.length)
})
