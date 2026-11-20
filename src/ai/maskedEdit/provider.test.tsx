import {ResultStage} from '../../creation/ResultStage'
import { vi, it, expect, afterEach } from 'vitest'
vi.mock('./workflow', async original=>{const module=await original<typeof import('./workflow')>();const {testMaskedIO}=await import('./testIO');return {...module,fitMaskedEditToEndpoint:(p:Parameters<typeof module.fitMaskedEditToEndpoint>[0],size:Parameters<typeof module.fitMaskedEditToEndpoint>[1])=>module.fitMaskedEditToEndpoint(p,size,testMaskedIO),prepareMaskedEdit:(s:Parameters<typeof module.prepareMaskedEdit>[0],id:string,sem:Parameters<typeof module.prepareMaskedEdit>[2],_io:unknown,target:Parameters<typeof module.prepareMaskedEdit>[4])=>module.prepareMaskedEdit(s,id,sem,testMaskedIO,target),finishMaskedEdit:(p:Parameters<typeof module.finishMaskedEdit>[0],raw:string,_io:unknown,strict:boolean)=>module.finishMaskedEdit(p,raw,testMaskedIO,strict)}})
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorProvider, useEditor, type EditorState, type EditorAction } from '../../state/editor'
import { AIComposer } from '../../creation/AIComposer'
import { ResultsPanel } from '../../layers/ResultsPanel'
import { testMaskedIO } from './testIO'
import {createSelection} from '../../canvas/selectionGeometry'
let latest:EditorState,dispatch:(a:EditorAction)=>void
function Setup(){const e=useEditor();latest=e.state;dispatch=e.dispatch;return null}
function mount(){localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{id:'masked',name:'蒙版模型',provider:'OpenAI',protocol:'openai_compatible',baseUrl:'https://provider.example/v1',apiKey:'not-for-provenance',enabled:true,models:['gpt-image-1'],generation:{multiImage:'single',concurrency:1,sendSize:false}}]));render(<EditorProvider><Setup/><AIComposer/><ResultsPanel/><ResultStage/></EditorProvider>);act(()=>{dispatch({type:'restore-project',document:{...latest,documentWidth:4,documentHeight:4}});dispatch({type:'set-composer-source',sourceId:'masked'});dispatch({type:'set-composer-parameter',parameter:'model',value:'gpt-image-1'});dispatch({type:'set-composer-parameter',parameter:'count',value:'1 张'});dispatch({type:'set-prompt',prompt:''})});fireEvent.click(screen.getByRole('button',{name:'修改图片'}))}
afterEach(()=>vi.restoreAllMocks())
it('submits an empty removal prompt with a real PNG mask, stages candidate, compares raw result, adopts and undoes',async()=>{
 const source=testMaskedIO.encode({width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},()=>[0,0,255,255]).flat())})
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:source.split(',')[1]}]})))
 mount();const layers=latest.layers.length
 expect(screen.getByRole('button',{name:'执行 AI 操作'})).toBeEnabled()
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1),{timeout:15000})
 expect(latest.layers).toHaveLength(layers);expect(latest.aiResults[0].adopted).toBe(false)
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 act(()=>dispatch({type:'set-generating',value:true}));fireEvent.click(screen.getByRole('button',{name:/预览结果/}));expect(screen.getByRole('button',{name:/^应用到/})).toBeDisabled();act(()=>dispatch({type:'set-generating',value:false}));expect(screen.getByRole('button',{name:/^应用到/})).toBeEnabled()
 const form=fetcher.mock.calls[0][1]?.body as FormData
 expect(form).toBeInstanceOf(FormData);expect(form.get('prompt')).toBe('');expect(form.get('mask')).toBeInstanceOf(File);expect(form.get('image')).toBeInstanceOf(File)
 expect(String(fetcher.mock.calls[0][0])).toContain('/images/edits')
 fireEvent.click(screen.getByText('图片详情'));expect(screen.getByText('查看完整原始结果与蒙版')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:/^应用到/}));expect(latest.layers).toHaveLength(layers+1)
 act(()=>dispatch({type:'undo'}));expect(latest.layers).toHaveLength(layers)
 expect(JSON.stringify(latest.aiResults)).not.toContain('not-for-provenance')
})
it('starts masked editing directly and HTTP failure does not alter pixels or add candidates',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:400}))
 mount();const original=JSON.stringify(latest.layers)
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce(),{timeout:15000});await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(screen.queryByRole('dialog',{name:'确认图片生成请求'})).not.toBeInTheDocument()
 expect(latest.aiResults).toHaveLength(0);expect(JSON.stringify(latest.layers)).toBe(original)
})
it('cancels an already submitted masked edit and drops its late result',async()=>{
 let resolve!:(r:Response)=>void
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(done=>{resolve=done}))
 mount();const original=JSON.stringify(latest.layers)
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(fetcher).toHaveBeenCalled(),{timeout:15000})
 fireEvent.click(screen.getByRole('button',{name:'取消编辑'}))
 const source=testMaskedIO.encode({width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},()=>[0,0,255,255]).flat())})
 await act(async()=>resolve(new Response(JSON.stringify({data:[{b64_json:source.split(',')[1]}]}))))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(latest.aiResults).toHaveLength(0);expect(JSON.stringify(latest.layers)).toBe(original)
})
it('maps a standard GPT output back into a 500x625 selection and keeps unselected pixels unchanged',async()=>{
 const source=testMaskedIO.encode({width:1024,height:1536,data:new Uint8ClampedArray(1024*1536*4).fill(255)})
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:source.split(',')[1]}]})))
 mount()
 act(()=>{
  dispatch({type:'restore-project',document:{...latest,documentWidth:500,documentHeight:625,selectionVisible:true,selection:createSelection('rectangle',{x:40,y:20,width:20,height:25})}})
  dispatch({type:'set-prompt',prompt:'帮我把这个太阳换成月亮'})
  dispatch({type:'set-composer-parameter',parameter:'size',value:'auto'})
 })
 const before=JSON.stringify(latest.layers)
 fireEvent.click(screen.getByRole('button',{name:'修改图片'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.isGenerating).toBe(false),{timeout:15000})
 expect(fetcher).toHaveBeenCalledOnce()
 expect(latest.aiResults).toHaveLength(1)
 expect(latest.aiResults[0].size).toBe('500 × 625')
 expect(latest.aiResults[0].request?.maskedEdit?.raw?.source).toBe(source)
 expect(JSON.stringify(latest.layers)).toBe(before)
 const result=await testMaskedIO.decode(latest.aiResults[0].source!)
 expect([result.width,result.height]).toEqual([500,625])
 expect(screen.getByText(/已完成 1\/1/)).toBeInTheDocument()
},20000)

it('keeps the returned original and explains a local mapping failure instead of reporting an unknown request',async()=>{
 const source=testMaskedIO.encode({width:16,height:12,data:new Uint8ClampedArray(16*12*4).fill(255)})
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:source.split(',')[1]}]})))
 mount();const before=JSON.stringify(latest.layers)
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledOnce(),{timeout:15000})
 await waitFor(()=>expect(latest.isGenerating).toBe(false),{timeout:15000})
 expect(latest.aiResults).toHaveLength(1)
 expect(latest.aiResults[0].source).toBe(source)
 expect(latest.aiResults[0].request?.maskedEdit).toBeUndefined()
 expect(latest.aiResults[0].request?.mode).toBe('generate')
 expect(JSON.stringify(latest.layers)).toBe(before)
 expect(screen.getAllByText(/图片已返回.*完整原图已保留/).length).toBeGreaterThan(0)
 expect(screen.queryByRole('button',{name:'处理未知结果'})).not.toBeInTheDocument()
 expect(fetcher).toHaveBeenCalledOnce()
},20000)

it('does not validate an omitted composer size against GPT API dimensions',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:400}))
 mount();act(()=>dispatch({type:'set-composer-parameter',parameter:'size',value:'500 × 625'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.isGenerating).toBe(false),{timeout:15000})
 expect(fetcher).toHaveBeenCalledOnce()
 expect((fetcher.mock.calls[0][1]!.body as FormData).get('size')).toBeNull()
})
