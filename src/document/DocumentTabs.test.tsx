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
  expect(probe()).toMatchObject({ width: 500, zoom: 150, layers: initialEditorState.layers.length + 1, undo: 1 })
  fireEvent.click(screen.getByText('撤销编辑'))
  expect(probe().layers).toBe(initialEditorState.layers.length)
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
  await waitFor(() => expect(probe()).toMatchObject({ layers: initialEditorState.layers.length, aiResults: 1 }))
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

test('deferring recovery retains the snapshot while editing and allows restoring later', async () => {
  const recovered = createDocumentSession('待恢复海报', { width: 640, height: 480 })
  const text = await encodeWorkspace({ documents: [recovered], activeId: recovered.id })
  localStorage.setItem(WORKSPACE_RECOVERY_KEY, text)
  setup()
  await screen.findByRole('dialog', { name: '恢复编辑' })
  fireEvent.click(screen.getByRole('button', { name: '稍后' }))
  vi.useFakeTimers()
  try {
    fireEvent.click(screen.getByText('添加图层'))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  } finally { vi.useRealTimers() }
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBe(text)
  fireEvent.click(screen.getByRole('button', { name: '查看待恢复的 1 个文档' }))
  fireEvent.click(screen.getByRole('button', { name: '恢复副本' }))
  expect(screen.getByRole('tab', { name: '待恢复海报 未保存' })).toBeInTheDocument()
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

test('renames a document in its tab and cancels a pending rename without applying it',()=>{
 render(<EditorProvider><Harness/></EditorProvider>)
 const tab=screen.getAllByRole('tab')[0]
 fireEvent.doubleClick(tab)
 const input=screen.getByRole('textbox',{name:'重命名文档'})
 fireEvent.change(input,{target:{value:'海报项目'}})
 fireEvent.keyDown(input,{key:'Enter'})
 expect(screen.getByRole('tab',{name:/海报项目/})).toBeInTheDocument()
 fireEvent.doubleClick(screen.getByRole('tab',{name:/海报项目/}))
 fireEvent.change(screen.getByRole('textbox',{name:'重命名文档'}),{target:{value:'未应用'}})
 fireEvent.keyDown(screen.getByRole('textbox',{name:'重命名文档'}),{key:'Escape'})
 expect(screen.getByRole('tab',{name:/海报项目/})).toBeInTheDocument()
 expect(screen.queryByRole('tab',{name:/未应用/})).not.toBeInTheDocument()
})

test('discard stays discarded across idle, view updates, and another launch', async()=>{
 const old=createDocumentSession('不再恢复的副本',{width:640,height:480})
 localStorage.setItem(WORKSPACE_RECOVERY_KEY,await encodeWorkspace({documents:[old],activeId:old.id}))
 const view=setup()
 await screen.findByRole('dialog',{name:'恢复编辑'})
 fireEvent.click(screen.getByRole('button',{name:'丢弃'}))
 fireEvent.click(screen.getByRole('button',{name:'确认丢弃'}))
 vi.useFakeTimers()
 try{
  fireEvent.click(screen.getByText('缩放150'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBeNull()
  view.unmount()
  setup()
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  expect(screen.queryByRole('dialog',{name:'恢复编辑'})).not.toBeInTheDocument()
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBeNull()
 }finally{vi.useRealTimers()}
})

test.each(['before','after'])('preserves a real edit made %s discard and recovers it on next launch',async timing=>{
 const old=createDocumentSession('旧副本',{width:640,height:480})
 localStorage.setItem(WORKSPACE_RECOVERY_KEY,await encodeWorkspace({documents:[old],activeId:old.id}))
 const view=setup()
 await screen.findByRole('dialog',{name:'恢复编辑'})
 vi.useFakeTimers()
 try{
  if(timing==='before')fireEvent.click(screen.getByText('添加图层'))
  fireEvent.click(screen.getByRole('button',{name:'丢弃'}));await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'确认丢弃'}))})
  if(timing==='after')fireEvent.click(screen.getByText('添加图层'))
  const count=probe().layers
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  const text=localStorage.getItem(WORKSPACE_RECOVERY_KEY)!
  expect(decodeWorkspace(text).documents[0].state.layers).toHaveLength(count)
  expect(text).not.toContain('旧副本')
  view.unmount();await act(async()=>{setup()})
  expect(screen.getByRole('dialog',{name:'恢复编辑'})).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'恢复副本'}))
  expect(probe().layers).toBe(count)
 }finally{vi.useRealTimers()}
})

test('does not autosave untouched startup content or retain an edit undone back to it',async()=>{
 setup();await act(async()=>{})
 vi.useFakeTimers()
 try{
  fireEvent.click(screen.getByText('缩放150'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBeNull()
  fireEvent.click(screen.getByText('添加图层'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).not.toBeNull()
  fireEvent.click(screen.getByText('撤销编辑'))
  await act(async()=>{await vi.advanceTimersByTimeAsync(2000)})
  expect(localStorage.getItem(WORKSPACE_RECOVERY_KEY)).toBeNull()
 }finally{vi.useRealTimers()}
})
