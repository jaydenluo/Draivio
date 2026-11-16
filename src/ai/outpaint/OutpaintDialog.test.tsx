import {aiManualToolCoverage} from '../tools/toolCoverage'
import { act,fireEvent,render,screen,waitFor } from '@testing-library/react'
import { vi,it,expect,afterEach } from 'vitest'
vi.mock('./workflow',async original=>{const m=await original<typeof import('./workflow')>();const {testMaskedIO}=await import('../maskedEdit/testIO');return {...m,generateOutpaint:(...args:Parameters<typeof m.generateOutpaint>)=>m.generateOutpaint(args[0],args[1],args[2],args[3],args[4],{...args[5],io:testMaskedIO})}})
import { OutpaintDialog } from './OutpaintDialog'
import { EditorProvider,useEditor,type EditorState,type EditorAction } from '../../state/editor'
import { ResultsPanel } from '../../layers/ResultsPanel'
import { testMaskedIO } from '../maskedEdit/testIO'
let latest:EditorState,dispatch:(a:EditorAction)=>void
function Setup(){const e=useEditor();latest=e.state;dispatch=e.dispatch;return null}
function mount(){localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{id:'masked',name:'蒙版模型',provider:'OpenAI',protocol:'openai_compatible',baseUrl:'https://provider.example/v1',apiKey:'never-provenance',enabled:true,models:['gpt-image-1'],imageCapabilities:{'gpt-image-1':{generate:true,edit:true,reference:true,encoding:'multipart',maskedEdit:{semantics:'transparent-edit',maxDimension:1024}}}}]));render(<EditorProvider><Setup/><OutpaintDialog onClose={()=>{}}/><ResultsPanel/></EditorProvider>);act(()=>{dispatch({type:'set-composer-source',sourceId:'masked'});dispatch({type:'set-composer-parameter',parameter:'model',value:'gpt-image-1'})})}
afterEach(()=>vi.restoreAllMocks())
it('updates ratio/anchor/pixel geometry, explicit limits and exact calls without submitting',()=>{
 const fetcher=vi.spyOn(globalThis,'fetch');mount()
 expect(screen.getByLabelText('扩图调用计划')).toHaveTextContent('端点上限 1024px')
 fireEvent.change(screen.getByLabelText('扩图最终宽度'),{target:{value:'600'}});fireEvent.change(screen.getByLabelText('扩图原图锚点'),{target:{value:'top-left'}})
 expect(screen.getByLabelText('扩图调用计划')).toHaveTextContent('原图偏移 0, 0')
 fireEvent.change(screen.getByLabelText('扩图常用比例'),{target:{value:'1:1'}});expect(screen.getByLabelText('扩图最终宽度')).toHaveValue(625)
 fireEvent.pointerDown(screen.getByLabelText('拖动扩图right-bottom'),{pointerId:1,clientX:10,clientY:10});fireEvent.pointerMove(screen.getByLabelText('扩图拖拽预览'),{pointerId:1,clientX:20,clientY:20});fireEvent.pointerUp(screen.getByLabelText('扩图拖拽预览'),{pointerId:1});expect(screen.getByLabelText('扩图最终宽度')).toHaveValue(635)
 expect(screen.getByRole('button',{name:'生成扩图候选'})).toBeDisabled();expect(fetcher).not.toHaveBeenCalled()
})
it('does not mutate canvas when upload is unconfirmed and cancels without an API call',()=>{const fetcher=vi.spyOn(globalThis,'fetch');mount();const before=JSON.stringify(latest.layers);fireEvent.click(screen.getByRole('button',{name:'生成扩图候选'}));expect(fetcher).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'取消扩图'}));expect(JSON.stringify(latest.layers)).toBe(before)})

it('calls a real masked-edit contract only after confirmation, stages candidate, and atomically adopts/undoes',async()=>{
 const execute=vi.spyOn(aiManualToolCoverage.outpaint,'execute')
 const raw=testMaskedIO.encode({width:1,height:1,data:new Uint8ClampedArray([50,60,70,255])})
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({data:[{b64_json:raw.split(',')[1]}]})))
 mount();const before=latest.layers.length,width=latest.documentWidth
 expect(screen.getByLabelText('扩图调用计划')).toHaveTextContent('预计 1 次调用')
 fireEvent.click(screen.getByLabelText('确认扩图上传与调用数'));fireEvent.click(screen.getByRole('button',{name:'生成扩图候选'}))
 await waitFor(()=>expect(latest.aiResults).toHaveLength(1),{timeout:15000});await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(execute).toHaveBeenCalledOnce()
 expect(latest.documentWidth).toBe(width);expect(latest.layers).toHaveLength(before)
 const body=fetcher.mock.calls[0][1]?.body as FormData;expect(body.get('mask')).toBeInstanceOf(File);expect(body.get('image')).toBeInstanceOf(File);expect(String(fetcher.mock.calls[0][0])).toContain('/images/edits')
 fireEvent.click(screen.getByRole('button',{name:'采用扩图'}));expect(latest.documentWidth).toBeGreaterThan(width);expect(latest.layers).toHaveLength(before+1)
 act(()=>dispatch({type:'undo'}));expect(latest.documentWidth).toBe(width);expect(latest.layers).toHaveLength(before)
 expect(JSON.stringify(latest.aiResults)).not.toContain('never-provenance')
})
it('late completion after canvas change is discarded and failed/cancelled requests never resize',async()=>{
 let resolve!:(response:Response)=>void
 vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(done=>{resolve=done}))
 mount();const before=latest.layers.length,width=latest.documentWidth
 fireEvent.click(screen.getByLabelText('确认扩图上传与调用数'));fireEvent.click(screen.getByRole('button',{name:'生成扩图候选'}));await waitFor(()=>expect(resolve).toBeTypeOf('function'),{timeout:15000})
 act(()=>dispatch({type:'set-layer-opacity',id:latest.selectedLayerId,opacity:50}))
 const raw=testMaskedIO.encode({width:1,height:1,data:new Uint8ClampedArray([30,40,50,255])})
 await act(async()=>resolve(new Response(JSON.stringify({data:[{b64_json:raw.split(',')[1]}]}))))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(latest.documentWidth).toBe(width);expect(latest.layers).toHaveLength(before);expect(latest.aiResults).toHaveLength(0);expect(screen.getByRole('alert')).toHaveTextContent('已改变')
})
it('discarding an in-flight request via cancel leaves canvas unchanged',async()=>{
 let resolve!:(response:Response)=>void;vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise<Response>(done=>{resolve=done}))
 mount();const width=latest.documentWidth
 fireEvent.click(screen.getByLabelText('确认扩图上传与调用数'));fireEvent.click(screen.getByRole('button',{name:'生成扩图候选'}));await waitFor(()=>expect(resolve).toBeTypeOf('function'),{timeout:15000})
 fireEvent.click(screen.getByRole('button',{name:'停止扩图'}));await act(async()=>resolve(new Response('',{status:400})))
 expect(latest.documentWidth).toBe(width);expect(latest.aiResults).toHaveLength(0);expect(latest.isGenerating).toBe(false)
})

it('consumes registered outpaint execution and rejects without transport or mutation',async()=>{
 const execute=vi.spyOn(aiManualToolCoverage.outpaint,'execute').mockRejectedValueOnce(new Error('registered outpaint denied'))
 const fetcher=vi.spyOn(globalThis,'fetch');mount();const width=latest.documentWidth
 fireEvent.click(screen.getByLabelText('确认扩图上传与调用数'));fireEvent.click(screen.getByRole('button',{name:'生成扩图候选'}))
 await waitFor(()=>expect(execute).toHaveBeenCalled(),{timeout:15000});await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(fetcher).not.toHaveBeenCalled();expect(latest.aiResults).toHaveLength(0);expect(latest.documentWidth).toBe(width)
 expect(screen.getByRole('alert')).toHaveTextContent('registered outpaint denied')
})
