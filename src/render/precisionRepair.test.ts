import { expect, it } from 'vitest'
import { initialEditorState } from '../state/editor'
import { createPixelBuffer, readNormalized } from './pixelBuffer'
import { packPrecisionAsset, unpackPrecisionAsset, toLinearPrecision, srgbPrecisionBuffer, validatePrecisionAsset } from './precisionAsset'
import { precisionPreviewBytes } from './precisionPreview'
import { processPrecision, convertPrecision, precisionMemoryEstimate } from './precisionPipeline'
import { renderPrecisionScene } from './precisionScene'
import { createSelection } from '../canvas/selectionGeometry'
import { rasterizeSelectionMask } from '../canvas/selectionRaster'

it('preserves native encoded16 samples, displays midpoint128, and processes exposure in linear light',async()=>{
 const asset=packPrecisionAsset(createPixelBuffer(1,1,'rgba16',[32768,32768,32768,65535]),'srgb')
 const linear=toLinearPrecision(JSON.parse(JSON.stringify(asset)))
 expect(precisionPreviewBytes(linear).data[0]).toBe(128)
 expect(readNormalized(linear,0)[0]).toBeCloseTo(.214048,5)
 const exposed=await processPrecision(linear,{exposureEV:1})
 expect(readNormalized(exposed,0)[0]).toBeCloseTo(.428096,5)
 const encoded=await convertPrecision(srgbPrecisionBuffer(linear),'rgba16')
 expect(encoded.data[0]).toBe(32768)
 expect(unpackPrecisionAsset(asset).data[0]).toBe(32768)
 expect(precisionPreviewBytes(toLinearPrecision(packPrecisionAsset(createPixelBuffer(1,1,'rgba32f',[.5,.5,.5,1])))).data[0]).toBe(188)
 expect(()=>validatePrecisionAsset({...asset,encoding:'unknown'})).toThrow(/编码/)
})
const scene=()=>({...initialEditorState,documentWidth:8,documentHeight:1,layers:[{id:'p',name:'p',className:'',visible:true,opacity:100,blendMode:'正常',contentWidth:8,contentHeight:1,highPrecision:packPrecisionAsset(createPixelBuffer(8,1,'rgba32f',Array(8).fill([1,1,1,1]).flat()))}],canvasShapes:[],canvasTexts:[],brushStrokes:[],layerMasks:{},sceneOrder:[]})
it('rejects visible attached vector text and brush content before export while allowing hidden shapes',async()=>{
 const base=scene()
 for(const key of ['canvasShapes','canvasTexts','brushStrokes'] as const) {
  await expect(renderPrecisionScene({...base,[key]:[{id:'a',layerId:'p'}]} as never)).rejects.toThrow(/内容/)
 }
 await expect(renderPrecisionScene({...base,canvasShapes:[{id:'a',layerId:'p',hidden:true}]} as never)).resolves.toBeDefined()
})
it('uses the same feathered and inverted selection alpha as document preview',async()=>{
 const selection={...createSelection('rectangle',{x:0,y:0,width:50,height:100}),feather:2}
 const expected=rasterizeSelectionMask(selection,8,1)
 for(const inverted of [false,true]) {
  const output=await renderPrecisionScene({...scene(),layerMasks:{p:{selection,strokes:[],applied:true,inverted}}})
  for(let i=0;i<8;i++)expect(readNormalized(output,i)[3]).toBeCloseTo(inverted?1-expected[i]/255:expected[i]/255,6)
 }
})
it('rejects4096-square working and serialized assets before allocation within a conservative512MiB budget',()=>{
 const before=process.memoryUsage()
 for(const format of ['rgba16','rgba32f'] as const) {
  expect(()=>precisionMemoryEstimate(4096,4096,format)).toThrow(/预算/)
  expect(()=>validatePrecisionAsset({width:4096,height:4096,format,data:''})).toThrow(/预算/)
  expect(()=>packPrecisionAsset({width:4096,height:4096,format,data:new Uint16Array(0)})).toThrow(/预算/)
 }
 const after=process.memoryUsage()
 console.log('F30 safe4096 preflight actual bytes',JSON.stringify({before,after,deltaArrayBuffers:after.arrayBuffers-before.arrayBuffers,deltaRss:after.rss-before.rss}))
 expect(after.arrayBuffers-before.arrayBuffers).toBeLessThan(1024*1024)
})

import { assertPrecisionProjectBudget, encodeProject } from '../document/projectFormat'
it('preflights aggregate project resources and excludes undo stacks before cloning',async()=>{
 const placeholder={width:2048,height:2048,format:'rgba32f',data:''}
 expect(()=>assertPrecisionProjectBudget({layers:Array(3).fill({highPrecision:placeholder})})).toThrow(/预算/)
 const base=scene()
 // A failing toJSON in omitted transient history proves it is never cloned.
 const undoStack=[{toJSON(){throw new Error('must not clone undo')}}]
 await expect(encodeProject({...base,undoStack} as never,{id:'p',name:'p'})).resolves.toContain('"encoding":"linear"')
})
