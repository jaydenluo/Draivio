import { testMaskedIO } from './testIO'
import { expect, it } from 'vitest'
import { createCanvas, loadImage } from 'batch-test-canvas'
import { Resvg } from '@resvg/resvg-js'
import { prepareMaskedEdit, finishMaskedEdit, type MaskedEditIO } from './workflow'
import { initialEditorState, editorReducer, type EditorState } from '../../state/editor'
import { createSelection } from '../../canvas/selectionGeometry'
import { encodeProject, decodeProject } from '../../document/projectFormat'
const io=testMaskedIO
function state(width=12,height=8):EditorState{
 const source=io.encode({width:2,height:2,data:new Uint8ClampedArray([255,0,0,255,255,0,0,255,255,0,0,255,255,0,0,255])})
 return {...initialEditorState,documentWidth:width,documentHeight:height,documentBackground:'transparent',smartObjectSources:{},layers:[{id:'target',name:'rotated',className:'layer-art',source,visible:true,opacity:100,blendMode:'正常',transform:{kind:'transform',rect:{x:10,y:10,width:80,height:80},rotation:90,flipX:false,flipY:false}}],selectedLayerId:'target',selectedLayerIds:['target'],brushStrokes:[],canvasTexts:[],canvasShapes:[],layerMasks:{},aiResults:[],sceneOrder:[],selectionVisible:true,selection:{...createSelection('path',{x:0,y:0,width:100,height:100}),path:{type:'raster',rows:['100','010'],d:'M0 0H100V100H0Z',alpha:[0,128,0,0,255,0],alphaWidth:3,alphaHeight:2}},prompt:''}
}
for(const [width,height] of [[12,8],[8,12]])it(`renders rotated layer in ${width}x${height} document, maps crop and retains outside pixels`,async()=>{
 const s=state(width,height),prepared=await prepareMaskedEdit(s,'doc','transparent-edit',io)
 expect(prepared.provenance.operation).toBe('remove');expect(prepared.mask.some(v=>v===128)).toBe(true)
 const raw=io.encode({width:prepared.provenance.crop.width,height:prepared.provenance.crop.height,data:new Uint8ClampedArray(Array.from({length:prepared.provenance.crop.width*prepared.provenance.crop.height},()=>[0,0,255,255]).flat())})
 const finished=await finishMaskedEdit(prepared,raw,io),composite=await io.decode(finished.thumbnail)
 for(let p=0;p<prepared.mask.length;p++)if(!prepared.mask[p])expect([...composite.data.slice(p*4,p*4+4)]).toEqual([...prepared.pixels.data.slice(p*4,p*4+4)])
 expect(finished.provenance.raw?.source).toBe(raw)
 expect([...(await io.decode(finished.source)).data]).toEqual([...composite.data])
})
it('keeps candidates separate, supports replacement/undo, and reopens all PNG provenance without service',async()=>{
 let s=state();s.prompt='replace with blue'
 const prepared=await prepareMaskedEdit(s,'doc','transparent-edit',io)
 const raw=io.encode({width:prepared.provenance.crop.width,height:prepared.provenance.crop.height,data:new Uint8ClampedArray(Array.from({length:prepared.provenance.crop.width*prepared.provenance.crop.height},()=>[0,0,255,255]).flat())}),finished=await finishMaskedEdit(prepared,raw,io)
 const request={mode:'edit' as const,prompt:s.prompt,context:prepared.context,sourceLayerId:'target',selection:s.selection,parameters:s.composerParameters,maskedEdit:finished.provenance}
 s=editorReducer(s,{type:'add-ai-result',result:{id:'candidate',source:finished.source,thumbnail:finished.thumbnail,prompt:s.prompt,model:'gpt-image-1',provider:'test',size:'12x8',createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,request}})
 expect(s.layers).toHaveLength(1);expect(s.aiResults[0].adopted).toBe(false)
 const original=s.layers[0].source
 s=editorReducer(s,{type:'replace-layer-with-ai-result',targetId:'target',resultId:'candidate'})
 expect(s.layers[0].documentSpace).toBe(true);expect(s.layers[0].transform).toBeUndefined();expect(s.layers.find(l=>l.id==='target')?.source).toBe(original)
 s=editorReducer(s,{type:'undo'});expect(s.layers[0].source).toBe(original)
 const restored=decodeProject(await encodeProject(s,{id:'doc',name:'masked'})).document
 expect(restored.aiResults?.[0].request?.maskedEdit).toEqual(finished.provenance)
 expect(restored.aiResults?.[0].request?.maskedEdit?.raw?.source).toBe(raw)
})
it('refuses locked targets before rendering',async()=>{const s=state();s.layers[0].locked=true;await expect(prepareMaskedEdit(s,'doc','transparent-edit',io)).rejects.toThrow('锁定')})

import { captureEditorContext } from '../context/editorContext'
import { contextPreviewSvg } from '../context/editorPreview'
const rendered=async(s:EditorState)=>io.decode(await io.render(contextPreviewSvg(s,captureEditorContext(s,'doc','document')),s.documentWidth,s.documentHeight))
for(const adoption of ['add','replace'] as const)for(const transparent of [true,false])it(`adopt ${adoption} matches actual PNG preview for transparent=${transparent} multiply backdrop and survives hide/undo/project`,async()=>{
 let s=state(4,4);s.layers[0]={...s.layers[0],transform:undefined,blendMode:'正片叠底'};s.layers.push({id:'back',name:'cyan',source:io.encode({width:1,height:1,data:new Uint8ClampedArray([0,255,255,255])}),className:'layer-art',visible:true,opacity:100,blendMode:'正常'})
 s.selection={...createSelection('path',{x:0,y:0,width:100,height:100}),path:{type:'raster',rows:['0000','0100','0000','0000'],d:'',alpha:Array.from({length:16},(_,i)=>i===5?255:0),alphaWidth:4,alphaHeight:4}}
 const before=await rendered(s),prepared=await prepareMaskedEdit(s,'doc','transparent-edit',io)
 const raw=io.encode({width:prepared.provenance.crop.width,height:prepared.provenance.crop.height,data:new Uint8ClampedArray(Array.from({length:prepared.provenance.crop.width*prepared.provenance.crop.height},()=>transparent?[0,0,0,0]:[0,0,255,255]).flat())}),finished=await finishMaskedEdit(prepared,raw,io),expected=await io.decode(finished.thumbnail)
 s=editorReducer(s,{type:'add-ai-result',result:{id:'candidate',source:finished.source,thumbnail:finished.thumbnail,prompt:'',model:'gpt-image-1',provider:'fixture',size:'4x4',createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,request:{mode:'edit',prompt:'',context:prepared.context,sourceLayerId:'target',selection:s.selection,parameters:s.composerParameters,maskedEdit:finished.provenance}}})
 s=editorReducer(s,adoption==='add'?{type:'adopt-ai-result-as-layer',id:'candidate'}:{type:'replace-layer-with-ai-result',targetId:'target',resultId:'candidate'})
 expect([...(await rendered(s)).data]).toEqual([...expected.data])
 const reopened=decodeProject(await encodeProject(s,{id:'doc',name:'composite'})).document as EditorState
 expect([...(await rendered({...s,...reopened})).data]).toEqual([...expected.data])
 const readopted=editorReducer(s,{type:'adopt-ai-result-as-layer',id:'candidate'});expect(readopted.layers).toBe(s.layers);expect([...(await rendered(readopted)).data]).toEqual([...expected.data])
 const modified={...s,layers:s.layers.map(l=>l.id==='target'?{...l,name:'changed'}:l)};expect(editorReducer(modified,{type:'adopt-ai-result-as-layer',id:'candidate'}).layers).toHaveLength(s.layers.length)
 const id=s.selectedLayerId
 const extra={...s.layers.find(l=>l.id==='back')!,id:'later',source:io.encode({width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},(_,i)=>i===0?[255,255,0,255]:[0,0,0,0]).flat())})}
 const withLater={...s,layers:[extra,...s.layers]};expect([...(await rendered(withLater)).data.slice(0,4)]).toEqual([255,255,0,255])
 const changedOriginal={...s,layers:s.layers.map(l=>l.id==='back'?{...l,source:raw}:l)};expect([...(await rendered(changedOriginal)).data]).toEqual([...expected.data])
 const deleted=editorReducer(s,{type:'delete-layer',id});expect([...(await rendered(deleted)).data]).toEqual([...before.data])
 const hidden=editorReducer(s,{type:'toggle-layer',id});expect([...(await rendered(hidden)).data]).toEqual([...before.data])
 s=editorReducer(s,{type:'undo'});expect([...(await rendered(s)).data]).toEqual([...before.data])
},15000)


it('receives a candidate without consuming redo or a content undo slot',async()=>{
 let s=editorReducer(editorReducer(state(),{type:'rename-layer',id:'target',name:'future'}),{type:'undo'})
 const before=s,prepared=await prepareMaskedEdit(s,'doc','transparent-edit',io)
 const finished=await finishMaskedEdit(prepared,prepared.provenance.source.source,io)
 s=editorReducer(s,{type:'add-ai-result',result:{id:'history-safe',source:finished.source,thumbnail:finished.thumbnail,prompt:'',model:'gpt-image-1',provider:'test',size:'12x8',createdAt:'now',status:'success',favorite:false,adopted:false,request:{mode:'edit',prompt:'',context:prepared.context,sourceLayerId:'target',selection:s.selection,parameters:s.composerParameters,maskedEdit:finished.provenance}}})
 expect(s.layers).toBe(before.layers);expect(s.undoStack).toBe(before.undoStack);expect(s.redoStack).toBe(before.redoStack)
 expect(editorReducer(s,{type:'redo'}).layers.find(l=>l.id==='target')?.name).toBe('future')
})
for(const change of ['lock','opacity'] as const)it(`refuses to overwrite an adopted masked snapshot after ${change}`,async()=>{
 let s=state();const prepared=await prepareMaskedEdit(s,'doc','transparent-edit',io),finished=await finishMaskedEdit(prepared,prepared.provenance.source.source,io)
 s=editorReducer(s,{type:'add-ai-result',result:{id:'guarded',source:finished.source,thumbnail:finished.thumbnail,prompt:'',model:'gpt-image-1',provider:'test',size:'12x8',createdAt:'now',status:'success',favorite:false,adopted:false,request:{mode:'edit',prompt:'',context:prepared.context,sourceLayerId:'target',selection:s.selection,parameters:s.composerParameters,maskedEdit:finished.provenance}}})
 s=editorReducer(s,{type:'adopt-ai-result-as-layer',id:'guarded'})
 s=editorReducer(s,change==='lock'?{type:'toggle-layer-lock',id:s.selectedLayerId}:{type:'set-layer-opacity',id:s.selectedLayerId,opacity:50})
 for(const action of [{type:'adopt-ai-result-as-layer',id:'guarded'},{type:'replace-layer-with-ai-result',targetId:'target',resultId:'guarded'}] as const){
  const rejected=editorReducer(s,action);expect(rejected.layers).toBe(s.layers);expect(rejected.undoStack).toBe(s.undoStack)
 }
})
