import { describe,it,expect } from 'vitest'
import { initialEditorState,editorReducer } from '../../state/editor'
import { createTextReplacementPlan, textReplacementDocument } from './replaceText'
import { contentRevision } from '../context/editorContext'
import type { OcrCandidate } from '../vision/ocr'
const candidate:OcrCandidate={id:'p',text:'99',confidence:.95,quad:[{x:10,y:20},{x:40,y:20},{x:40,y:30},{x:10,y:30}],sourceLayerId:'base'}
const state=()=>({...structuredClone(initialEditorState),documentWidth:200,documentHeight:100,artboards:[{id:"board-1",name:"test",layerIds:["base"],x:0,y:0,width:200,height:100,background:"transparent"}],layers:[{id:'base',name:'base',className:'layer-art',source:'data:image/png;base64,original',visible:true,opacity:100,blendMode:'正常'}],selectedLayerId:'base',selectedLayerIds:['base'],canvasTexts:[],canvasShapes:[],sceneOrder:[],undoStack:[],redoStack:[]})
describe('atomic confirmed OCR replacement',()=>{
 it('applies repair then correctly placed editable text in one undo step',()=>{const s=state();const p=createTextReplacementPlan(s,{query:'99',replacement:'129',candidateId:'p',repairSource:'data:image/png;base64,repaired',baseContentRevision:contentRevision(s)},[candidate]);const doc=textReplacementDocument(s,p);const n=editorReducer(s,{type:'apply-edit-plan',document:doc});expect(n.layers).toHaveLength(3);expect(n.canvasTexts[0]).toMatchObject({x:5,y:20,width:30,height:13});expect(n.layers[0].id).toBe(n.canvasTexts[0].layerId);expect(n.undoStack).toHaveLength(1);expect(editorReducer(n,{type:'undo'}).layers).toEqual(s.layers)})
 it('rejects effective locks, stale content, missing repair and duplicate direct text',()=>{const s=state(),request={query:'99',replacement:'129',candidateId:'p',repairSource:'data:image/png;base64,repair'};expect(()=>createTextReplacementPlan({...s,layers:s.layers.map(x=>({...x,locked:true}))},request,[candidate])).toThrow('锁定');expect(()=>createTextReplacementPlan(s,{...request,baseContentRevision:'stale'},[candidate])).toThrow('更改');expect(()=>createTextReplacementPlan(s,{...request,repairSource:undefined},[candidate])).toThrow('修补');const t={id:'t',layerId:'base',x:0,y:0,text:'same',fontFamily:'sans-serif',fontSize:12,fontWeight:'400',color:'#000',align:'left' as const};expect(()=>createTextReplacementPlan({...s,canvasTexts:[t,{...t,id:'t2'}]},{query:'same',replacement:'x'})).toThrow('多个')})
})

it('requires explicit acknowledgement of every unverified non-generic font even when fontAvailable is true',()=>{
 const s=state(),r={query:'99',replacement:'129',candidateId:'p',repairSource:'data:image/png;base64,r',fontFamily:'DefinitelyMissing',fontAvailable:true}
 expect(()=>createTextReplacementPlan(s,r,[candidate])).toThrow('字体未验证')
 expect(()=>createTextReplacementPlan(s,{...r,confirmFontFallback:true},[candidate])).not.toThrow()
 const t={id:'t',layerId:'base',x:0,y:0,text:'old',fontFamily:'DefinitelyMissing',fontSize:12,fontWeight:'400',color:'#000',align:'left' as const}
 expect(()=>createTextReplacementPlan({...s,canvasTexts:[t]},{query:'old',replacement:'new',fontAvailable:true})).toThrow('字体未验证')
 expect(()=>createTextReplacementPlan({...s,canvasTexts:[t]},{query:'old',replacement:'new',confirmFontFallback:true})).not.toThrow()
})
