import {describe,it,expect} from 'vitest'
import {initialEditorState,editorReducer} from '../../state/editor'
import {drawingToolAction,validateDrawingTool,applyDrawingTool} from './drawingTools'
const state=()=>({...structuredClone(initialEditorState),documentWidth:100,documentHeight:100,selectionVisible:false,layers:[{...initialEditorState.layers[0],id:'base'}],selectedLayerId:'base',selectedLayerIds:['base'],canvasShapes:[]})
describe('AI drawing adapters',()=>{it('validates bounded brush and commits undoable stroke',()=>{const s=state();const n=applyDrawingTool(s,'brush',{layerId:'base',points:[{x:0,y:0},{x:50,y:50}],size:8,color:'#fff'});expect(n.brushStrokes).toHaveLength(1);expect(n.undoStack).toHaveLength(1);expect(()=>validateDrawingTool(s,'brush',{layerId:'base',points:Array.from({length:4097},()=>({x:1,y:1}))})).toThrow(/4096/)})
it('does not let AI brush escape an active selection',()=>{const s={...state(),selectionVisible:true,selection:{...initialEditorState.selection,rect:{x:20,y:20,width:40,height:40}}};expect(()=>drawingToolAction(s,'brush',{layerId:'base',points:[{x:1,y:1}],selection:s.selection})).toThrow(/选区内/)});
it('requires a selection for fill and protects locked layers',()=>{const s=state();expect(()=>drawingToolAction(s,'fill',{layerId:'base',color:'#fff'})).toThrow(/选区/);const locked={...s,layers:s.layers.map(l=>({...l,locked:true}))};expect(()=>drawingToolAction(locked,'brush',{layerId:'base',points:[{x:1,y:1}]})).toThrow(/锁定/)})
it('requires same-layer editable paths for boolean operations',()=>{const s=state();s.canvasShapes=[{id:'a',layerId:'base',kind:'path',rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0,path:{closed:true,fillRule:'nonzero',anchors:[{x:0,y:0},{x:20,y:0},{x:20,y:20}]}},{id:'b',layerId:'other',kind:'path',rect:{x:0,y:0,width:20,height:20},color:'#fff',strokeWidth:0,path:{closed:true,fillRule:'nonzero',anchors:[{x:0,y:0},{x:20,y:0},{x:20,y:20}]}}] as any;expect(()=>drawingToolAction(s,'path-boolean',{layerId:'base',sourceIds:['a','b'],booleanMode:'union'})).toThrow(/属于目标图层/)})})
import { createSelection, combineSelection } from '../../canvas/selectionGeometry'
it('never accepts caller selection as authority for brush, fill or gradient',()=>{
 const selection=createSelection('rectangle',{x:20,y:20,width:40,height:40}),s={...state(),selectionVisible:true,selection},forged=createSelection('rectangle',{x:0,y:0,width:100,height:100})
 expect(()=>drawingToolAction(s,'brush',{layerId:'base',points:[{x:3,y:3}],selection:forged,size:2})).toThrow(/选区/)
 for(const name of ['fill','gradient-fill'] as const){const action=drawingToolAction(s,name,{layerId:'base',selection:forged,color:'#fff'});expect(action.type==='add-shape'&&action.shape.selection).toEqual(selection)}
 expect(()=>drawingToolAction(state(),'fill',{layerId:'base',selection:forged})).toThrow(/选区/)
})
it('protects brush footprint and rejects holes/soft selections rather than checking endpoints only',()=>{
 const selection=createSelection('rectangle',{x:20,y:20,width:40,height:40}),s={...state(),selectionVisible:true,selection}
 expect(()=>drawingToolAction(s,'brush',{layerId:'base',points:[{x:21,y:40}],selection,size:10})).toThrow(/选区/)
 const hole=combineSelection(selection,createSelection('rectangle',{x:35,y:35,width:10,height:10}),'subtract')
 expect(()=>drawingToolAction({...s,selection:hole},'brush',{layerId:'base',points:[{x:30,y:40},{x:50,y:40}],selection,size:2})).toThrow(/选区/)
 expect(()=>drawingToolAction({...s,selection:{...selection,feather:2}},'brush',{layerId:'base',points:[{x:40,y:40}],size:2})).toThrow(/选区/)
})
it.each(['hardness','flow','smoothing'] as const)('rejects nonfinite %s',key=>{expect(()=>drawingToolAction(state(),'brush',{layerId:'base',points:[{x:40,y:40}],[key]:NaN})).toThrow()})
