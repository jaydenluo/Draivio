import {it,expect} from 'vitest'
import {editorReducer,initialEditorState} from './editor'
import {captureEditorContext,contextCanCommit} from '../ai/context/editorContext'
const source=()=>structuredClone(initialEditorState)
function receive(s:ReturnType<typeof source>,id:string,index=0,request?:any){return editorReducer(s,{type:'append-ai-result',id,index,image:'data:image/png;base64,cA==',request:request??{mode:'generate',prompt:'生成候选',sourceLayerId:s.selectedLayerId,selection:null,parameters:s.composerParameters,context:captureEditorContext(s,'doc','document')}})}
it('keeps receipt in candidates without changing formal layers, selection or content undo history',()=>{
 const s=source(),next=receive(s,'candidate');expect(next.layers).toBe(s.layers);expect(next.selectedLayerId).toBe(s.selectedLayerId);expect(next.undoStack).toBe(s.undoStack);expect(next.history).toBe(s.history);expect(next.aiResults[0].adopted).toBe(false)
})
it('adopts each pristine same-batch candidate once, permits undo, and rejects edits before adoption',()=>{
 const s=source(),context=captureEditorContext(s,'doc','document'),request={mode:'generate' as const,prompt:'x',sourceLayerId:s.selectedLayerId,selection:null,parameters:s.composerParameters,context}
 const received=receive(receive(s,'one',0,request),'two',1,request)
 const one=editorReducer(received,{type:'adopt-ai-result-as-layer',id:'one'});expect(one.layers).toHaveLength(s.layers.length+1);expect(contextCanCommit(one,context)).toBe(true)
 const two=editorReducer(one,{type:'adopt-ai-result-as-layer',id:'two'});expect(two.layers).toHaveLength(s.layers.length+2)
 const duplicate=editorReducer(two,{type:'adopt-ai-result-as-layer',id:'two'});expect(duplicate.layers).toBe(two.layers)
 const undone=editorReducer(two,{type:'undo'});expect(undone.layers).toEqual(one.layers);expect(undone.aiResults.find(r=>r.id==='two')?.adopted).toBe(false)
 const stale=editorReducer(received,{type:'set-layer-opacity',id:s.selectedLayerId,opacity:12});expect(editorReducer(stale,{type:'adopt-ai-result-as-layer',id:'one'}).layers).toBe(stale.layers)
})

import {encodeProject,decodeProject} from '../document/projectFormat'
it('persists an unadopted generation candidate and adopts restored bytes in one undo transaction',async()=>{
 const s=source(),received=receive(s,'persisted');const document=decodeProject(await encodeProject(received,{id:'candidate',name:'候选保存'})).document
 const restored={...received,...document};expect(restored.layers).toEqual(s.layers);expect(restored.aiResults[0].adopted).toBe(false)
 const adopted=editorReducer(restored,{type:'adopt-ai-result-as-layer',id:'persisted'});expect(adopted.layers).toHaveLength(s.layers.length+1);expect(adopted.layers[0].source).toBe(received.aiResults[0].source)
 const undone=editorReducer(adopted,{type:'undo'});expect(undone.layers).toEqual(s.layers);expect(undone.aiResults[0].adopted).toBe(false)
})

import {defaultEffect} from '../render/layerEffects'
it('invalidates sibling candidates after adding a real effect/filter to an adopted generated layer',()=>{
 const s=source(),context=captureEditorContext(s,'doc','document'),request={mode:'generate' as const,prompt:'x',sourceLayerId:s.selectedLayerId,selection:null,parameters:s.composerParameters,context}
 const received=receive(receive(s,'one',0,request),'two',1,request),adopted=editorReducer(received,{type:'adopt-ai-result-as-layer',id:'one'})
 const effects=editorReducer(adopted,{type:'set-layer-effects',id:'one',effects:{version:1,items:[defaultEffect('shadow')]}})
 expect(contextCanCommit(effects,context)).toBe(false);expect(editorReducer(effects,{type:'adopt-ai-result-as-layer',id:'two'}).layers).toBe(effects.layers)
 const filtered=editorReducer(adopted,{type:'set-smart-filters',id:'one',chain:{items:[{id:'blur',kind:'gaussian',enabled:true,radius:2,amount:1}]}})
 expect(contextCanCommit(filtered,context)).toBe(false)
})
