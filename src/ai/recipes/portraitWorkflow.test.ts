import {it,expect} from 'vitest'
import {initialEditorState,editorReducer} from '../../state/editor'
import {createSelection} from '../../canvas/selectionGeometry'
import {solidImage} from '../../engine/raster/composite'
import {defaultPortraitSettings,type PortraitMasks} from './portrait'
import {capturePortraitRegions,createPortraitCandidate,adoptPortraitCandidate} from './portraitWorkflow'
import {encodeProject,decodeProject} from '../../document/projectFormat'
const ellipse=(x:number,y:number,w:number,h:number)=>createSelection('ellipse',{x,y,width:w,height:h})
const masks:PortraitMasks={confirmed:true,person:ellipse(0,0,100,100),skin:ellipse(20,20,60,60),eyes:ellipse(25,30,50,10)}
const state=()=>({...structuredClone(initialEditorState),documentWidth:32,documentHeight:32,layers:[{id:'p',name:'portrait',source:'data:image/png;base64,AA==',kind:'image' as const,className:'layer-art',opacity:100,blendMode:'正常',visible:true}],artboards:[{id:'b',name:'photo',x:0,y:0,width:32,height:32,background:'transparent',layerIds:['p']}],activeArtboardId:'b',selectedLayerId:'p',selectedLayerIds:['p'],canvasTexts:[],canvasShapes:[],brushStrokes:[],layerMasks:{},sceneOrder:[]})
const io={decode:async()=>solidImage(32,32,[120,90,70,255]),encode:()=> 'data:image/png;base64,iVBORw0KGgo='}
it('captures document/target basis, previews privately, rejects stale target and supports one undo plus project masks',async()=>{
 const original=state(),regions=capturePortraitRegions(original,'doc',masks)
 const candidate=await createPortraitCandidate(original,'doc',regions,defaultPortraitSettings(),{io})
 expect(original.layers).toHaveLength(1);expect(candidate.state.layers.length).toBeGreaterThan(1)
 const adopted=adoptPortraitCandidate(candidate,original,'doc')
 expect(adopted.undoStack).toHaveLength(1);expect(adopted.layers.find(l=>l.id==='p')?.source).toBe(original.layers[0].source)
 expect(editorReducer(adopted,{type:'undo'}).layers).toEqual(original.layers)
 const restored=decodeProject(await encodeProject(adopted,{id:'portrait',name:'portrait'})).document
 expect(restored.layerMasks).toEqual(adopted.layerMasks)
 expect(()=>adoptPortraitCandidate(candidate,{...original,layers:original.layers.map(l=>({...l,opacity:50}))},'doc')).toThrow('过期')
 expect(()=>adoptPortraitCandidate(candidate,original,'other-doc')).toThrow('过期')
})
it('rejects source changes since mask capture and locked/non-RGB8 targets',async()=>{
 const original=state(),regions=capturePortraitRegions(original,'doc',masks)
 await expect(createPortraitCandidate({...original,layers:original.layers.map(l=>({...l,source:'changed'}))},'doc',regions,defaultPortraitSettings(),{io})).rejects.toThrow('过期')
 expect(()=>capturePortraitRegions({...original,layers:original.layers.map(l=>({...l,locked:true}))},'doc',masks)).toThrow('锁定')
 expect(()=>capturePortraitRegions({...original,pixelFormat:'rgba16'},'doc',masks)).toThrow('RGB')
})
