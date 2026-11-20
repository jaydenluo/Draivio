import { expect, it } from 'vitest'
import { editorReducer, initialEditorState, type Layer } from './editor'
import { validateClipping } from './clipping'
const layer=(id:string):Layer=>({id,name:id,className:'layer-art',visible:true,opacity:100,blendMode:'正常'})
const state=()=>({...structuredClone(initialEditorState),layers:[layer('top'),layer('middle'),layer('base'),layer('extra')],selectedLayerId:'top',selectedLayerIds:['top']})
it('creates multi-layer same-base clipping, releases with undo, and releases links on base delete',()=>{
 let s=state();s=editorReducer(s,{type:'create-clipping',id:'middle'});s=editorReducer(s,{type:'create-clipping',id:'top'})
 expect(s.layers.slice(0,2).map(l=>l.clipBaseId)).toEqual(['base','base'])
 const clipped=s;s=editorReducer(s,{type:'release-clipping',id:'top'});expect(s.layers[0].clipBaseId).toBeUndefined()
 s=editorReducer(s,{type:'undo'});expect(s.layers).toEqual(clipped.layers)
 s=editorReducer(s,{type:'delete-layer',id:'base'});expect(s.layers.every(l=>!l.clipBaseId)).toBe(true)
})
it('rejects cross-parent, dangling, circular and noncontiguous chains',()=>{
 const layers=state().layers
 for(const mutated of [layers.map(l=>l.id==='top'?{...l,clipBaseId:'missing'}:l),layers.map(l=>l.id==='base'?{...l,clipBaseId:'top'}:l),layers.map(l=>l.id==='top'?{...l,clipBaseId:'base'}:l)]) expect(()=>validateClipping(mutated)).toThrow()
 expect(()=>validateClipping([layer('group'),{...layer('a'),groupId:'group',clipBaseId:'b'},layer('b')])).toThrow()
})
it('protects locked layers and rejects unsupported blend values without history',()=>{
 const s=state();s.layers[0].locked=true
 expect(editorReducer(s,{type:'create-clipping',id:'top'}).undoStack).toHaveLength(0)
 expect(editorReducer(state(),{type:'set-layer-blend',id:'top',blendMode:'not-a-mode'}).undoStack).toHaveLength(0)
})
it('reorder releases interrupted chains, grouping requires a complete chain, and locks block implicit release',()=>{
 let s=editorReducer(state(),{type:'create-clipping',id:'middle'});s=editorReducer(s,{type:'create-clipping',id:'top'})
 const reordered=editorReducer(s,{type:'reorder-layer',id:'base',direction:'up'});expect(reordered.layers.find(l=>l.id==='middle')?.clipBaseId).toBeUndefined();expect(reordered.layers.find(l=>l.id==='top')?.clipBaseId).toBe('base')
 const grouped=editorReducer(s,{type:'group-layers',ids:['base','extra']});expect(grouped.layers).toBe(s.layers);expect(grouped.notice).toContain('完整的剪贴链')
 const fullGroup=editorReducer(s,{type:'group-layers',ids:['top','middle','base']});expect(fullGroup.layers.find(l=>l.id==='top')?.clipBaseId).toBe('base');expect(()=>validateClipping(fullGroup.layers)).not.toThrow()
 s={...s,layers:s.layers.map(l=>l.id==='top'?{...l,locked:true}:l)}
 const blocked=editorReducer(s,{type:'delete-layer',id:'base'});expect(blocked.layers).toBe(s.layers);expect(blocked.undoStack).toBe(s.undoStack);expect(blocked.notice).toMatch(/锁定/)
})
it('reorders explicit grouped siblings using their actual render order and releases invalid links',()=>{
 let s=state();s.layers.unshift({...layer('g'),children:['top','middle','base','extra']});s.layers.slice(1).forEach(l=>l.groupId='g')
 s=editorReducer(s,{type:'create-clipping',id:'middle'})
 s=editorReducer(s,{type:'reorder-layer',id:'middle',direction:'down'})
 expect(s.layers[0].children).toEqual(['top','base','middle','extra']);expect(s.layers.find(l=>l.id==='middle')?.clipBaseId).toBeUndefined()
})
it('duplicating a group remaps internal base IDs and preserves the original chain',()=>{
 let s=state();s.layers.unshift({...layer('g'),children:['top','middle','base','extra']});s.layers.slice(1).forEach(l=>l.groupId='g')
 s=editorReducer(s,{type:'create-clipping',id:'middle'});s=editorReducer(s,{type:'create-clipping',id:'top'})
 const copied=editorReducer(s,{type:'duplicate-layer',id:'g'});expect(()=>validateClipping(copied.layers)).not.toThrow()
 const newGroup=copied.layers.find(l=>l.id===copied.selectedLayerId)!,newChildren=copied.layers.filter(l=>l.groupId===newGroup.id)
 expect(newChildren.filter(l=>l.clipBaseId)).toHaveLength(2);expect(newChildren.find(l=>l.clipBaseId)?.clipBaseId).not.toBe('base')
 expect(copied.layers.find(l=>l.id==='top')?.clipBaseId).toBe('base')
})
