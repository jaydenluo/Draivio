import { expect, test } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { createBrushStroke } from './BrushEngine'
import { CanvasScene } from './CanvasScene'
import { editorReducer, initialEditorState, type EditorState } from '../state/editor'
import { encodeProject, decodeProject } from '../document/projectFormat'
import { serializeExport } from '../render/serializeExport'

function pixels(state: EditorState) {
  const { container, unmount } = render(<CanvasScene state={state} />)
  const svg = container.querySelector('svg')!
  Object.defineProperty(svg, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: state.documentWidth, height: state.documentHeight } } })
  const result = new Resvg(serializeExport(svg, { range: 'canvas' })).render().pixels
  unmount(); return result
}

test('smart content keeps original source sampling after shrink and enlarge unlike a destructive one-pixel source', () => {
  const source = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="red"/><rect width="4" height="8" fill="blue"/></svg>').render().asPng()
  let state: EditorState = { ...structuredClone(initialEditorState), documentWidth: 8, documentHeight: 8, layers: [{ id: 'art', name: '图', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: `data:image/png;base64,${Buffer.from(source).toString('base64')}`, contentWidth: 8, contentHeight: 8 }], canvasTexts: [], canvasShapes: [] }
  const original = pixels(state)
  state = editorReducer(state, { type: 'convert-to-smart-object', id: 'art' })
  state = editorReducer(state, { type: 'commit-layer-transform', layerId: 'art', transform: { kind: 'transform', rect: { x: 0, y: 0, width: 12.5, height: 12.5 }, rotation: 0, flipX: false, flipY: false } })
  state = editorReducer(state, { type: 'commit-layer-transform', layerId: 'art', transform: { kind: 'transform', rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false } })
  expect(pixels(state)).toEqual(original)
  const destructive = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="purple"/></svg>').render().asPng()
  state = editorReducer(state, { type: 'replace-smart-object', id: 'art', source: { id: 'replacement', kind: 'image', source: `data:image/png;base64,${Buffer.from(destructive).toString('base64')}`, width: 1, height: 1, revision: 1 } })
  expect(pixels(state)).not.toEqual(original)
})

test('internal shape edits render in every shared instance and only commit on save', () => {
  const base = { ...structuredClone(initialEditorState), documentWidth: 8, documentHeight: 8, layers: [{ id: 'art', name: 'shape', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' }], canvasShapes: [{ id: 'shape', layerId: 'art', kind: 'rectangle' as const, color: '#ff0000', rect: { x: 0, y: 0, width: 100, height: 100 }, strokeWidth: 0 }], sceneOrder: ['shape'] }
  let state = editorReducer(base, { type: 'convert-to-smart-object', id: 'art' })
  const sourceId = state.layers[0].smartObject!.sourceId
  expect(pixels(state)[0]).toBe(255)
  const document = structuredClone(state.smartObjectSources[sourceId].document!)
  document.canvasShapes[0].color = '#00ff00'
  expect(pixels(state)[0]).toBe(255)
  state = editorReducer(state, { type: 'update-smart-object-source', sourceId, patch: { document } })
  expect(Array.from(pixels(state).slice(0, 4))).toEqual([0, 255, 0, 255])
  expect(renderToStaticMarkup(<CanvasScene state={state} />)).toContain('data-smart-revision="2"')
  cleanup()
})


test('offline project preserves real embedded PNG resources and exact pixels; corrupt child schema is rejected', async () => {
  const image = new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#123456"/><circle cx="4" cy="4" r="2" fill="#ef9876"/></svg>').render().asPng()
  const data = `data:image/png;base64,${Buffer.from(image).toString('base64')}`
  const base: EditorState = { ...structuredClone(initialEditorState), documentWidth: 8, documentHeight: 8, layers: [{ id: 'art', name: 'image', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: data, contentWidth: 8, contentHeight: 8 }], selectedLayerId: 'art', selectedLayerIds: ['art'], canvasTexts: [], canvasShapes: [], brushStrokes: [], layerMasks: {}, sceneOrder: [] }
  const state = editorReducer(base, { type: 'convert-to-smart-object', id: 'art' })
  const expected = pixels(state)
  const raw = JSON.parse(await encodeProject(state, { id: 'offline', name: '源资源' }, async () => { throw new Error('must not access network') }))
  expect(Object.values(raw.assets)).toEqual([data])
  const sourceId = state.layers[0].smartObject!.sourceId
  expect(raw.document.smartObjectSources[sourceId].document.layers[0].source).toMatch(/^asset:/)
  const reopened = decodeProject(JSON.stringify(raw)).document
  expect(pixels({ ...base, ...reopened })).toEqual(expected)
  expect(reopened.smartObjectSources![sourceId].document!.layers[0].source).toBe(data)
  const missingAsset = structuredClone(raw); missingAsset.assets = {}
  expect(() => decodeProject(JSON.stringify(missingAsset))).toThrow('资源缺失')
  const invalidChild = structuredClone(raw); invalidChild.document.smartObjectSources[sourceId].document.layers[0].opacity = 'opaque'
  expect(() => decodeProject(JSON.stringify(invalidChild))).toThrow('opacity')
  const injectedChild = structuredClone(raw); injectedChild.document.smartObjectSources[sourceId].document.smartObjectSources = {}
  expect(() => decodeProject(JSON.stringify(injectedChild))).toThrow('内部文档字段')
})


function solidImageState(size = 8): EditorState {
  const png = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="red"/></svg>`).render().asPng()
  return { ...structuredClone(initialEditorState), documentWidth: 8, documentHeight: 8, documentBackground: 'transparent', layers: [{ id: 'art', name: 'red', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: `data:image/png;base64,${Buffer.from(png).toString('base64')}`, contentWidth: size, contentHeight: size }], selectedLayerId: 'art', selectedLayerIds: ['art'], canvasTexts: [], canvasShapes: [], brushStrokes: [], sceneOrder: [], layerMasks: {} }
}

test('replacement preserves exact brush mask pixels when source dimensions change, including offline reopen and rasterization', async () => {
  const base = solidImageState()
  base.layerMasks.art = { inverted: false, applied: true, strokes: [createBrushStroke('center', 'mask', 'art', { x: 50, y: 50 }, { size: 4, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: '#000000' })] }
  let state = editorReducer(base, { type: 'convert-to-smart-object', id: 'art' })
  const original = pixels(state)
  expect(original[(4 * 8 + 4) * 4 + 3]).toBe(0)
  const replacement = solidImageState(16).layers[0].source!
  state = editorReducer(state, { type: 'replace-smart-object', id: 'art', source: { id: 'replacement', kind: 'image', width: 16, height: 16, revision: 1, source: replacement } })
  expect(pixels(state)).toEqual(original)
  expect(state.layers[0]).toMatchObject({ contentWidth: 8, contentHeight: 8 })
  const reopened = decodeProject(await encodeProject(state, { id: 'mask', name: 'mask geometry' })).document
  expect(pixels({ ...base, ...reopened })).toEqual(original)
  const rasterized = editorReducer(state, { type: 'rasterize-smart-object', id: 'art', source: replacement })
  expect(pixels(rasterized)).toEqual(original)
  expect(pixels(editorReducer(rasterized, { type: 'undo' }))).toEqual(original)
})

test('hidden layer conversion keeps visibility on the outer instance so showing it restores original pixels', () => {
  const base = solidImageState()
  const original = pixels(base)
  let state = editorReducer({ ...base, layers: [{ ...base.layers[0], visible: false }] }, { type: 'convert-to-smart-object', id: 'art' })
  expect(pixels(state).every(value => value === 0)).toBe(true)
  state = editorReducer(state, { type: 'toggle-layer', id: 'art' })
  expect(pixels(state)).toEqual(original)
})
