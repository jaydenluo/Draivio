import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { describe,it,expect } from 'vitest'
import { EditorProvider,useEditor,initialEditorState,type EditorState } from '../../state/editor'
import { RecipeWorkspace } from './RecipeWorkspace'
import { encodeProject,decodeProject } from '../../document/projectFormat'
let latest:EditorState
let reopen:EditorState | undefined
function Observe(){const {state,dispatch}=useEditor();latest=state;return <button onClick={()=>{if(reopen)dispatch({type:'restore-project',document:reopen})}}>重开配方项目</button>}
const mount=()=>render(<EditorProvider><Observe/><RecipeWorkspace/></EditorProvider>)
describe('recipe workspace integration',()=>{
 it('exposes input/parameters, previews real canvas without mutation, cancels, adopts and reopens saved recipe',async()=>{
  mount();const original=latest!.layers[0].opacity
  fireEvent.click(screen.getByRole('button',{name:'操作配方'}))
  fireEvent.change(screen.getByLabelText('配方参数 opacity'),{target:{value:'35'}})
  fireEvent.click(screen.getByRole('button',{name:'预览配方'}))
  await screen.findByLabelText('配方预览');expect(latest!.layers[0].opacity).toBe(original)
  expect(screen.getByLabelText('配方预览').querySelector('svg')).toBeTruthy()
  fireEvent.click(screen.getByRole('button',{name:'取消配方'}));expect(screen.queryByLabelText('配方预览')).toBeNull();expect(latest!.layers[0].opacity).toBe(original)
  fireEvent.click(screen.getByRole('button',{name:'预览配方'}));await screen.findByLabelText('配方预览')
  fireEvent.click(screen.getByRole('button',{name:'采用配方'}));await waitFor(()=>expect(latest!.layers[0].opacity).toBe(35))
  expect(latest!.savedRecipes).toHaveLength(1);expect(latest!.undoStack).toHaveLength(1)
  fireEvent.change(screen.getByLabelText('重新编辑已保存配方'),{target:{value:'0'}})
  expect((screen.getByLabelText('配方参数 opacity') as HTMLInputElement).value).toBe('35')
  const saved=await encodeProject(latest!,{id:'recipe',name:'Recipe'});expect(decodeProject(saved).document.savedRecipes).toEqual(latest!.savedRecipes)
  reopen={...initialEditorState,...decodeProject(saved).document};fireEvent.click(screen.getByText('重开配方项目'));expect(latest!.savedRecipes).toHaveLength(1);fireEvent.change(screen.getByLabelText('重新编辑已保存配方'),{target:{value:'0'}});fireEvent.change(screen.getByLabelText('配方参数 opacity'),{target:{value:'55'}});fireEvent.click(screen.getByRole('button',{name:'预览配方'}));await screen.findByLabelText('配方预览');expect(latest!.layers[0].opacity).toBe(35);fireEvent.click(screen.getByRole('button',{name:'采用配方'}));await waitFor(()=>expect(latest!.layers[0].opacity).toBe(55));expect(latest!.savedRecipes).toHaveLength(2)
 })
 it('blocks invalid input without writing state',async()=>{
  mount();const before=latest!
  fireEvent.click(screen.getByRole('button',{name:'操作配方'}));fireEvent.change(screen.getByLabelText('配方输入 target'),{target:{value:''}})
  fireEvent.click(screen.getByRole('button',{name:'预览配方'}));expect(await screen.findByRole('alert')).toHaveTextContent('缺少输入')
  expect(latest!).toBe(before)
 })
 it('rejects corrupt recipe persistence',async()=>{
  const state=structuredClone(initialEditorState);state.savedRecipes=[{recipe:{schemaVersion:90},parameters:{},bindings:{},records:[]}] as never
  await expect(encodeProject(state,{id:'invalid',name:'invalid'})).rejects.toThrow()
 })
})
