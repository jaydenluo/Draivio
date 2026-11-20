import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'
import { AppShell } from '../app/AppShell'
import { Resvg } from '@resvg/resvg-js'
import * as raster from './rasterTools'
import { createSelection } from './selectionGeometry'

afterEach(() => vi.restoreAllMocks())
let latest: EditorState
function Probe() {
  const {state,dispatch}=useEditor(); latest=state
  return <><button onClick={()=>dispatch({type:'commit-selection',selection:createSelection('rectangle',{x:20,y:20,width:30,height:40})})}>准备菜单选区</button><button onClick={()=>dispatch({type:'toggle-layer-lock',id:state.selectedLayerId})}>锁定菜单图层</button><button onClick={()=>dispatch({type:'set-composer-minimized',minimized:true})}>收起菜单AI</button><button onClick={()=>dispatch({type:'undo'})}>撤销菜单操作</button></>
}
function mount(){render(<EditorProvider><AppShell/><Probe/></EditorProvider>);fireEvent.click(screen.getByText('准备菜单选区'))}
function open(){fireEvent.contextMenu(screen.getByLabelText('主画布'),{clientX:500,clientY:280});return screen.getByRole('menu',{name:'选区操作'})}
function action(name:string){fireEvent.click(within(open()).getByRole('menuitem',{name}))}

it('shows a grouped portal menu with pixel dimensions and real selection actions',()=>{
  mount();const menu=open()
  expect(menu.parentElement).toBe(document.body)
  expect(within(menu).getAllByRole('menuitem')).toHaveLength(11)
  expect(within(menu).getAllByRole('separator')).toHaveLength(3)
  expect(within(menu).getByText('150 × 250 px')).toBeInTheDocument()
  expect(within(menu).queryByText('关闭菜单')).toBeNull()
  expect(within(menu).getByRole('menuitem',{name:'AI 局部修改'})).toHaveFocus()
})
it('opens from the selection resize handles as well as the canvas surface',()=>{
  mount();fireEvent.click(screen.getByLabelText('工具组：选区'))
  fireEvent.contextMenu(screen.getByRole('button',{name:'调整选区nw'}),{clientX:500,clientY:280})
  expect(screen.getByRole('menu',{name:'选区操作'})).toBeInTheDocument()
})
it('Escape and outside press close only the menu; arrows navigate without moving the canvas',()=>{
  mount();const before=latest.selection,menu=open()
  fireEvent.keyDown(document.activeElement!,{key:'ArrowDown'})
  expect(within(menu).getByRole('menuitem',{name:'内容识别填充'})).toHaveFocus()
  fireEvent.keyDown(document.activeElement!,{key:'Escape'})
  expect(screen.queryByRole('menu',{name:'选区操作'})).toBeNull();expect(latest.selection).toEqual(before);expect(latest.selectionVisible).toBe(true)
  open();fireEvent.pointerDown(document.body);expect(screen.queryByRole('menu',{name:'选区操作'})).toBeNull()
})
it('inverts, expands, contracts, selects all and deselects through real editor commands',()=>{
  mount();const original=latest.selection
  action('反向选择');expect(latest.selection.path).not.toEqual(original.path)
  fireEvent.click(screen.getByText('撤销菜单操作'));expect(latest.selection).toEqual(original)
  action('扩展选区');expect(latest.selection.rect.width).toBeGreaterThan(original.rect.width)
  fireEvent.click(screen.getByText('撤销菜单操作'));action('收缩选区');expect(latest.selection.rect.width).toBeLessThan(original.rect.width)
  action('全部选择');expect(latest.selection.rect).toEqual({x:0,y:0,width:100,height:100})
  action('取消选择');expect(latest.selectionVisible).toBe(false)
})
it('creates a mask once and never silently replaces an existing mask',()=>{
  mount();action('从选区创建蒙版');const mask=latest.layerMasks[latest.selectedLayerId]
  expect(mask?.selection).toBeTruthy()
  expect(within(open()).getByRole('menuitem',{name:'从选区创建蒙版'})).toBeDisabled()
  expect(latest.layerMasks[latest.selectedLayerId]).toEqual(mask)
})
it('opens selection refinement and routes AI editing to the composer without starting a job',()=>{
  mount();action('选择并遮住');expect(screen.getByRole('dialog',{name:'选择并遮住工作区'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'关闭选择并遮住工作区'}))
  fireEvent.click(screen.getByText('收起菜单AI'));action('AI 局部修改')
  expect(latest.composerMinimized).toBe(false);expect(latest.composerMode).toBe('edit')
  expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveFocus();expect(latest.isGenerating).toBe(false)
})
it('disables pixel writes for a locked layer but keeps selection operations usable',()=>{
  mount();fireEvent.click(screen.getByText('锁定菜单图层'));const menu=open()
  for(const name of ['内容识别填充','从选区创建蒙版'])expect(within(menu).getByRole('menuitem',{name})).toBeDisabled()
  expect(within(menu).getByRole('menuitem',{name:'反向选择'})).toBeEnabled()
})
it('preserves text-copy menus instead of opening a canvas menu on the composer input',()=>{
  mount();const input=screen.getByRole('textbox',{name:'AI 操作'}) as HTMLTextAreaElement
  input.focus();input.setSelectionRange(0,3);fireEvent.contextMenu(input,{clientX:400,clientY:500})
  expect(screen.queryByRole('menu',{name:'选区操作'})).toBeNull()
  expect(screen.getByRole('menuitem',{name:'复制'})).toBeInTheDocument()
})
it('closes on scrolling or selection changes and clamps near the viewport edge',()=>{
  mount();vi.spyOn(HTMLElement.prototype,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:244,height:360,right:244,bottom:360,x:0,y:0,toJSON(){}})
  fireEvent.contextMenu(screen.getByLabelText('主画布'),{clientX:window.innerWidth-1,clientY:window.innerHeight-1})
  expect(screen.getByRole('menu',{name:'选区操作'})).toHaveStyle({left:`${window.innerWidth-252}px`,top:`${window.innerHeight-368}px`})
  fireEvent.scroll(window);expect(screen.queryByRole('menu',{name:'选区操作'})).toBeNull()
  open();fireEvent.click(screen.getByText('准备菜单选区'));expect(screen.queryByRole('menu',{name:'选区操作'})).toBeNull()
})
it('opens current layer styles from a selection without consuming the selection',()=>{
 mount();const selection=latest.selection
 action('当前图层的混合选项…')
 expect(within(screen.getByRole('dialog',{name:'图层样式'})).getByText(/作用范围：整个图层/)).toBeInTheDocument()
 expect(latest.selection).toEqual(selection);expect(latest.selectionVisible).toBe(true)
 expect(latest.layers[0].effects).toBeUndefined()
})
it('offers layer styles without a selection and disables them on locked layers',()=>{
 render(<EditorProvider><AppShell/><Probe/></EditorProvider>)
 fireEvent.contextMenu(screen.getByLabelText('主画布'),{clientX:500,clientY:280})
 const menu=screen.getByRole('menu',{name:'画布图层操作'})
 expect(within(menu).getByRole('menuitem',{name:'当前图层的混合选项…'})).toBeEnabled()
 expect(within(menu).queryByRole('menuitem',{name:'扩展选区'})).not.toBeInTheDocument()
 fireEvent.keyDown(menu,{key:'Escape'});fireEvent.click(screen.getByText('锁定菜单图层'))
 fireEvent.contextMenu(screen.getByLabelText('主画布'),{clientX:500,clientY:280})
 expect(screen.getByRole('menuitem',{name:'当前图层的混合选项…'})).toBeDisabled()
})

it('copies only selected pixels to a new layer and can undo in one step',async()=>{
  const rasterize=vi.spyOn(raster,'rasterizeSvgPixels').mockImplementation(async svg=>{
    const {source}=raster.serializeSvg(svg)
    const image=new Resvg(source).render()
    return {width:image.width,height:image.height,data:new Uint8ClampedArray(image.pixels)}
  })
  const encode=vi.spyOn(raster,'imageToPng').mockReturnValue('data:image/png;base64,copy')
  mount()
  const before=latest
  action('将选区复制到新图层')
  await waitFor(()=>expect(latest.layers,latest.notice??'').toHaveLength(before.layers.length+1))
  expect(rasterize).toHaveBeenCalledOnce()
  const {width,height,data}=encode.mock.calls[0][0]
  expect([width,height]).toEqual([500,625])
  expect(data[3]).toBe(0)
  expect(data[(150*width+120)*4+3]).toBeGreaterThan(0)
  expect(latest.layers[0]).toMatchObject({id:latest.selectedLayerId,source:'data:image/png;base64,copy'})
  expect(latest.layers.slice(1)).toEqual(before.layers)
  expect(latest.undoStack).toHaveLength(before.undoStack.length+1)
  fireEvent.click(screen.getByText('撤销菜单操作'))
  expect(latest.layers).toEqual(before.layers)
})
