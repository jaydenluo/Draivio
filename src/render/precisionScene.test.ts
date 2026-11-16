import { expect,it } from 'vitest'
import { initialEditorState, type EditorState, type Layer } from '../state/editor'
import { packPrecisionAsset } from './precisionAsset'
import { createPixelBuffer, readNormalized } from './pixelBuffer'
import { renderPrecisionScene } from './precisionScene'
import { createSelection } from '../canvas/selectionGeometry'

const layer=(id:string,rgba:number[],extra:Partial<Layer>={}):Layer=>({id,name:id,className:'',kind:'image',visible:true,opacity:100,blendMode:'正常',contentWidth:2,contentHeight:1,highPrecision:packPrecisionAsset(createPixelBuffer(2,1,'rgba32f',[...rgba,...rgba])),...extra})
const state=(layers:Layer[]):EditorState=>({...initialEditorState,documentWidth:2,documentHeight:1,documentBackground:'transparent',layers,canvasShapes:[],canvasTexts:[],brushStrokes:[],layerMasks:{},sceneOrder:[]})
it('composites true HDR originals using scene-linear samples and opacity',async()=>{
  const s=state([layer('top',[.5,.5,.5,.5]),layer('base',[2,1,.5,1])])
  expect(readNormalized(await renderPrecisionScene(s),0)).toEqual([1.25,.75,.5,1])
  const multiply={...s,layers:s.layers.map(l=>l.id==='top'?{...l,blendMode:'正片叠底'}:l)}
  expect(readNormalized(await renderPrecisionScene(multiply),0)[0]).toBe(1.5)
})
it('uses affine placement and selection masks without quantizing original source',async()=>{
  const s=state([layer('image',[2.5,1,0,1])]);s.layerMasks={image:{selection:createSelection('rectangle',{x:0,y:0,width:50,height:100}),strokes:[],applied:true,inverted:false}}
  const out=await renderPrecisionScene(s)
  expect(readNormalized(out,0)[0]).toBe(2.5);expect(readNormalized(out,1)[3]).toBe(0)
})
it('isolates group opacity once and refuses content unsupported by the high precision renderer',async()=>{
  const group:Layer={id:'g',name:'g',className:'',kind:'group',visible:true,opacity:50,blendMode:'正常',children:['a','b']}
  const s=state([group,layer('a',[2,0,0,1],{groupId:'g'}),layer('b',[0,1,0,1],{groupId:'g'})])
  expect(readNormalized(await renderPrecisionScene(s),0)).toEqual([2,0,0,.5])
  await expect(renderPrecisionScene(state([{...layer('ordinary',[1,1,1,1]),highPrecision:undefined,source:'data:image/png;base64,x'}]))).rejects.toThrow(/高精度原始/)
  const abort=new AbortController();abort.abort();await expect(renderPrecisionScene(s,{signal:abort.signal})).rejects.toThrow(/取消/)
})
