import {expect,it} from 'vitest'
import {editorReducer,initialEditorState} from '../state/editor'
import {defaultEffect,cloneEffects} from './layerEffects'
import {encodeProject,decodeProject} from '../document/projectFormat'
it('persists effects, clones mutable style, undo and inherited locks',async()=>{const targetId=initialEditorState.layers[1].id;const effects={version:1 as const,items:[defaultEffect('gradientOverlay')]};let state=editorReducer(initialEditorState,{type:'set-layer-effects',id:'art',effects});effects.items[0].stops[0].color='#ffffff';expect(state.layers[0].effects!.items[0].stops[0].color).toBe('#ff765f');const restored=decodeProject(await encodeProject(state,{id:'f15',name:'效果'}));expect(restored.document.layers[0].effects).toEqual(state.layers[0].effects);expect(editorReducer(state,{type:'undo'}).layers[0].effects).toBeUndefined();const copy=cloneEffects(state.layers[0].effects!);state=editorReducer(state,{type:'set-layer-effects',id:targetId,effects:copy});copy.items[0].color='#ffffff';expect(state.layers[1].effects!.items[0].color).not.toBe('#ffffff');const locked={...state,layers:state.layers.map(l=>l.id==='art'?{...l,locked:true,children:[targetId]}:l)};expect(editorReducer(locked,{type:'set-layer-effects',id:targetId,effects:{version:1,items:[]}}).layers).toBe(locked.layers)})
it('roundtrips extended controls and shared light through project serialization',async()=>{
 const effects={version:1 as const,globalLightAngle:120,items:[{...defaultEffect('shadow'),spread:25,useGlobalLight:true},{...defaultEffect('stroke'),fillType:'gradient' as const,gradientType:'radial' as const,scale:75,offsetX:20,offsetY:-10,reverse:true,blendMode:'multiply' as const}]}
 const state=editorReducer(initialEditorState,{type:'set-layer-effects',id:'art',effects})
 const restored=decodeProject(await encodeProject(state,{id:'extended',name:'扩展样式'}))
 expect(restored.document.layers[0].effects).toEqual(effects)
})
