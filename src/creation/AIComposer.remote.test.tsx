import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,it,expect,vi} from 'vitest'
import {EditorProvider,useEditor,type EditorState,type EditorAction} from '../state/editor'
import {AIComposer} from './AIComposer'
let latest:EditorState,edit:(a:EditorAction)=>void
const connection={id:'reasoning',name:'Local',provider:'Local',baseUrl:'http://127.0.0.1:45678/v1',apiKey:'local-test-only',protocol:'openai_compatible' as const,models:['vision'],enabled:true,modelCapabilities:{vision:{text:true,vision:true,image:false}},assistantModel:'vision'}
const result={steps:[{id:'s1',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}],explanation:'模型建议移动',clarifications:[],warnings:[]}
function Probe(){const {state,dispatch}=useEditor();latest=state;edit=dispatch;return <AIComposer/>}
function setup(){localStorage.setItem('draivio-service-connections-v1',JSON.stringify([connection]));vi.spyOn(window,'confirm').mockReturnValue(true);render(<EditorProvider><Probe/></EditorProvider>);fireEvent.click(screen.getByRole('button',{name:'编辑画布'}));fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'为当前画面建立一套复杂的光影层次方案'}})}
afterEach(()=>vi.restoreAllMocks())
it('executes configured reasoning with real image content and requires plan+private-preview adoption',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]})))
 setup();fireEvent.change(screen.getByLabelText('选择图片'),{target:{files:[new File(['png'],'reference.png',{type:'image/png'})]}})
 await waitFor(()=>expect(screen.getByAltText('已添加图片 reference.png')).toBeInTheDocument())
 const before=latest.layers
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(screen.getByText('模型建议移动')).toBeInTheDocument())
 const body=JSON.parse(fetcher.mock.calls[0][1]!.body as string);expect(body.model).toBe('vision');expect(body.messages[1].content[1].image_url.url).toMatch(/^data:image\/png;base64,/);expect(latest.layers).toBe(before)
 fireEvent.click(screen.getByText('确认执行计划'));await waitFor(()=>expect(screen.getByRole('button',{name:'采用预览'})).toBeInTheDocument());expect(latest.layers).toBe(before)
 fireEvent.click(screen.getByRole('button',{name:'采用预览'}));expect(latest.layers[0].transform?.rect.x).toBe(2);expect(JSON.stringify(latest)).not.toContain('local-test-only')
})
it('isolates cancelled and stale model completions without publishing plans or document changes',async()=>{
 const pending:((x:Response)=>void)[]=[];vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(r=>pending.push(r)))
 setup();const before=latest.layers;fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(pending).toHaveLength(1));fireEvent.click(screen.getByText('取消模型规划'))
 await act(async()=>pending[0](new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}))))
 expect(screen.queryByText('模型建议移动')).not.toBeInTheDocument();expect(latest.layers).toBe(before)
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'为当前画面建立一套复杂的光影层次方案'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));await waitFor(()=>expect(pending).toHaveLength(2));act(()=>edit({type:'rename-layer',id:'art',name:'manual'}));await act(async()=>pending[1](new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}))))
 expect(screen.queryByText('模型建议移动')).not.toBeInTheDocument();expect(screen.getByText(/文档已更改/)).toBeInTheDocument()
})


it('uses the same stop icon while planning and ignores the cancelled response',async()=>{
 let respond!:(response:Response)=>void
 vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>{respond=resolve}))
 setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 const stop=await screen.findByRole('button',{name:'停止当前任务'})
 expect(stop).toBeEnabled();fireEvent.click(stop)
 expect(screen.getByRole('button',{name:'执行 AI 操作'})).toBeEnabled()
 await act(async()=>respond(new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(result)}}]}))))
 expect(screen.queryByRole('button',{name:'确认执行计划'})).not.toBeInTheDocument()
})
