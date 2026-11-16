import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './ExportDialog'
import * as pipeline from './exportImage'
import { useState } from 'react'
import { EditorProvider, useEditor } from '../state/editor'
import { TopBar } from '../components/TopBar'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { LayersPanel } from '../layers/LayersPanel'
afterEach(() => {localStorage.clear(); vi.restoreAllMocks()})

describe('ExportDialog', () => {
  it('keeps the compact controls and disables selection without a selection', () => {
    render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection={false} onClose={vi.fn()} />)
    expect(screen.getByLabelText('格式')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /选区/ })).toBeDisabled()
    expect(screen.getByDisplayValue('800')).toBeInTheDocument()
  })
  it('updates the paired dimension while the ratio is locked', async () => {
    const user = userEvent.setup()
    render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={vi.fn()} />)
    await user.clear(screen.getByDisplayValue('800'))
    await user.type(screen.getByDisplayValue('0'), '400')
    expect(screen.getByDisplayValue('300')).toBeInTheDocument()
  })
})

it('rejects corrupt preference fields and defaults PNG to transparency', () => {
  localStorage.setItem('draivio-export-settings',JSON.stringify({format:'tiff',range:'invalid',width:-9,height:Infinity,quality:1000,background:'evil',lockRatio:'yes'}))
  render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection={false} onClose={vi.fn()} />)
  expect(screen.getByLabelText('格式')).toHaveValue('png')
  expect(screen.getByLabelText('透明背景')).toBeChecked()
  expect(screen.getByDisplayValue('800')).toBeInTheDocument()
  localStorage.clear()
})
it('uses selection dimensions and locks to that range ratio', async()=>{
 const user=userEvent.setup();render(<ExportDialog open svgSource={()=>'<svg/>'} documentWidth={800} documentHeight={600} selectionDimensions={{width:200,height:100}} hasSelection onClose={vi.fn()}/> )
 await user.selectOptions(screen.getByLabelText('范围'),'selection')
 expect(screen.getByLabelText('宽度')).toHaveValue(200); expect(screen.getByLabelText('高度')).toHaveValue(100)
 fireEvent.change(screen.getByLabelText('宽度'),{target:{value:'400'}})
 expect(screen.getByLabelText('高度')).toHaveValue(200)
})
it.each(['cancel','session','close','revision'] as const)('never downloads a pending export after %s',async mode=>{
 let resolve!: (blob:Blob)=>void
 vi.spyOn(pipeline,'exportSvgImage').mockImplementation(()=>new Promise(done=>{resolve=done}))
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 const onExport=vi.fn();const onClose=vi.fn()
 const props={open:true,svgSource:()=>'<svg/>',documentWidth:800,documentHeight:600,hasSelection:true,onClose,onExport,documentKey:'id:session:rev'}
 const view=render(<ExportDialog {...props}/> )
 fireEvent.click(screen.getByRole('button',{name:/^导出$/}))
 await waitFor(()=>expect(resolve).toBeDefined())
 if(mode==='cancel')fireEvent.click(screen.getByRole('button',{name:'取消'}))
 else view.rerender(<ExportDialog {...props} open={mode!=='close'} documentKey={mode==='session'?'id:new-session:rev':mode==='revision'?'id:session:new-rev':props.documentKey}/> )
 await act(async()=>resolve(new Blob(['pixels'],{type:'image/png'})))
 expect(click).not.toHaveBeenCalled();expect(onExport).not.toHaveBeenCalled()
})
it('honors SVG output size and survives preference storage failure',async()=>{
 const prepare=vi.spyOn(pipeline,'prepareSvgExport').mockResolvedValue('<svg width="400" height="300"/>')
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota')})
 render(<ExportDialog open svgSource={()=>'<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={vi.fn()}/> )
 fireEvent.change(screen.getByLabelText('格式'),{target:{value:'svg'}});fireEvent.change(screen.getByLabelText('宽度'),{target:{value:'400'}})
 fireEvent.click(screen.getByRole('button',{name:/^导出$/}))
 await waitFor(()=>expect(click).toHaveBeenCalledTimes(1))
 expect(prepare).toHaveBeenCalledWith('<svg/>',expect.objectContaining({width:400,height:300}))
})
it('rejects arrays masquerading as saved format/range enum strings',async()=>{
 localStorage.setItem('draivio-export-settings',JSON.stringify({format:['png'],range:['canvas']}))
 const exportImage=vi.spyOn(pipeline,'exportSvgImage').mockResolvedValue(new Blob(['pixels'],{type:'image/png'}))
 vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 render(<ExportDialog open svgSource={()=>'<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={vi.fn()}/> )
 fireEvent.click(screen.getByRole('button',{name:/^导出$/}))
 await waitFor(()=>expect(exportImage).toHaveBeenCalled())
 expect(exportImage.mock.calls[0][1].format).toBe('png')
})
it('exports selected formats through the batch export action', async () => {
 const exportImage=vi.spyOn(pipeline,'exportSvgImage').mockResolvedValue(new Blob(['pixels'],{type:'image/png'}))
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 const onExport=vi.fn()
 render(<ExportDialog open svgSource={()=>'<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={vi.fn()} onExport={onExport}/> )
 fireEvent.click(screen.getByLabelText('批量导出多种格式'))
 fireEvent.click(screen.getByLabelText('JPEG'))
 fireEvent.click(screen.getByRole('button',{name:/^导出$/}))
 await waitFor(()=>expect(exportImage).toHaveBeenCalledTimes(2))
 await waitFor(()=>expect(click).toHaveBeenCalledTimes(1), { timeout: 1000 })
 await waitFor(()=>expect(onExport).toHaveBeenCalledWith('canvas'), { timeout: 1000 })
})
it('focuses export controls, traps Tab and restores the trigger on Escape',async()=>{
 const user=userEvent.setup()
 function Harness(){const [open,setOpen]=useState(false);return <><button onClick={()=>setOpen(true)}>打开导出</button><ExportDialog open={open} svgSource={()=>'<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={()=>setOpen(false)}/><button>背景</button></>}
 render(<Harness/>);const trigger=screen.getByRole('button',{name:'打开导出'});await user.click(trigger)
 const dialog=screen.getByRole('dialog',{name:'导出图像'})
 expect(dialog.contains(document.activeElement)).toBe(true)
 const last=screen.getByRole('button',{name:/^导出$/});last.focus();await user.tab()
 expect(screen.getByRole('button',{name:'关闭导出'})).toHaveFocus()
 await user.tab({shift:true});expect(last).toHaveFocus()
 screen.getByRole('button',{name:'背景'}).focus();expect(dialog.contains(document.activeElement)).toBe(true)
 await user.keyboard('{Escape}');expect(screen.queryByRole('dialog')).toBeNull();expect(trigger).toHaveFocus()
})
it('blocks actual canvas/layer global shortcuts while retaining editable export fields',async()=>{
 const user=userEvent.setup();let snapshot=''
 function Probe(){const {state}=useEditor();snapshot=JSON.stringify({layers:state.layers,selection:state.selection,revision:state.documentRevision});return null}
 render(<EditorProvider><TopBar/><CanvasViewport/><LayersPanel/><Probe/></EditorProvider>)
 const before=snapshot;const trigger=screen.getByRole('button',{name:/^导出$/});await user.click(trigger)
 screen.getAllByRole('button',{name:/^导出$/}).at(-1)!.focus()
 await user.keyboard('{ArrowRight}{Delete}{Control>}d{/Control}')
 expect(snapshot).toBe(before)
 fireEvent.keyDown(document.body,{key:'Delete'});expect(snapshot).toBe(before)
 const width=screen.getByLabelText('宽度');await user.clear(width);await user.type(width,'400');expect(width).toHaveValue(400)
 await user.keyboard('{Escape}');expect(trigger).toHaveFocus();expect(snapshot).toBe(before)
})
it.each(['{Enter}',' '])('preserves native button activation with %s',async key=>{
 const user=userEvent.setup();const onClose=vi.fn()
 render(<ExportDialog open svgSource={()=>'<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={onClose}/> )
 screen.getByRole('button',{name:'取消'}).focus();await user.keyboard(key);expect(onClose).toHaveBeenCalledTimes(1)
})
