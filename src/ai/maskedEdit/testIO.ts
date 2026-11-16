import { createCanvas, loadImage } from 'batch-test-canvas'
import { Resvg } from '@resvg/resvg-js'
import type { MaskedEditIO } from './workflow'
// Keep real fonts for any text protection fixture, but do not scan fonts for image-only snapshots.
export const testMaskedIO:MaskedEditIO={
 render:async(svg)=>`data:image/png;base64,${new Resvg(svg,{font:{loadSystemFonts:/<text\b/.test(svg)}}).render().asPng().toString('base64')}`,
 decode:async(source)=>{const image=await loadImage(source);const canvas=createCanvas(image.width,image.height);const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {width:image.width,height:image.height,data:new Uint8ClampedArray(ctx.getImageData(0,0,image.width,image.height).data)}},
 encode:image=>{const canvas=createCanvas(image.width,image.height);const ctx=canvas.getContext('2d');const data=ctx.createImageData(image.width,image.height);data.data.set(image.data);ctx.putImageData(data,0,0);return canvas.toDataURL('image/png')}
}
