import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { EditorProvider, initialEditorState, useEditor, type EditorState, type EditorAction } from '../state/editor'
import { LayersPanel } from './LayersPanel'
import { useToolShortcuts } from '../tools/useToolShortcuts'
import { createSelection } from '../canvas/selectionGeometry'
let latest: EditorState, dispatch: (action: EditorAction) => void
function Observe() { const editor = useEditor(); latest = editor.state; dispatch = editor.dispatch; useToolShortcuts(); return null }
function mount() {
 render(<EditorProvider><LayersPanel /><Observe /></EditorProvider>)
 act(() => dispatch({type:'restore-project',document:{...initialEditorState,layers:[
  {...initialEditorState.layers[0],id:'a',name:'图片 A',opacity:70},
  {...initialEditorState.layers[0],id:'b',name:'图片 B',opacity:35,source:undefined},
  {...initialEditorState.layers[0],id:'c',name:'图片 C'},
 ],selectedLayerId:'a',selectedLayerIds:['a'],layerMasks:{a:{strokes:[],inverted:false,applied:true,selection:createSelection('rectangle',{x:0,y:0,width:50,height:100})}},artboards:[]}}))
}
beforeEach(()=>localStorage.clear())
const layer=(name:string)=>screen.getByRole('button',{name:`${name}图层`})
it('gives space to layers with fixed controls and no empty filter stacks or merge explanations',()=>{
 mount()
 const list=screen.getByRole('list',{name:'图层列表'})
 expect(screen.queryByText('智能滤镜 · 0')).toBeNull()
 expect(screen.queryByText(/栅格化当前效果/)).toBeNull()
 expect(screen.queryByRole('searchbox')).toBeNull()
 expect(screen.getByRole('toolbar',{name:'图层常用操作'})).toBeInTheDocument()
 expect(screen.getByRole('combobox',{name:'图层混合模式'}).compareDocumentPosition(list)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}))
 const menu=screen.getByRole('menu',{name:'图层操作'})
 expect(menu.parentElement).toBe(document.body)
 expect(within(menu).getByRole('menuitem',{name:'合并所选'})).toBeInTheDocument()
 fireEvent.keyDown(menu,{key:'Escape'})
 expect(screen.queryByRole('menu')).toBeNull()
})
it('supports continuous Shift selection and Ctrl toggling; mixed properties apply once to all selected layers',()=>{
 mount(); fireEvent.click(layer('图片 A'));fireEvent.click(layer('图片 C'),{shiftKey:true})
 expect(latest.selectedLayerIds).toEqual(['a','b','c'])
 expect(screen.getByRole('spinbutton',{name:'图层不透明度'})).toHaveAttribute('placeholder','混合')
 const before=latest.undoStack.length
 fireEvent.change(screen.getByRole('spinbutton',{name:'图层不透明度'}),{target:{value:'60'}})
 expect(latest.layers.map(l=>l.opacity)).toEqual([60,60,60]);expect(latest.undoStack).toHaveLength(before+1)
 fireEvent.click(layer('图片 B'),{ctrlKey:true});expect(latest.selectedLayerIds).toEqual(['a','c'])
 fireEvent.change(screen.getByRole('combobox',{name:'图层混合模式'}),{target:{value:'正片叠底'}})
 expect(latest.layers.map(l=>l.blendMode)).toEqual(['正片叠底','正常','正片叠底'])
})
it('renames inline, Escape preserves the name and arrow keys select without reordering',()=>{
 mount();fireEvent.doubleClick(screen.getByText('图片 A'))
 const input=screen.getByRole('textbox',{name:'图层名称'})
 fireEvent.change(input,{target:{value:'新名字'}});fireEvent.keyDown(input,{key:'Enter'})
 expect(latest.layers[0].name).toBe('新名字')
 fireEvent.doubleClick(screen.getByText('新名字'));fireEvent.change(screen.getByRole('textbox',{name:'图层名称'}),{target:{value:'丢弃'}})
 fireEvent.keyDown(screen.getByRole('textbox',{name:'图层名称'}),{key:'Escape'});expect(latest.layers[0].name).toBe('新名字')
 const before=latest.layers
 fireEvent.keyDown(layer('新名字'),{key:'ArrowDown'})
 expect(latest.selectedLayerId).toBe('b');expect(latest.layers).toBe(before)
})
it('search is opt-in, filters actual content and uses real layer IDs for a context menu',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'搜索与筛选图层'}))
 fireEvent.change(screen.getByRole('searchbox',{name:'搜索图层'}),{target:{value:'图片 B'}})
 expect(screen.queryByRole('button',{name:'图片 A图层'})).toBeNull()
 fireEvent.contextMenu(layer('图片 B'),{clientX:500,clientY:300})
 fireEvent.click(screen.getByRole('menuitem',{name:'复制'}))
 expect(latest.layers.some(l=>l.name==='图片 B 副本')).toBe(true)
})
it('shows a real attached mask thumbnail and switches the edit target without duplicating layers',()=>{
 mount();const count=latest.layers.length
 const mask=screen.getByRole('button',{name:'编辑图片 A蒙版'})
 expect(mask.querySelector('svg mask')).toBeInTheDocument()
 fireEvent.click(mask);expect(latest.activeToolGroup).toBe('mask');expect(mask).toHaveAttribute('aria-pressed','true')
 fireEvent.contextMenu(mask,{clientX:200,clientY:200});fireEvent.click(screen.getByRole('menuitem',{name:'停用蒙版'}))
 expect(latest.layerMasks.a.disabled).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'编辑图片 A内容'}));expect(latest.activeToolGroup).not.toBe('mask')
 expect(latest.layers).toHaveLength(count)
})
it('locked selection disables both properties; an empty selection never silently edits the first layer',()=>{
 mount();act(()=>dispatch({type:'toggle-layer-lock',id:'a'}))
 expect(screen.getByRole('spinbutton',{name:'图层不透明度'})).toBeDisabled()
 expect(screen.getByRole('combobox',{name:'图层混合模式'})).toBeDisabled()
 act(()=>dispatch({type:'select-layers',ids:[]}))
 expect(screen.getByRole('spinbutton',{name:'图层不透明度'})).toBeDisabled()
})
it('filtered drag ordering targets stored layer IDs instead of the filtered index',()=>{
 mount();act(()=>dispatch({type:'rename-layer',id:'b',name:'其他内容'}))
 fireEvent.click(screen.getByRole('button',{name:'搜索与筛选图层'}));fireEvent.change(screen.getByRole('searchbox'),{target:{value:'图片'}})
 const source=layer('图片 A').closest('[data-layer-row]')!,target=layer('图片 C').closest('[data-layer-row]')!
 fireEvent.dragStart(source);fireEvent.dragOver(target,{clientY:40});fireEvent.drop(target)
 expect(latest.layers.map(l=>l.id)).toEqual(['b','c','a'])
})

it('normalizes legacy blend IDs and keeps modifier selection on thumbnails',()=>{
 mount();act(()=>dispatch({type:'set-layer-blend',id:'a',blendMode:'multiply'}))
 expect(screen.getByRole('combobox',{name:'图层混合模式'})).toHaveValue('正片叠底')
 fireEvent.click(screen.getByRole('button',{name:'编辑图片 C内容'}),{shiftKey:true})
 expect(latest.selectedLayerIds).toEqual(['a','b','c'])
})
it('groups a single selected layer rather than creating an unrelated empty folder',()=>{
 mount();fireEvent.click(screen.getByRole('button',{name:'图层编组'}))
 const group=latest.layers.find(l=>l.children)
 expect(group?.children).toEqual(['a'])
 expect(latest.layers.find(l=>l.id==='a')?.groupId).toBe(group?.id)
})
