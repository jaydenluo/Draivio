import { Blob as NodeBlob } from 'node:buffer'
import { createCanvas, loadImage } from 'batch-test-canvas'
import { expect, it } from 'vitest'
import { renderBatchImage } from './renderBatchImage'
import { defaultRecipe, type BatchRecipe } from './batchProcessor'
const releases:string[]=[]
function blobOf(bytes: Uint8Array|string,type='image/png'):Blob { return new NodeBlob([typeof bytes==='string'?bytes:new Uint8Array(bytes)],{type}) as unknown as Blob }
const deps={createCanvas:()=>{const canvas=createCanvas(1,1);return Object.assign(canvas,{toBlob(callback:(b:Blob|null)=>void,mime:string,quality:number){callback(blobOf(mime==='image/png'?canvas.toBuffer('image/png'):canvas.toBuffer(mime as 'image/jpeg'|'image/webp',Math.round(quality*100)),mime))}}) as unknown as HTMLCanvasElement},decode:async(blob:Blob)=>{const image=await loadImage(Buffer.from(await blob.arrayBuffer()));return {image:image as unknown as CanvasImageSource,width:image.width,height:image.height,release:()=>{releases.push('release')}}}}
function fixture(width:number,height:number){const c=createCanvas(width,height),ctx=c.getContext('2d');ctx.fillStyle='#ff0000';ctx.fillRect(0,0,width/2,height);ctx.fillStyle='#0000ff';ctx.fillRect(width/2,0,width/2,height);return blobOf(c.toBuffer('image/png'))}
async function pixels(blob:Blob){const image=await loadImage(Buffer.from(await blob.arrayBuffer())),c=createCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {width:image.width,height:image.height,at:(x:number,y:number)=>[...ctx.getImageData(x,y,1,1).data]}}
it('real PNG landscape/portrait fits preserve transparent padding and fill crops symmetrically',async()=>{
 const recipe:BatchRecipe={...defaultRecipe(),mode:'fixed',width:100,height:100}
 const fit=await pixels((await renderBatchImage(fixture(400,200),recipe,deps)).blob)
 expect(fit.at(50,10)[3]).toBe(0);expect(fit.at(10,50)).toEqual([255,0,0,255]);expect(fit.at(90,50)).toEqual([0,0,255,255])
 const portrait=await pixels((await renderBatchImage(fixture(200,400),recipe,deps)).blob);expect(portrait.at(10,50)[3]).toBe(0);expect(portrait.at(30,50)).toEqual([255,0,0,255])
 const fill=await pixels((await renderBatchImage(fixture(400,200),{...recipe,fit:'fill'},deps)).blob);expect(fill.at(10,10)).toEqual([255,0,0,255]);expect(fill.at(90,90)).toEqual([0,0,255,255])
})
it('real image watermark lands inside bottom-right margin and recipe roundtrip preserves pixels',async()=>{
 const wm=createCanvas(20,10);wm.getContext('2d').fillStyle='#00ff00';wm.getContext('2d').fillRect(0,0,20,10)
 const recipe:BatchRecipe={...defaultRecipe(),longEdge:100,preset:'mono',watermark:{...defaultRecipe().watermark,kind:'image',image:wm.toDataURL('image/png'),scale:0.2,opacity:1,margin:5}}
 const first=await renderBatchImage(fixture(100,100),recipe,deps),second=await renderBatchImage(fixture(100,100),JSON.parse(JSON.stringify(recipe)),deps),decoded=await pixels(first.blob)
 expect(decoded.at(76,86)).toEqual([0,255,0,255]);expect(decoded.at(96,96)).toEqual([18,18,18,255]);expect(Buffer.from(await first.blob.arrayBuffer())).toEqual(Buffer.from(await second.blob.arrayBuffer()))
})
it('real text watermark changes pixels only in the chosen corner and releases decode resources',async()=>{
 const base={...defaultRecipe(),longEdge:100},recipe:BatchRecipe={...base,watermark:{...base.watermark,kind:'text',text:'X',position:'top-left',scale:1,opacity:1,color:'#ffffff',margin:5}}
 const before=await pixels((await renderBatchImage(fixture(100,100),base,deps)).blob),after=await pixels((await renderBatchImage(fixture(100,100),recipe,deps)).blob)
 let changed=0;for(let y=5;y<40;y++)for(let x=5;x<45;x++)if(after.at(x,y).join()!==before.at(x,y).join())changed++
 expect(changed).toBeGreaterThan(30);expect(after.at(90,90)).toEqual(before.at(90,90));expect(releases.length).toBeGreaterThan(0)
})
it('encodes genuine JPEG/WebP at selected quality, white JPEG padding and reports corrupt input',async()=>{
 const base:BatchRecipe={...defaultRecipe(),mode:'fixed',width:100,height:100}
 for(const format of ['jpeg','webp'] as const){const result=await renderBatchImage(fixture(400,200),{...base,format,quality:0.7},deps);const bytes=new Uint8Array(await result.blob.arrayBuffer());if(format==='jpeg'){expect([...bytes.slice(0,2)]).toEqual([255,216]);expect((await pixels(result.blob)).at(10,10)).toEqual([255,255,255,255])}else expect(String.fromCharCode(...bytes.slice(8,12))).toBe('WEBP')}
 await expect(renderBatchImage(blobOf('corrupt'),base,deps)).rejects.toThrow()
})
it('real JPEG quality changes encoded size for a fixed noisy fixture',async()=>{
 const canvas=createCanvas(128,128),ctx=canvas.getContext('2d'),data=ctx.createImageData(128,128);let seed=7
 for(let i=0;i<data.data.length;i+=4){for(let c=0;c<3;c++){seed=(seed*1664525+1013904223)>>>0;data.data[i+c]=seed>>>24}data.data[i+3]=255}ctx.putImageData(data,0,0)
 const source=blobOf(canvas.toBuffer('image/png')),recipe:BatchRecipe={...defaultRecipe(),longEdge:128,format:'jpeg'}
 const low=await renderBatchImage(source,{...recipe,quality:0.1},deps),high=await renderBatchImage(source,{...recipe,quality:0.95},deps)
 expect(high.blob.size).toBeGreaterThan(low.blob.size*2)
})
it('embeds the saved F13 HSL preset and reproduces shared adjustment pixels after recipe roundtrip',async()=>{
 const { createPreset }=await import('../adjustments/presets'),{defaultHsl}=await import('../adjustments/hsl'),{normalizeRecipe}=await import('./batchProcessor')
 const hsl=defaultHsl();hsl.global.saturation=-100;const preset=createPreset('我的去色',hsl),recipe:BatchRecipe={...defaultRecipe(),longEdge:100,adjustmentPreset:preset}
 const saved=normalizeRecipe(JSON.parse(JSON.stringify(recipe)));preset.hsl.global.saturation=100
 const result=await pixels((await renderBatchImage(fixture(100,100),saved,deps)).blob),red=result.at(10,10),blue=result.at(90,10)
 expect(red).toEqual([128,128,128,255]);expect(blue).toEqual([128,128,128,255]);expect(saved.adjustmentPreset?.hsl.global.saturation).toBe(-100)
})
