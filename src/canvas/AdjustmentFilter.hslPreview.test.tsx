import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdjustmentFilter } from './AdjustmentFilter'
import { neutralAdjustments } from '../state/editor'
import { defaultHsl } from '../adjustments/hsl'
import { serializeExport } from '../render/serializeExport'
it('keeps HSL active while curve comparison excludes curves only in preview and restores export',()=>{
 const hsl=defaultHsl();hsl.global.hue=60
 const settings={...neutralAdjustments,hsl}
 const svg = new DOMParser().parseFromString(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4">${renderToStaticMarkup(<AdjustmentFilter id="f" adjustments={settings} width={4} height={4} compareOriginal/>)}</svg>`,'image/svg+xml').documentElement as unknown as SVGSVGElement
 const preview=JSON.parse(svg.querySelector('filter')!.getAttribute('data-adjustments')!)
 expect(preview.curves).toBeUndefined();expect(preview.levels).toBeUndefined();expect(preview.hsl.global.hue).toBe(60)
 const exported=new DOMParser().parseFromString(serializeExport(svg,{range:'canvas'}),'image/svg+xml')
 expect(JSON.parse(exported.querySelector('filter')!.getAttribute('data-adjustments')!)).toEqual(settings)
})
