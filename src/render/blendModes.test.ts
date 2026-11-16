import { expect, it } from 'vitest'
import { BLEND_MODES, blendPixel, resolveBlendMode } from './blendModes'
import { compositeLayers, solidImage } from '../engine/raster/composite'

it('rejects unsupported imported and runtime modes rather than silently normalizing', () => {
 expect(() => resolveBlendMode('未知模式')).toThrow(/不支持/)
 expect(BLEND_MODES).toHaveLength(16)
})
it.each(['multiply','screen','overlay','soft-light','hard-light','darken','lighten','color-dodge','color-burn','difference','exclusion','hue','saturation','color','luminosity','normal'])('%s preserves source over an empty backdrop and uses alpha-correct source-over', mode => {
 expect(blendPixel([0,0,0,0],[201,83,39,179],mode)).toEqual([201,83,39,179])
 const pixel=blendPixel([61,157,208,128],[201,83,39,179],mode)
 expect(pixel[3]).toBe(217)
 expect([...compositeLayers(1,1,[{image:solidImage(1,1,[61,157,208,128])},{image:solidImage(1,1,[201,83,39,179]),blendMode:mode as never}]).data]).toEqual(pixel)
})
it('uses the W3C partial-backdrop alpha equation for multiply',()=>{
 const a=128/255,b=179/255,out=b+a*(1-b)
 const expected=[61,157,208].map((c,i)=>Math.round(((1-b)*a*c/255+b*(1-a)*[201,83,39][i]/255+a*b*(c/255)*([201,83,39][i]/255))/out*255))
 expect(blendPixel([61,157,208,128],[201,83,39,179],'multiply')).toEqual([...expected,217])
})
