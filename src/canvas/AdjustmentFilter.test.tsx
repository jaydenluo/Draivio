import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { neutralAdjustments, initialEditorState } from '../state/editor'
import { adjustmentPipeline, gaussianAxisKernel, CLARITY_SIGMA } from '../imaging/layerAdjustments'
import { AdjustmentFilter } from './AdjustmentFilter'
import { CanvasScene } from './CanvasScene'
import { extractLayerScene } from './layerExtraction'

test('neutral bypasses filters exactly and scene uses named SVG filter instead of CSS approximations', () => {
 const state={...initialEditorState,layers:[{...initialEditorState.layers[0],adjustments:{...neutralAdjustments}}]}; const view=render(<CanvasScene state={state}/>); expect(view.container.querySelector('filter[data-adjustment-filter]')).toBeNull(); expect(view.container.querySelector('[data-layer-id]')).not.toHaveAttribute('filter')
 state.layers[0].adjustments={...neutralAdjustments,temperature:60,shadows:50,sharpness:40,blur:30}; view.rerender(<CanvasScene state={state}/>); const layer=view.container.querySelector('[data-layer-id]')!; expect(layer.getAttribute('filter')).toMatch(/^url\(#.+\)$/); expect((layer as SVGElement).style.filter).toBe(''); expect(view.container.querySelector('filter[data-adjustment-filter]')).toHaveAttribute('color-interpolation-filters','sRGB')
})
test('SVG transfers and convolution use the CPU reference tables and weights', () => {
 const adjustments={...neutralAdjustments,brightness:15,saturation:30,temperature:-70,highlights:-20,sharpness:50,blur:60}; const pipeline=adjustmentPipeline(adjustments)!; const view=render(<svg><AdjustmentFilter id="adjust" adjustments={adjustments} width={500} height={625}/></svg>); const filter=view.container.querySelector('filter')!; expect(filter.querySelector('feFuncR')?.getAttribute('tableValues')?.split(' ').map(Number)).toEqual(pipeline.tables[0]); expect(filter.querySelector('feConvolveMatrix')?.getAttribute('kernelMatrix')?.split(' ').map(Number)).toEqual(gaussianAxisKernel(CLARITY_SIGMA)); expect(filter.querySelectorAll('feConvolveMatrix')).toHaveLength(4); expect(filter.querySelectorAll('feComposite[operator="in"]')).toHaveLength(2); expect(filter.querySelector('feComposite[operator="arithmetic"]')).toHaveAttribute('k2','1.4'); expect(filter).toHaveAttribute('filterUnits','userSpaceOnUse')
})
test('visual layer export keeps named definitions and raster source bypasses selected filter', () => {
 const state={...initialEditorState,layers:[{...initialEditorState.layers[0],adjustments:{...neutralAdjustments,shadows:70,blur:80}}]}; const view=render(<CanvasScene state={state}/>); const svg=view.container.querySelector('svg')!; const visual=extractLayerScene(svg,'art'); const layer=visual.querySelector('[data-layer-id="art"]')!; const id=layer.getAttribute('filter')!.slice(5,-1); expect(visual.querySelector(`[id="${id}"]`)).not.toBeNull(); const source=extractLayerScene(svg,'art',{mode:'raster-source'}); expect(source.querySelector('[data-layer-id="art"]')).not.toHaveAttribute('filter')
})
test('SVG convolution keeps transparent samples empty rather than extending edge colors', () => {
 const view=render(<svg><AdjustmentFilter id="edges" adjustments={{...neutralAdjustments,blur:100}} width={500} height={625}/></svg>); const kernel=view.container.querySelector('feConvolveMatrix')!; expect(kernel).toHaveAttribute('edgeMode','none'); expect(kernel).toHaveAttribute('preserveAlpha','false'); expect(kernel).toHaveAttribute('kernelUnitLength','1 1'); expect(view.container.querySelector('filter')).toHaveAttribute('x','-24')
})
test('preview off bypasses the same pipeline used for export without clearing stored values', () => {
 const layer={...initialEditorState.layers[0],adjustments:{...neutralAdjustments,brightness:80},adjustmentsEnabled:false}; const view=render(<CanvasScene state={{...initialEditorState,layers:[layer]}}/>); expect(view.container.querySelector('[data-layer-id="art"]')).not.toHaveAttribute('filter'); expect(view.container.querySelector('filter[data-adjustment-filter]')).toBeNull(); expect(extractLayerScene(view.container.querySelector('svg')!,'art').querySelector('[data-layer-id="art"]')).not.toHaveAttribute('filter'); expect(layer.adjustments.brightness).toBe(80)
})
test('uses two bounded separable kernels and restores coverage only after both axes',()=>{
 const view=render(<svg><AdjustmentFilter id="separable" adjustments={{...neutralAdjustments,sharpness:70}} width={64} height={64}/></svg>);const kernels=[...view.container.querySelectorAll('feConvolveMatrix')];expect(kernels.map(n=>n.getAttribute('order'))).toEqual(['25 1','1 25']);expect(kernels.map(n=>n.getAttribute('preserveAlpha'))).toEqual(['false','false']);expect(kernels[1].getAttribute('in')).toBe(kernels[0].getAttribute('result'));expect(kernels[0].nextElementSibling).toBe(kernels[1]);expect(view.container.querySelectorAll('feComposite[operator="in"]')).toHaveLength(1)
})
