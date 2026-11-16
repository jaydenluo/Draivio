vi.mock('../ai/context/editorPreview', async importOriginal => {
 const original = await importOriginal<typeof import('../ai/context/editorPreview')>()
 return {...original,captureRenderedEditorContext:(state:import('../state/editor').EditorState,id:string,scope:import('../ai/context/editorContext').EditorScope)=>original.captureRenderedEditorContext(state,id,scope,async ()=>'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==')}
})
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { DocumentTabs } from './DocumentTabs'
import { ProjectFileControl } from './ProjectFileControl'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
import { encodeProject } from './projectFormat'
import { initialEditorState } from '../state/editor'
import { saveProjectFile } from './projectStorage'
import { useImageGeneration } from '../creation/ImageGeneration'
import { WORKSPACE_RECOVERY_KEY, decodeWorkspace, encodeWorkspace } from './workspaceRecovery'
import { createDocumentSession } from './documentWorkspace'
import { loadConnections } from '../creation/serviceConnections'

vi.mock('./projectStorage', () => ({ hasProjectPicker: () => false, openProjectFile: vi.fn(), saveProjectFile: vi.fn() }))
const save = vi.mocked(saveProjectFile)
let openFile: (text: string) => void
let lateEdit: () => void
function Harness() {
  const { state, dispatch } = useEditor()
  const { workspace, openSerialized } = useDocumentWorkspace()
  const generation = useImageGeneration()
  openFile = openSerialized
  return <><ProjectFileControl /><DocumentTabs /><output data-testid="probe">{JSON.stringify({ width: state.documentWidth, zoom: state.zoom, layers: state.layers.length, aiResults: state.aiResults.length, prompt: state.prompt, undo: state.undoStack.length, generating: state.isGenerating, ids: workspace.documents.map(document => document.id) })}</output><button onClick={() => dispatch({ type: 'set-zoom', zoom: 150 })}>缩放150</button><button onClick={() => dispatch({ type: 'add-layer' })}>添加图层</button><button onClick={() => dispatch({ type: 'undo' })}>撤销编辑</button><button onClick={() => { lateEdit = () => dispatch({ type: 'add-layer' }) }}>启动异步编辑</button><button onClick={() => { dispatch({ type: 'set-composer-source', sourceId: 'proxy' }); dispatch({ type: 'set-composer-parameter', parameter: 'model', value: 'gpt-image-2.5' }) }}>准备生成</button><button onClick={() => generation.start('generate')}>启动生成</button></>
}
const probe = () => JSON.parse(screen.getByTestId('probe').textContent!)
const setup = () => render(<EditorProvider><Harness /></EditorProvider>)
beforeEach(async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  localStorage.removeItem(WORKSPACE_RECOVERY_KEY); localStorage.removeItem('draivio-recovery-snapshots'); save.mockReset()
  localStorage.setItem('draivio-service-connections-v1', JSON.stringify([{ id:'proxy', provider:'OpenAI', name:'中转', baseUrl:'https://proxy.example/v1', apiKey:'test-runtime-key', protocol:'openai_compatible', models:['gpt-image-2.5'], enabled:true, imageCapabilities:{'gpt-image-2.5':{generate:true,edit:true,reference:true,encoding:'base64-json'}}, generation:{multiImage:'split', concurrency:2, sendSize:false} }]))
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==' }] })))
  await loadConnections()
})

test('creates tabs and restores each document view and undo independently', () => {
  setup()
  fireEvent.click(screen.getByText('缩放150'))
  fireEvent.click(screen.getByText('添加图层'))
  fireEvent.click(screen.getByLabelText('新建文档标签'))
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  expect(probe()).toMatchObject({ width: 1024, zoom: 100, layers: 1, undo: 0, prompt: '' })
  fireEvent.click(screen.getByRole('tab', { name: '未命名作品 未保存' }))
  expect(probe()).toMatchObject({ width: 500, zoom: 150, layers: 4, undo: 1 })
  fireEvent.click(screen.getByText('撤销编辑'))
  expect(probe().layers).toBe(3)
  fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true })
  expect(probe().width).toBe(1024)
})

test('opening a project adds a saved tab without discarding the dirty current document', async () => {
  setup()
  const text = await encodeProject({ ...initialEditorState, documentWidth: 1200, documentHeight: 800 }, { id: 'loaded-project', name: '打开的海报' })
  act(() => openFile(text))
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  expect(probe().width).toBe(1200)
  expect(screen.getByLabelText('已保存')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: '未命名作品 未保存' }))
  expect(probe().width).toBe(500)
  expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
})

test('close cancel and failed or cancelled save preserve the tab', async () => {
  setup()
  fireEvent.click(screen.getByLabelText('关闭文档：未命名作品'))
  fireEvent.click(screen.getByText('取消', { selector: '.document-close-dialog button' }))
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  fireEvent.click(screen.getByLabelText('关闭文档：未命名作品'))
  save.mockResolvedValueOnce(null)
  fireEvent.click(screen.getByText('保存并关闭'))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  await waitFor(() => expect(screen.getByText('保存并关闭')).toBeEnabled())
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  save.mockRejectedValueOnce(new Error('磁盘已满'))
  fireEvent.click(screen.getByText('保存并关闭'))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(screen.getByRole('dialog', { name: '关闭文档' })).toBeInTheDocument()
})

test('background saving marks only the original document saved', async () => {
  let finish!: (value: { name: string }) => void
  save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
  setup()
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(save).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByLabelText('新建文档标签'))
  await act(async () => finish({ name: 'first.draivio' }))
  expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: '未命名作品' }))
  expect(screen.getByLabelText('已保存')).toBeInTheDocument()
})

test('late edits after closing cannot recreate a session or affect the current document', () => {
  setup()
  fireEvent.click(screen.getByText('启动异步编辑'))
  fireEvent.click(screen.getByLabelText('新建文档标签'))
  fireEvent.click(screen.getByLabelText('关闭文档：未命名作品'))
  fireEvent.click(screen.getByText('不保存'))
  act(() => lateEdit())
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  expect(probe().layers).toBe(1)
})

test('generation continues on its original background document', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  setup()
  fireEvent.click(screen.getByText('准备生成'))
  fireEvent.click(screen.getByText('启动生成'))
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  expect(probe().generating).toBe(true)
  fireEvent.click(screen.getByLabelText('新建文档标签'))
  expect(probe().generating).toBe(false)
  await act(async () => finish(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }))))
  expect(probe().layers).toBe(1)
  fireEvent.click(screen.getByRole('tab', { name: '未命名作品 未保存' }))
  await waitFor(() => expect(probe()).toMatchObject({ layers: 3, aiResults: 1 }))
  expect(probe().generating).toBe(false)
})

test('a delayed generation result cannot recreate a closed document or enter another document', async () => {
  let finish!: (response: Response) => void
  const fetcher = vi.mocked(fetch).mockImplementation(() => new Promise(resolve => { finish = resolve }))
  setup()
  fireEvent.click(screen.getByText('准备生成'))
  fireEvent.click(screen.getByText('启动生成'))
  await waitFor(() => expect(fetcher).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByLabelText('新建文档标签'))
  fireEvent.click(screen.getByLabelText('关闭文档：未命名作品'))
  fireEvent.click(screen.getByText('不保存'))
  await act(async () => finish(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }))))
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  expect(probe()).toMatchObject({ layers: 1, generating: false })
})

test('restores multiple local tabs without restoring stale save locations', async () => {
  const first = createDocumentSession('恢复A', { width: 640, height: 480 })
  const second = createDocumentSession('恢复B', { width: 1200, height: 800 })
  second.state.zoom = 150
  const text = await encodeWorkspace({ documents: [first, second], activeId: second.id })
  expect(decodeWorkspace(text).documents[1].location).toBeUndefined()
  localStorage.setItem(WORKSPACE_RECOVERY_KEY, text)
  setup()
  await screen.findByRole('dialog', { name: '恢复编辑' })
  fireEvent.click(screen.getByText('恢复副本'))
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  expect(probe()).toMatchObject({ width: 1200, zoom: 150 })
  fireEvent.click(screen.getByRole('tab', { name: '恢复A 未保存' }))
  expect(probe().width).toBe(640)
})

test('keeps keyboard focus on the switched tab and traps close dialog focus', async () => {
  setup()
  fireEvent.click(screen.getByLabelText('新建文档标签'))
  const activeTab = screen.getAllByRole('tab')[1]
  activeTab.focus()
  fireEvent.keyDown(activeTab, { key: 'ArrowLeft' })
  await waitFor(() => expect(screen.getAllByRole('tab')[0]).toHaveFocus())
  fireEvent.click(screen.getByLabelText('关闭文档：未命名作品'))
  const cancel = screen.getByRole('button', { name: '取消' })
  expect(cancel).toHaveFocus()
  fireEvent.keyDown(cancel, { key: 'Tab', shiftKey: true })
  const close = screen.getByRole('button', { name: '取消关闭文档' })
  expect(close).toHaveFocus()
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
  expect(screen.getByRole('button', { name: '保存并关闭' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('button', { name: '保存并关闭' }), { key: 'n', ctrlKey: true })
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  fireEvent.keyDown(cancel, { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '关闭文档' })).not.toBeInTheDocument()
})
