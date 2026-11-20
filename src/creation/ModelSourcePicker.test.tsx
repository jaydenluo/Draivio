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
