import { expect, test } from 'vitest'
import { editorReducer, initialEditorState } from '../state/editor'
import { resizeShape, shapeBounds, shapePoint, selectedObjects } from './objectProperties'
const shape={id:'rect',layerId:'art',kind:'rectangle' as const,rect:{x:10,y:20,width:30,height:40},color:'#ff0000',strokeWidth:2}
test('selection is shared, styles apply to objects and batch edit has one undo',()=>{
 let s:typeof initialEditorState={...initialEditorState,canvasShapes:[shape,{...shape,id:'other'}]}
 s=editorReducer(s,{type:'select-canvas-targets',targets:[{kind:'shape',id:'rect',layerId:'art'},{kind:'shape',id:'other',layerId:'art'}]})
 expect(selectedObjects(s)).toHaveLength(2)
 const next=editorReducer(s,{type:'update-canvas-objects',shapes:s.canvasShapes.map(o=>({...o,color:'#123456'}))})
 expect(next.undoStack.length).toBe(s.undoStack.length+1)
 expect(next.canvasShapes.every(o=>o.color==='#123456')).toBe(true)
 expect(editorReducer(next,{type:'undo'}).canvasShapes).toEqual(s.canvasShapes)
 expect(selectedObjects(editorReducer(next,{type:'select-layer',id:'art'}))).toHaveLength(0)
})
test('batch edit is atomic when a target is locked',()=>{
 const s={...initialEditorState,layers:[{...initialEditorState.layers[0],locked:true}],canvasShapes:[shape]}
 expect(editorReducer(s,{type:'update-canvas-objects',shapes:[{...shape,color:'#123456'}]}).canvasShapes).toEqual([shape])
})
test('resize keeps line endpoints and path anchors in sync',()=>{
 const line={...shape,kind:'line' as const,from:{x:10,y:20},to:{x:40,y:60}}
 const resized=resizeShape(line,{x:20,y:30,width:60,height:20})
 expect(resized.from).toEqual({x:20,y:30});expect(resized.to).toEqual({x:80,y:50})
 const path={...shape,kind:'path' as const,path:{closed:true,fillRule:'nonzero' as const,anchors:[{x:10,y:20},{x:40,y:20},{x:40,y:60}]}}
 expect(shapeBounds(resizeShape(path,{x:0,y:0,width:60,height:80}))).toMatchObject({x:0,y:0,width:60,height:80})
})
test('rotated shapes use the same center for rendering and hit testing',()=>{
 const p=shapePoint({...shape,rotation:90},{x:25,y:20},100,100)
 expect(p.x).toBeCloseTo(45);expect(p.y).toBeCloseTo(40)
})
