import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import * as core from '@tauri-apps/api/core'
import * as native from '../lib/native'
import { EditorProvider } from '../state/editor'
import { TopBar } from './TopBar'
import { SoftwareSettings } from './SoftwareSettings'
import { createRef } from 'react'
import { ImageImportControl } from './ImageImportControl'
import { ExportDialog } from '../render/ExportDialog'

vi.mock('@tauri-apps/api/core', async importOriginal => ({...await importOriginal<typeof core>(),isTauri:vi.fn(()=>false)}))
afterEach(()=>{vi.restoreAllMocks();vi.mocked(core.isTauri).mockReturnValue(false)})
function open(){render(<EditorProvider><TopBar/></EditorProvider>);fireEvent.click(screen.getByRole('button',{name:'账户设置'}));fireEvent.click(screen.getByRole('button',{name:'软件设置'}));return screen.getByRole('dialog',{name:'软件设置'})}
function openNative(){const anchor=createRef<HTMLButtonElement>();render(<><button ref={anchor}>设置</button><SoftwareSettings anchor={anchor} onClose={()=>{}}/></>);return screen.getByRole('dialog',{name:'软件设置'})}
const defaults={directory:'/app/generated-images',defaultDirectory:'/app/generated-images',isDefault:true}
test('provides a browser settings window without pretending it can change disk paths',()=>{
 const panel=open()
 expect(panel.parentElement).toBe(document.body)
 expect(panel.closest('.app-titlebar')).toBeNull()
 expect(within(panel).getByText('浏览器本地存储（当前网站）')).toBeInTheDocument()
 expect(within(panel).getByRole('button',{name:'选择文件夹'})).toBeDisabled()
 fireEvent.click(within(panel).getByRole('button',{name:'关闭软件设置'}))
 expect(screen.queryByRole('dialog',{name:'软件设置'})).not.toBeInTheDocument()
})
test('reads native default, changes path, handles cancellation and restores default',async()=>{
 vi.mocked(core.isTauri).mockReturnValue(true)
 const invoke=vi.spyOn(native,'invokeCommand').mockImplementation(async command=>command==='result_library_settings'?defaults:command==='result_library_choose_directory'?{...defaults,directory:'/chosen/images',isDefault:false}:defaults)
 const panel=openNative()
 expect(await within(panel).findByDisplayValue(defaults.directory)).toBeInTheDocument()
 fireEvent.click(within(panel).getByRole('button',{name:'选择文件夹'}))
 expect(await within(panel).findByDisplayValue('/chosen/images')).toBeInTheDocument()
 invoke.mockResolvedValueOnce(null)
 fireEvent.click(within(panel).getByRole('button',{name:'选择文件夹'}))
 await act(async()=>{})
 expect(within(panel).getByDisplayValue('/chosen/images')).toBeInTheDocument()
 fireEvent.click(within(panel).getByRole('button',{name:'恢复默认'}))
 expect(await within(panel).findByDisplayValue(defaults.directory)).toBeInTheDocument()
 expect(invoke).toHaveBeenCalledWith('result_library_reset_directory')
})
test('keeps the previous path after a native failure and supports retry',async()=>{
 vi.mocked(core.isTauri).mockReturnValue(true)
 const invoke=vi.spyOn(native,'invokeCommand').mockResolvedValue(defaults)
 const panel=openNative();await within(panel).findByDisplayValue(defaults.directory)
 invoke.mockRejectedValueOnce(new Error('目录不可写'))
 fireEvent.click(within(panel).getByRole('button',{name:'选择文件夹'}))
 expect(await within(panel).findByRole('alert')).toHaveTextContent('目录不可写')
 expect(within(panel).getByDisplayValue(defaults.directory)).toBeInTheDocument()
 expect(within(panel).getByRole('button',{name:'选择文件夹'})).toBeEnabled()
})
test('drags only the title, clamps at viewport edges and leaves controls stationary',()=>{
 const panel=open()
 vi.spyOn(panel,'getBoundingClientRect').mockReturnValue({left:100,top:100,right:600,bottom:400,width:500,height:300,x:100,y:100,toJSON(){}})
 fireEvent.pointerDown(within(panel).getByText('软件设置',{selector:'strong'}),{pointerId:1,button:0,clientX:200,clientY:120})
 fireEvent.pointerMove(window,{pointerId:1,clientX:-2000,clientY:-2000})
 fireEvent.pointerUp(window,{pointerId:1})
 expect(panel.style.translate).toBe('-92px -92px')
 fireEvent.pointerDown(within(panel).getByRole('button',{name:'选择文件夹'}),{pointerId:2,button:0,clientX:200,clientY:120})
 fireEvent.pointerMove(window,{pointerId:2,clientX:300,clientY:200})
 expect(panel.style.translate).toBe('-92px -92px')
})

test('uses saved import defaults and keeps per-file overrides temporary', () => {
 const profile = localStorage.getItem('draivio-import-profile')
 try {
   render(<EditorProvider><TopBar/><ImageImportControl/></EditorProvider>)
   fireEvent.click(screen.getByRole('button', {name: '账户设置'}))
   fireEvent.click(screen.getByRole('button', {name: '软件设置'}))
   const settings = screen.getByRole('dialog', {name: '软件设置'})
   fireEvent.click(within(settings).getByRole('button', {name: '导入与导出'}))
   fireEvent.change(within(settings).getByLabelText('默认导入尺寸'), {target: {value: 'canvas'}})
   fireEvent.change(within(settings).getByLabelText('默认导入色彩策略'), {target: {value: 'assign'}})
   fireEvent.click(within(settings).getByRole('button', {name: '保存导入与导出默认值'}))
   fireEvent.click(within(settings).getByRole('button', {name: '关闭软件设置'}))
   const selectFile = () => fireEvent.change(screen.getByLabelText('选择要导入的图片'), {
     target: {files: [new File([], 'sample.png', {type: 'image/png'})]},
   })
   selectFile()
   expect(screen.getByLabelText('导入尺寸')).toHaveValue('canvas')
   expect(screen.getByLabelText('导入色彩策略')).toHaveValue('assign')
   fireEvent.change(screen.getByLabelText('导入色彩策略'), {target: {value: 'preserve'}})
   fireEvent.click(screen.getByRole('button', {name: '关闭导入图片'}))
   selectFile()
   expect(screen.getByLabelText('导入色彩策略')).toHaveValue('assign')
 } finally {
   localStorage.removeItem('draivio-file-preferences-v1')
   if (profile === null) localStorage.removeItem('draivio-import-profile')
   else localStorage.setItem('draivio-import-profile', profile)
 }
})

test('reads export defaults when a mounted dialog is opened again', () => {
 const exportProps = {svgSource: () => '<svg/>', documentWidth: 800, documentHeight: 600, hasSelection: false, onClose: () => {}}
 const view = render(<ExportDialog {...exportProps} open={false} />)
 try {
   const settings = open()
   fireEvent.click(within(settings).getByRole('button', {name: '导入与导出'}))
   fireEvent.change(within(settings).getByLabelText('默认导出格式'), {target: {value: 'webp'}})
   fireEvent.input(within(settings).getByLabelText('默认压缩质量'), {target: {value: '76'}})
   fireEvent.click(within(settings).getByRole('button', {name: '保存导入与导出默认值'}))
   fireEvent.click(within(settings).getByRole('button', {name: '关闭软件设置'}))
   view.rerender(<ExportDialog {...exportProps} open />)
   expect(screen.getByLabelText('格式')).toHaveValue('webp')
   expect(screen.getByLabelText(/质量/)).toHaveValue(76)
   fireEvent.change(screen.getByLabelText('格式'), {target: {value: 'png'}})
   view.rerender(<ExportDialog {...exportProps} open={false} />)
   view.rerender(<ExportDialog {...exportProps} open />)
   expect(screen.getByLabelText('格式')).toHaveValue('webp')
 } finally {
   localStorage.removeItem('draivio-file-preferences-v1')
 }
})

test.each([
 ['快捷键', '管理键盘快捷键', '键盘快捷键'],
 ['AI 服务', '管理服务来源', '服务来源管理'],
])('opens the existing %s window from software settings', (category, action, title) => {
 const settings = open()
 fireEvent.click(within(settings).getByRole('button', {name: category}))
 fireEvent.click(within(settings).getByRole('button', {name: action}))
 expect(settings).not.toBeInTheDocument()
 expect(screen.getByRole('dialog', {name: title})).toBeInTheDocument()
})
