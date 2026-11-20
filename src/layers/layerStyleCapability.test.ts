import { expect,it } from 'vitest'
import { initialEditorState,editorReducer } from '../state/editor'
import { defaultEffect } from '../render/layerEffects'
import { layerStyleUnavailableReason } from './layerStyleCapability'
it('uses the same capability checks for editor entry and actual commits',()=>{
 const effects={version:1 as const,items:[defaultEffect('shadow')]}
 for(const state of [{...initialEditorState,colorModel:'cmyk' as const},{...initialEditorState,layers:initialEditorState.layers.map((l,i)=>i?l:{...l,locked:true})}]){
  const reason=layerStyleUnavailableReason(state,'art');expect(reason).toBeTruthy()
  const next=editorReducer(state,{type:'set-layer-effects',id:'art',effects});expect(next.layers).toBe(state.layers);expect(next.notice).toBe(reason)
 }
 expect(layerStyleUnavailableReason(initialEditorState,'art')).toBeNull()
 expect(layerStyleUnavailableReason(initialEditorState,'missing')).toBeTruthy()
})
it('rejects stale style commits instead of overwriting newer styles',()=>{
 const effects={version:1 as const,items:[defaultEffect('shadow')]}
 const changed=editorReducer(initialEditorState,{type:'set-layer-effects',id:'art',effects})
 const next=editorReducer(changed,{type:'set-layer-effects',id:'art',effects:{version:1,items:[]},expectedEffects:null})
 expect(next.layers).toBe(changed.layers);expect(next.notice).toMatch(/已.*修改|冲突/)
})
