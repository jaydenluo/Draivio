vi.mock('../ai/context/editorPreview', async importOriginal => {
 const original = await importOriginal<typeof import('../ai/context/editorPreview')>()
 return {...original,captureRenderedEditorContext:(state:import('../state/editor').EditorState,id:string,scope:import('../ai/context/editorContext').EditorScope)=>original.captureRenderedEditorContext(state,id,scope,async ()=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')}
})
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi, beforeEach } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'
import { loadConnections } from './serviceConnections'

afterEach(() => vi.useRealTimers())
beforeEach(async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ id:'proxy', provider:'OpenAI', name:'中转', baseUrl:'https://proxy.example/v1', apiKey:'test-runtime-key', protocol:'openai_compatible', models:['gpt-image-2.5'], enabled:true, imageCapabilities:{'gpt-image-2.5':{generate:true,edit:true,reference:true,encoding:'base64-json'}}, generation:{multiImage:'split', concurrency:2, sendSize:false} }]))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==' }] })))
  await loadConnections()
})

function setup() {
  let current: EditorState
  function Probe() { current = useEditor().state; return null }
  render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  return () => current!
}

function openFormat() {
  fireEvent.click(screen.getByRole('button', { name: '选择比例与分辨率' }))
  return screen.getByRole('dialog', { name: '比例与分辨率' })
}
function chooseLocalSource() {
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'gpt-image-2.5 · OpenAI · 中转' }))
}

test('replaces separate controls with nested ratio and resolution choices applied together', async () => {
  const state = setup()
  expect(screen.queryByRole('button', { name: '选择尺寸' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '选择比例' })).not.toBeInTheDocument()
  const dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: '比例 16:9' }))
  expect(within(dialog).queryByRole('button', { name: '1024 × 1024' })).not.toBeInTheDocument()
  fireEvent.click(within(dialog).getByRole('button', { name: '1920 × 1080' }))
  expect(state().composerParameters).toMatchObject({ ratio: '16:9', size: '1920 × 1080' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('16:9 · 1920 × 1080')
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(state().composerParameters).toMatchObject({ ratio: '1:1', size: '1024 × 1024' })
  fireEvent.click(screen.getByRole('button', { name: '重做' }))
  expect(state().composerParameters).toMatchObject({ ratio: '16:9', size: '1920 × 1080' })
})

test('supports automatic resolution per ratio and fully automatic output across placements', async () => {
  const state = setup()
  let dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: '比例 4:5' }))
  fireEvent.click(within(dialog).getByRole('button', { name: 'Auto 自动分辨率' }))
  expect(state().composerParameters).toMatchObject({ ratio: '4:5', size: 'auto' })
  fireEvent.click(screen.getByRole('button', { name: '移到右侧' }))
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('4:5 · Auto')
  dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Auto 自动比例与分辨率' }))
  expect(state().composerParameters).toMatchObject({ ratio: 'auto', size: 'auto' })
  fireEvent.click(screen.getByRole('button', { name: '悬浮到画布底部' }))
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('Auto')
})

test('captures the chosen format at submission and dismisses the picker with Escape', async () => {
  vi.useFakeTimers()
  const state = setup()
  chooseLocalSource()
  const dialog = openFormat()
  fireEvent.click(within(dialog).getByRole('button', { name: '比例 9:16' }))
  fireEvent.click(within(dialog).getByRole('button', { name: '1080 × 1920' }))
  fireEvent.click(screen.getByRole('button', { name: '切换到生成新内容' }))
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  openFormat()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await act(async () => { await vi.runAllTimersAsync() })
  expect(state().aiResults).toHaveLength(1)
  expect(state().aiResults[0]).toMatchObject({ adopted: false, status: 'success', request: { parameters: { ratio: '9:16', size: '1080 × 1920' } } })
})
