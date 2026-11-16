import { vi, it, expect, afterEach } from 'vitest'
vi.mock('./workflow', async original=>{const module=await original<typeof import('./workflow')>();const {testMaskedIO}=await import('./testIO');return {...module,prepareMaskedEdit:(s:Parameters<typeof module.prepareMaskedEdit>[0],id:string,sem:Parameters<typeof module.prepareMaskedEdit>[2])=>module.prepareMaskedEdit(s,id,sem,testMaskedIO),finishMaskedEdit:(p:Parameters<typeof module.finishMaskedEdit>[0],raw:string)=>module.finishMaskedEdit(p,raw,testMaskedIO)}})
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EditorProvider, useEditor, type EditorState, type EditorAction } from '../../state/editor'
import { AIComposer } from '../../creation/AIComposer'
import { ResultsPanel } from '../../layers/ResultsPanel'
import { testMaskedIO } from './testIO'
let latest:EditorState,dispatch:(a:EditorAction)=>void
function Setup(){const e=useEditor();latest=e.state;dispatch=e.dispatch;return null}
function mount(){localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{id:'masked',name:'蒙版模型',provider:'OpenAI',protocol:'openai_compatible',baseUrl:'https://provider.example/v1',apiKey:'not-for-provenance',enabled:true,models:['gpt-image-1'],generation:{multiImage:'single',concurrency:1,sendSize:false}}]));render(<EditorProvider><Setup/><AIComposer/><ResultsPanel/></EditorProvider>);act(()=>{dispatch({type:'restore-project',document:{...latest,documentWidth:4,documentHeight:4}});dispatch({type:'set-composer-source',sourceId:'masked'});dispatch({type:'set-composer-parameter',parameter:'model',value:'gpt-image-1'});dispatch({type:'set-composer-parameter',parameter:'count',value:'1 张'});dispatch({type:'set-prompt',prompt:''})})}
afterEach(()=>vi.restoreAllMocks())
it('submits an empty removal prompt with a real PNG mask, stages candidate, compares raw result, adopts and undoes',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true)
 const source=testMaskedIO.encode({width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},()=>[0,0,255,255]).flat())})
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:source.split(',')[1]}]})))
 mount();const layers=latest.layers.length
 expect(screen.getByText(/作用范围：当前选区/)).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1),{timeout:15000})
 expect(latest.layers).toHaveLength(layers);expect(latest.aiResults[0].adopted).toBe(false)
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 act(()=>dispatch({type:'set-generating',value:true}));expect(screen.getByRole('button',{name:'新增图层'})).toBeDisabled();expect(screen.getByRole('button',{name:'替换当前'})).toBeDisabled();expect(screen.getByText('批次完成后可采用')).toBeInTheDocument();act(()=>dispatch({type:'set-generating',value:false}));expect(screen.getByRole('button',{name:'新增图层'})).toBeEnabled()
 const form=fetcher.mock.calls[0][1]?.body as FormData
 expect(form).toBeInstanceOf(FormData);expect(form.get('prompt')).toBe('');expect(form.get('mask')).toBeInstanceOf(File);expect(form.get('image')).toBeInstanceOf(File)
 expect(String(fetcher.mock.calls[0][0])).toContain('/images/edits')
 fireEvent.click(screen.getByRole('button',{name:/预览结果/}));expect(screen.getByText('查看完整原始结果与蒙版')).toBeInTheDocument();fireEvent.click(screen.getByRole('button',{name:'关闭预览'}))
 fireEvent.click(screen.getByRole('button',{name:'新增图层'}));expect(latest.layers).toHaveLength(layers+1)
 act(()=>dispatch({type:'undo'}));expect(latest.layers).toHaveLength(layers)
 expect(JSON.stringify(latest.aiResults)).not.toContain('not-for-provenance')
})
it('cancelled upload and HTTP failure do not alter document pixels or add candidates',async()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(false),fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('',{status:400}))
 mount();const original=JSON.stringify(latest.layers)
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(latest.isGenerating).toBe(false),{timeout:15000});expect(fetcher).not.toHaveBeenCalled();expect(JSON.stringify(latest.layers)).toBe(original)
 confirm.mockReturnValue(true);fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(fetcher).toHaveBeenCalled(),{timeout:15000});await waitFor(()=>expect(latest.isGenerating).toBe(false));expect(latest.aiResults).toHaveLength(0);expect(JSON.stringify(latest.layers)).toBe(original)
})
it('cancels an already submitted masked edit and drops its late result',async()=>{
 vi.spyOn(window,'confirm').mockReturnValue(true)
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
