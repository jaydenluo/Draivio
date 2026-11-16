import { it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from '../canvas/CanvasScene'
import { editorReducer, initialEditorState } from '../state/editor'
import { decodeProject, encodeProject } from './projectFormat'
import { uniqueArtboardNames } from '../canvas/artboards'
import { editorSnapIndex } from '../canvas/snapTransform'

const base = () => { const s = structuredClone(initialEditorState); s.layers = [{id:'red',name:'红',className:'layer-art',visible:true,opacity:100,blendMode:'正常'}]; s.canvasShapes=[{id:'shape',layerId:'red',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#ff0000',strokeWidth:0}];s.selectedLayerId='red';s.selectedLayerIds=['red'];s.artboards=[{id:'a',name:'A',width:100,height:100,x:0,y:0,background:'transparent',layerIds:['red']}];s.activeArtboardId='a';s.documentWidth=100;s.documentHeight=100;return s }
it('copies objects with independent IDs and real contain/crop pixel geometry',()=>{
 const s=base(); const copy=editorReducer(s,{type:'duplicate-artboard',sourceId:'a',id:'b',name:'B',width:200,height:300,mode:'scale'})
 expect(copy.artboards[1].layerIds).not.toContain('red');expect(copy.canvasShapes[1].id).not.toBe('shape'); expect(copy.layers[0].transform?.rect).toEqual({x:0,y:50/300*100,width:100,height:20000/300})
 const img=new Resvg(renderToStaticMarkup(<CanvasScene state={copy} thumbnail/>)).render();expect([img.width,img.height]).toEqual([200,300]);const px=img.pixels; expect(px[(0*200+10)*4+3]).toBe(0);expect(px[(100*200+10)*4]).toBe(255)
 const crop=editorReducer(s,{type:'duplicate-artboard',sourceId:'a',id:'b',name:'B',width:50,height:50,mode:'crop'});expect(crop.layers[0].transform?.rect.width).toBe(200)
 expect(s.canvasShapes).toHaveLength(1)
})
it('keeps empty boards and active state through project reopen and undo/redo',async()=>{
 const s=base();const next=editorReducer(s,{type:'add-artboard',board:{id:'empty',name:'空',width:40,height:30,x:150,y:20,background:'#00ff00',layerIds:[]}})
 expect(next.selectedLayerId).toBe('');const reopened=editorReducer(s,{type:'restore-project',document:decodeProject(await encodeProject(next,{id:'p',name:'P'})).document});expect(reopened.artboards).toEqual(next.artboards);expect(reopened.activeArtboardId).toBe('empty')
 expect(editorReducer(next,{type:'undo'}).artboards).toHaveLength(1);expect(editorReducer(editorReducer(next,{type:'undo'}),{type:'redo'}).artboards).toHaveLength(2)
 const image=new Resvg(renderToStaticMarkup(<CanvasScene state={reopened} thumbnail/>)).render();expect([image.width,image.height]).toEqual([40,30]);expect([...image.pixels.slice(0,4)]).toEqual([0,255,0,255])
})
it('cross-board move retains local pixel coordinates and participates in undo',()=>{const s=base();s.layers[0].transform={kind:'transform',rect:{x:10,y:20,width:50,height:40},rotation:0,flipX:false,flipY:false};s.artboards.push({id:'b',name:'B',x:200,y:100,width:200,height:300,background:'transparent',layerIds:[]});const moved=editorReducer(s,{type:'move-layer-to-artboard',layerId:'red',from:'a',to:'b'});expect(moved.layers[0].transform?.rect).toEqual({x:5,y:20/3,width:25,height:40/3});expect(moved.artboards[0].layerIds).toEqual([]);expect(editorReducer(moved,{type:'undo'}).layers[0].transform).toEqual(s.layers[0].transform);const shifted=editorReducer(moved,{type:'move-artboard',id:'b',x:900,y:800});expect(shifted.layers).toEqual(moved.layers)})
it('snap targets exclude foreign boards and retain local canvas edges',()=>{const s=base();s.layers.push({...s.layers[0],id:'foreign'});s.artboards.push({id:'b',name:'B',x:200,y:0,width:200,height:100,background:'transparent',layerIds:['foreign']});expect(editorSnapIndex(s,'red').x.some(target=>target.targetId==='foreign')).toBe(false);expect(editorSnapIndex(s,'red').x.some(target=>target.position===100)).toBe(true)})
it('deduplicates final sanitized names and pre-existing suffixes',()=>{const a=base().artboards[0];expect(uniqueArtboardNames(['A','A','A-2','A/','A?'].map((name,i)=>({...a,id:String(i),name}))).map(b=>b.name)).toEqual(['A','A-2','A-2-2','A_','A_-2'])})

it('removing a board cannot leak its content when only one board remains',()=>{const s=base();const duplicated=editorReducer(s,{type:'duplicate-artboard',sourceId:'a',id:'b',name:'B',width:100,height:100,mode:'scale'});const single=editorReducer(duplicated,{type:'remove-artboard',id:'b'});const svg=renderToStaticMarkup(<CanvasScene state={single} thumbnail/>);expect(svg).toContain('data-layer-id="red"');expect(svg).not.toContain(`data-layer-id="${duplicated.artboards[1].layerIds[0]}"`)})
it('excludes deleted-board ghost objects from single-board snapping',()=>{const s=base();const copied=editorReducer(s,{type:'duplicate-artboard',sourceId:'a',id:'b',name:'B',width:100,height:100,mode:'scale'});const ghost=copied.layers.find(layer=>layer.id===copied.artboards[1].layerIds[0])!;ghost.transform={kind:'transform',rect:{x:23,y:17,width:40,height:40},rotation:0,flipX:false,flipY:false};const removed=editorReducer(copied,{type:'remove-artboard',id:'b'});const foreign=new Set(copied.artboards[1].layerIds);expect([...editorSnapIndex(removed,'red').x,...editorSnapIndex(removed,'red').y].some(target=>foreign.has(target.targetId))).toBe(false)})
it('detaches nested subtree from source group on cross-board move and preserves physical geometry through reopen and undo',async()=>{
 const s=base();s.layers.unshift({id:'g',name:'group',className:'layer-group',visible:true,opacity:100,blendMode:'正常',children:['red'],transform:{kind:'transform',rect:{x:20,y:10,width:50,height:50},rotation:20,flipX:false,flipY:false}});s.layers[1].groupId='g';s.artboards[0].layerIds=['g','red'];s.artboards.push({id:'b',name:'B',x:200,y:100,width:200,height:300,background:'transparent',layerIds:[]})
 const {layerWorldPixelMatrix}=await import('../canvas/layerWorldMatrix');const before=layerWorldPixelMatrix(s.layers,'red',100,100)
 const moved=editorReducer(s,{type:'move-layer-to-artboard',layerId:'red',from:'a',to:'b'});expect(moved.layers.find(layer=>layer.id==='red')?.groupId).toBeUndefined();expect(moved.layers.find(layer=>layer.id==='g')?.children).toEqual([]);const after=layerWorldPixelMatrix(moved.layers,'red',200,300);after.forEach((value,i)=>expect(value).toBeCloseTo(before[i],8));expect(renderToStaticMarkup(<CanvasScene state={moved} thumbnail/>)).not.toContain('data-layer-id="g"');expect(editorReducer(moved,{type:'undo'}).layers).toEqual(s.layers)
 const restored=editorReducer(s,{type:'restore-project',document:decodeProject(await encodeProject(moved,{id:'nested',name:'nested'})).document});expect(restored.layers).toEqual(moved.layers)
})
it('restores an explicit single-document size without a stale default board overriding coordinates',()=>{
 const state=structuredClone(initialEditorState)
 const restored=editorReducer(state,{type:'restore-project',document:{...state,documentWidth:500,documentHeight:500,documentBackground:'#123456'}})
 expect(restored.documentWidth).toBe(500);expect(restored.documentHeight).toBe(500);expect(restored.artboards[0]).toMatchObject({width:500,height:500,background:'#123456'})
})
