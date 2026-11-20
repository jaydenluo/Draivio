import {useImageGeneration} from './ImageGeneration'
import type {ImageOverrides} from './chatImageParameters'
import {ResultStage} from './ResultStage'
import {aiManualToolCoverage} from '../ai/tools/toolCoverage'
vi.mock('../ai/maskedEdit/workflow',async importOriginal=>{
 const original=await importOriginal<typeof import('../ai/maskedEdit/workflow')>()
 const {testMaskedIO}=await import('../ai/maskedEdit/testIO')
 return {...original,fitMaskedEditToEndpoint:(p:Parameters<typeof original.fitMaskedEditToEndpoint>[0],size:Parameters<typeof original.fitMaskedEditToEndpoint>[1])=>original.fitMaskedEditToEndpoint(p,size,testMaskedIO),prepareMaskedEdit:(...args:Parameters<typeof original.prepareMaskedEdit>)=>original.prepareMaskedEdit(args[0],args[1],args[2],testMaskedIO,args[4])}
})
vi.mock('../ai/context/editorPreview', async importOriginal => {
 const original = await importOriginal<typeof import('../ai/context/editorPreview')>()
 return {...original,captureRenderedEditorContext:(state:EditorState,id:string,scope:import('../ai/context/editorContext').EditorScope)=>original.captureRenderedEditorContext(state,id,scope,async ()=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')}
})
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorState, type EditorAction } from '../state/editor'
import { AIComposer } from './AIComposer'
import { GenerationPanel } from './GenerationPanel'
import { ResultsPanel } from '../layers/ResultsPanel'
import { MessageHost } from '../components/MessageHost'
let latest: EditorState
let edit: (action: EditorAction) => void
let chatOverrides:ImageOverrides={}
function Setup() {
 const {start}=useImageGeneration()
 const { state, dispatch } = useEditor(); latest = state; edit = dispatch
 return <><button onClick={()=>start('generate',undefined,'document',chatOverrides)}>聊天图片任务</button><button onClick={() => {
  dispatch({ type:'set-composer-source', sourceId:'proxy' }); dispatch({type:'set-composer-parameter',parameter:'model',value:'image'})
  dispatch({type:'set-composer-parameter',parameter:'count',value:'4 张'}); dispatch({type:'set-composer-mode',mode:'generate'})
 }}>准备</button></>
}
function mount(masked = false) {
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{id:'proxy',provider:'OpenAI',name:'中转',baseUrl:'https://proxy.example/v1',apiKey:'never-in-history',protocol:'openai_compatible',models:['image'],enabled:true,generation:{multiImage:'split',concurrency:2,sendSize:false},...(masked ? {imageCapabilities:{image:{generate:true,edit:true,reference:true,encoding:'base64-json',maskedEdit:{semantics:'transparent-edit'}}}} : {})}]))
 const view=render(<><MessageHost/><EditorProvider><Setup/><AIComposer/><GenerationPanel/><ResultsPanel/><ResultStage/></EditorProvider></>)
 fireEvent.click(within(screen.getByRole('tablist',{name:'AI 快捷操作'})).getByRole('button',{name:'生成图片'}))
 return view
}
beforeEach(() => { vi.spyOn(window,'confirm').mockReturnValue(false); localStorage.removeItem('draivio-generation-confirmation-v1') })
afterEach(() => localStorage.removeItem('draivio-generation-confirmation-v1'))
afterEach(() => vi.restoreAllMocks())
test.each(['生成图片','修改图片'])('%s clears the submitted draft while preserving the request and later typing', async mode => {
 let finish!: (response:Response)=>void
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve}))
 mount(true);fireEvent.click(screen.getByText('准备'))
 act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}))
 fireEvent.click(within(screen.getByRole('tablist',{name:'AI 快捷操作'})).getByRole('button',{name:mode}))
 if(mode==='修改图片'){
  fireEvent.change(screen.getByLabelText('选择图片'),{target:{files:[new File(['png'],'reference.png',{type:'image/png'})]}})
  await screen.findByAltText('已添加图片 reference.png')
  fireEvent.change(screen.getByRole('combobox',{name:/^修改/}),{target:{value:'upload'}})
 }
 const input=screen.getByRole('textbox',{name:'AI 操作'})
 fireEvent.change(input,{target:{value:'把画面变成暖色'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(input).toHaveValue('')
 await waitFor(()=>expect(finish).toBeTypeOf('function'))
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).prompt).toBe('把画面变成暖色')
 fireEvent.change(input,{target:{value:'下一张的要求'}})
 await act(async()=>finish(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}))))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(input).toHaveValue('下一张的要求')
 expect(latest.aiResults[0].request?.prompt).toBe('把画面变成暖色')
})
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
 fireEvent.click(screen.getAllByRole('button',{name:/预览结果 /})[0]);fireEvent.click(screen.getByRole('button',{name:'作为新图层加入'}))
 expect(latest.layers).toHaveLength(before.length+1)
 expect(latest.aiResults.filter(r=>r.adopted)).toHaveLength(1)
 act(()=>edit({type:'undo'}));expect(latest.layers).toEqual(before);expect(latest.aiResults.every(r=>!r.adopted)).toBe(true)
 expect(fetcher).toHaveBeenCalledTimes(5)
})
test('generic edit support never silently falls back when a model lacks masked editing', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button',{name:'修改图片'}))
 expect(screen.getByRole('button',{name:'执行 AI 操作'})).toBeDisabled()
 expect(screen.getByRole('button',{name:'执行 AI 操作'})).toHaveAccessibleDescription(/此模型未声明蒙版编辑能力/)
 expect(fetcher).not.toHaveBeenCalled()
})

test.each(['生成图片','修改图片'])('%s sends an attached image to the reference endpoint and retains its provenance', async mode => {
 const fetcher = vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount(true); fireEvent.click(screen.getByText('准备'))
 act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}))
 fireEvent.click(screen.getByRole('tablist',{name:'AI 快捷操作'}).querySelector(`[aria-label="${mode}"]`)!)
 fireEvent.paste(screen.getByRole('textbox',{name:'AI 操作'}),{clipboardData:{files:[new File(['png'],'reference.png',{type:'image/png'})],items:[]}})
 await screen.findByAltText('已添加图片 reference.png')
 if(mode==='修改图片'){
  expect(screen.getByRole('combobox',{name:/^修改/})).toHaveValue('auto')
  expect(screen.getByText('参考图')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox',{name:/^修改/}),{target:{value:'document'}})
  expect(screen.getByAltText('已添加图片 reference.png')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox',{name:/^修改/}),{target:{value:'upload'}})
 }
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1))
 expect(String(fetcher.mock.calls[0][0])).toContain('images/edits')
 const payload = JSON.parse(fetcher.mock.calls[0][1]!.body as string)
 expect(payload.image).toBe('data:image/png;base64,cG5n')
 expect(payload.mask).toBeUndefined()
 expect(latest.aiResults[0].request).toMatchObject({intent:'reference',selection:null,reference:{source:payload.image,layerId:'attachment'}})
 expect(latest.layers).toHaveLength(2)
})

test('unsupported reference models never submit a text-only replacement request', async () => {
 const fetcher = vi.spyOn(globalThis,'fetch')
 mount(); fireEvent.click(screen.getByText('准备'))
 fireEvent.click(screen.getByRole('tablist',{name:'AI 快捷操作'}).querySelector('[aria-label="生成图片"]')!)
 fireEvent.change(screen.getByLabelText('选择图片'),{target:{files:[new File(['png'],'reference.png',{type:'image/png'})]}})
 await screen.findByAltText('已添加图片 reference.png')
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'保留这条未发送的描述'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(fetcher).not.toHaveBeenCalled()
 expect(latest.aiResults).toHaveLength(0)
 expect(screen.getByText(/此模型不支持参考图片/)).toBeInTheDocument()
 expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('保留这条未发送的描述')
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
test('edit entry reports inherited locks before submitting a real request', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount(true); fireEvent.click(screen.getByText('准备'))
 act(()=>edit({type:'toggle-layer-lock',id:latest.selectedLayerId}))
 fireEvent.click(screen.getByRole('button',{name:'修改图片'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(await screen.findByText(/所属组已锁定/)).toBeInTheDocument()
 expect(fetcher).not.toHaveBeenCalled()
})

test('keeps delayed downloaded results after content edits without replacing artwork or repeating a paid call',async()=>{
 let finish!:(response:Response)=>void
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(resolve=>{finish=resolve}))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}));fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(finish).toBeTypeOf('function'))
 act(()=>edit({type:'set-layer-opacity',id:latest.selectedLayerId,opacity:40}));const edited=latest.layers
 await act(async()=>finish(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}))))
 await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(latest.aiResults).toHaveLength(1)
 expect(latest.layers).toBe(edited);expect(fetcher).toHaveBeenCalledTimes(1)
 expect(screen.queryByRole('region',{name:'生成结果预览'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:/张图片已就绪/})).toBeInTheDocument()
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
 await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(latest.layers).toBe(before);expect(latest.aiResults).toHaveLength(0);expect(latest.undoStack).toEqual(undo)
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
 localStorage.removeItem('draivio-generation-confirmation-v1')
 let paid=0,quotes=0
 const send=vi.spyOn(cloudAccount,'request').mockImplementation(async(path)=>{
  if(path.endsWith('/quotes'))return {status:200,body:{totalCredits:++quotes===1?'2':'3'},retryAfter:1000}
  paid++;return paid===1?{status:400,body:{},retryAfter:1000}:{status:200,body:{data:[{b64_json:'aGVsbG8='}]},retryAfter:1000}
 })
 mountCloud();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findAllByRole('button',{name:'重试失败 / 补齐'})
 expect(paid).toBe(1)
 const quoted=send.mock.calls.find(([path])=>path.endsWith('/quotes'))![1]!.body as any
 const generated=send.mock.calls.find(([path])=>path.endsWith('/generations'))![1]!.body
 expect(quoted.request).toEqual(generated)
 fireEvent.click(screen.getAllByRole('button',{name:'重试失败 / 补齐'})[0])
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1))
 expect(quotes).toBe(2);expect(paid).toBe(2)
 expect(window.confirm).not.toHaveBeenCalled()
})
test('a failed cloud quote submits no generation requests',async()=>{
 const send=vi.spyOn(cloudAccount,'request').mockRejectedValue(new Error('云端报价失败'))
 mountCloud();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findByText('云端报价失败')
 expect(send.mock.calls.map(([path])=>path)).toEqual(['/api/model-gateway/v1/quotes'])
 expect(latest.aiResults).toHaveLength(0);expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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
 if (operation !== 'generate') fireEvent.click(screen.getByRole('button',{name:'修改图片'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(execute).toHaveBeenCalled(),{timeout:15000})
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(execute.mock.calls[0][1].operation).toBe(operation)
 expect(fetcher).not.toHaveBeenCalled();expect(latest.aiResults).toHaveLength(0)
})


test('starts immediately without a confirmation dialog or saved opt-out and supports another generation',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1));await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(screen.queryByRole('dialog',{name:'确认图片生成请求'})).not.toBeInTheDocument()
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'再生成一张春日海报'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(2));expect(fetcher).toHaveBeenCalledTimes(2)
 expect(window.confirm).not.toHaveBeenCalled();expect(localStorage.getItem('draivio-generation-confirmation-v1')).toBeNull()
})
test('ignores repeated Enter submissions while the image preview is being prepared',async()=>{
 const previews=await import('../ai/context/editorPreview'),capture=previews.captureRenderedEditorContext
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 const preview=vi.spyOn(previews,'captureRenderedEditorContext').mockImplementation(async(...args)=>{const context=await capture(...args);await gate;return context})
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(preview).toHaveBeenCalledOnce())
 fireEvent.keyDown(screen.getByRole('textbox',{name:'AI 操作'}),{key:'Enter'});expect(preview).toHaveBeenCalledOnce()
 await act(async()=>{release();await gate});await waitFor(()=>expect(latest.aiResults).toHaveLength(1));expect(fetcher).toHaveBeenCalledOnce()
})


test('composer keeps requests above the input with inline errors, linked results and retry of an older failed task', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('',{status:400})).mockImplementation(async()=>new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount();fireEvent.click(screen.getByText('准备'))
 act(()=>{edit({type:'set-composer-parameter',parameter:'count',value:'2 张'});edit({type:'set-prompt',prompt:'第一条：春日海报'})})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 const history=screen.getByRole('region',{name:'AI 任务记录'})
 expect(history.compareDocumentPosition(screen.getByRole('textbox',{name:'AI 操作'})) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
 let cards=within(history).getAllByRole('article')
 expect(cards).toHaveLength(1)
 expect(within(cards[0]).getByText('第一条：春日海报')).toBeInTheDocument()
 expect(within(cards[0]).getByText(/生图请求失败/)).toBeInTheDocument()
 expect(within(cards[0]).getByRole('img',{name:'生成结果 1'})).toBeInTheDocument()
 act(()=>{edit({type:'set-prompt',prompt:'第二条：蓝色海报'});edit({type:'set-composer-parameter',parameter:'count',value:'1 张'})})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(2));await waitFor(()=>expect(latest.isGenerating).toBe(false))
 cards=within(history).getAllByRole('article')
 expect(cards).toHaveLength(2)
 expect(within(cards[0]).getByText('第一条：春日海报')).toBeInTheDocument()
 expect(within(cards[1]).getByText('第二条：蓝色海报')).toBeInTheDocument()
 expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('')
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'尚未发送的下一条'}})
 fireEvent.click(within(cards[0]).getByRole('button',{name:'重试失败 / 补齐'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(3));await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(fetcher).toHaveBeenCalledTimes(4)
 const payload=JSON.parse(fetcher.mock.calls[3][1]!.body as string)
 expect(payload.prompt).toBe('第一条：春日海报')
 expect(within(history).getAllByRole('article')).toHaveLength(2)
 expect(within(history).queryByRole('button',{name:'重试失败 / 补齐'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'收起任务记录'}))
 expect(within(history).queryByRole('article')).not.toBeInTheDocument()
 expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('尚未发送的下一条')
 fireEvent.click(screen.getByRole('button',{name:'展开任务记录'}))
 expect(within(history).getAllByRole('article')).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'最小化 AI 对话框'}))
 expect(screen.queryByRole('region',{name:'AI 任务记录'})).not.toBeInTheDocument()
 fireEvent.focus(screen.getByRole('textbox',{name:'AI 操作'}))
 expect(screen.getByRole('region',{name:'AI 任务记录'})).toBeInTheDocument()
})


test('send button shows a stop icon and cancels the active request without accepting late results',async()=>{
 let respond!:(response:Response)=>void
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(resolve=>{respond=resolve}))
 mount();fireEvent.click(screen.getByText('准备'));act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'1 张'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
 const stop=screen.getByRole('button',{name:'停止当前任务'})
 expect(stop).toBeEnabled();expect(stop.querySelector('svg rect')).toBeInTheDocument()
 fireEvent.click(stop)
 await waitFor(()=>expect(screen.getByRole('button',{name:'执行 AI 操作'})).toBeEnabled())
 await act(async()=>respond(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}))))
 expect(latest.aiResults).toHaveLength(0);expect(latest.isGenerating).toBe(false)
})

test('stop during context preparation immediately releases the composer and prevents submission',async()=>{
 const previews=await import('../ai/context/editorPreview'),capture=previews.captureRenderedEditorContext
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve})
 vi.spyOn(previews,'captureRenderedEditorContext').mockImplementation(async(...args)=>{const context=await capture(...args);await gate;return context})
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount();fireEvent.click(screen.getByText('准备'));fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'停止当前任务'}))
 expect(latest.isGenerating).toBe(false)
 expect(screen.getByRole('button',{name:'执行 AI 操作'})).toBeEnabled()
 await act(async()=>{release();await gate})
 expect(fetcher).not.toHaveBeenCalled();expect(latest.aiResults).toHaveLength(0)
})

test('stop remains available during a cloud quote and prevents a paid generation after the quote resolves',async()=>{
 let finishQuote!:(value:any)=>void
 const send=vi.spyOn(cloudAccount,'request').mockImplementation(()=>new Promise(resolve=>{finishQuote=resolve}))
 mountCloud();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(send).toHaveBeenCalledTimes(1))
 fireEvent.click(screen.getByRole('button',{name:'停止当前任务'}))
 expect(latest.isGenerating).toBe(false)
 await act(async()=>finishQuote({status:200,body:{totalCredits:'2'},retryAfter:1000}))
 expect(send.mock.calls.map(([path])=>path)).toEqual(['/api/model-gateway/v1/quotes'])
 expect(latest.aiResults).toHaveLength(0)
})


test('chat task inherits defaults, applies one-shot count and freezes queued calls after composer changes',async()=>{
 const release:Array<(r:Response)=>void>=[]
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>release.push(resolve)))
 mount();fireEvent.click(screen.getByText('准备'));chatOverrides={count:3}
 fireEvent.click(screen.getByText('聊天图片任务'))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
 expect(latest.composerParameters.count).toBe('4 张')
 act(()=>{edit({type:'set-composer-parameter',parameter:'count',value:'1 张'});edit({type:'set-composer-parameter',parameter:'size',value:'2048 × 2048'})})
 await act(async()=>release[0](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}))))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(3))
 await act(async()=>{release[1](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})));release[2](new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))})
 await waitFor(()=>expect(latest.aiResults).toHaveLength(3))
 for(const r of latest.aiResults){
  expect(r.request?.parameters).toMatchObject({size:'1024 × 1024',count:'3 张',model:'image'})
  expect(r.generationMetadata).toMatchObject({defaults:{count:'4 张'},resolved:{count:'3 张'},overrides:{count:3},sent:{}})
  expect(r.generationMetadata?.sent.size).toBeUndefined()
 }
 expect(JSON.stringify(latest.aiResults)).not.toContain('never-in-history')
})
test.each([{size:'1280x720'},{ratio:'9:16' as const},{model:'missing'},{quality:'high' as const},{strength:.7}])('rejects unsupported explicit chat parameters before sending: %j',async overrides=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount();fireEvent.click(screen.getByText('准备'));chatOverrides=overrides
 fireEvent.click(screen.getByText('聊天图片任务'))
 await waitFor(()=>expect(screen.getByRole('button',{name:'执行 AI 操作'})).not.toBeDisabled())
 expect(fetcher).not.toHaveBeenCalled();expect(latest.aiResults).toHaveLength(0)
 expect(screen.getAllByText(/无法保证|未配置|不支持本次明确/).length).toBeGreaterThan(0)
})
test('chat overrides reach the provider with model, size, quality and strength without changing composer defaults',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='}]})))
 mount();fireEvent.click(screen.getByText('准备'))
 const providers=JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)
 providers[0].models.push('image-b')
 providers[0].generation.sendSize=true
 providers[0].imageCapabilities={'image-b':{generate:true,edit:false,reference:false,encoding:'base64-json',quality:['high'],supportsStrength:true}}
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify(providers))
 chatOverrides={model:'image-b',size:'1280x720',count:1,quality:'high',strength:.485}
 fireEvent.click(screen.getByText('聊天图片任务'))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1))
 expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string)).toMatchObject({model:'image-b',size:'1280x720',quality:'high',strength:.485})
 expect(latest.composerParameters).toMatchObject({model:'image',size:'1024 × 1024',count:'4 张'})
 expect(latest.aiResults[0]).toMatchObject({size:'1 × 1',generationMetadata:{resolved:{size:'1280 × 720'},sent:{size:'1280x720',quality:'high',strength:.485}}})
 fireEvent.click(screen.getAllByRole('button',{name:/预览结果 /})[0]);fireEvent.click(screen.getByText('图片详情'))
 expect(screen.getByText('image-b · 实际图片 1 × 1')).toBeInTheDocument()
 expect(screen.getByText(/本次请求：1280 × 720/)).toBeInTheDocument()
 expect(screen.getByText(/发送尺寸：1280x720 · 质量 high · 强度 0.485/)).toBeInTheDocument()
})

test('chat retry reuses submitted parameters instead of current composer values',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response('',{status:400})).mockResolvedValueOnce(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount();fireEvent.click(screen.getByText('准备'));chatOverrides={count:1}
 fireEvent.click(screen.getByText('聊天图片任务'))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(fetcher).toHaveBeenCalledTimes(1)
 act(()=>{edit({type:'set-composer-parameter',parameter:'model',value:'different'});edit({type:'set-composer-parameter',parameter:'size',value:'2048 × 2048'});edit({type:'set-composer-parameter',parameter:'count',value:'8 张'})})
 fireEvent.click(screen.getAllByRole('button',{name:'重试失败 / 补齐'})[0])
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1))
 expect(fetcher.mock.calls[1][1]!.body).toBe(fetcher.mock.calls[0][1]!.body)
 expect(latest.aiResults[0].request?.parameters).toMatchObject({model:'image',size:'1024 × 1024',count:'1 张'})
 expect(latest.composerParameters.count).toBe('8 张')
})

test('a preflight size rejection explains the unsupported parameter without claiming a request was sent',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount();fireEvent.click(screen.getByText('准备'))
 const providers=JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)
 providers[0].generation.sendSize=true
 providers[0].imageCapabilities={image:{generate:true,edit:false,reference:false,encoding:'base64-json',sizes:['1024x1024']}}
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify(providers))
 act(()=>edit({type:'set-composer-parameter',parameter:'size',value:'500 × 625'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(fetcher).not.toHaveBeenCalled()
 expect(screen.getAllByText(/模型不支持输出尺寸/).length).toBeGreaterThan(0)
 expect(screen.queryByRole('button',{name:'处理未知结果'})).not.toBeInTheDocument()
})
