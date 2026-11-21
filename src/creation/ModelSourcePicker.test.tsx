import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { ModelSourcePicker } from './ModelSourcePicker'
import {cloudAccount,type CloudAccountSnapshot} from '../account/cloudAccount'
afterEach(()=>vi.restoreAllMocks())

const connection = { id: 'openai-custom', provider: 'OpenAI', name: '个人', baseUrl: 'https://example.com/v1', apiKey: 'test-only', protocol: 'openai_compatible', models: ['image-first', 'shared-image', 'image-last'], enabled: true }
describe('ModelSourcePicker', () => {
  beforeEach(() => localStorage.setItem('draivio-service-connections-v1', JSON.stringify([
    connection,
    { ...connection, id: 'volcengine-custom', provider: '火山引擎', name: '工作', models: ['shared-image'] },
  ])))
  it('opens the configured custom models in their original order while signed out', () => {
    render(<ModelSourcePicker sourceId="openai-custom" modelCode="image-last" onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型：image-last/ }))
    expect(screen.getByRole('dialog', { name: '选择模型' }).closest('.composer-anchored-popover')?.parentElement).toBe(document.body)
    expect(screen.getByRole('searchbox', { name: '搜索模型或服务来源' })).toHaveFocus()
    const names = screen.getAllByRole('button').filter(button => button.hasAttribute('data-model-option')).map(button => button.getAttribute('aria-label'))
    expect(names).toEqual(['image-first · OpenAI · 个人', 'shared-image · OpenAI · 个人', 'image-last · OpenAI · 个人', 'shared-image · 火山引擎 · 工作'])
    expect(screen.getByText('由 个人 计费')).toBeInTheDocument()
    const surface = screen.getByRole('dialog', { name: '选择模型' }).closest<HTMLElement>('.composer-anchored-popover')!
    const { height, top } = surface.style
    expect(height).toBe('440px')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '找不到的型号' } })
    expect(screen.getByText('没有匹配的模型')).toBeInTheDocument()
    expect(surface).toHaveStyle({ height, top })
    const viewport = vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(340)
    fireEvent.resize(window)
    expect(surface).toHaveStyle({ height: '316px' })
    expect(parseFloat(surface.style.top) + parseFloat(surface.style.height)).toBeLessThanOrEqual(328)
    viewport.mockRestore()
  })
  it('searches across sources and selects a model and its source in one click', () => {
    const onSourceChange = vi.fn(), onClose = vi.fn()
    render(<ModelSourcePicker compact sourceId="draivio-cloud" modelCode="image-pro" onClose={onClose} onSourceChange={onSourceChange} onModelChange={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '工作' } })
    expect(screen.queryByRole('button', { name: /Image Pro ·/ })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'shared-image · 火山引擎 · 工作' }))
    expect(onSourceChange).toHaveBeenCalledWith('volcengine-custom', 'shared-image')
    expect(onClose).toHaveBeenCalledTimes(1)
  })
  it('selects within the current source without changing sources', () => {
    const onModelChange = vi.fn(), onSourceChange = vi.fn()
    render(<ModelSourcePicker sourceId="openai-custom" modelCode="image-first" onSourceChange={onSourceChange} onModelChange={onModelChange} />)
    fireEvent.click(screen.getByRole('button', { name: /选择模型：image-first/ }))
    fireEvent.click(screen.getByRole('button', { name: 'image-last · OpenAI · 个人' }))
    expect(onModelChange).toHaveBeenCalledWith('image-last')
    expect(onSourceChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })
  it('shows no selectable models for empty or disabled sources and keeps management available', () => {
    localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ ...connection, models: [] }, { ...connection, id: 'disabled', name: '停用', enabled: false }]))
    render(<ModelSourcePicker compact sourceId="draivio-cloud" modelCode="image-pro" onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'shared-image' } })
    expect(screen.getByText('没有匹配的模型')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '管理服务来源' })).toBeEnabled()
  })
})

it('lists the authenticated catalog before custom sources, selects public code, and removes it on logout',()=>{
  let snapshot:CloudAccountSnapshot={authenticated:true,user:{email:'fixture@example.test'},balance:10,models:[{id:'fixture-official-id',code:'fixture-official-code',displayName:'Fixture official display',modality:'image',capabilities:['image'],constraints:{},availability:{available:true}}]}
  vi.spyOn(cloudAccount,'getSnapshot').mockImplementation(()=>snapshot)
  const subscribers=new Set<()=>void>()
  vi.spyOn(cloudAccount,'subscribe').mockImplementation(listener=>{subscribers.add(listener);return ()=>{subscribers.delete(listener)}})
  localStorage.setItem('draivio-service-connections-v1',JSON.stringify([connection]))
  const onSourceChange=vi.fn(),onModelChange=vi.fn()
  render(<ModelSourcePicker compact sourceId="openai-custom" modelCode="image-first" onSourceChange={onSourceChange} onModelChange={onModelChange}/>)
  const options=()=>screen.getAllByRole('button').filter(button=>button.hasAttribute('data-model-option')).map(button=>button.getAttribute('aria-label'))
  expect(options()).toEqual(['Fixture official display · Draivio 云端','image-first · OpenAI · 个人','shared-image · OpenAI · 个人','image-last · OpenAI · 个人'])
  fireEvent.click(screen.getByRole('button',{name:'Fixture official display · Draivio 云端'}))
  expect(onSourceChange).toHaveBeenCalledWith('draivio-cloud','fixture-official-code')
  expect(onModelChange).not.toHaveBeenCalled()
  act(()=>{snapshot={authenticated:false,user:null,balance:null,models:[]};subscribers.forEach(listener=>listener())})
  expect(screen.queryByRole('button',{name:'Fixture official display · Draivio 云端'})).not.toBeInTheDocument()
  expect(options()).toEqual(['image-first · OpenAI · 个人','shared-image · OpenAI · 个人','image-last · OpenAI · 个人'])
})

it('keeps cached models visible on open and updates the open picker when the catalog arrives', async () => {
 const oldModel={id:'old',code:'old',displayName:'旧模型',modality:'image',capabilities:['image'],constraints:{},availability:{available:true}}
 let snapshot:CloudAccountSnapshot={authenticated:true,user:{email:'fixture@example.test'},balance:10,models:[oldModel]}
 vi.spyOn(cloudAccount,'getSnapshot').mockImplementation(()=>snapshot)
 const subscribers=new Set<()=>void>()
 vi.spyOn(cloudAccount,'subscribe').mockImplementation(listener=>{subscribers.add(listener);return ()=>{subscribers.delete(listener)}})
 let resolve!:(models:CloudAccountSnapshot['models'])=>void
 const refresh=vi.spyOn(cloudAccount,'refreshModels').mockImplementation(()=>new Promise(done=>{resolve=done}))
 render(<ModelSourcePicker sourceId="draivio-cloud" modelCode="old" onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
 expect(refresh).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:/选择模型：旧模型/}))
 expect(screen.getByRole('button',{name:'旧模型 · Draivio 云端'})).toBeInTheDocument()
 expect(refresh).toHaveBeenCalledOnce()
 await act(async()=>{
  snapshot={...snapshot,models:[{...oldModel,id:'new',code:'new',displayName:'新模型'}]}
  subscribers.forEach(listener=>listener())
  resolve(snapshot.models)
 })
 expect(screen.getByRole('button',{name:'新模型 · Draivio 云端'})).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'旧模型 · Draivio 云端'})).not.toBeInTheDocument()
})

it('collapses providers independently and reveals matching models during search', () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([
    connection,
    { ...connection, id: 'studio', name: '工作室', models: ['studio-image'] },
  ]))
  render(<ModelSourcePicker sourceId="openai-custom" modelCode="image-first" onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /选择模型：image-first/ }))

  const group = screen.getByRole('button', { name: 'OpenAI · 个人' })
  const dialog = screen.getByRole('dialog', { name: '选择模型' })
  const surface = dialog.closest<HTMLElement>('.composer-anchored-popover')!
  const { height, top } = surface.style

  fireEvent.click(group)
  expect(group).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('button', { name: 'image-first · OpenAI · 个人' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'studio-image · OpenAI · 工作室' })).toBeVisible()

  const search = screen.getByRole('searchbox')
  fireEvent.change(search, { target: { value: 'image-first' } })
  expect(group).toHaveAttribute('aria-expanded', 'true')
  expect(screen.getByRole('button', { name: 'image-first · OpenAI · 个人' })).toHaveAttribute('aria-pressed', 'true')
  fireEvent.change(search, { target: { value: '' } })
  expect(group).toHaveAttribute('aria-expanded', 'false')
  expect(surface).toHaveStyle({ height, top })

  fireEvent.keyDown(search, { key: 'ArrowDown' })
  expect(group).toHaveFocus()
  fireEvent.click(group)
  expect(screen.getByRole('button', { name: 'image-first · OpenAI · 个人' })).toBeVisible()
})

it('explains why the signed-in cloud has no selectable reasoning models even when custom models exist', async () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ ...connection, models: ['gpt-4o'] }]))
  const models = [{ id: 'cloud-text', code: 'cloud-text', displayName: '云端文本模型', modality: 'text', capabilities: ['chat'], constraints: {}, availability: { available: false, reason: 'NO_AVAILABLE_SUPPLIER' } }]
  vi.spyOn(cloudAccount, 'getSnapshot').mockReturnValue({ authenticated: true, user: null, balance: 10, models })
  vi.spyOn(cloudAccount, 'refreshModels').mockResolvedValue(models)
  render(<ModelSourcePicker compact kind="text" sourceId="openai-custom" modelCode="gpt-4o" onSourceChange={vi.fn()} onModelChange={vi.fn()} />)
  expect(await screen.findByText('云端推理模型暂无可用供应商线路')).toBeVisible()
  expect(screen.getByRole('button', { name: 'gpt-4o · OpenAI · 个人' })).toBeVisible()
  expect(screen.queryByRole('button', { name: /云端文本模型/ })).not.toBeInTheDocument()
})

it('groups official models by publisher while keeping selection on the cloud source', () => {
  const model = { modality: 'text', capabilities: ['chat'], constraints: {}, availability: { available: true } }
  const models = [
    { ...model, id: 'gpt-a', code: 'gpt-a', displayName: 'GPT A', publisher: 'OpenAI' },
    { ...model, id: 'claude-a', code: 'claude-a', displayName: 'Sonnet A', publisher: 'Anthropic' },
  ]
  vi.spyOn(cloudAccount, 'getSnapshot').mockReturnValue({ authenticated: true, user: null, balance: 10, models })
  vi.spyOn(cloudAccount, 'refreshModels').mockReturnValue(new Promise(() => {}))
  const onModelChange = vi.fn()
  render(<ModelSourcePicker compact kind="text" sourceId="draivio-cloud" modelCode="gpt-a" onSourceChange={vi.fn()} onModelChange={onModelChange} />)

  fireEvent.click(screen.getByRole('button', { name: 'OpenAI · 云端' }))
  expect(screen.queryByRole('button', { name: 'GPT A · OpenAI · 云端' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Sonnet A · Claude · 云端' })).toBeVisible()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'anthropic' } })
  expect(screen.queryByRole('button', { name: 'OpenAI · 云端' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Sonnet A · Claude · 云端' }))
  expect(onModelChange).toHaveBeenCalledWith('claude-a')
})
