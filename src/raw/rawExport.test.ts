import {it,expect,vi} from 'vitest'
import {Resvg} from '@resvg/resvg-js'
import {inflateSync} from 'node:zlib'
import samples from '../../docs/raw/real-sample-evidence.json'
import {exportRawPreview} from './rawExport'
import {defaultProfile,transformProfileRgba} from '../color/iccPipeline'
import type {RawDecodeResult} from './rawPipeline'
function encode(rgba:Uint8ClampedArray){return new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1">${[0,1].map(i=>`<rect x="${i}" width="1" height="1" fill="rgb(${rgba[i*4]},${rgba[i*4+1]},${rgba[i*4+2]})"/>`).join('')}</svg>`).render().asPng()}
it.each(samples)('exports real $sample.make RAW pixels through ICC with embedded target profile',async sample=>{
 let pixels=Uint8ClampedArray.from(sample.iccExportFixture.rgba16,n=>Math.round(n/257));const original=pixels.slice();const profile=defaultProfile('display-p3')
 const expected=await transformProfileRgba(pixels,2,1,defaultProfile(),profile)
 const png=encode(pixels),preview=`data:image/png;base64,${Buffer.from(png).toString('base64')}`
 const canvas=document.createElement('canvas'),context={drawImage:vi.fn(),getImageData:()=>({data:pixels}),putImageData:(image:ImageData)=>{pixels=new Uint8ClampedArray(image.data)}}
 vi.spyOn(canvas,'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
 vi.spyOn(canvas,'toBlob').mockImplementation(cb=>cb(new Blob([new Uint8Array(encode(pixels))],{type:'image/png'})))
 const blob=await exportRawPreview({asset:{width:2,height:1},preview} as RawDecodeResult,profile,{createCanvas:()=>canvas,decodeSvg:async()=>({image:canvas,width:2,height:1})})
 expect(pixels).toEqual(expected);expect(pixels).not.toEqual(original)
 const bytes=new Uint8Array(await blob.arrayBuffer());let embedded:Uint8Array|undefined
 for(let i=8;i+12<=bytes.length;){const n=new DataView(bytes.buffer).getUint32(i),type=new TextDecoder().decode(bytes.slice(i+4,i+8));if(type==='iCCP'){const d=bytes.slice(i+8,i+8+n);embedded=new Uint8Array(inflateSync(d.slice(d.indexOf(0)+2)))}i+=n+12}
 expect(embedded).toEqual(profile.bytes)
 // Independently rasterize the exported PNG, which includes converted RGB pixels.
 const decoded=new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="1"><image href="data:image/png;base64,${Buffer.from(bytes).toString('base64')}" width="2" height="1"/></svg>`).render().pixels
 expect(Array.from(decoded)).toEqual(Array.from(expected))
})
