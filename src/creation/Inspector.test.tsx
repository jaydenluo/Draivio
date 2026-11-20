vi.mock('../ai/context/editorPreview', async importOriginal => {
 const original = await importOriginal<typeof import('../ai/context/editorPreview')>()
 return {...original,captureRenderedEditorContext:(state:import('../state/editor').EditorState,id:string,scope:import('../ai/context/editorContext').EditorScope)=>original.captureRenderedEditorContext(state,id,scope,async ()=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')}
})
import { fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { test, expect, vi, afterEach, beforeEach } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, initialEditorState, useEditor, type EditorState } from '../state/editor'
import { loadConnections } from './serviceConnections'

afterEach(() => vi.useRealTimers())
beforeEach(async () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ id:'proxy', provider:'OpenAI', name:'中转', baseUrl:'https://proxy.example/v1', apiKey:'test-runtime-key', protocol:'openai_compatible', models:['gpt-image-2.5'], enabled:true, imageCapabilities:{'gpt-image-2.5':{generate:true,edit:true,reference:true,encoding:'base64-json'}}, generation:{multiImage:'split', concurrency:2, sendSize:false} }]))
  await loadConnections()
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==' }] })))
})
function chooseLocalSource() {
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'gpt-image-2.5 · OpenAI · 中转' }))
}

test('uses one AI composer for generation and editing', async () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  expect(screen.getByRole('button', { name: '生成图片' })).toHaveTextContent('生成图片')
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  expect(screen.getByRole('button', { name: '修改图片' })).toHaveTextContent('修改图片')
  expect(screen.getByPlaceholderText('输入你的要求')).toBeInTheDocument()
})

test('opens a parameter popover from the AI composer', async () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  expect(screen.getByRole('dialog', { name: '选择模型' })).toBeInTheDocument()
  expect(screen.getByRole('searchbox', { name: '搜索模型或服务来源' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'gpt-image-2.5 · OpenAI · 中转' }))
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('gpt-image-2.5')
})

test('submitting the AI composer shows loading and appends a result', async () => {
  vi.useFakeTimers()
  render(<EditorProvider><AppShell /></EditorProvider>)
  chooseLocalSource()
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  expect(screen.getByRole('button', { name: '执行中…' })).toBeDisabled()
  await act(async () => { await vi.runAllTimersAsync() })
  expect(screen.getByRole('button', { name: '执行 AI 操作' })).toBeEnabled()
  expect(screen.getByRole('button', { name: '新增图层' })).toBeInTheDocument()
})

test('keeps the submitted scope and intent when the user changes them during execution', async () => {
  vi.useFakeTimers()
  let latest: EditorState
  function Observer() { latest = useEditor().state; return null }
  render(<EditorProvider><AppShell /><Observer /></EditorProvider>)
  chooseLocalSource()
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  fireEvent.click(screen.getByRole('button', { name: '修改图片' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  await act(async () => { await vi.runAllTimersAsync() })
  const result = latest!.aiResults[0]
  expect(result.request?.mode).toBe('generate')
  expect(result.request?.selection).toEqual(initialEditorState.selectionVisible ? initialEditorState.selection : null)
  expect(latest!.selectionVisible).toBe(initialEditorState.selectionVisible)
  expect(latest!.layers).toHaveLength(initialEditorState.layers.length);expect(result.adopted).toBe(false)
  expect(screen.getByRole('button', { name: '原图图层' })).toBeInTheDocument()
})

for (const count of [3, 6, 8]) {
  test(`selects ${count} candidates without adding formal layers or content history`, async () => {
    vi.useFakeTimers()
    let latest: EditorState
    function Observer() { latest = useEditor().state; return null }
    render(<EditorProvider><AppShell /><Observer /></EditorProvider>)
    chooseLocalSource()
    fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
    for (const option of [1, 2, 3, 4, 6, 8]) expect(screen.getByRole('button', { name: `${option} 张` })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: `${count} 张` }))
    expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent(`${count} 张`)
    fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
    await act(async () => { await vi.runAllTimersAsync() })
    expect(latest!.aiResults).toHaveLength(count)
    expect(latest!.layers).toHaveLength(initialEditorState.layers.length)
    expect(latest!.history).toHaveLength(initialEditorState.history.length)
  })
}
