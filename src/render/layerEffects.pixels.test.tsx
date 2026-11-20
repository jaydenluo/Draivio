import {expect,it} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {Resvg} from '@resvg/resvg-js'
import {LayerEffectsFilter} from './LayerEffectsFilter'
import {defaultEffect,type EffectKind} from './layerEffects'
// Font scanning is irrelevant to image/shape fixtures. The text case still uses real system fonts.
const renderOptions=(content:string)=>({font:{loadSystemFonts:/<text\b/.test(content)}})
function pixels(kind:EffectKind,content='<rect x="8" y="8" width="8" height="8" fill="red"/>',patch={}){const effect={...defaultEffect(kind),...patch}; const enabled=effect.enabled !== false;const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs>${renderToStaticMarkup(<svg><LayerEffectsFilter id="f" effects={{version:1,items:[effect]}} width={32} height={32}/></svg>)}</defs><g ${enabled?'filter="url(#f)"':''}>${content}</g></svg>`;return new Resvg(svg,renderOptions(content)).render().pixels}
const at=(p:Uint8Array,x:number,y:number)=>[...p.slice((y*32+x)*4,(y*32+x)*4+4)]
it('renders all five effect graphs with real pixels',()=>{expect(at(pixels('colorOverlay','<rect x="8" y="8" width="8" height="8" fill="red"/>',{color:'#00ff00'}),12,12)).toEqual([0,255,0,255]);expect(at(pixels('shadow'),19,19)[3]).toBeGreaterThan(0);expect(at(pixels('innerShadow'),9,9)[0]).toBeLessThan(255);expect(at(pixels('stroke'),7,12)[3]).toBeGreaterThan(0);const gradient=pixels('gradientOverlay');expect(at(gradient,9,12)).not.toEqual(at(gradient,14,12))})
it('implements inside center outside stroke and transparent flood',()=>{for(const [position,outer] of [['inside',false],['center',true],['outside',true]] as const){const p=pixels('stroke',undefined,{position,width:4,color:'#00ff00'});expect(at(p,7,12)[3]>0,position).toBe(outer)}expect(at(pixels('colorOverlay',undefined,{color:'#00ff0000'}),12,12)).toEqual([255,0,0,255])})
it('covers five effects on transparent image edges, text, shape and isolated group pixels',()=>{
 const imagePng=Buffer.from(new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><rect x="2" y="2" width="8" height="8" fill="red" opacity="0.5"/></svg>',{font:{loadSystemFonts:false}}).render().asPng()).toString('base64')
 const contents=[`<image href="data:image/png;base64,${imagePng}" x="8" y="8" width="12" height="12"/>`,'<text x="6" y="22" font-family="sans-serif" font-size="18" fill="red">A</text>','<path d="M8 8H18V18H8Z" fill="red"/>','<g><rect x="8" y="8" width="8" height="8" fill="red"/><rect x="16" y="8" width="5" height="8" fill="blue"/></g>']
 for(const content of contents){const render=(kind:EffectKind,enabled:boolean)=>new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><defs>${renderToStaticMarkup(<svg><LayerEffectsFilter id="f" effects={{version:1,items:[{...defaultEffect(kind),enabled}]}} width={32} height={32}/></svg>)}</defs><g ${enabled?'filter="url(#f)"':''}>${content}</g></svg>`,renderOptions(content)).render().pixels
 const baseline=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">${content}</svg>`,renderOptions(content)).render().pixels
 for(const kind of ['shadow','stroke','innerShadow','colorOverlay','gradientOverlay'] as EffectKind[]){const enabled=render(kind,true),disabled=render(kind,false);expect(enabled.some((v,i)=>v!==baseline[i]),kind).toBe(true);expect(disabled.some((v,i)=>v!==baseline[i]),kind).toBe(false)}
 }
})
it('extends shadow support beyond source object bounds without filter clipping',()=>{const p=pixels('shadow','<rect x="0" y="8" width="4" height="4" fill="red"/>',{distance:10,angle:0,blur:0,opacity:100,color:'#0000ff'});expect(at(p,12,9)).toEqual([0,0,255,255])})
it('keeps opaque source colors intact when adding an outer shadow',()=>{
 const p=pixels('shadow','<rect x="4" y="4" width="20" height="20" fill="red"/>',{blur:0,distance:4,angle:0})
 expect(at(p,12,12)).toEqual([255,0,0,255])
 expect(at(p,26,12)[3]).toBeGreaterThan(0)
})
it.each(['colorOverlay','gradientOverlay'] as EffectKind[])('%s preserves semi-transparent source alpha',kind=>{
 const p=pixels(kind,'<rect x="8" y="8" width="8" height="8" fill="red" opacity="0.5"/>',{color:'#00ff00'})
 expect(at(p,12,12)[3]).toBe(128)
 if(kind==='colorOverlay')expect(at(p,12,12).slice(0,3)).toEqual([0,128,0])
})
it('renders gradient reverse, radial, scale, offsets and gradient stroke',()=>{
 const linear=pixels('gradientOverlay',undefined,{angle:0,reverse:false})
 const reverse=pixels('gradientOverlay',undefined,{angle:0,reverse:true})
 expect(at(linear,10,12)).not.toEqual(at(reverse,10,12))
 const radial=pixels('gradientOverlay',undefined,{gradientType:'radial',scale:50,offsetX:-25})
 expect(at(radial,10,12)).not.toEqual(at(linear,10,12))
 const stroke=pixels('stroke',undefined,{fillType:'gradient',width:4,angle:0})
 expect(at(stroke,6,9)).not.toEqual(at(stroke,17,9))
})
it.each(['colorOverlay','gradientOverlay','innerShadow'] as EffectKind[])('%s at zero opacity does not alter transparent source pixels',kind=>{
 const p=pixels(kind,'<rect x="8" y="8" width="8" height="8" fill="red" opacity="0.5"/>',{opacity:0})
 expect(at(p,12,12)).toEqual([128,0,0,128])
})
it('blends a color overlay without increasing source alpha',()=>{
 const p=pixels('colorOverlay','<rect x="8" y="8" width="8" height="8" fill="#808080" opacity="0.5"/>',{color:'#808080',blendMode:'multiply'})
 expect(at(p,12,12)[3]).toBe(128);expect(at(p,12,12)[0]).toBeCloseTo(32,0)
})
