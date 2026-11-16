import {describe,it,expect,vi} from 'vitest'
import {editorReducer,initialEditorState} from '../state/editor'
import {decodeProject,encodeProject} from '../document/projectFormat'
import {defaultDevelopSettings,developRaw,type RawSourceRecord} from './rawPipeline'
const record:RawSourceRecord={bytes:[1,2,3,4],metadata:{format:'nef',orientation:6},settings:defaultDevelopSettings(),checksum:'abcdef12'}
const asset={width:1,height:1,format:'rgba16' as const,data:'AAAAAP//AAA=',encoding:'srgb' as const},preview='data:image/png;base64,cA=='
describe('RAW document transaction',()=>{
 it('rejects tampered bytes before trusting a cached checksum',async()=>{await expect(developRaw({...record,bytes:Array(32).fill(1),checksum:'a'.repeat(64)})).rejects.toThrow(/校验和/)} )

 it('commits once, preserves original bytes on parameter reopen and supports undo/redo/project restore',async()=>{
 const state={...structuredClone(initialEditorState),artboards:[...structuredClone(initialEditorState.artboards),{id:'second',name:'第二板',x:600,y:0,width:100,height:100,background:'transparent',layerIds:[]}],activeArtboardId:'second'},action={type:'apply-raw' as const,id:'raw',name:'camera.nef',record,asset,preview,expectedState:state,replace:false}
 const imported=editorReducer(state,action);expect(imported.artboards.find(b=>b.id==='second')?.layerIds).toContain('raw');expect(imported.layers[0].rawSource).toEqual(record);expect(imported.undoStack).toHaveLength(state.undoStack.length+1)
 const updatedRecord={...record,settings:{...record.settings,exposureEV:1}}
 const updated=editorReducer(imported,{...action,record:updatedRecord,expectedState:imported,replace:true})
 expect(updated.layers[0].rawSource?.bytes).toBe(record.bytes);expect(editorReducer(updated,{type:'undo'}).layers[0].rawSource?.settings.exposureEV).toBe(0)
 expect(editorReducer(editorReducer(updated,{type:'undo'}),{type:'redo'}).layers[0].rawSource?.settings.exposureEV).toBe(1)
 expect(decodeProject(await encodeProject(updated,{id:'raw',name:'RAW'})).document.layers[0].rawSource).toEqual(updatedRecord)
 })
 it('rejects stale document state, locked source, invalid payload without content/history changes',()=>{
 const state=structuredClone(initialEditorState),action={type:'apply-raw' as const,id:'raw',name:'r',record,asset,preview,expectedState:state,replace:false}
 const stale=editorReducer({...state,documentWidth:111},action);expect(stale.layers).toBe(state.layers);expect(stale.undoStack).toBe(state.undoStack)
 const imported=editorReducer(state,action),locked={...imported,layers:imported.layers.map(l=>({...l,locked:true}))}
 expect(editorReducer(locked,{...action,expectedState:locked,replace:true}).layers).toBe(locked.layers)
 })
 it.each(['dng','cr3','orf','raf','rw2'] as const)('rejects unsupported %s in the actual develop entry before invoking native',async format=>{await expect(developRaw({...record,metadata:{...record.metadata,format},bytes:Array(32).fill(1)})).rejects.toThrow(/暂不支持真实 RAW 解码/)})
 it('pre-cancelled decode never invokes the native codec',async()=>{const c=new AbortController();c.abort();await expect(developRaw(record,c.signal)).rejects.toThrow(/取消/)})
})
