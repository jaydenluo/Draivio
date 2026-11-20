import { useAssistantModel } from './useAssistantModel'
vi.mock('../ai/context/editorPreview', async importOriginal => {
 const original = await importOriginal<typeof import('../ai/context/editorPreview')>()
 return {...original,captureRenderedEditorContext:(state:import('../state/editor').EditorState,id:string,scope:import('../ai/context/editorContext').EditorScope)=>original.captureRenderedEditorContext(state,id,scope,async ()=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')}
})
import { act, fireEvent, render as renderView, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MessageHost } from '../components/MessageHost'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { ServiceSourceSettings } from './ServiceSourceSettings'
import { loadConnections } from './serviceConnections'
import { ModelSourcePicker } from './ModelSourcePicker'
import { AIComposer } from './AIComposer'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'

beforeEach(() => localStorage.clear())
const render = (view: ReactNode) => renderView(<><MessageHost />{view}</>)
beforeEach(() => vi.spyOn(window,'confirm').mockReturnValue(true))
afterEach(() => vi.restoreAllMocks())
function addAccount(name: string) {
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: name } })
  fireEvent.change(screen.getByLabelText('密钥'), { target: { value: 'test-secret' } })
  fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'my-image-model' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
}
test('saves multiple accounts and updates the model selector immediately', async () => {
  render(<><ServiceSourceSettings onClose={() => {}} /><ModelSourcePicker sourceId="draivio-cloud" modelCode="image-pro" onSourceChange={() => {}} onModelChange={() => {}} /></>)
  addAccount('个人')
  await screen.findByRole('button', { name: '编辑 OpenAI · 个人' })
  expect(screen.getByText('服务来源已保存').closest('.message-host')).not.toBeNull()
  addAccount('工作')
  await screen.findByRole('button', { name: '编辑 OpenAI · 工作' })
  fireEvent.click(screen.getByRole('button', { name: /选择模型：请选择/ }))
  expect(screen.getByRole('button', { name: 'my-image-model · OpenAI · 个人' })).toBeEnabled()
  expect(screen.getByRole('button', { name: 'my-image-model · OpenAI · 工作' })).toBeEnabled()
  expect(JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)).toHaveLength(2)
})

test('keeps the draft and reports a failed save', async () => {
  render(<ServiceSourceSettings onClose={() => {}} />)
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disk full') })
  addAccount('个人')
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.getByLabelText('名称')).toHaveValue('个人')
})

test('does not overwrite corrupt stored settings', async () => {
  localStorage.setItem('draivio-service-connections-v1', '{broken')
  render(<ServiceSourceSettings onClose={() => {}} />)
  await waitFor(() => expect(screen.getByRole('button', { name: '添加来源' })).toBeDisabled())
  expect(localStorage.getItem('draivio-service-connections-v1')).toBe('{broken')
})

test('preserves the source ID in submitted operations without retaining credentials', async () => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] })))
  let state: EditorState | undefined
  function Observe() { state = useEditor().state; return null }
  render(<EditorProvider><ServiceSourceSettings onClose={() => {}} /><AIComposer /><Observe /></EditorProvider>)
  addAccount('工作')
  await screen.findByRole('button', { name: '编辑 OpenAI · 工作' })
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'my-image-model · OpenAI · 工作' }))
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  expect(screen.getByText('供应商计费')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  await waitFor(() => expect(state?.aiResults[0]?.request?.modelCode).toBe('my-image-model'), { timeout: 2000 })
  expect(state?.aiResults[0]?.request?.sourceId).toMatch(/^custom-/)
  expect(JSON.stringify(state)).not.toContain('test-secret')
  fireEvent.click(screen.getByLabelText('启用 OpenAI · 工作'))
  await waitFor(() => expect(screen.getByRole('button', { name: '执行 AI 操作' })).toBeDisabled())
})
test('supports masking, disable and delete without retaining the key in selector labels', async () => {
  render(<ServiceSourceSettings onClose={() => {}} />)
  addAccount('个人')
  const edit = await screen.findByRole('button', { name: '编辑 OpenAI · 个人' })
  fireEvent.click(edit)
  expect(screen.getByLabelText('密钥')).toHaveAttribute('type', 'password')
  fireEvent.click(screen.getByRole('button', { name: '显示密钥' }))
  expect(screen.getByLabelText('密钥')).toHaveAttribute('type', 'text')
  fireEvent.click(screen.getByRole('button', { name: '关闭来源编辑' }))
  fireEvent.click(screen.getByLabelText('启用 OpenAI · 个人'))
  await waitFor(() => expect(screen.getByLabelText('启用 OpenAI · 个人')).not.toBeChecked())
  fireEvent.click(screen.getByRole('button', { name: '编辑 OpenAI · 个人' }))
  fireEvent.click(screen.getByRole('button', { name: '删除' }))
  fireEvent.click(screen.getByRole('button', { name: '确认删除' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '编辑 OpenAI · 个人' })).not.toBeInTheDocument())
})

test('selects protocol presets, preserves proxy URLs and reopens saved protocol', async () => {
  render(<ServiceSourceSettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  fireEvent.change(screen.getByLabelText('平台'), { target: { value: 'Google' } })
  expect(screen.getByLabelText('协议')).toHaveValue('gemini')
  expect(screen.getByLabelText('地址')).toHaveValue('https://generativelanguage.googleapis.com/v1beta')
  fireEvent.change(screen.getByLabelText('地址'), { target: { value: 'https://proxy.example/api' } })
  fireEvent.change(screen.getByLabelText('协议'), { target: { value: 'bfl' } })
  expect(screen.getByLabelText('地址')).toHaveValue('https://proxy.example/api')
  expect(screen.getByRole('button', { name: '测试' })).toBeDisabled()
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '代理账号' } })
  fireEvent.change(screen.getByLabelText('密钥'), { target: { value: 'test-secret' } })
  fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'my-flux-model' } })
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  fireEvent.click(await screen.findByRole('button', { name: '编辑 Google · 代理账号' }))
  expect(screen.getByLabelText('协议')).toHaveValue('bfl')
  expect(screen.getByLabelText('模型')).toHaveValue('my-flux-model')
  expect(screen.getByLabelText('地址')).toHaveValue('https://proxy.example/api')
})

test('keeps the service editor focused on connection essentials', async () => {
  render(<ServiceSourceSettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  fireEvent.change(screen.getByLabelText('名称'), { target: { value: '中转' } })
  fireEvent.change(screen.getByLabelText('密钥'), { target: { value: 'test-only' } })
  fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'image-a, image-b' } })
  expect(screen.queryByText('生成设置')).not.toBeInTheDocument()
  expect(screen.queryByText('图片调用费用估算')).not.toBeInTheDocument()
  expect(screen.queryByText('接口说明')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  fireEvent.click(await screen.findByRole('button', { name: '编辑 OpenAI · 中转' }))
  expect(screen.queryByText('生成设置')).not.toBeInTheDocument()
})

test('opens an editor over the drawer, fetches and filters models while preserving manual selections',async()=>{
 vi.spyOn(globalThis,'fetch').mockImplementation(async()=>new Response(JSON.stringify({data:[{id:'image-a'},{id:'image-b'},{id:'chat-model'}]})))
 render(<ServiceSourceSettings onClose={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'添加来源'}))
 expect(screen.getByRole('dialog',{name:'添加服务来源'})).toBeInTheDocument()
 fireEvent.change(screen.getByLabelText('名称'),{target:{value:'中转'}})
 fireEvent.change(screen.getByLabelText('密钥'),{target:{value:'test-key'}})
 fireEvent.change(screen.getByLabelText('模型'),{target:{value:'manual-image'}})
 fireEvent.click(screen.getByRole('button',{name:'获取模型列表'}))
 await screen.findByRole('checkbox',{name:'使用模型 image-a'})
 fireEvent.change(screen.getByLabelText('搜索模型'),{target:{value:'image-'}})
 expect(screen.queryByRole('checkbox',{name:'使用模型 chat-model'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('checkbox',{name:'使用模型 image-a'}))
 expect(screen.getByLabelText('模型')).toHaveValue('manual-image, image-a')
 fireEvent.click(screen.getByRole('button',{name:'保存'}))
 await screen.findByRole('button',{name:'编辑 OpenAI · 中转'})
 expect(screen.getByRole('dialog',{name:'服务来源管理'})).toHaveClass('service-settings--drawer')
 expect(JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)[0].models).toEqual(['manual-image','image-a'])
})
test('Escape closes only the editor and returns to the drawer',()=>{
 const onClose=vi.fn()
 render(<ServiceSourceSettings onClose={onClose}/>);
 fireEvent.click(screen.getByRole('button',{name:'添加来源'}))
 fireEvent.keyDown(document,{key:'Escape'})
 expect(onClose).not.toHaveBeenCalled()
 expect(screen.queryByRole('dialog',{name:'添加服务来源'})).not.toBeInTheDocument()
 expect(screen.getByRole('dialog',{name:'服务来源管理'})).toBeInTheDocument()
 fireEvent.keyDown(document,{key:'Escape'})
 expect(onClose).toHaveBeenCalledTimes(1)
})

test('ignores a model response from a closed editor', async () => {
  let resolveResponse!: (value: Response) => void
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { resolveResponse = resolve }))
  render(<ServiceSourceSettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  fireEvent.change(screen.getByLabelText('密钥'), { target: { value: 'test-key' } })
  fireEvent.click(screen.getByRole('button', { name: '获取模型列表' }))
  fireEvent.click(screen.getByRole('button', { name: '关闭来源编辑' }))
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  await act(async () => { resolveResponse(new Response(JSON.stringify({ data: [{ id: 'old-image' }] }))) })
  expect(screen.queryByRole('checkbox', { name: '使用模型 old-image' })).not.toBeInTheDocument()
  expect(screen.getByLabelText('模型')).toHaveValue('')
})

test('retains selected models when refreshing the supplier list fails', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 401 }))
  render(<ServiceSourceSettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '添加来源' }))
  fireEvent.change(screen.getByLabelText('密钥'), { target: { value: 'test-key' } })
  fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'manual-image' } })
  fireEvent.click(screen.getByRole('button', { name: '获取模型列表' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '获取模型列表' })).toBeEnabled())
  expect(screen.getByLabelText('模型')).toHaveValue('manual-image')
  expect(screen.getByRole('checkbox', { name: '使用模型 manual-image' })).toBeChecked()
})

test('does not require model capability configuration to save a source', async () => {
 localStorage.setItem('draivio-service-connections-v1', JSON.stringify([
  {id:'personal',provider:'OpenAI',name:'个人',baseUrl:'https://example.com/v1',apiKey:'key',protocol:'openai_compatible',enabled:true,models:['image-z','shared','image-a']},
  {id:'work',provider:'OpenAI',name:'工作',baseUrl:'https://example.com/v1',apiKey:'key',protocol:'openai_compatible',enabled:true,models:['shared'],modelCapabilities:{shared:{image:true,text:true,vision:false}}}
 ]))
 await loadConnections()
 let editorState: EditorState | undefined
 let selectedAssistant: ReturnType<typeof useAssistantModel>['selected']
 function ObserveAssistantIndependence() { editorState = useEditor().state; selectedAssistant = useAssistantModel().selected; return null }
 render(<EditorProvider><ServiceSourceSettings onClose={()=>{}} /><ObserveAssistantIndependence /></EditorProvider>)
 const originalImageSource=editorState!.composerSourceId, originalImageModel=editorState!.composerParameters.model
 expect(selectedAssistant).toMatchObject({sourceId:'work',model:'shared'})
 fireEvent.click(screen.getByRole('button',{name:'编辑 OpenAI · 个人'}))
 expect(screen.queryByText('模型能力')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'保存'}))
 await screen.findByRole('button',{name:'编辑 OpenAI · 个人'})
 const records=JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)
 expect(records.map((c:{id:string})=>c.id)).toEqual(['personal','work'])
 expect(records[0].models).toEqual(['image-z','shared','image-a'])
 expect(records[0].assistantModel).toBeUndefined()
 expect(editorState!.composerSourceId).toBe(originalImageSource)
 expect(editorState!.composerParameters.model).toBe(originalImageModel)
 expect(records[0].modelCapabilities).toBeUndefined()
 expect(screen.queryByText(/模型列表可访问不代表/)).not.toBeInTheDocument()
 fireEvent.click(screen.getByLabelText('启用 OpenAI · 个人'))
 await waitFor(()=>expect(selectedAssistant).toMatchObject({sourceId:'work',model:'shared'}))
})
test('does not show duplicate reasoning configuration for image-only accounts',()=>{
 render(<ServiceSourceSettings onClose={()=>{}} />)
 expect(screen.queryByText(/暂无可用推理模型/)).not.toBeInTheDocument()
 expect(screen.queryByLabelText('推理模型')).not.toBeInTheDocument()
})

test('uses built-in image edit presets without exposing capability configuration', async()=>{
 render(<ServiceSourceSettings onClose={()=>{}} />)
 fireEvent.click(screen.getByRole('button',{name:'添加来源'}))
 fireEvent.change(screen.getByLabelText('名称'),{target:{value:'编辑来源'}})
 fireEvent.change(screen.getByLabelText('密钥'),{target:{value:'fixture'}})
 fireEvent.change(screen.getByLabelText('模型'),{target:{value:'gpt-image-2'}})
 expect(screen.queryByText('图片编辑与蒙版能力')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'保存'}))
 await screen.findByRole('button',{name:'编辑 OpenAI · 编辑来源'})
 const saved=JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)[0]
 expect(saved.imageCapabilities).toBeUndefined()
})

test('accurately explains local credential storage when editing a source',()=>{
 render(<ServiceSourceSettings onClose={()=>{}}/>)
 fireEvent.click(screen.getByRole('button',{name:'添加来源'}))
 expect(screen.getAllByText(/API Key 保存在本机/).length).toBeGreaterThan(0)
 expect(screen.queryByText(/明文保存/)).not.toBeInTheDocument()
})


test('shows recharge beside the cloud source without a duplicate reasoning-model section', () => {
 const onClose=vi.fn(), recharge=vi.fn()
 window.addEventListener('draivio:cloud-recharge',recharge)
 try {
  render(<ServiceSourceSettings onClose={onClose}/>)
  expect(screen.queryByRole('region',{name:'推理模型配置'})).not.toBeInTheDocument()
  expect(screen.queryByLabelText('推理模型')).not.toBeInTheDocument()
  const button=screen.getByRole('button',{name:'充值'})
  expect(button.closest('.service-settings-row')).toHaveTextContent('Draivio 云端')
  fireEvent.click(button)
  expect(onClose).toHaveBeenCalledOnce()
  expect(recharge).toHaveBeenCalledOnce()
 } finally { window.removeEventListener('draivio:cloud-recharge',recharge) }
})
