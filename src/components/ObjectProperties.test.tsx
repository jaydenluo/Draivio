import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, initialEditorState } from '../state/editor'
import { AppShell } from '../app/AppShell'
import { encodeProject, decodeProject } from '../document/projectFormat'
import type { CanvasShape } from '../canvas/documentTypes'
import { hitMoveTarget } from '../canvas/moveTargets'
let editor:ReturnType<typeof useEditor>
function Probe(){editor=useEditor();return null}
const rect={id:'rect',layerId:'art',kind:'rectangle' as const,rect:{x:10,y:10,width:30,height:30},color:'#123456',strokeColor:'#abcdef',strokeWidth:2}
function setup(){const view=render(<EditorProvider><AppShell/><Probe/></EditorProvider>);const board=view.container.querySelector('.artboard')!;vi.spyOn(board,'getBoundingClientRect').mockReturnValue({x:0,y:0,left:0,top:0,right:500,bottom:625,width:500,height:625,toJSON:()=>({})});return view}
function load(shapes:CanvasShape[]=[rect]){act(()=>{shapes.forEach(shape=>editor.dispatch({type:'add-shape',shape}));editor.dispatch({type:'select-tool',tool:'select'});editor.dispatch({type:'select-canvas-targets',targets:[{kind:'shape',id:shapes[0].id,layerId:'art'}]})});fireEvent.click(screen.getByRole('button',{name:'属性'}))}
test('selected shape changes appearance, radius, geometry and top controls stay linked without touching its neighbor',()=>{
 const view=setup();load([rect,{...rect,id:'other',rect:{x:60,y:60,width:20,height:20}}])
 fireEvent.change(screen.getByLabelText('填充颜色'),{target:{value:'#ff0000'}})
 expect(editor.state.canvasShapes[0].color).toBe('#ff0000')
 expect(editor.state.canvasShapes[1].color).toBe('#123456')
 expect(screen.getByLabelText('快捷填充颜色')).toHaveValue('#ff0000')
 fireEvent.change(screen.getByLabelText('对象左上'),{target:{value:'12'}})
 fireEvent.blur(screen.getByLabelText('对象左上'))
 expect(editor.state.canvasShapes[0].cornerRadii).toEqual([12,12,12,12])
 expect(view.container.querySelector('[data-shape="rect"] path')).toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('对象填充'))
 expect(view.container.querySelector('[data-shape="rect"] path')).toHaveAttribute('fill','none')
 fireEvent.change(screen.getByLabelText('对象宽度'),{target:{value:'100'}});fireEvent.blur(screen.getByLabelText('对象宽度'))
 expect(editor.state.canvasShapes[0].rect.width).toBe(20)
})
test('mixed multi-selection edits once and undo restores both objects',()=>{
 setup();load([rect,{...rect,id:'other',color:'#ffffff'}])
 act(()=>editor.dispatch({type:'select-canvas-targets',targets:editor.state.canvasShapes.map(s=>({kind:'shape',id:s.id,layerId:s.layerId}))}))
 const undoLength=editor.state.undoStack.length
 fireEvent.change(screen.getByLabelText('填充颜色'),{target:{value:'#00ff00'}})
 expect(editor.state.canvasShapes.every(s=>s.color==='#00ff00')).toBe(true)
 expect(editor.state.undoStack.length).toBe(undoLength+1)
 act(()=>editor.dispatch({type:'undo'}))
 expect(editor.state.canvasShapes.map(s=>s.color)).toEqual(['#123456','#ffffff'])
})
test('canvas handle previews resize, commits once, and undo restores geometry',()=>{
 setup();load()
 const handle=screen.getByRole('button',{name:'图形缩放控制点se'})
 const before=editor.state.undoStack.length
 fireEvent.pointerDown(handle,{pointerId:2,button:0,clientX:200,clientY:250})
 fireEvent.pointerMove(handle,{pointerId:2,clientX:250,clientY:312.5})
 expect(editor.state.canvasShapes[0].rect.width).toBe(30)
 fireEvent.pointerUp(handle,{pointerId:2,clientX:250,clientY:312.5})
 expect(editor.state.canvasShapes[0].rect.width).toBeCloseTo(40)
 expect(editor.state.undoStack.length).toBe(before+1)
 act(()=>editor.dispatch({type:'undo'}))
 expect(editor.state.canvasShapes[0].rect).toEqual(rect.rect)
})
test('arrowheads are independently editable and serialized with shape transforms',async()=>{
 const view=setup();load([{...rect,kind:'arrow',from:{x:10,y:10},to:{x:40,y:40}}])
 fireEvent.click(screen.getByLabelText('对象起点箭头'))
 expect(view.container.querySelectorAll('.canvas-art [data-shape="rect"] polygon')).toHaveLength(2)
 fireEvent.change(screen.getByLabelText('对象旋转'),{target:{value:'45'}});fireEvent.blur(screen.getByLabelText('对象旋转'))
 expect(view.container.querySelector('[data-shape="rect"]')).toHaveAttribute('transform',expect.stringContaining('rotate(45)'))
 const loaded=decodeProject(await encodeProject(editor.state,{id:'shape-test',name:'形状属性'}))
 expect(loaded.document.canvasShapes?.[0]).toMatchObject({arrowStart:true,rotation:45,strokeColor:'#abcdef'})
})
test('no-fill rectangle selects its visible border rather than its empty center',()=>{
 const state={...initialEditorState,canvasShapes:[{...rect,fillEnabled:false}],sceneOrder:['rect']} as typeof editor.state
 // Use fixture source callback to avoid treating empty center as an image hit.
 expect(hitMoveTarget(state,{x:25,y:25},()=>false)?.kind).not.toBe('shape')
 expect(hitMoveTarget(state,{x:10,y:25},()=>false)?.id).toBe('rect')
})
