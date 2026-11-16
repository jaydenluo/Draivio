import {aiManualToolCoverage} from '../ai/tools/toolCoverage'
vi.mock('../ai/maskedEdit/workflow',async importOriginal=>{
 const original=await importOriginal<typeof import('../ai/maskedEdit/workflow')>()
 const {testMaskedIO}=await import('../ai/maskedEdit/testIO')
 return {...original,prepareMaskedEdit:(...args:Parameters<typeof original.prepareMaskedEdit>)=>original.prepareMaskedEdit(args[0],args[1],args[2],testMaskedIO)}
})
vi.mock('../ai/context/editorPreview', async importOriginal => {
 const original = await importOriginal<typeof import('../ai/context/editorPreview')>()
 return {...original,captureRenderedEditorContext:(state:EditorState,id:string,scope:import('../ai/context/editorContext').EditorScope)=>original.captureRenderedEditorContext(state,id,scope,async ()=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')}
})
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorState, type EditorAction } from '../state/editor'
import { AIComposer } from './AIComposer'
import { GenerationPanel } from './GenerationPanel'
import { ResultsPanel } from '../layers/ResultsPanel'
import { MessageHost } from '../components/MessageHost'
let latest: EditorState
let edit: (action: EditorAction) => void
function Setup() {
 const { state, dispatch } = useEditor(); latest = state; edit = dispatch
 return <button onClick={() => {
  dispatch({ type:'set-composer-source', sourceId:'proxy' }); dispatch({type:'set-composer-parameter',parameter:'model',value:'image'})
  dispatch({type:'set-composer-parameter',parameter:'count',value:'4 张'}); dispatch({type:'set-composer-mode',mode:'generate'})
 }}>准备</button>
}
function mount(masked = false) {
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{id:'proxy',provider:'OpenAI',name:'中转',baseUrl:'https://proxy.example/v1',apiKey:'never-in-history',protocol:'openai_compatible',models:['image'],enabled:true,generation:{multiImage:'split',concurrency:2,sendSize:false},...(masked ? {imageCapabilities:{image:{generate:true,edit:true,reference:true,encoding:'base64-json',maskedEdit:{semantics:'transparent-edit'}}}} : {})}]))
 return render(<><MessageHost/><EditorProvider><Setup/><AIComposer/><GenerationPanel/><ResultsPanel/></EditorProvider></>)
}
beforeEach(() => vi.spyOn(window,'confirm').mockReturnValue(true))
afterEach(() => vi.restoreAllMocks())
test('both entry points share a real batch, progressively add actual images and only retry failures', async () => {
 const execute=vi.spyOn(aiManualToolCoverage.generate,'execute')
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}))).mockResolvedValueOnce(new Response('',{status:400})).mockImplementation(async () => new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(execute).toHaveBeenCalledTimes(4)
 expect(fetcher).toHaveBeenCalledTimes(4)
 expect(latest.layers.filter(layer=>layer.aiOperation)).toHaveLength(0)
 expect(latest.aiResults).toHaveLength(3)
 expect(latest.aiResults.every(result=>!result.adopted)).toBe(true)
 expect(latest.aiResults[0].source).toBe('data:image/png;base64,aGVsbG8=')
 expect(JSON.stringify(latest)).not.toContain('never-in-history')
 expect(screen.getByText(/已生成 3\/4 张/)).toBeInTheDocument()
 expect(screen.getAllByText(/生图请求失败/)).toHaveLength(1)
 fireEvent.click(screen.getAllByRole('button',{name:'重试失败 / 补齐'})[0])
 await waitFor(()=>expect(latest.aiResults).toHaveLength(4))
 expect(latest.layers.filter(layer=>layer.aiOperation)).toHaveLength(0)
 const before=latest.layers
 fireEvent.click(screen.getAllByRole('button',{name:'新增图层'})[0])
 expect(latest.layers).toHaveLength(before.length+1)
 expect(latest.aiResults.filter(r=>r.adopted)).toHaveLength(1)
 act(()=>edit({type:'undo'}));expect(latest.layers).toEqual(before);expect(latest.aiResults.every(r=>!r.adopted)).toBe(true)
 expect(fetcher).toHaveBeenCalledTimes(5)
})
test('generic edit support never silently falls back when a model lacks masked editing', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button',{name:'切换到修改当前图'}))
 expect(screen.getByRole('button',{name:'执行 AI 操作'})).toBeDisabled()
 expect(screen.getByText(/此模型未声明蒙版编辑能力/)).toBeInTheDocument()
 expect(fetcher).not.toHaveBeenCalled()
})

test('real batch freezes document target and pixel selection before selection changes', async () => {
 let resolve!: (response: Response) => void
 vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(done=>{resolve=done}))
 mount(); fireEvent.click(screen.getByText('准备'))
 act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}))
 // Setup already rendered the real source; capture the selected original target.
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(resolve).toBeTypeOf('function'))
 const selected=latest.selectedLayerId
 act(()=>{edit({type:'select-layer',id:'original'}); edit({type:'set-selection-rect',rect:{x:1,y:2,width:3,height:4}})})
 resolve(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 const context=latest.aiResults[0]?.request?.context
 expect(context?.documentId).toBeTruthy(); expect(context?.targetLayerId).toBe(selected)
 expect(context?.selection).toBeNull()
 expect(context?.pixelBounds).toEqual({x:0,y:0,width:500,height:625})
})
test('edit entry reports inherited locks before submitting a real request', () => {
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount(true); fireEvent.click(screen.getByText('准备'))
 act(()=>edit({type:'toggle-layer-lock',id:latest.selectedLayerId}))
 fireEvent.click(screen.getByRole('button',{name:'切换到修改当前图'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(screen.getByText(/所属组已锁定/)).toBeInTheDocument()
 expect(fetcher).not.toHaveBeenCalled()
})

test('drops a delayed result after a content edit and retries with fresh bitmap/revision', async()=>{
 const pending:((response:Response)=>void)[]=[]
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(resolve=>pending.push(resolve)))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}));fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(pending).toHaveLength(1));const original=latest.selectedLayerId
 act(()=>edit({type:'set-layer-opacity',id:original,opacity:40}))
 pending[0](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(latest.layers.filter(l=>l.aiOperation)).toHaveLength(0);expect(latest.aiResults).toHaveLength(0)
 expect(screen.getAllByRole('button',{name:'重试失败 / 补齐'}).length).toBeGreaterThan(0)
 fireEvent.click(screen.getAllByRole('button',{name:'重试失败 / 补齐'})[0]);await waitFor(()=>expect(pending).toHaveLength(2))
 pending[1](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1));const result=latest.aiResults[0]
 expect(result.request!.context!.preview.dataUrl).toMatch(/^data:image\/png;base64,/);expect(result.request!.context!.targetLayerId).toBe(original);expect(fetcher).toHaveBeenCalledTimes(2)
})

test('does not submit a request when content changes while the bitmap is being prepared',async()=>{
 const previews=await import('../ai/context/editorPreview');const capture=previews.captureRenderedEditorContext
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 vi.spyOn(previews,'captureRenderedEditorContext').mockImplementation(async(...args)=>{const context=await capture(...args);await gate;return context})
 const fetcher=vi.spyOn(globalThis,'fetch');mount();fireEvent.click(screen.getByText('准备'));fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));act(()=>edit({type:'set-layer-opacity',id:latest.selectedLayerId,opacity:30}));await act(async()=>{release();await gate});await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(fetcher).not.toHaveBeenCalled();expect(screen.getByText(/预览已过期/)).toBeInTheDocument()
})

test('cancel drops late network success and never creates candidates or formal layers',async()=>{
 const pending:((response:Response)=>void)[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(resolve=>pending.push(resolve)))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}));const before=latest.layers,undo=latest.undoStack
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(pending).toHaveLength(1));fireEvent.click(screen.getAllByRole('button',{name:'取消生成'})[0]);pending[0](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(latest.layers).toBe(before);expect(latest.aiResults).toHaveLength(0);expect(latest.undoStack).toBe(undo)
})

test('cancel keeps completed candidates from a partial batch but never adopts them or accepts late siblings',async()=>{
 const pending:((response:Response)=>void)[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(resolve=>pending.push(resolve)))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'2 张'}));const layers=latest.layers
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(pending).toHaveLength(2));pending[0](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1));expect(latest.layers).toBe(layers);fireEvent.click(screen.getAllByRole('button',{name:'取消生成'})[0]);pending[1](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(latest.aiResults).toHaveLength(1);expect(latest.aiResults[0].adopted).toBe(false);expect(latest.layers).toBe(layers)
})

import {cloudAccount} from '../account/cloudAccount'
function mountCloud(){
 vi.spyOn(cloudAccount,'getSnapshot').mockReturnValue({authenticated:true,user:{email:'member@test'},balance:100,models:[{id:'cloud-image',code:'cloud-image',displayName:'Cloud Image',modality:'image',capabilities:['image'],constraints:{sizes:['1024x1024']},availability:{available:true}}]})
 vi.spyOn(cloudAccount,'refreshAccount').mockResolvedValue(cloudAccount.getSnapshot())
 mount()
 act(()=>{
  edit({type:'set-composer-source',sourceId:'draivio-cloud'})
  edit({type:'set-composer-parameter',parameter:'model',value:'Cloud Image'})
  edit({type:'set-composer-parameter',parameter:'size',value:'1024 × 1024'})
  edit({type:'set-composer-parameter',parameter:'count',value:'1 张'})
  edit({type:'set-composer-mode',mode:'generate'})
 })
}
test('cloud generation quotes matching payload and re-quotes manual retries before charging',async()=>{
 let paid=0,quotes=0
 const send=vi.spyOn(cloudAccount,'request').mockImplementation(async(path)=>{
  if(path.endsWith('/quotes'))return {status:200,body:{totalCredits:++quotes===1?'2':'3'},retryAfter:1000}
  paid++;return paid===1?{status:400,body:{},retryAfter:1000}:{status:200,body:{data:[{b64_json:'aGVsbG8='}]},retryAfter:1000}
 })
 mountCloud();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findAllByRole('button',{name:'重试失败 / 补齐'})
 expect(paid).toBe(1);expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('预计费用：2 积分'))
 const quoted=send.mock.calls.find(([path])=>path.endsWith('/quotes'))![1]!.body as any
 const generated=send.mock.calls.find(([path])=>path.endsWith('/generations'))![1]!.body
 expect(quoted.request).toEqual(generated)
 fireEvent.click(screen.getAllByRole('button',{name:'重试失败 / 补齐'})[0])
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1))
 expect(quotes).toBe(2);expect(paid).toBe(2)
 expect(window.confirm).toHaveBeenLastCalledWith(expect.stringContaining('预计费用：3 积分'))
})
test('canceling cloud cost confirmation submits no paid requests',async()=>{
 vi.mocked(window.confirm).mockReturnValue(false)
 const send=vi.spyOn(cloudAccount,'request').mockResolvedValue({status:200,body:{totalCredits:'2.5'},retryAfter:1000})
 mountCloud();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(window.confirm).toHaveBeenCalled())
 expect(send.mock.calls.map(([path])=>path)).toEqual(['/api/model-gateway/v1/quotes'])
 expect(latest.aiResults).toHaveLength(0)
})

test('cloud task stays bound to the account from before asynchronous preview capture',async()=>{
 const previews=await import('../ai/context/editorPreview'),capture=previews.captureRenderedEditorContext
 let release!:()=>void;const gate=new Promise<void>(r=>{release=r})
 const preview=vi.spyOn(previews,'captureRenderedEditorContext').mockImplementation(async(...args)=>{const context=await capture(...args);await gate;return context})
 const version=vi.spyOn(cloudAccount,'getSessionVersion').mockReturnValue(4)
 const send=vi.spyOn(cloudAccount,'request')
 mountCloud();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(preview).toHaveBeenCalled())
 version.mockReturnValue(5);await act(async()=>{release();await gate})
 await screen.findByText('云端账号已更改，请创建新任务')
 expect(send).not.toHaveBeenCalled();expect(window.confirm).not.toHaveBeenCalled()
})

test.each(['generate','fill','remove'] as const)('production %s consumes its registered executor and fails closed',async operation=>{
 const entry=operation==='generate'?aiManualToolCoverage.generate:aiManualToolCoverage.reference
 const execute=vi.spyOn(entry,'execute').mockRejectedValueOnce(new Error('registered generation denied'))
 const fetcher=vi.spyOn(globalThis,'fetch');mount(true);fireEvent.click(screen.getByText('准备'))
 act(()=>{edit({type:'set-composer-parameter',parameter:'count',value:'1 张'});edit({type:'set-prompt',prompt:operation==='remove'?'':'new image'});edit({type:'set-composer-mode',mode:operation==='generate'?'generate':'edit'})})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(execute).toHaveBeenCalled(),{timeout:15000})
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(execute.mock.calls[0][1].operation).toBe(operation)
 expect(fetcher).not.toHaveBeenCalled();expect(latest.aiResults).toHaveLength(0)
})
