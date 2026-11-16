import { readFileSync } from 'node:fs'
import { StrictMode, useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import { RecoveryControl, findRecoverableSnapshot } from './RecoveryControl'
import { encodeProject, validateProjectImages } from './projectFormat'
import { REQUEST_RECOVERY } from './projectLifecycleEvents'
import { ProjectFileControl } from './ProjectFileControl'
import type { RecoveryStore, RecoverySnapshot } from './recoveryStore'
import { saveProjectFile } from './projectStorage'
vi.mock('./projectStorage', () => ({ hasProjectPicker: () => false, openProjectFile: vi.fn(), saveProjectFile: vi.fn() }))
vi.mock('./projectFormat', async importOriginal => { const actual = await importOriginal<typeof import('./projectFormat')>(); return { ...actual, validateProjectImages: vi.fn(actual.validateProjectImages) } })
beforeEach(() => { localStorage.removeItem('draivio-autosave-enabled'); vi.mocked(saveProjectFile).mockReset() })
const payload = () => encodeProject(initialEditorState, { id: 'recovered-project', name: '恢复测试' })
const row = async (): Promise<RecoverySnapshot> => ({ documentId: 'recovered-project', savedAt: 1, projectVersion: 1, name: '恢复测试', payload: await payload() })
function store(rows: RecoverySnapshot[] = []): RecoveryStore { return { list: vi.fn(async () => rows), save: vi.fn(async () => true), reserve: vi.fn(id => ({ documentId: id, generation: 1 })), invalidate: vi.fn(), discard: vi.fn(async () => undefined) } }
function ReadState() { const { state } = useEditor(); return <output aria-label="文档身份">{state.documentId}</output> }
it('recovers an older valid snapshot when the latest is corrupt and interrupts pending AI', async () => {
 const older = await row(); const data = JSON.parse(older.payload)
 data.document.aiResults = [{ id: 'pending', prompt: 'x', model: 'x', provider: 'x', size: '1', createdAt: new Date().toISOString(), status: 'loading', favorite: false, adopted: false }]
 older.payload = JSON.stringify(data)
 const result = await findRecoverableSnapshot([{ ...older, payload: '{bad' }, older])
 expect(result.skipped).toBe(1); expect(result.document.aiResults?.[0].status).toBe('error')
})
it('validates complete editable fixture resources before returning recovery state', async () => {
 const fixture = readFileSync('docs/implementation/fixtures/editable-project-v2.draivio', 'utf8')
 const validate = vi.fn(async () => undefined)
 const result = await findRecoverableSnapshot([{ ...await row(), payload: fixture }], validate)
 expect(validate).toHaveBeenCalledOnce(); expect(result.document.canvasTexts).toHaveLength(1); expect(result.document.layers.some(l => l.source?.startsWith('data:image/png;base64,'))).toBe(true)
 await expect(findRecoverableSnapshot([{ ...await row(), payload: fixture }], async () => { throw new Error('项目图片解码失败') })).rejects.toThrow('项目图片解码失败')
})
it('restores through dirty confirmation with a new identity and an unset save destination', async () => {
 const s = store([await row()]); render(<EditorProvider><ProjectFileControl /><ReadState /><RecoveryControl store={s} /></EditorProvider>)
 await screen.findByRole('button', { name: '恢复副本' }); const id = screen.getByLabelText('文档身份').textContent
 fireEvent.click(screen.getByRole('button', { name: '恢复副本' }))
 await screen.findByRole('dialog', { name: '未保存修改' }); fireEvent.click(screen.getByRole('button', { name: '取消切换' }))
 expect(screen.getByLabelText('文档身份')).toHaveTextContent(id!)
 fireEvent.click(screen.getByRole('button', { name: '恢复副本' })); await screen.findByRole('dialog', { name: '未保存修改' }); fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
 await waitFor(() => expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('恢复测试 · 恢复副本'))
 expect(screen.getByLabelText('文档身份').textContent).not.toBe('recovered-project'); expect(screen.getByLabelText('文档身份').textContent).not.toBe(id)
 vi.mocked(saveProjectFile).mockResolvedValue({ name: 'copy.draivio' }); fireEvent.click(screen.getByRole('button', { name: '保存' }))
 await waitFor(() => expect(saveProjectFile).toHaveBeenCalledOnce()); expect(vi.mocked(saveProjectFile).mock.calls[0][2]).toBeUndefined()
})
it('requires confirmation and keeps records visible after discard failure', async () => {
 const s = store([await row()]); vi.mocked(s.discard).mockRejectedValueOnce(new Error('无写入权限'))
 render(<EditorProvider><RecoveryControl store={s} /></EditorProvider>); await screen.findByRole('button', { name: '丢弃' })
 fireEvent.click(screen.getByRole('button', { name: '丢弃' })); expect(s.discard).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: '取消丢弃' })); expect(s.discard).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: '丢弃' })); fireEvent.click(screen.getByRole('button', { name: '确认丢弃' })); await screen.findByText('无写入权限')
 expect(screen.getByRole('button', { name: '恢复副本' })).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '确认丢弃' })); await screen.findByText('没有待恢复的作品')
})
it('saves after StrictMode effect cleanup and allows disabling automatic saves', async () => {
 vi.useFakeTimers()
 const s = store(); render(<StrictMode><EditorProvider><RecoveryControl store={s} /></EditorProvider></StrictMode>)
 await act(async () => { await vi.advanceTimersByTimeAsync(901) }); expect(s.save).toHaveBeenCalledOnce()
 fireEvent.click(screen.getByRole('button', { name: '自动保存与恢复' })); await act(async () => {})
 fireEvent.click(screen.getByRole('checkbox', { name: '启用自动保存' })); expect(localStorage.getItem('draivio-autosave-enabled')).toBe('false')
 vi.useRealTimers()
})

for (const cancel of ['close', 'unmount'] as const) it(`cancels pending recovery validation on ${cancel}`, async () => {
 let release!: () => void
 vi.mocked(validateProjectImages).mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
 const request = vi.fn(); window.addEventListener(REQUEST_RECOVERY, request)
 const view = render(<EditorProvider><RecoveryControl store={store([await row()])} /></EditorProvider>)
 try {
  fireEvent.click(await screen.findByRole('button', { name: '恢复副本' }))
  await waitFor(() => expect(release).toBeTypeOf('function'))
  if (cancel === 'close') fireEvent.click(screen.getByRole('button', { name: '关闭自动保存与恢复' })); else view.unmount()
  await act(async () => release())
  expect(request).not.toHaveBeenCalled()
 } finally { window.removeEventListener(REQUEST_RECOVERY, request) }
})
function EditDuringRecovery() { const { dispatch } = useEditor(); return <button onClick={() => dispatch({ type: 'set-prompt', prompt: '确认期间继续编辑' })}>继续编辑</button> }
it('cancels recovery when the current revision changes during dirty confirmation', async () => {
 render(<EditorProvider><ProjectFileControl /><ReadState /><EditDuringRecovery /><RecoveryControl store={store([await row()])} /></EditorProvider>)
 const id = screen.getByLabelText('文档身份').textContent
 fireEvent.click(await screen.findByRole('button', { name: '恢复副本' }))
 await screen.findByRole('dialog', { name: '未保存修改' })
 fireEvent.click(screen.getByRole('button', { name: '继续编辑' }))
 fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
 await act(async () => {})
 expect(screen.getByLabelText('文档身份').textContent).toBe(id)
 expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('未命名作品')
})
it('does not let a cancelled validation clear a newer recovery request busy state', async () => {
 const releases: Array<() => void> = []
 for (let index = 0; index < 2; index++) vi.mocked(validateProjectImages).mockImplementationOnce(() => new Promise<void>(resolve => releases.push(resolve)))
 const request = vi.fn(); window.addEventListener(REQUEST_RECOVERY, request)
 render(<EditorProvider><RecoveryControl store={store([await row()])} /></EditorProvider>)
 try {
  fireEvent.click(await screen.findByRole('button', { name: '恢复副本' }))
  await waitFor(() => expect(releases).toHaveLength(1))
  fireEvent.click(screen.getByRole('button', { name: '关闭自动保存与恢复' }))
  fireEvent.click(screen.getByRole('button', { name: '自动保存与恢复' }))
  fireEvent.click(await screen.findByRole('button', { name: '恢复副本' }))
  await waitFor(() => expect(releases).toHaveLength(2))
  await act(async () => releases[0]())
  expect(request).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '恢复副本' })).toBeDisabled()
  await act(async () => releases[1]())
  expect(request).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '恢复副本' })).toBeEnabled()
 } finally { window.removeEventListener(REQUEST_RECOVERY, request) }
})

function RemovableRecovery({ recoveryStore }: { recoveryStore: RecoveryStore }) {
 const [visible, setVisible] = useState(true)
 return <><button onClick={() => setVisible(false)}>卸载恢复面板</button>{visible && <RecoveryControl store={recoveryStore} />}</>
}
for (const cancel of ['close', 'unmount'] as const) it(`does not apply recovery after ${cancel} while dirty confirmation is pending`, async () => {
 render(<EditorProvider><ProjectFileControl /><ReadState /><RemovableRecovery recoveryStore={store([await row()])} /></EditorProvider>)
 const id = screen.getByLabelText('文档身份').textContent
 fireEvent.click(await screen.findByRole('button', { name: '恢复副本' }))
 const confirmation = await screen.findByRole('dialog', { name: '未保存修改' })
 if (cancel === 'close') fireEvent.keyDown(confirmation, { key: 'Escape' })
 else fireEvent.click(screen.getByRole('button', { name: '卸载恢复面板' }))
 expect(screen.queryByRole('dialog', { name: '自动保存与恢复' })).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
 await act(async () => {})
 expect(screen.getByLabelText('文档身份').textContent).toBe(id)
 expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('未命名作品')
})
