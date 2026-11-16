import { expect, it } from 'vitest'
import { editorReducer, initialEditorState, neutralAdjustments, type EditorAction } from './editor'
it('rejects every F13 write beneath locked ancestors without undo pollution',()=>{
 const state = {...initialEditorState,layers:[{id:'parent',name:'locked',className:'group',kind:'group' as const,visible:true,opacity:100,blendMode:'正常',locked:true}, {...initialEditorState.layers[0],groupId:'parent'}]}
 const actions: EditorAction[] = [
 {type:'set-layer-hsl',id:'art',channel:'red',key:'hue',value:40},
 {type:'set-layer-color-balance',id:'art',tone:'shadows',key:'cyanRed',value:40},
 {type:'set-layer-preserve-luminosity',id:'art',value:false},
 {type:'set-layer-adjustments',id:'art',adjustments:{...neutralAdjustments,brightness:20}},
 {type:'reset-layer-adjustments',id:'art'}]
 for (const action of actions) {const result=editorReducer(state,action); expect(result.layers).toBe(state.layers);expect(result.undoStack).toBe(state.undoStack)}
})
it('rejects NaN and malformed HSL instead of changing pixels or history',()=>{
 for (const action of [{type:'set-layer-hsl',id:'art',channel:'red',key:'hue',value:NaN},{type:'set-layer-color-balance',id:'art',tone:'shadows',key:'cyanRed',value:Infinity},{type:'set-layer-adjustments',id:'art',adjustments:{...neutralAdjustments,hsl:{global:{hue:0,saturation:0,lightness:0},channels:{}}}}] as EditorAction[]) {
 const next=editorReducer(initialEditorState,action);expect(next.layers).toBe(initialEditorState.layers);expect(next.undoStack).toBe(initialEditorState.undoStack)
 }
})
