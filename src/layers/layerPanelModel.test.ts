import { expect,it } from 'vitest'
import { editorReducer,initialEditorState } from '../state/editor'
import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { CanvasScene } from '../canvas/CanvasScene'
import { createSelection } from '../canvas/selectionGeometry'
const fixture=()=>({...structuredClone(initialEditorState),layers:[
 {...initialEditorState.layers[0],id:'a',name:'A',source:undefined},
 {...initialEditorState.layers[0],id:'g',name:'组',children:[],source:undefined,transform:{kind:'transform' as const,rect:{x:10,y:20,width:80,height:70},rotation:20,flipX:false,flipY:false}},
 {...initialEditorState.layers[0],id:'b',name:'B',source:undefined},
],artboards:[],selectedLayerId:'a',selectedLayerIds:['a','b']})
it('batch properties are one undo entry, validate values and respect inherited locks',()=>{
 const s=fixture(),n=editorReducer(s,{type:'set-selected-layer-properties',ids:['a','b'],opacity:45,blendMode:'正片叠底'})
 expect(n.layers.filter(l=>l.id!=='g').map(l=>[l.opacity,l.blendMode])).toEqual([[45,'正片叠底'],[45,'正片叠底']]);expect(n.undoStack).toHaveLength(1)
 expect(editorReducer(n,{type:'undo'}).layers).toEqual(s.layers)
 const locked={...s,layers:s.layers.map(l=>l.id==='a'?{...l,locked:true}:l)}
 expect(editorReducer(locked,{type:'set-selected-layer-properties',ids:['a','b'],opacity:30}).layers).toBe(locked.layers)
})
it('reparents without changing world coordinates and restores hierarchy with undo',()=>{
 const s=fixture(),before=layerWorldPixelMatrix(s.layers,'a',500,625)
 const n=editorReducer(s,{type:'place-layer',id:'a',targetId:'g',placement:'inside'})
 expect(n.layers.find(l=>l.id==='a')?.groupId).toBe('g');expect(n.layers.find(l=>l.id==='g')?.children).toEqual(['a'])
 layerWorldPixelMatrix(n.layers,'a',500,625).forEach((v,i)=>expect(v).toBeCloseTo(before[i],8))
 expect(editorReducer(n,{type:'undo'}).layers).toEqual(s.layers)
 const rejected=editorReducer(n,{type:'place-layer',id:'g',targetId:'a',placement:'inside'})
 expect(rejected.layers).toBe(n.layers)
})
it('places relative to stable target IDs and moves whole subtrees',()=>{
 const s=fixture(),n=editorReducer(s,{type:'place-layer',id:'b',targetId:'a',placement:'before'})
 expect(n.layers.map(l=>l.id)).toEqual(['b','a','g'])
})
it('disabled masks preserve data, undo and rendering output while staying editable',()=>{
 const s=fixture();s.layerMasks={a:{strokes:[],inverted:false,applied:true,selection:createSelection('rectangle',{x:0,y:0,width:50,height:100})}}
 const n=editorReducer(s,{type:'update-layer-mask',id:'a',operation:'toggle'})
 expect(n.layerMasks.a.disabled).toBe(true)
 const svg=renderToStaticMarkup(createElement(CanvasScene,{state:n,thumbnail:true}))
 expect(svg).toMatch(/data-layer-mask="a"(?! mask=)/)
 expect(editorReducer(n,{type:'undo'}).layerMasks.a).toEqual(s.layerMasks.a)
 const inverse=editorReducer(s,{type:'update-layer-mask',id:'a',operation:'invert'})
 expect(inverse.layerMasks.a.inverted).toBe(true);expect(inverse.layerMasks.a.applied).toBe(true)
})

it('groups nested siblings in place, preserves world transforms and rejects unsafe hierarchy changes',()=>{
 const s=fixture();s.layers.find(l=>l.id==='g')!.children=['b','a']
 s.layers=s.layers.map(l=>['a','b'].includes(l.id)?{...l,groupId:'g'}:l)
 const before=layerWorldPixelMatrix(s.layers,'a',s.documentWidth,s.documentHeight)
 const n=editorReducer(s,{type:'group-layers',ids:['a','b']})
 const group=n.layers.find(l=>l.id!== 'g'&&l.children)!
 expect(group.children).toEqual(['b','a']);expect(group.groupId).toBe('g')
 expect(n.layers.find(l=>l.id==='g')!.children).toEqual([group.id])
 layerWorldPixelMatrix(n.layers,'a',s.documentWidth,s.documentHeight).forEach((v,i)=>expect(v).toBeCloseTo(before[i],8))
 expect(editorReducer(n,{type:'undo'}).layers).toEqual(s.layers)
 const rejected=editorReducer(fixture(),{type:'group-layers',ids:['a','b']})
 expect(rejected.layers).toEqual(fixture().layers)
 expect(rejected.notice).toContain('排在一起')
})

it('never inserts a layer into a clipping chain or silently releases its links',()=>{
 const s=fixture();s.layers=[{...s.layers[0],id:'top',clipBaseId:'base'},{...s.layers[0],id:'middle',clipBaseId:'base'},{...s.layers[0],id:'base'},{...s.layers[0],id:'extra'}]
 const rejected=editorReducer(s,{type:'place-layer',id:'extra',targetId:'middle',placement:'before'})
 expect(rejected.layers).toBe(s.layers);expect(rejected.undoStack).toBe(s.undoStack)
})
