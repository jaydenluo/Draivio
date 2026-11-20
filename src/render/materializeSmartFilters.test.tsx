import { Blob as NodeBlob } from 'node:buffer'
import {expect,it,vi} from 'vitest'
import {createCanvas,loadImage} from 'batch-test-canvas'
import {Resvg} from '@resvg/resvg-js'
import {renderToStaticMarkup} from 'react-dom/server'
import {materializeColorAdjustments,type DecodedSvg} from './exportImage'
import { toneFilterNames } from '../filters/tone'
import {SmartFilterGraph} from './SmartFilterGraph'
import {createSmartFilter,applySmartFilters,type SmartFilterKind} from './filterPipeline'
import { createInteractiveFilter, filterAddItems, type AddableFilter } from '../layers/smartFilterControls'
import { createSelection } from '../canvas/selectionGeometry'
import { rasterizeSelectionMask } from '../canvas/selectionRaster'
// These SVG fixtures contain no text; avoid an unrelated system-font scan per rasterization.
const deps={createCanvas:()=>{const c=createCanvas(1,1);return Object.assign(c,{toBlob:(callback:(b:Blob)=>void)=>callback(new NodeBlob([new Uint8Array(c.toBuffer('image/png'))],{type:'image/png'}) as unknown as Blob)}) as unknown as HTMLCanvasElement},decodeSvg:async(source:string):Promise<DecodedSvg>=>{const r=new Resvg(source,{font:{loadSystemFonts:false}}).render(),image=await loadImage(Buffer.from(r.asPng()));return {image:image as unknown as CanvasImageSource,width:r.width,height:r.height}}}
const raster=(svg:string)=>new Resvg(svg,{font:{loadSystemFonts:false}}).render().pixels

it('every filter offered in the menu changes real pixels in a mixed image and shape layer, including inside a captured selection', async () => {
 const width = 32, height = 32
 const texture = createCanvas(width, height)
 const paint = texture.getContext('2d')
 const pixels = paint.createImageData(width, height)
 for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  const i = (y * width + x) * 4
  const noise = (x * 31 + y * 17) % 43
  pixels.data.set([x * 5 + noise, y * 4 + 20, 110 + noise, 255], i)
 }
 paint.putImageData(pixels, 0, 0)
 const artwork = <><image href={texture.toDataURL()} width={width} height={height}/><rect x="10" y="8" width="12" height="12" fill="#ab6e35"/></>
 const svg = (filter?: ReturnType<typeof createSmartFilter>, selection?: ReturnType<typeof createSelection>) => renderToStaticMarkup(
  <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height}>
   <SmartFilterGraph chain={filter && { items: [filter], selection }} width={width} height={height}>{artwork}</SmartFilterGraph>
  </svg>,
 )
 const original = raster(svg())
 const selection = createSelection('ellipse', { x: 15, y: 15, width: 70, height: 70 })
 const coverage = rasterizeSelectionMask(selection, width, height)
 for (const { id } of filterAddItems()) {
  const filter = createInteractiveFilter(id.slice('filter-add:'.length) as AddableFilter, id)
  const whole = raster(await materializeColorAdjustments(svg(filter), deps))
  const local = raster(await materializeColorAdjustments(svg(filter, selection), deps))
  expect(whole, filter.kind).not.toEqual(original)
  let changedInside = false
  let changedOutside = false
  for (let pixel = 0; pixel < coverage.length; pixel++) {
   for (let channel = 0; channel < 4; channel++) {
    const index = pixel * 4 + channel
    if (local[index] === original[index]) continue
    if (coverage[pixel]) changedInside = true
    else changedOutside = true
   }
  }
  expect(changedInside, filter.kind).toBe(true)
  expect(changedOutside, filter.kind).toBe(false)
 }
}, 20000)

it('inlines a leased desktop image before filtering, preserves unrelated pixels, and surfaces read failures', async () => {
 const texture = createCanvas(4, 4)
 const paint = texture.getContext('2d')
 paint.fillStyle = '#fa320a'
 paint.fillRect(0, 0, 4, 4)
 const url = `http://draivio-image.localhost/${'a'.repeat(48)}/${'b'.repeat(48)}?revision=1`
 const blob = new Blob([new Uint8Array(texture.toBuffer('image/png'))], { type: 'image/png' })
 const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, blob: async () => blob } as Response)
 try {
  const source = renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="8" height="4">
   <SmartFilterGraph chain={{ items: [{ ...createSmartFilter('invert', 'invert'), amount: 1 }] }} width={4} height={4}>
    <image href={url} width="4" height="4"/>
   </SmartFilterGraph>
   <image href={url} x="4" width="4" height="4"/>
  </svg>)
  const rendered = raster(await materializeColorAdjustments(source, deps))
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect([...rendered.slice(0, 4)]).toEqual([5, 205, 245, 255])
  expect([...rendered.slice(16, 20)]).toEqual([250, 50, 10, 255])
  fetcher.mockResolvedValue({ ok: false } as Response)
  await expect(materializeColorAdjustments(source, deps)).rejects.toThrow('无法读取本地图片预览')
 } finally { fetcher.mockRestore() }
})
it('all common kinds share awaited actual CPU pixels between preview/export; outside mask unchanged',async()=>{
 for(const kind of ['motion','radial','pixelate','grain','vignette', ...Object.keys(toneFilterNames)] as SmartFilterKind[]){const filter={...createSmartFilter(kind,kind),radius:kind==='radial'?50:2,amount:.6,size:3,seed:7,angle:45},chain={items:[filter],mask:{enabled:true,inverted:false,rect:{x:30,y:20,width:40,height:60}}};const children=<><rect width="12" height="12" fill="#304060"/><rect x="5" y="2" width="2" height="8" fill="#cc8060"/></>;const render=(filtered:boolean)=>renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12">{filtered?<SmartFilterGraph chain={chain} width={12} height={12}>{children}</SmartFilterGraph>:children}</svg>);const original=raster(render(false)),expected=await applySmartFilters(new Uint8ClampedArray(original),12,12,chain),materialized=await materializeColorAdjustments(render(true),deps),actual=raster(materialized);expect([...actual],kind).toEqual([...expected]);expect(materialized).not.toContain('data-cpu-smart-filters');expect([...actual.slice(0,12*4)]).toEqual([...original.slice(0,12*4)]);expect(raster(await materializeColorAdjustments(render(true),deps))).toEqual(actual)}
},20000)
it('CPU capability marker is absent for neutral defaults and disabled kinds',()=>{for(const kind of ['motion','radial','pixelate','grain','vignette', ...Object.keys(toneFilterNames)] as SmartFilterKind[]){const svg=renderToStaticMarkup(<svg><SmartFilterGraph chain={{items:[createSmartFilter(kind,kind)]}} width={10} height={10}><rect width="10" height="10"/></SmartFilterGraph></svg>);expect(svg).not.toContain('data-cpu-smart-filters')}})
it('captured ellipse selection preserves every outside pixel and persists through project undo redo',async()=>{
 const {createSelection}=await import('../canvas/selectionGeometry'),{rasterizeSelectionMask}=await import('../canvas/selectionRaster'),{initialEditorState,editorReducer}=await import('../state/editor'),{encodeProject,decodeProject}=await import('../document/projectFormat'),{CanvasScene}=await import('../canvas/CanvasScene')
 let s=structuredClone(initialEditorState);s.documentWidth=12;s.documentHeight=12;s.documentBackground='transparent';s.layers=[{id:'art',name:'f',className:'layer-art',visible:true,opacity:100,blendMode:'正常'}];s.brushStrokes=[];s.canvasTexts=[];s.layerMasks={};s.canvasShapes=[{id:'x',layerId:'art',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#408080',strokeWidth:0}];s.sceneOrder=['x'];s.selectedLayerIds=['art'];s.selectedLayerId='art'
 const selection=createSelection('ellipse',{x:25,y:25,width:50,height:50}),filter={...createSmartFilter('invert','g'),amount:.5},next=editorReducer(s,{type:'set-smart-filters',id:'art',chain:{items:[filter],selection}})
 const render=async(state:typeof s)=>raster(await materializeColorAdjustments(new DOMParser().parseFromString(renderToStaticMarkup(<CanvasScene state={state}/>),'text/html').querySelector('svg')!.outerHTML,deps)),before=await render(s),after=await render(next),mask=rasterizeSelectionMask(selection,12,12)
 let changes=0;for(let i=0;i<mask.length;i++){if(mask[i]===0)expect([...after.slice(i*4,i*4+4)]).toEqual([...before.slice(i*4,i*4+4)]);else if(after[i*4]!==before[i*4])changes++}expect(changes).toBeGreaterThan(10)
 const saved=await encodeProject(next,{id:'common',name:'saved'}),restored={...s,...decodeProject(saved).document};expect(await render(restored)).toEqual(after);expect(await render(editorReducer(next,{type:'undo'}))).toEqual(before);expect(await render(editorReducer(editorReducer(next,{type:'undo'}),{type:'redo'}))).toEqual(after);expect(next.layers[0].source).toBeUndefined()
},20000)
it('cancelled materialization refuses publication and oversized layers report a concrete limit',async()=>{const {materializeSmartFilters}=await import('./materializeSmartFilters');const chain={items:[{...createSmartFilter('motion','m'),radius:4}]};const marked=(w:number,h:number)=>renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><SmartFilterGraph chain={chain} width={w} height={h}><rect width="12" height="12" fill="red"/></SmartFilterGraph></svg>);const c=new AbortController();await expect(materializeSmartFilters(marked(12,12),{...deps,decodeSvg:async(s)=>{c.abort();return deps.decodeSvg(s)}},{signal:c.signal})).rejects.toThrow(/取消/);await expect(materializeSmartFilters(marked(5000,5000),deps)).rejects.toThrow(/1600 万/);})
it('advanced CPU layer pipeline preserves ancestor transform, opacity and blending exactly once',async()=>{const {CanvasScene}=await import('../canvas/CanvasScene'),{initialEditorState}=await import('../state/editor');const state=structuredClone(initialEditorState);state.documentWidth=12;state.documentHeight=12;state.documentBackground='#fff';state.layers=[{id:'art',name:'effect',className:'layer-art',source:undefined,visible:true,opacity:50,blendMode:'正片叠底',transform:{kind:'transform',rect:{x:25,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false},smartFilters:{items:[{...createSmartFilter('vignette','v'),amount:1}]}}];state.canvasTexts=[];state.brushStrokes=[];state.layerMasks={};state.canvasShapes=[{id:'r',layerId:'art',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#ff0000',strokeWidth:0}];state.sceneOrder=['r'];const rendered=await materializeColorAdjustments(new DOMParser().parseFromString(renderToStaticMarkup(<CanvasScene state={state}/>),'text/html').querySelector('svg')!.outerHTML,deps),p=raster(rendered);expect([...p.slice((6*12+0)*4,(6*12+0)*4+4)]).toEqual([255,255,255,255]);const center=[...p.slice((6*12+9)*4,(6*12+9)*4+4)];expect(center[0]).toBeGreaterThan(240);expect(center[1]).toBe(128);expect(center[3]).toBe(255)})
it('final real encoded PNG export equals CPU preview image bytes after decode',async()=>{const {exportSvgImage}=await import('./exportImage');const chain={items:[{...createSmartFilter('grain','g'),amount:.3,seed:53}]},svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12"><SmartFilterGraph chain={chain} width={12} height={12}><rect width="12" height="12" fill="#808080"/></SmartFilterGraph></svg>);const preview=raster(await materializeColorAdjustments(svg,deps)),blob=await exportSvgImage(svg,{format:'png',width:12,height:12},deps),encoded=Buffer.from(await blob.arrayBuffer());expect([...encoded.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);const img=await loadImage(encoded),canvas=createCanvas(12,12),ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);expect([...ctx.getImageData(0,0,12,12).data]).toEqual([...preview])})
it('actual derived PNG motion at transparent edges stays red with premultiplied alpha, without black fringe',async()=>{const chain={items:[{...createSmartFilter('motion','m'),radius:2,angle:0}]};const svg=renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="9" height="9"><SmartFilterGraph chain={chain} width={9} height={9}><rect x="4" y="4" width="1" height="1" fill="red"/></SmartFilterGraph></svg>),p=raster(await materializeColorAdjustments(svg,deps));for(let x=2;x<=6;x++){const i=(4*9+x)*4;expect(p[i+3]).toBe(51);expect(p[i]).toBe(p[i+3]);expect(p[i+1]).toBe(0);expect(p[i+2]).toBe(0)}})
