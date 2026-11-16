import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'
import { CanvasScene } from '../canvas/CanvasScene'
import { serializeExport } from '../render/serializeExport'
import { useDocumentWorkspace } from '../document/DocumentWorkspaceProvider'
import { AIComposer } from './AIComposer'
beforeEach(()=>localStorage.clear())
let latest: EditorState
function Observe() {
 const { state, dispatch } = useEditor(); latest = state
 const { newDocument, workspace } = useDocumentWorkspace()
 return <><span data-testid="document-count">{workspace.documents.length}</span><button onClick={()=>newDocument()}>切换文档测试</button><CanvasScene state={state}/><button onClick={()=>dispatch({type:'redo'})}>重做测试</button><button onClick={()=>dispatch({type:'set-layer-opacity',id:'art',opacity:45})}>外部修改测试</button></>
}
function mount() { render(<EditorProvider><AIComposer/><Observe/></EditorProvider>); fireEvent.click(screen.getByRole('button',{name:'一句话编辑'})); fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'向右10像素然后旋转15度'}}); fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'})); }
async function candidate() { fireEvent.click(screen.getByRole('button',{name:'确认执行计划'})); return await screen.findByRole('region',{name:'编辑效果预览'}) }
function pixels(svg: SVGSVGElement) {
 Object.defineProperty(svg,'viewBox',{configurable:true,value:{baseVal:{x:0,y:0,width:500,height:625}}})
 const source=serializeExport(svg,{range:'canvas'}); if(!source.startsWith('<svg')) throw new Error(source.slice(0,500)); return new Resvg(source).render().pixels
}
describe('real temporary edit preview',()=>{
 it('renders changed pixels, switches before/after, discards without document or history writes',async()=>{
  mount();const original=latest;const basePixels=pixels(document.querySelector('.canvas-art')!);const panel=await candidate()
  expect(latest).toBe(original);expect(document.querySelectorAll('.canvas-art')).toHaveLength(1)
  expect(pixels(panel.querySelector('svg')!)).not.toEqual(basePixels)
  fireEvent.click(within(panel).getByRole('button',{name:'查看编辑前'}));expect(pixels(panel.querySelector('svg')!)).toEqual(basePixels)
  fireEvent.click(within(panel).getByRole('button',{name:'查看编辑后'}));expect(pixels(panel.querySelector('svg')!)).not.toEqual(basePixels)
  fireEvent.click(within(panel).getByRole('button',{name:'放弃预览'}));expect(latest).toBe(original);expect(screen.queryByRole('region',{name:'编辑效果预览'})).not.toBeInTheDocument()
 })
 it('retunes one candidate from base, adopts once and matches real exported pixels through undo/redo',async()=>{
  mount();const original=latest;const basePixels=pixels(document.querySelector('.canvas-art')!);const panel=await candidate()
  expect(screen.queryByRole('button',{name:'撤销本次编辑'})).not.toBeInTheDocument()
  const dx=within(panel).getByRole('spinbutton',{name:'步骤 1 水平移动（像素）'})
  fireEvent.change(dx,{target:{value:'30'}});fireEvent.change(dx,{target:{value:'20'}})
  const resultPixels=pixels(panel.querySelector('svg')!);expect(latest).toBe(original)
  fireEvent.click(within(panel).getByRole('button',{name:'采用预览'}))
  expect(latest.layers.find(l=>l.id==='art')?.transform?.rect.x).toBe(4)
  expect(latest.undoStack).toHaveLength(original.undoStack.length+1)
  expect(pixels(document.querySelector('.canvas-art')!)).toEqual(resultPixels)
  fireEvent.click(screen.getByRole('button',{name:'撤销本次编辑'}));expect(latest.layers).toEqual(original.layers);expect(pixels(document.querySelector('.canvas-art')!)).toEqual(basePixels)
  fireEvent.click(screen.getByText('重做测试'));expect(pixels(document.querySelector('.canvas-art')!)).toEqual(resultPixels)
 })
 it('blocks a stale candidate after external document edits',async()=>{
  mount();const panel=await candidate();fireEvent.click(screen.getByText('外部修改测试'));const changed=latest
  expect(within(panel).getByRole('button',{name:'采用预览'})).toBeDisabled()
  expect(within(panel).getByText(/文档已更改/)).toBeInTheDocument();expect(latest).toBe(changed)
 })
 it('cancels during execution without writes and ignores duplicate confirmation',async()=>{
  mount();const original=latest;const confirm=screen.getByRole('button',{name:'确认执行计划'});fireEvent.click(confirm);fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
  fireEvent.click(screen.getByRole('button',{name:'取消'}));await waitFor(()=>expect(screen.getByText('已取消')).toBeInTheDocument())
  expect(latest.layers).toBe(original.layers);expect(latest.undoStack).toBe(original.undoStack);expect(screen.queryByRole('region',{name:'编辑效果预览'})).not.toBeInTheDocument()
 })
 it('ignores repeated execute while building a candidate and adopts only once',async()=>{
  mount();const original=latest;fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}));fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
  const panel=await screen.findByRole('region',{name:'编辑效果预览'});expect(latest).toBe(original)
  expect(panel.querySelectorAll('[data-layer-transform="art"]')).toHaveLength(1)
  const adopt=within(panel).getByRole('button',{name:'采用预览'});fireEvent.click(adopt);fireEvent.click(adopt)
  expect(latest.layers.find(l=>l.id==='art')?.transform?.rotation).toBe(15);expect(latest.undoStack).toHaveLength(original.undoStack.length+1)
 })
 it.each(['mode','minimize','prompt','scope'] as const)('does not publish a late candidate after %s abandons a running preview',async path=>{
  mount();const original=latest;fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}))
  if(path==='mode')fireEvent.click(screen.getByRole('button',{name:'一句话编辑'}))
  if(path==='minimize')fireEvent.click(screen.getByRole('button',{name:'最小化 AI 对话框'}))
  if(path==='prompt')fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'向左20像素'}})
  if(path==='scope')fireEvent.change(screen.getByRole('combobox',{name:'一句话编辑范围'}),{target:{value:'document'}})
  const afterInteraction=latest
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})
  expect(latest.layers).toBe(original.layers);expect(latest.undoStack).toBe(afterInteraction.undoStack);expect(screen.queryByRole('region',{name:'编辑效果预览'})).not.toBeInTheDocument()
 })
 it('never writes an executing candidate to another document',async()=>{
  mount();const original=latest;fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}));fireEvent.click(screen.getByText('切换文档测试'));const other=latest
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20))})
  expect(latest.layers).toBe(other.layers);expect(latest.layers).not.toBe(original.layers);expect(latest.undoStack).toHaveLength(0);expect(screen.queryByRole('region',{name:'编辑效果预览'})).not.toBeInTheDocument()
 })

})
