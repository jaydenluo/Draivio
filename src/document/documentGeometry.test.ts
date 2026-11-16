import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from '../state/editor'

describe('document geometry', () => {
  it('imports natural dimensions and keeps output size independent from display zoom', () => {
    const imported = editorReducer(initialEditorState, { type: 'import-image', id: 'natural', name: '1200x800', source: 'data:image/png;base64,x', width: 1200, height: 800, autoSize: true })
    expect([imported.documentWidth, imported.documentHeight]).toEqual([1200, 800])
    expect(editorReducer(imported, { type: 'set-zoom', zoom: 50 }).documentWidth).toBe(1200)
    expect(editorReducer(imported, { type: 'undo' }).documentWidth).toBe(500)
  })
  it('expands a centered canvas without scaling layer content and restores it with undo', () => {
    const next = editorReducer(initialEditorState, { type: 'resize-document', width: 1000, height: 1000, mode: 'canvas', anchor: 'center', background: 'transparent' })
    expect(next.layers[0].transform?.rect).toEqual({ x: 25, y: 18.75, width: 50, height: 62.5 })
    expect([next.layers[0].contentWidth, next.layers[0].contentHeight]).toEqual([500, 625])
    expect(next.documentBackground).toBe('transparent')
    expect(editorReducer(next, { type: 'undo' }).layers[0].transform).toBeUndefined()
  })
  it('resizes the whole image while preserving normalized object positions', () => {
    const next = editorReducer(initialEditorState, { type: 'resize-document', width: 1000, height: 1250, mode: 'image' })
    expect(next.documentWidth).toBe(1000)
    expect(next.layers[0].contentWidth).toBe(500)
    expect(next.selectionRect).toEqual(initialEditorState.selectionRect)
  })
  it.each([[0, 10], [1.5, 10], [16385, 1], [16384, 16384], [NaN, 10]])('rejects unsafe dimensions %s x %s without undo entries', (width, height) => {
    const next = editorReducer(initialEditorState, { type: 'resize-document', width, height, mode: 'canvas' })
    expect(next.documentWidth).toBe(500)
    expect(next.undoStack).toHaveLength(0)
    expect(next.notice).toMatch(/尺寸|面积/)
  })
})

import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { CanvasScene } from '../canvas/CanvasScene'
it('renders natural-size content and keeps all object geometry together on canvas expansion', () => {
  const state = { ...initialEditorState, documentWidth: 1200, documentHeight: 800, layers: [{ ...initialEditorState.layers[0], source: 'image.png' }], canvasTexts: [{ id: 'text', layerId: 'art', x: 50, y: 50, text: 'Hello', fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#000', align: 'left' as const }] }
  const svg = renderToStaticMarkup(createElement(CanvasScene, { state }))
  expect(svg).toContain('viewBox="0 0 1200 800"')
  expect(svg).toContain('x="600" y="400"')
  const expanded = editorReducer(state, { type: 'resize-document', width: 1400, height: 1000, mode: 'canvas' })
  const output = renderToStaticMarkup(createElement(CanvasScene, { state: expanded }))
  expect(output).toContain('translate(700 500)')
  expect(output).toContain('font-size="24"')
})
it('rejects image rescaling that would distort rotated objects', () => {
 const next = editorReducer(initialEditorState, { type: 'resize-document', width: 1000, height: 800, mode: 'image' })
 expect(next.documentWidth).toBe(500)
 expect(next.notice).toMatch(/比例/)
})
it('maps a document selection into resized layer-local mask coordinates', () => {
 const expanded = editorReducer(initialEditorState, { type: 'resize-document', width: 1000, height: 1000, mode: 'canvas' })
 const masked = editorReducer(expanded, { type: 'selection-to-mask' })
 expect(masked.layerMasks.art.selection?.rect.x).toBeCloseTo(initialEditorState.selection.rect.x)
 expect(masked.layerMasks.art.selection?.rect.y).toBeCloseTo(initialEditorState.selection.rect.y)
})
it('keeps text, shapes, brush strokes and applied masks in the same pixel space when cropping a centered canvas', () => {
 const stroke = { id: 'stroke', layerId: 'art', mode: 'paint' as const, points: [{ x: 50, y: 50 }], size: 20, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: '#000' }
 const state = { ...initialEditorState, brushStrokes: [stroke], canvasShapes: [{ id: 'shape', layerId: 'art', kind: 'rectangle' as const, rect: { x: 40, y: 40, width: 20, height: 20 }, color: '#fff', strokeWidth: 2 }], layerMasks: { art: { selection: initialEditorState.selection, strokes: [stroke], inverted: false, applied: true } } }
 const cropped = editorReducer(state, { type: 'resize-document', width: 400, height: 400, mode: 'canvas' })
 expect(cropped.layers[0].transform?.rect).toEqual({ x: -12.5, y: -28.125, width: 125, height: 156.25 })
 expect(cropped.brushStrokes).toEqual(state.brushStrokes)
 expect(cropped.canvasShapes).toEqual(state.canvasShapes)
 expect(cropped.layerMasks).toEqual(state.layerMasks)
 const svg = renderToStaticMarkup(createElement(CanvasScene, { state: cropped }))
 expect(svg).toContain('translate(200 200) rotate(0) scale(1 1) translate(-250 -312.5)')
 expect(svg).toContain('data-mask-stroke="stroke"')
 expect(svg).toContain('data-shape="shape"')
 expect(svg).toContain('r="10"')
})
it('converts masks using document aspect ratio after a nonuniform canvas expansion', () => {
 const expanded = editorReducer(initialEditorState, { type: 'resize-document', width: 1000, height: 1000, mode: 'canvas' })
 const rotated = editorReducer(expanded, { type: 'commit-layer-transform', layerId: 'art', transform: { ...expanded.layers[0].transform!, rotation: 90 } })
 const selected = editorReducer(rotated, { type: 'commit-selection', selection: { ...rotated.selection, rect: { x: 40, y: 40, width: 10, height: 10 } } })
 const masked = editorReducer(selected, { type: 'selection-to-mask' })
 const rect = masked.layerMasks.art.selection!.rect
 expect(rect.x).toBeCloseTo(30); expect(rect.y).toBeCloseTo(50); expect(rect.width).toBeCloseTo(20); expect(rect.height).toBeCloseTo(16)
})
it('preserves document-pixel feather when creating a mask after image scaling', () => {
 const scaled = editorReducer(initialEditorState, { type: 'resize-document', width: 1000, height: 1250, mode: 'image' })
 const masked = editorReducer({ ...scaled, selection: { ...scaled.selection, feather: 10 } }, { type: 'selection-to-mask' })
 expect(masked.layerMasks.art.selection?.feather).toBe(5)
})
