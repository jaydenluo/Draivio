import { render } from '@testing-library/react'
import { Resvg } from '@resvg/resvg-js'
import { describe, expect, it, test } from 'vitest'
import { CanvasScene } from './CanvasScene'
import { initialEditorState, type LayerAdjustments } from '../state/editor'
import { serializeExport } from '../render/serializeExport'
import { editorReducer } from '../state/editor'
import { createSelection } from './selectionGeometry'
import { encodeProject, decodeProject } from '../document/projectFormat'
function pixels(state:any){const {container}=render(<CanvasScene state={state}/>);const svg=container.querySelector('svg')!;Object.defineProperty(svg,'viewBox',{configurable:true,value:{baseVal:{x:0,y:0,width:500,height:625}}});return new Resvg(serializeExport(svg,{range:'canvas'})).render().pixels}
it('uses the same SVG filter for preview and export when applying one EV',()=>{const neutral=structuredClone(initialEditorState);const exposed=structuredClone(initialEditorState);exposed.layers[0].adjustments={...exposed.layers[0].adjustments,exposureEV:1} as LayerAdjustments;const a=pixels(neutral),b=pixels(exposed);expect(b).not.toEqual(a);expect(Array.from(b)).toEqual(Array.from(pixels(exposed)))}, 20000)


test('exports an independent gray128 EV1 expected pixel through the real SVG path', () => {
 const state = structuredClone(initialEditorState)
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="625"><rect width="500" height="625" fill="rgb(128,128,128)"/></svg>`
 state.layers[0].source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
 state.layers[0].adjustments = { ...state.layers[0].adjustments, exposureEV: 1 } as LayerAdjustments
 const output = pixels(state)
 const expected = 176
 expect(output[0]).toBeGreaterThanOrEqual(expected - 1)
 expect(output[0]).toBeLessThanOrEqual(expected + 1)
 expect(output[1]).toBe(output[0]); expect(output[2]).toBe(output[0]); expect(output[3]).toBe(255)
}, 20000)

test('exports a colored gray-point white balance with independent neutral expectation', () => {
 const state = structuredClone(initialEditorState)
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="625"><rect width="500" height="625" fill="rgb(180,140,100)"/></svg>`
 state.layers[0].source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
 state.layers[0].adjustments = { ...state.layers[0].adjustments, whiteBalance: { r: 0.21404114048223255 / ((180 / 255 <= 0.04045 ? 180 / 255 / 12.92 : ((180 / 255 + .055) / 1.055) ** 2.4)), g: 0.21404114048223255 / ((140 / 255 <= 0.04045 ? 140 / 255 / 12.92 : ((140 / 255 + .055) / 1.055) ** 2.4)), b: 0.21404114048223255 / ((100 / 255 <= 0.04045 ? 100 / 255 / 12.92 : ((100 / 255 + .055) / 1.055) ** 2.4)) } } as LayerAdjustments
 const output = pixels(state)
 expect(Math.max(output[0], output[1], output[2]) - Math.min(output[0], output[1], output[2])).toBeLessThanOrEqual(2)
 expect(output[0]).toBeGreaterThanOrEqual(126);expect(output[0]).toBeLessThanOrEqual(129)
 expect(output[3]).toBe(255)
}, 20000)

test('exports a curve midpoint through the same SVG filter used by preview', () => {
 const state = structuredClone(initialEditorState)
 const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="625"><rect width="500" height="625" fill="rgb(128,128,128)"/></svg>`
 state.layers[0].source = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
 state.layers[0].adjustments = { ...state.layers[0].adjustments, curves: { rgb: [{x:0,y:0},{x:0.5,y:0.25},{x:1,y:1}], r:[{x:0,y:0},{x:1,y:1}], g:[{x:0,y:0},{x:1,y:1}], b:[{x:0,y:0},{x:1,y:1}] } } as LayerAdjustments
 const output = pixels(state)
 expect(output[0]).toBeGreaterThanOrEqual(63); expect(output[0]).toBeLessThanOrEqual(65)
 expect(output[1]).toBe(output[0]); expect(output[2]).toBe(output[0]); expect(output[3]).toBe(255)
}, 20000)

test('adjustment layer wraps only lower siblings and survives reducer insertion', () => {
 const state = structuredClone(initialEditorState)
 state.layers = [
  { id: 'top', name: 'top', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
  { id: 'bottom', name: 'bottom', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
 ]
 state.selectedLayerId = 'top'; state.selectedLayerIds = ['top']
 const next = editorReducer(state, { type: 'add-adjustment-layer' })
 expect(next.layers.map(layer => layer.kind ?? 'pixel')).toEqual(['pixel', 'adjustment', 'pixel'])
 expect(next.layers[1].adjustments?.brightness).toBe(0)
 const { container } = render(<CanvasScene state={{ ...next, canvasShapes: [
  { id: 'bottom-shape', layerId: 'bottom', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#202020', strokeWidth: 0 },
  { id: 'top-shape', layerId: 'top', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#202020', strokeWidth: 0 },
 ] as any, sceneOrder: ['bottom-shape', 'top-shape'] }} />)
 const adjustment = container.querySelector('[data-adjustment-layer]')
 expect(adjustment).toBeInTheDocument()
 expect(adjustment?.querySelector('[data-layer-id="bottom"]')).toBeInTheDocument()
 expect(adjustment?.querySelector('[data-layer-id="top"]')).toBeNull()
}, 20000)

test('adjustment pixels affect lower content while foreground stays unchanged', () => {
 const state = structuredClone(initialEditorState)
 state.layers = [
  { id: 'top', name: 'top', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
  { id: 'adjust', name: 'adjust', className: 'layer-adjustment', kind: 'adjustment', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...initialEditorState.layers[0].adjustments!, brightness: 100 } },
  { id: 'bottom', name: 'bottom', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
 ]
 state.canvasShapes = [
  { id: 'bottom-shape', layerId: 'bottom', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#202020', strokeWidth: 0 },
  { id: 'top-shape', layerId: 'top', kind: 'rectangle', rect: { x: 50, y: 0, width: 50, height: 100 }, color: '#202020', strokeWidth: 0 },
 ] as any
 state.sceneOrder = ['bottom-shape', 'top-shape']
 const { container } = render(<CanvasScene state={state} />)
 const svg = container.querySelector('svg')!
 Object.defineProperty(svg, 'viewBox', { configurable: true, value: { baseVal: { x: 0, y: 0, width: 500, height: 625 } } })
 const pixels = new Resvg(serializeExport(svg, { range: 'canvas' })).render().pixels
 expect(pixels[0]).toBeGreaterThan(32)
 const right = (0 * 500 + 375) * 4
 expect(pixels[right]).toBeLessThan(80)
}, 20000)

test('adjustment mask gates the filtered surface and leaves source data untouched', () => {
 const state = structuredClone(initialEditorState)
 state.layers = [
  { id: 'adjust', name: 'adjust', className: 'layer-adjustment', kind: 'adjustment', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...initialEditorState.layers[0].adjustments!, brightness: 100 } },
  { id: 'bottom', name: 'bottom', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
 ]
 state.canvasShapes = [{ id: 'bottom-shape', layerId: 'bottom', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#202020', strokeWidth: 0 }] as any
 state.sceneOrder = ['bottom-shape']
 const mask = { selection: createSelection('rectangle', { x: 0, y: 0, width: 50, height: 100 }), strokes: [], inverted: false, applied: true }
 state.layerMasks = { adjust: mask }
 const { container } = render(<CanvasScene state={state} />)
 const filtered = container.querySelector('[data-adjustment-layer] g[mask]')
 expect(filtered).toBeInTheDocument()
 expect(filtered?.getAttribute('mask')).toContain('url(#')
 expect(state.layerMasks.adjust).toEqual(mask)
}, 20000)

test('keeps a clipped adjustment layer in the stack and records its clip base', () => {
 const state = structuredClone(initialEditorState)
 state.layers = [
  { id: 'adjust', name: 'adjust', className: 'layer-adjustment', kind: 'adjustment', clipBaseId: 'base', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...initialEditorState.layers[0].adjustments!, brightness: 10 } },
  { id: 'base', name: 'base', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
  { id: 'lower', name: 'lower', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
 ]
 state.canvasShapes = [{ id: 'shape', layerId: 'base', kind: 'rectangle', rect: { x: 0, y: 0, width: 50, height: 50 }, color: '#202020', strokeWidth: 0 }, { id: 'lower-shape', layerId: 'lower', kind: 'rectangle', rect: { x: 50, y: 0, width: 50, height: 50 }, color: '#202020', strokeWidth: 0 }] as any
 state.sceneOrder = ['shape', 'lower-shape']
 const { container } = render(<CanvasScene state={state} />)
 const adjustment = container.querySelector('[data-adjustment-layer="adjust"]')!
 expect(adjustment).toHaveAttribute('data-adjustment-clip-base', 'base')
 expect(adjustment.querySelector('[data-layer-id="base"]')).toBeInTheDocument()
 expect(adjustment.querySelector('[data-layer-id="lower"]')).toBeNull()
}, 20000)

test('applies black white and half mask coverage in the same exported pixel path', () => {
 const state = structuredClone(initialEditorState)
 state.layers = [
  { id: 'adjust', name: 'adjust', className: 'layer-adjustment', kind: 'adjustment', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...initialEditorState.layers[0].adjustments!, exposureEV: 1 } },
  { id: 'base', name: 'base', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
 ]
 state.canvasShapes = [{ id: 'shape', layerId: 'base', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#404040', strokeWidth: 0 }] as any
 state.sceneOrder = ['shape']
 state.layerMasks = { adjust: { strokes: [], inverted: false, applied: true, gradient: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } } } }
 const { container } = render(<CanvasScene state={state} />)
 const svg = container.querySelector('svg')!
 Object.defineProperty(svg, 'viewBox', { configurable: true, value: { baseVal: { x: 0, y: 0, width: 500, height: 625 } } })
 const pixels = new Resvg(serializeExport(svg, { range: 'canvas' })).render().pixels
 const sample = (x: number) => pixels[(300 * 500 + x) * 4]
 const black = sample(475), half = sample(250), white = sample(25)
 expect(white).toBeGreaterThan(half)
 expect(half).toBeGreaterThan(black)
 expect(black).toBeGreaterThan(50)
 expect(state.canvasShapes[0].color).toBe('#404040')
}, 20000)

test('round trips adjustment layer and preserves exported adjustment structure', async () => {
 const state = structuredClone(initialEditorState)
 state.layers = [
  { id: 'adjust', name: 'adjust', className: 'layer-adjustment', kind: 'adjustment', visible: true, opacity: 80, blendMode: '正常', adjustments: { ...initialEditorState.layers[0].adjustments!, brightness: 24 } },
  { id: 'base', name: 'base', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' },
 ]
 state.canvasShapes = [{ id: 'shape', layerId: 'base', kind: 'rectangle', rect: { x: 0, y: 0, width: 100, height: 100 }, color: '#404040', strokeWidth: 0 }] as any
 state.sceneOrder = ['shape']
 const mask = { strokes: [], inverted: false, applied: true, gradient: { from: { x: 0, y: 0 }, to: { x: 100, y: 0 } } }
 state.layerMasks = { adjust: mask }
 const restored = decodeProject(await encodeProject(state, { id: 'adjustment', name: '调整' })).document as typeof state
 expect(restored.layers[0]).toMatchObject({ kind: 'adjustment', adjustments: { brightness: 24 }, opacity: 80 })
 expect(restored.layerMasks?.adjust).toEqual(mask)
 const { container } = render(<CanvasScene state={restored} />)
 expect(container.querySelector('[data-adjustment-layer="adjust"]')).toBeInTheDocument()
 const svg = container.querySelector('svg')!
 expect(serializeExport(svg, { range: 'canvas' })).toContain('data-adjustment-layer')
}, 20000)

test('preview comparison changes the visible filter but exports the committed curve',()=>{
 const state=structuredClone(initialEditorState);state.layers[0].source=undefined;state.canvasShapes=[{id:'gray',layerId:'art',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#808080',strokeWidth:0} as any]
 state.layers[0].adjustments={...state.layers[0].adjustments,curves:{rgb:[{x:0,y:0},{x:.5,y:.25},{x:1,y:1}],r:[{x:0,y:0},{x:1,y:1}],g:[{x:0,y:0},{x:1,y:1}],b:[{x:0,y:0},{x:1,y:1}]}} as LayerAdjustments
 const committed=pixels(state)
 state.curvePreviewOffLayerId='art'
 const {container}=render(<CanvasScene state={state}/>);const svg=container.querySelector('svg')!;Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:500,height:625}}})
 const visible=new Resvg(svg.outerHTML).render().pixels
 expect(visible[0]).toBeGreaterThan(committed[0]+50)
 for(const range of ['canvas','layer','selection'] as const) {const exported=serializeExport(svg,{range,selectedLayerId:'art',selection:{...state.selection,rect:{x:0,y:0,width:100,height:100}}});expect(exported).not.toContain('data-export-table');expect(exported).toContain('tableValues');if(range!=='selection')expect(new Resvg(exported).render().pixels[0]).toBe(committed[0])}
 expect(state.undoStack).toHaveLength(0)
},20000)
