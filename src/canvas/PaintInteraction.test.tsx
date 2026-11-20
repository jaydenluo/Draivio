import { fireEvent, render, screen, waitFor, act, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'
import * as raster from './rasterTools'
import { selectionContains, createSelection } from './selectionGeometry'
import { saveBindings } from '../commands/shortcuts'
let editor:ReturnType<typeof useEditor>
function Probe(){editor=useEditor();return <input aria-label="测试文字输入"/>}
function setup(){
 const view=render(<EditorProvider><AppShell/><Probe/></EditorProvider>)
 const board=view.container.querySelector('.artboard')!
 vi.spyOn(board,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:500,height:625,right:500,bottom:625,x:0,y:0,toJSON:()=>({})})
 return view
}
describe('painting interaction',()=>{
 it('swaps/reset colors through configurable shortcuts, leaving typing and canvas background intact',()=>{
  setup()
  const background=editor!.state.documentBackground
  act(()=>editor.dispatch({type:'set-background-color',color:'#123456'}))
  const fg=editor.state.brushColor
  fireEvent.keyDown(window,{key:'x'})
  expect(editor.state.brushColor).toBe('#123456')
  expect(editor.state.backgroundColor).toBe(fg)
  fireEvent.keyDown(window,{key:'d'})
  expect(editor.state.brushColor).toBe('#000000')
  expect(editor.state.backgroundColor).toBe('#ffffff')
  expect(editor.state.documentBackground).toBe(background)
  const input=screen.getByRole('textbox',{name:'测试文字输入'})
  fireEvent.keyDown(input,{key:'x'})
  expect(editor.state.brushColor).toBe('#000000')
  act(()=>saveBindings({swapColors:'k'}))
  fireEvent.keyDown(window,{key:'k'})
  expect(editor.state.brushColor).toBe('#ffffff')
  act(()=>saveBindings({}))
 })
 it('clips a bucket region, keeps original editable content, and undoes in one step',async()=>{
  const rasterize=vi.spyOn(raster,'rasterizeSvgPixels').mockResolvedValue({width:3,height:3,data:new Uint8ClampedArray([0,0,0,0,255,0,0,0,0].flatMap(v=>[v,v,v,255]))})
  setup()
  act(()=>editor.dispatch({type:'select-tool',tool:'fill'}))
  const oldLayers=editor.state.layers, oldCount=editor.state.canvasShapes.length
  fireEvent.pointerDown(screen.getByLabelText('画布交互层'),{button:0,clientX:250,clientY:312,pointerId:1})
  await waitFor(()=>expect(editor.state.canvasShapes.length).toBe(oldCount+1))
  const selection=editor.state.canvasShapes.at(-1)!.selection!
  expect(selectionContains(selection.path,{x:50,y:50})).toBe(true)
  expect(selectionContains(selection.path,{x:10,y:10})).toBe(false)
  expect(editor.state.layers).toEqual(oldLayers)
  expect(screen.getByLabelText('画布交互层').style.cursor).toContain('data:image/svg+xml')
  act(()=>editor.dispatch({type:'undo'}))
  expect(editor.state.canvasShapes.length).toBe(oldCount)
  rasterize.mockRestore()
 })
 it('fills explicit selection with background color and blocks locked layers',()=>{
  setup()
  act(()=>{
   editor.dispatch({type:'commit-selection',selection:createSelection('rectangle',{x:20,y:20,width:30,height:30})})
   editor.dispatch({type:'set-background-color',color:'#123456'})
  })
  fireEvent.keyDown(window,{key:'Backspace',ctrlKey:true})
  expect(editor.state.canvasShapes.at(-1)?.color).toBe('#123456')
  expect(selectionContains(editor.state.canvasShapes.at(-1)!.selection!.path,{x:10,y:10})).toBe(false)
  const count=editor.state.canvasShapes.length
  act(()=>editor.dispatch({type:'toggle-layer-lock',id:editor.state.selectedLayerId}))
  fireEvent.keyDown(window,{key:'Backspace',altKey:true})
  expect(editor.state.canvasShapes.length).toBe(count)
 })
 it('shows tool help in an independent draggable window and editable foreground/background swatches',()=>{
  setup()
  act(()=>editor.dispatch({type:'select-tool',tool:'fill'}))
  fireEvent.click(screen.getByRole('button',{name:'当前工具用法'}))
  const dialog=screen.getByRole('dialog',{name:/填充.*用法/})
  expect(dialog.parentElement).toBe(document.body)
  expect(within(dialog).getByText(/连续：/)).toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button',{name:/关闭/}))
  const colors=screen.getByRole('group',{name:'前景色与背景色'})
  fireEvent.click(within(colors).getByRole('button',{name:'打开颜色选择器：背景色'}))
  expect(screen.getByRole('dialog',{name:'背景色颜色选择器'}).parentElement).toBe(document.body)
 })
})
