import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'
import { AIComposer } from './AIComposer'
import { cloudAccount, type CloudAccountSnapshot } from '../account/cloudAccount'
import { ServiceSourceSettings } from './ServiceSourceSettings'

const connection = { id: 'assistant-source', provider: 'OpenAI', name: '助手测试', baseUrl: 'https://assistant.invalid/v1', apiKey: 'test-only', protocol: 'openai_compatible', enabled: true, models: ['image-only', 'text-one', 'text-two'], modelCapabilities: { 'image-only': { image: true, text: false, vision: false }, 'text-one': { image: false, text: true, vision: false }, 'text-two': { image: false, text: true, vision: true } } }
let state: EditorState
function Probe() { state = useEditor().state; return <AIComposer /> }
function mount() { return render(<EditorProvider><Probe /></EditorProvider>) }
function setup() { localStorage.setItem('draivio-service-connections-v1', JSON.stringify([connection])) }
afterEach(() => vi.restoreAllMocks())

test('shares the searchable assistant picker across smart and auto modes and remembers it independently of images', async () => {
  setup()
  const first = mount()
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'image-only · OpenAI · 助手测试' }))
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  expect(screen.queryByRole('button', { name: 'image-only · OpenAI · 助手测试' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '选择数量' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'text-two' } })
  fireEvent.click(screen.getByRole('button', { name: 'text-two · OpenAI · 助手测试' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '选择推理模型' })).toHaveTextContent('text-two'))
  fireEvent.click(screen.getByRole('button', { name: '自动理解' }))
  expect(screen.queryByRole('combobox', { name: '意图理解模型' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选择推理模型' })).toHaveTextContent('text-two')
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('image-only')
  expect(state.composerSourceId).toBe(connection.id)
  first.unmount()
  mount()
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  expect(screen.getByRole('button', { name: '选择推理模型' })).toHaveTextContent('text-two')
})

test('auto understanding keeps image model, format and count configurable alongside the assistant', () => {
  setup()
  mount()
  fireEvent.click(screen.getByRole('button', { name: '自动理解' }))
  expect(screen.getByRole('button', { name: '选择推理模型' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  expect(screen.queryByRole('button', { name: 'text-one · OpenAI · 助手测试' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'image-only · OpenAI · 助手测试' }))
  expect(screen.getByRole('button', { name: '自动理解' })).toHaveAttribute('aria-pressed','true')
  fireEvent.click(screen.getByRole('button', { name: '选择比例与分辨率' }))
  fireEvent.click(screen.getByRole('button', { name: '比例 16:9' }))
  fireEvent.click(screen.getByRole('button', { name: '1920 × 1080' }))
  fireEvent.click(screen.getByRole('button', { name: '选择数量' }))
  fireEvent.click(screen.getByRole('button', { name: '4 张' }))
  expect(state.composerParameters).toMatchObject({ model: 'image-only', ratio: '16:9', size: '1920 × 1080', count: '4 张' })
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  expect(screen.queryByRole('button', { name: '选择模型' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '选择数量' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '自动理解' }))
  expect(screen.getByRole('button', { name: '选择模型' })).toHaveTextContent('image-only')
  expect(screen.getByRole('button', { name: '选择比例与分辨率' })).toHaveTextContent('16:9 · 1920 × 1080')
  expect(screen.getByRole('button', { name: '选择数量' })).toHaveTextContent('4 张')
})

test('auto understanding sends the shared assistant model and invalidates its answer when that choice changes', async () => {
  setup()
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ kind: 'generate', target: 'document', targetIds: [], summary: '画一只猫', question: '' }) } }] })))
  mount()
  fireEvent.click(screen.getByRole('button', { name: '自动理解' }))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'text-two · OpenAI · 助手测试' }))
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'image-only · OpenAI · 助手测试' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '画一只猫' } })
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  await screen.findByRole('button', { name: '按此理解继续' })
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).model).toBe('text-two')
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'text-one · OpenAI · 助手测试' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: '按此理解继续' })).not.toBeInTheDocument())
})

test('keeps a remembered cloud assistant unavailable after logout instead of switching billing sources', async () => {
  setup()
  let snapshot: CloudAccountSnapshot = { authenticated: true, user: { email: 'fixture@example.test' }, balance: 10, models: [{ id: 'cloud-text', code: 'cloud-text', displayName: '云端助手', modality: 'text', capabilities: ['text'], constraints: {}, availability: { available: true } }] }
  vi.spyOn(cloudAccount, 'getSnapshot').mockImplementation(() => snapshot)
  const listeners = new Set<() => void>()
  vi.spyOn(cloudAccount, 'subscribe').mockImplementation(listener => { listeners.add(listener); return () => { listeners.delete(listener) } })
  mount()
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  fireEvent.click(screen.getByRole('button', { name: '云端助手 · Draivio 云端' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '选择推理模型' })).toHaveTextContent('云端助手'))
  act(() => { snapshot = { authenticated: false, user: null, balance: null, models: [] }; listeners.forEach(listener => listener()) })
  expect(screen.getByRole('button', { name: '选择推理模型' })).toHaveTextContent('推理模型不可用')
})

test('can declare an assistant in service settings and immediately select it in the shared picker', async () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ ...connection, models: ['new-text'], modelCapabilities: undefined }]))
  const view = render(<ServiceSourceSettings onClose={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: '编辑 OpenAI · 助手测试' }))
  fireEvent.change(screen.getByRole('combobox', { name: 'new-text 用途' }), { target: { value: 'text' } })
  fireEvent.click(screen.getByRole('checkbox', { name: 'new-text 支持看图' }))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await screen.findByRole('button', { name: '编辑 OpenAI · 助手测试' })
  const records = JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)
  expect(records[0].modelCapabilities['new-text']).toEqual({ image: false, text: true, vision: true })
  view.unmount()
  mount()
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  expect(screen.getByRole('button', { name: 'new-text · OpenAI · 助手测试' })).toBeEnabled()
})

test('filters missing keys, disabled sources and unsupported text protocols', () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([
    connection,
    { ...connection, id: 'disabled', name: '已停用', enabled: false },
    { ...connection, id: 'missing-key', name: '未填密钥', apiKey: '' },
    { ...connection, id: 'unsupported', name: '未接入协议', protocol: 'gemini' },
  ]))
  mount()
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  expect(screen.getAllByRole('button').filter(button => button.hasAttribute('data-model-option'))).toHaveLength(2)
})

test('changing the assistant cancels pending smart planning and ignores its late response', async () => {
  setup()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  let respond!: (response: Response) => void
  const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => { respond = resolve }))
  mount()
  fireEvent.click(screen.getByRole('button', { name: '编辑画布' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '为当前画面建立一套复杂的光影层次方案' } })
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'text-two · OpenAI · 助手测试' }))
  expect(fetcher.mock.calls[0][1]!.signal!.aborted).toBe(true)
  await act(async () => respond(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ steps: [{ id: 's1', tool: 'move', args: { layerId: 'art', dx: 10, dy: 0 }, dependsOn: [] }], explanation: '旧模型结果', clarifications: [], warnings: [] }) } }] }))))
  expect(screen.queryByText('旧模型结果')).not.toBeInTheDocument()
})

test('classifies legacy GPT models and uses the selected reasoning model for understanding', async () => {
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ ...connection, models: ['gpt-6.5-sol', 'gpt-image-2.5-flare', 'unknown-model'], modelCapabilities: undefined }]))
  const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ kind: 'generate', target: 'document', targetIds: [], summary: '生成猫', question: '' }) } }] })))
  mount()
  fireEvent.click(screen.getByRole('button', { name: '自动理解' }))
  fireEvent.click(screen.getByRole('button', { name: '选择推理模型' }))
  expect(screen.queryByRole('button', { name: 'gpt-image-2.5-flare · OpenAI · 助手测试' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'unknown-model · OpenAI · 助手测试' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'gpt-6.5-sol · OpenAI · 助手测试' }))
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  fireEvent.click(screen.getByRole('button', { name: 'gpt-image-2.5-flare · OpenAI · 助手测试' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '生成一只猫' } })
  fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
  await screen.findByRole('button', { name: '按此理解继续' })
  expect(JSON.parse(fetcher.mock.calls[0][1]!.body as string).model).toBe('gpt-6.5-sol')
  expect(JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)[0].modelCapabilities).toBeUndefined()
  fireEvent.click(screen.getByRole('button', { name: '生成图片' }))
  fireEvent.click(screen.getByRole('button', { name: '选择模型' }))
  expect(screen.queryByRole('button', { name: 'gpt-6.5-sol · OpenAI · 助手测试' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'gpt-image-2.5-flare · OpenAI · 助手测试' })).toBeEnabled()
})


test('source editor shows inferred GPT usages and can classify an unknown deployment', async () => {
 localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ ...connection, models: ['gpt-6.5-sol', 'gpt-image-2.5-flare', 'private-deployment'], modelCapabilities: undefined }]))
 render(<ServiceSourceSettings onClose={() => {}} />)
 fireEvent.click(screen.getByRole('button', { name: '编辑 OpenAI · 助手测试' }))
 expect(screen.getByRole('combobox', { name: 'gpt-6.5-sol 用途' })).toHaveValue('text')
 expect(screen.getByRole('combobox', { name: 'gpt-image-2.5-flare 用途' })).toHaveValue('image')
 expect(screen.getByRole('combobox', { name: 'private-deployment 用途' })).toHaveValue('unknown')
 fireEvent.change(screen.getByRole('combobox', { name: 'private-deployment 用途' }), { target: { value: 'text' } })
 fireEvent.click(screen.getByRole('button', { name: '保存' }))
 await screen.findByRole('button', { name: '编辑 OpenAI · 助手测试' })
 expect(JSON.parse(localStorage.getItem('draivio-service-connections-v1')!)[0].modelCapabilities['private-deployment']).toEqual({ image: false, text: true, vision: false })
})
