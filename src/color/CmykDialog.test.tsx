import { useEffect } from 'react'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { describe,it,expect,vi } from 'vitest'
import { EditorProvider,useEditor,initialEditorState,type EditorState } from '../state/editor'
import { CmykDialog } from './CmykDialog'
import { cmykState,type CmykRaster } from './cmykRaster'
const {backend}=vi.hoisted(()=>({backend:vi.fn()}))
vi.mock('./cmykRaster',async original=>({...await original<typeof import('./cmykRaster')>(),cmykBackend:backend}))
function fixture():CmykRaster {const p=new Uint8Array(132);p.set(new TextEncoder().encode('CMYK'),16);p.set(new TextEncoder().encode('acsp'),36);return{width:1,height:1,data:'AAAA/w==',rgb:'AAAA/w==',profile:btoa(String.fromCharCode(...p)),profileName:'schema fixture',previewPng:'data:image/png;base64,AAAA',maximumInk:1,totalInkLimit:3}}
let latest:EditorState
function Observe(){const {state,dispatch}=useEditor();latest=state;useEffect(()=>{dispatch({type:'restore-project',document:cmykState(structuredClone(initialEditorState),fixture())})},[dispatch]);return null}
describe('CMYK document mode dialog',()=>{
 it('previews/cancels device-channel edits privately, adopts atomically, and explicitly creates RGB copy',async()=>{
  const r=fixture();backend.mockImplementation(async request=>request.operation==='capabilities'?{available:true,systemProfile:true,backend:'test backend'}:{...r,data:request.data,maximumInk:1.5})
  render(<EditorProvider><Observe/><CmykDialog onClose={()=>{}}/></EditorProvider>)
  await screen.findByText(/test backend/)
  fireEvent.change(screen.getByLabelText('CMYK C'),{target:{value:'50'}})
  fireEvent.click(screen.getByRole('button',{name:'预览 CMYK 通道编辑'}));await screen.findByRole('button',{name:'采用 CMYK 预览'})
  expect(latest!.cmykRaster?.data).toBe(r.data)
  fireEvent.click(screen.getByRole('button',{name:'取消 CMYK 预览'}));expect(latest!.cmykRaster?.data).toBe(r.data)
  fireEvent.click(screen.getByRole('button',{name:'预览 CMYK 通道编辑'}));await screen.findByRole('button',{name:'采用 CMYK 预览'})
  fireEvent.click(screen.getByRole('button',{name:'采用 CMYK 预览'}));expect(latest!.cmykRaster?.data).not.toBe(r.data);expect(latest!.undoStack).toHaveLength(1)
  const device=latest!.cmykRaster
  fireEvent.click(screen.getByRole('button',{name:'显式创建 RGB 工作副本'}));expect(latest!.colorModel).toBe('rgb');expect(latest!.cmykRaster).toBe(device)
 })
 it('shows unsupported backend without changing a CMYK project',async()=>{
  backend.mockRejectedValue(new Error('未安装 Pillow'))
  render(<EditorProvider><Observe/><CmykDialog onClose={()=>{}}/></EditorProvider>)
  await screen.findByText('未安装 Pillow')
  fireEvent.click(screen.getByRole('button',{name:'预览 CMYK 通道编辑'}));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('未安装 Pillow'))
  expect(latest!.colorModel).toBe('cmyk');expect(latest!.undoStack).toHaveLength(0)
 })
})
