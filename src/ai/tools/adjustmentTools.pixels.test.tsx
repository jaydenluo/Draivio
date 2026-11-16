import { Blob as NodeBlob } from 'node:buffer'
import { writeFileSync } from 'node:fs'
import { expect,it } from 'vitest'
import { createCanvas,loadImage } from 'batch-test-canvas'
import { Resvg } from '@resvg/resvg-js'
import { renderToStaticMarkup } from 'react-dom/server'
import { materializeColorAdjustments,type DecodedSvg } from '../../render/exportImage'
import { SmartFilterGraph } from '../../render/SmartFilterGraph'
import { applySmartFilters } from '../../render/filterPipeline'
import { initialEditorState } from '../../state/editor'
import { executeAdjustmentCommand } from './adjustmentTools'
import { createSelection,invertSelection } from '../../canvas/selectionGeometry'
import { rasterizeSelectionMask } from '../../canvas/selectionRaster'
import { encodeProject,decodeProject } from '../../document/projectFormat'
const deps={createCanvas:()=>{const c=createCanvas(1,1);return Object.assign(c,{toBlob:(callback:(b:Blob)=>void)=>callback(new NodeBlob([new Uint8Array(c.toBuffer('image/png'))],{type:'image/png'}) as unknown as Blob)}) as unknown as HTMLCanvasElement},decodeSvg:async(source:string):Promise<DecodedSvg>=>{const r=new Resvg(source).render(),image=await loadImage(Buffer.from(r.asPng()));return {image:image as unknown as CanvasImageSource,width:r.width,height:r.height}}}
const raster=(svg:string)=>new Resvg(svg).render()
it('shares actual preview/export CPU pixels for color card, skin and gradient with feather and inverse selection; preserves stage order and project roundtrip',async()=>{
 const b=structuredClone(initialEditorState);b.documentWidth=24;b.documentHeight=12;b.selectionVisible=true;b.selection=invertSelection({...createSelection('rectangle',{x:25,y:0,width:25,height:100}),feather:1})
 let a=executeAdjustmentCommand(b,{op:'adjustment',layerId:'art',key:'temperature',value:30,scope:'selection'});a=executeAdjustmentCommand(a,{op:'adjustment',layerId:'art',key:'hsl.red.saturation',value:-30,scope:'selection'});const chain=a.layers[0].smartFilters!
 const children=<><defs><linearGradient id="gradient"><stop stopColor="#202020"/><stop offset="1" stopColor="#e0e0e0"/></linearGradient></defs><rect width="24" height="12" fill="url(#gradient)"/><rect width="4" height="6" fill="#ee3030"/><rect x="4" width="4" height="6" fill="#e0a080"/><rect x="8" width="4" height="6" fill="#2070dd"/></>
 const svg=(enabled:boolean)=>renderToStaticMarkup(<svg xmlns="http://www.w3.org/2000/svg" width="24" height="12">{enabled?<SmartFilterGraph chain={chain} width={24} height={12}>{children}</SmartFilterGraph>:children}</svg>)
 const before=raster(svg(false)),expected=await applySmartFilters(new Uint8ClampedArray(before.pixels),24,12,chain),preview=await materializeColorAdjustments(svg(true),deps),exported=await materializeColorAdjustments(svg(true),deps)
 expect(raster(preview).pixels).toEqual(Buffer.from(expected));expect(raster(exported).pixels).toEqual(raster(preview).pixels);expect(expected).not.toEqual(new Uint8ClampedArray(before.pixels));const mask=rasterizeSelectionMask(chain.items[0].selection!,24,12);for(let i=0;i<mask.length;i++)if(mask[i]===0)expect(expected.slice(i*4,i*4+4)).toEqual(new Uint8ClampedArray(before.pixels.slice(i*4,i*4+4)))
 const loaded=decodeProject(await encodeProject(a,{id:'color',name:'color'})).document.layers[0].smartFilters!;expect(await applySmartFilters(new Uint8ClampedArray(before.pixels),24,12,loaded)).toEqual(expected)
 writeFileSync('/tmp/color-ai-before.png',before.asPng());writeFileSync('/tmp/color-ai-after.png',raster(exported).asPng())
})
it('preserves declared noncommutative local stage order',async()=>{const b=structuredClone(initialEditorState);b.selectionVisible=true;b.selection=createSelection('rectangle',{x:0,y:0,width:100,height:100});let a=executeAdjustmentCommand(b,{op:'adjustment',layerId:'art',key:'exposureEV',value:2,scope:'selection'});a={...a,selection:createSelection('rectangle',{x:0,y:0,width:50,height:100})};a=executeAdjustmentCommand(a,{op:'adjustment',layerId:'art',key:'highlights',value:-80,scope:'selection'});const chain=a.layers[0].smartFilters!,p=new Uint8ClampedArray([180,150,130,255,70,90,120,255]);expect(chain.items).toHaveLength(2);const forward=await applySmartFilters(p,2,1,chain),reverse=await applySmartFilters(p,2,1,{items:[...chain.items].reverse()});expect(forward).not.toEqual(reverse)})
