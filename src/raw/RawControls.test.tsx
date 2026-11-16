import {act,render,screen,fireEvent,waitFor} from '@testing-library/react'
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest'
import {RawControls} from './RawControls'
import {initialEditorState} from '../state/editor'
import {defaultDevelopSettings} from './rawPipeline'
const mock=vi.hoisted(()=>({dispatch:vi.fn(),develop:vi.fn(),state:null as any,documentId:'doc'}))
vi.mock('../state/editor',async imp=>({...await imp<any>(),useEditor:()=>({state:mock.state,dispatch:mock.dispatch,documentId:mock.documentId})}))
vi.mock('./rawPipeline',async imp=>({...await imp<any>(),developRaw:(...args:any[])=>mock.develop(...args)}))
const rawSource={bytes:[1,2,3,4],metadata:{format:'nef',orientation:1},settings:defaultDevelopSettings(),checksum:'abcdef12'}
const result={asset:{width:1,height:1,format:'rgba16',data:'AAAAAP//AAA=',encoding:'srgb'},preview:'data:image/png;base64,cA==',checksum:'abcdef12',orientation:1,backend:'rawpy / LibRaw',peakRss:123}
afterEach(()=>vi.restoreAllMocks())
beforeEach(()=>{mock.documentId='doc';mock.dispatch.mockReset();mock.develop.mockReset();mock.state={...initialEditorState,layers:[{...initialEditorState.layers[0],id:'raw',rawSource}],selectedLayerId:'raw'}})
describe('RAW reopen workspace',()=>{
 it('reopens editable parameters and only commits after preview confirmation',async()=>{
 mock.develop.mockResolvedValue(result);render(<RawControls/>);fireEvent.click(screen.getByText('RAW 显影'));fireEvent.change(screen.getByLabelText('曝光 EV'),{target:{value:'1'}});fireEvent.click(screen.getByText('生成显影预览'))
 await screen.findByAltText('RAW显影预览');expect(mock.dispatch).not.toHaveBeenCalled();fireEvent.click(screen.getByText('确认显影'))
 expect(mock.dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'apply-raw',replace:true,id:'raw',record:expect.objectContaining({settings:expect.objectContaining({exposureEV:1})})}))
 })
 it('rejects an unsupported file at import and prevents reuse of an earlier preview',async()=>{
 mock.develop.mockResolvedValue(result);render(<RawControls/>);fireEvent.click(screen.getByText('RAW 显影'));fireEvent.click(screen.getByText('生成显影预览'));await screen.findByAltText('RAW显影预览')
 const file=new File([new Uint8Array(32)],'camera.cr3');Object.defineProperty(file,'arrayBuffer',{value:async()=>new ArrayBuffer(32)})
 fireEvent.change(screen.getByLabelText('打开 RAW'),{target:{files:[file]}})
 await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent(/CR3 暂不支持/))
 expect(screen.queryByText('确认显影')).not.toBeInTheDocument();expect(screen.queryByText('生成显影预览')).not.toBeInTheDocument();expect(mock.develop).toHaveBeenCalledTimes(1);expect(mock.dispatch).not.toHaveBeenCalled()
 })
 it('cancels codec without dispatching document changes',async()=>{
 let signal:AbortSignal;mock.develop.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise(()=>{})});render(<RawControls/>);fireEvent.click(screen.getByText('RAW 显影'));fireEvent.click(screen.getByText('生成显影预览'));fireEvent.click(screen.getByText('取消解码'));expect(signal!.aborted).toBe(true);expect(mock.dispatch).not.toHaveBeenCalled()
 })
 it('shows actual decoder failure and preserves document',async()=>{
 mock.develop.mockRejectedValue(new Error('需要安装rawpy'));render(<RawControls/>);fireEvent.click(screen.getByText('RAW 显影'));fireEvent.click(screen.getByText('生成显影预览'));await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('需要安装rawpy'));expect(mock.dispatch).not.toHaveBeenCalled()
 })
 it('aborts on document switch and ignores a late result from the old document',async()=>{
 let resolve:(v:any)=>void;let signal:AbortSignal;mock.develop.mockImplementation((_r:any,s:AbortSignal)=>{signal=s;return new Promise(r=>resolve=r)})
 const view=render(<RawControls/>);fireEvent.click(screen.getByText('RAW 显影'));fireEvent.click(screen.getByText('生成显影预览'));fireEvent.keyDown(window,{key:'Escape'});expect(signal!.aborted).toBe(true)
 resolve!(result);await waitFor(()=>expect(screen.queryByText('确认显影')).not.toBeInTheDocument());expect(mock.dispatch).not.toHaveBeenCalled();view.unmount()
 })
 it('invalidates a preview when parameters change and refuses a duplicate run while busy',async()=>{
 let resolve:(v:any)=>void;mock.develop.mockImplementation(()=>new Promise(r=>resolve=r));render(<RawControls/>);fireEvent.click(screen.getByText('RAW 显影'));fireEvent.click(screen.getByText('生成显影预览'));fireEvent.click(screen.getByText('生成显影预览'));expect(mock.develop).toHaveBeenCalledTimes(1);resolve!(result);await screen.findByAltText('RAW显影预览');fireEvent.change(screen.getByLabelText('曝光 EV'),{target:{value:'2'}});expect(screen.queryByText('确认显影')).not.toBeInTheDocument();expect(mock.dispatch).not.toHaveBeenCalled()
 })

})

function deferredFile(name:string){
 let resolve!:(value:ArrayBuffer)=>void, reject!:(reason:Error)=>void
 const file=new File([new Uint8Array(32)],name)
 Object.defineProperty(file,'arrayBuffer',{value:()=>new Promise<ArrayBuffer>((yes,no)=>{resolve=yes;reject=no})})
 return {file,resolve:(value=new Uint8Array(32).buffer)=>resolve(value),reject:(reason:Error)=>reject(reason)}
}
function choose(file:File){fireEvent.change(screen.getByLabelText('打开 RAW'),{target:{files:[file]}})}
function openRaw(){fireEvent.click(screen.getByText('RAW 显影'))}

it.each(['buffer','hash'] as const)('ignores an older import completing at %s after a newer unsupported file fails',async phase=>{
 let hashFinish!:(value:ArrayBuffer)=>void
 const digest=phase==='hash'?vi.spyOn(crypto.subtle,'digest').mockImplementationOnce(()=>new Promise<ArrayBuffer>(r=>hashFinish=r)):vi.spyOn(crypto.subtle,'digest').mockResolvedValue(new Uint8Array(32).buffer)
 render(<RawControls/>);openRaw()
 const old=deferredFile('older.nef');choose(old.file)
 if(phase==='hash'){await act(async()=>old.resolve());await waitFor(()=>expect(digest).toHaveBeenCalledOnce())}
 const unsupported=deferredFile('newer.cr3');choose(unsupported.file);await act(async()=>unsupported.resolve())
 expect(screen.getByRole('alert')).toHaveTextContent('CR3 暂不支持')
 await act(async()=>{if(phase==='hash')hashFinish(new Uint8Array(32).buffer);else old.resolve()})
 await waitFor(()=>expect(screen.queryByText('生成显影预览')).not.toBeInTheDocument())
 expect(screen.getByRole('alert')).toHaveTextContent('CR3 暂不支持');expect(mock.dispatch).not.toHaveBeenCalled()
})

it.each(['close','document'] as const)('does not restore an old import after %s and reopening another RAW source',async mode=>{
 vi.spyOn(crypto.subtle,'digest').mockResolvedValue(new Uint8Array(32).buffer)
 const view=render(<RawControls/>);openRaw();const old=deferredFile('older.nef');choose(old.file)
 if(mode==='close')fireEvent.click(screen.getByText('取消并关闭'))
 else {mock.documentId='next-doc';mock.state={...mock.state};view.rerender(<RawControls/>)}
 openRaw();expect(screen.getByLabelText('曝光 EV')).toHaveValue(0)
 await act(async()=>old.resolve())
 fireEvent.click(screen.getByText('生成显影预览'))
 expect(mock.develop).toHaveBeenCalledOnce()
 expect(mock.develop.mock.calls[0][0]).toBeTruthy()
 expect(mock.develop.mock.calls[0][0].checksum).toBe('abcdef12')
 expect(mock.dispatch).not.toHaveBeenCalled()
})

it('ignores an old import failure after a newer supported import succeeds',async()=>{
 render(<RawControls/>);openRaw();const old=deferredFile('older.nef');choose(old.file)
 const newer=deferredFile('newer.nef');choose(newer.file);await act(async()=>newer.resolve())
 await screen.findByText('生成显影预览')
 await act(async()=>old.reject(new Error('stale file read failed')))
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();expect(screen.getByText('生成显影预览')).toBeInTheDocument()
})

it('stops a pending file import before hashing after unmount',async()=>{
 const digest=vi.spyOn(crypto.subtle,'digest').mockResolvedValue(new Uint8Array(32).buffer)
 const view=render(<RawControls/>);openRaw();const pending=deferredFile('pending.nef');choose(pending.file)
 view.unmount();await act(async()=>pending.resolve())
 expect(digest).not.toHaveBeenCalled();expect(mock.dispatch).not.toHaveBeenCalled()
})
