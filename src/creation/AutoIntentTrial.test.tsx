import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorAction, type EditorState } from '../state/editor'
import { AIComposer } from './AIComposer'
import * as generation from './ImageGeneration'

const originalGenerationHook=generation.useImageGeneration
const connection={id:'intent-test',name:'测试服务',provider:'Custom',baseUrl:'https://intent.invalid/v1',apiKey:'test-only',protocol:'openai_compatible',models:['text-model'],enabled:true,imageCapabilities:{'text-model':{generate:true,edit:true,reference:true,encoding:'base64-json',maskedEdit:{semantics:'transparent-edit'}}},modelCapabilities:{'text-model':{image:true,text:true,vision:false}}}
let edit:(a:EditorAction)=>void
let current:EditorState
function Probe(){const editor=useEditor();edit=editor.dispatch;current=editor.state;return <AIComposer/>}
function setup(){
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([connection]))
 const start=vi.fn()
 vi.spyOn(generation,'useImageGeneration').mockImplementation(()=>({...originalGenerationHook(),start}))
 render(<EditorProvider><Probe/></EditorProvider>)
 act(()=>{edit({type:'set-composer-source',sourceId:connection.id});edit({type:'set-composer-parameter',parameter:'model',value:'text-model'})})
 fireEvent.click(screen.getByRole('button',{name:'自动理解'}))
 fireEvent.click(screen.getByRole('button',{name:'选择推理模型'}))
 fireEvent.click(screen.getByRole('button',{name:'text-model · Custom · 测试服务'}))
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'新画一只猫'}})
 return start
}
const answer=(value:object)=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(value)}}]}))
const generate={kind:'generate',target:'document',targetIds:[],summary:'生成一张猫的图片',question:''}
afterEach(()=>vi.restoreAllMocks())
test('keeps manual buttons and confirms semantic understanding before calling generation',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(answer(generate))
 const start=setup()
 for(const name of ['生成图片','修改图片','编辑画布'])expect(screen.getByRole('button',{name})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 const confirm=await screen.findByRole('button',{name:'按此理解继续'})
 expect(fetcher).toHaveBeenCalledTimes(1);expect(start).not.toHaveBeenCalled()
 fireEvent.click(confirm)
 await waitFor(()=>expect(start).toHaveBeenCalledWith('generate',undefined,'document',{}))
})

test('uses image settings configured in automatic mode when the understood generation is confirmed',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer(generate))
 const start=setup()
 fireEvent.click(screen.getByRole('button',{name:'选择比例与分辨率'}))
 fireEvent.click(screen.getByRole('button',{name:'比例 16:9'}))
 fireEvent.click(screen.getByRole('button',{name:'1920 × 1080'}))
 fireEvent.click(screen.getByRole('button',{name:'选择数量'}))
 fireEvent.click(screen.getByRole('button',{name:'4 张'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 await waitFor(()=>expect(start).toHaveBeenCalledWith('generate',undefined,'document',{}))
 expect(current.composerParameters).toMatchObject({model:'text-model',ratio:'16:9',size:'1920 × 1080',count:'4 张'})
 expect(current.composerSourceId).toBe(connection.id)
})
test('manual button leaves trial and uses the original generation path',()=>{
 const start=setup()
 fireEvent.click(screen.getByRole('button',{name:'生成图片'}))
 expect(screen.getByRole('button',{name:'自动理解'})).toHaveAttribute('aria-pressed','false')
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(start).toHaveBeenCalledTimes(1)
})
test('mixed tasks ask a question and do not execute a partial task',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer({...generate,kind:'mixed',question:'先换背景还是移动标题？'}))
 const start=setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(await screen.findByText('先换背景还是移动标题？')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument();expect(start).not.toHaveBeenCalled()
})
test.each(['stop','prompt','content','manual','upload','document'])('invalidates a pending understanding after %s and ignores late answers',async(reason)=>{
 let respond!:(r:Response)=>void
 const fetcher=vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>{respond=resolve}))
 const start=setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
 if(reason==='stop')fireEvent.click(screen.getByRole('button',{name:'停止当前任务'}))
 if(reason==='prompt')fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'换成狗'}})
 if(reason==='content')act(()=>edit({type:'rename-layer',id:'art',name:'改名'}))
 if(reason==='manual')fireEvent.click(screen.getByRole('button',{name:'编辑画布'}))
 if(reason==='upload')fireEvent.change(screen.getByLabelText('选择图片'),{target:{files:[new File(['png'],'new.png',{type:'image/png'})]}})
 if(reason==='document')act(()=>edit({type:'new-document',width:100,height:100,background:'transparent'}))
 await act(async()=>respond(answer(generate)))
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument();expect(start).not.toHaveBeenCalled()
})

test('uses all explicitly identified image targets instead of the previous selection',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer({kind:'image-edit',target:'object',targetIds:['original','art'],summary:'修改两个图层',question:''}))
 const start=setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 await waitFor(()=>expect(start).toHaveBeenCalledWith('edit',undefined,'object',{}))
 expect(current.selectedLayerIds).toEqual(['original','art'])
})
test('routes a native edit to the named layer and retains the plan preview',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer({kind:'smart-plan',target:'object',targetIds:['original'],summary:'移动原图',question:''}))
 const start=setup()
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'把原图向右移动10像素'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 expect(await screen.findByRole('region',{name:'编辑计划预览'})).toBeInTheDocument()
 expect(current.selectedLayerId).toBe('original');expect(start).not.toHaveBeenCalled()
})
test('editing the prompt or provider invalidates an already understood result',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>answer(generate))
 setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findByRole('button',{name:'按此理解继续'})
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'换一个主题'}})
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findByRole('button',{name:'按此理解继续'})
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{...connection,enabled:false}]))
 act(()=>window.dispatchEvent(new Event('storage')))
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument()
})
test('replacing an existing upload cancels understanding even though an upload remains present',async()=>{
 let respond!:(r:Response)=>void
 vi.spyOn(globalThis,'fetch').mockImplementation(()=>new Promise(resolve=>{respond=resolve}))
 setup()
 const upload=screen.getByLabelText('选择图片')
 fireEvent.change(upload,{target:{files:[new File(['first'],'first.png',{type:'image/png'})]}})
 await screen.findByAltText('已添加图片 first.png')
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findByRole('button',{name:'停止当前任务'})
 fireEvent.change(upload,{target:{files:[new File(['second'],'second.png',{type:'image/png'})]}})
 await screen.findByAltText('已添加图片 second.png')
 await act(async()=>respond(answer(generate)))
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument()
})

test('uses the shared text model for both understanding and remote planning',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
  .mockResolvedValueOnce(answer({kind:'smart-plan',target:'object',targetIds:['art'],summary:'为当前图层规划光影调整',question:''}))
  .mockResolvedValueOnce(answer({steps:[{id:'s1',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}],explanation:'远端规划结果',clarifications:[],warnings:[]}))
 const start=setup()
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'为当前画面建立一套复杂的光影层次方案'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 expect(await screen.findByText('远端规划结果')).toBeInTheDocument()
 expect(fetcher).toHaveBeenCalledTimes(2);expect(start).not.toHaveBeenCalled()
 expect(JSON.parse(fetcher.mock.calls[1][1]!.body as string).model).toBe('text-model')
 expect(current.layers[0].transform).toBeUndefined()
})
test('does not partially execute a multi-object intent through a single-target local shortcut',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
  .mockResolvedValueOnce(answer({kind:'smart-plan',target:'object',targetIds:['original','art'],summary:'将两层向右移动10像素',question:''}))
  .mockResolvedValueOnce(answer({steps:['original','art'].map((layerId,i)=>({id:`s${i}`,tool:'move',args:{layerId,dx:10,dy:0},dependsOn:[]})),explanation:'移动两个图层',clarifications:[],warnings:[]}))
 setup()
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'把这两层向右移动10像素'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
 const plan=await screen.findByRole('region',{name:'编辑计划预览'})
 expect(plan.querySelectorAll('li')).toHaveLength(2)
 expect(current.layers.every(layer=>!layer.transform)).toBe(true)
})
test('blocks a remote plan that omits one of the confirmed semantic targets',async()=>{
 vi.spyOn(globalThis,'fetch')
  .mockResolvedValueOnce(answer({kind:'smart-plan',target:'document',targetIds:[],summary:'移动所有图层',question:''}))
  .mockResolvedValueOnce(answer({steps:[{id:'s1',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]}],explanation:'仅移动第一层',clarifications:[],warnings:[]}))
 setup()
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'所有图层都向右移动10像素'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 expect(await screen.findByText(/计划未覆盖全部已确认对象/)).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'确认执行计划'})).not.toBeInTheDocument()
 expect(current.layers.every(layer=>!layer.transform)).toBe(true)
})
test('always remotely plans multi-object semantic edits even when local steps happen to mention every object',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch')
  .mockResolvedValueOnce(answer({kind:'smart-plan',target:'object',targetIds:['original','art'],summary:'两层右移，然后旋转画面',question:''}))
  .mockResolvedValueOnce(answer({steps:[
   {id:'s1',tool:'move',args:{layerId:'original',dx:10,dy:0},dependsOn:[]},
   {id:'s2',tool:'move',args:{layerId:'art',dx:10,dy:0},dependsOn:[]},
   {id:'s3',tool:'rotate',args:{layerId:'art',degrees:30},dependsOn:['s2']},
  ],explanation:'完整的两层操作',clarifications:[],warnings:[]}))
 setup();act(()=>edit({type:'rename-layer',id:'art',name:'画面'}))
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'把这两层向右移动10像素，然后图层“画面”旋转30度'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 fireEvent.click(await screen.findByRole('button',{name:'按此理解继续'}))
 await waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(2))
 expect((await screen.findByRole('region',{name:'编辑计划预览'})).querySelectorAll('li')).toHaveLength(3)
})
test('previews task overrides, passes them to the image tool and keeps composer defaults untouched',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer({...generate,imageParameters:{count:2,ratio:'9:16'}}))
 const start=setup(),before={...current.composerParameters}
 fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value:'画两张9:16的猫咪海报'}})
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 const confirm=await screen.findByRole('button',{name:'按此理解继续'})
 expect(screen.getByLabelText('本次图片参数')).toHaveTextContent('720 × 1280')
 fireEvent.click(confirm)
 await waitFor(()=>expect(start).toHaveBeenCalledWith('generate',undefined,'document',{count:2,ratio:'9:16'}))
 expect(current.composerParameters).toEqual(before)
})
test('changing composer parameters invalidates a confirmed interpretation before image execution',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer(generate))
 setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findByRole('button',{name:'按此理解继续'})
 act(()=>edit({type:'set-composer-parameter',parameter:'count',value:'4 张'}))
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument()
})

test('checks image configuration again at confirmation even without a settings event',async()=>{
 vi.spyOn(globalThis,'fetch').mockResolvedValue(answer(generate))
 const start=setup();fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 const confirm=await screen.findByRole('button',{name:'按此理解继续'})
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{...connection,generation:{sendSize:false}}]))
 fireEvent.click(confirm)
 expect(screen.queryByRole('button',{name:'按此理解继续'})).not.toBeInTheDocument()
 expect(start).not.toHaveBeenCalled()
})
