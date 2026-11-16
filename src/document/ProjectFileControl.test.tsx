/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ProjectFileControl } from './ProjectFileControl'
import { saveProjectFile } from './projectStorage'
vi.mock('./projectStorage', () => ({ hasProjectPicker: () => false, openProjectFile: vi.fn(), saveProjectFile: vi.fn() }))
const save = vi.mocked(saveProjectFile)
beforeEach(() => { save.mockReset() })
afterEach(() => vi.unstubAllGlobals())
describe('project file controls', () => {
  it('does not mark a newer project name saved when an older save finishes', async () => {
    let finish!: (value: { name: string }) => void
    save.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    render(<EditorProvider><ProjectFileControl /></EditorProvider>)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(save).toHaveBeenCalledOnce())
    fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '新名字' } })
    await act(async () => finish({ name: '旧名字.draivio' }))
    expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
  })
  it('keeps the document dirty on failed or cancelled save', async () => {
    save.mockRejectedValueOnce(new Error('磁盘已满'))
    render(<EditorProvider><ProjectFileControl /></EditorProvider>)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())
    expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
    save.mockResolvedValueOnce(null)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
  })
})

it('cancels a new document without losing the current project', async () => {
  render(<EditorProvider><ProjectFileControl /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '保留的作品' } })
  act(() => window.dispatchEvent(new CustomEvent('draivio:request-new-document', { cancelable: true, detail: { width: 800, height: 600 } })))
  expect(screen.getByRole('dialog', { name: '未保存修改' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消切换' }))
  expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('保留的作品')
})
it('does not switch documents when save before switching fails or is cancelled', async () => {
  render(<EditorProvider><ProjectFileControl /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '保留的作品' } })
  for (const fail of [false, true]) {
    save.mockImplementationOnce(async () => { if (fail) throw new Error('磁盘已满'); return null })
    act(() => window.dispatchEvent(new CustomEvent('draivio:request-new-document', { cancelable: true, detail: { width: 800, height: 600 } })))
    fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存并继续' })).toBeEnabled())
    expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('保留的作品')
    fireEvent.click(screen.getByRole('button', { name: '取消切换' }))
  }
})
it('discards into a fresh project whose save cannot overwrite the previous destination', async () => {
  save.mockResolvedValue({ name: 'old.draivio', token: 'old-file' })
  render(<EditorProvider><ProjectFileControl /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.getByLabelText('已保存')).toBeInTheDocument())
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '脏作品' } })
  act(() => window.dispatchEvent(new CustomEvent('draivio:request-new-document', { cancelable: true, detail: { width: 800, height: 600 } })))
  fireEvent.click(screen.getByRole('button', { name: '放弃修改' }))
  await waitFor(() => expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('未命名作品'))
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
  expect(save.mock.calls[1][2]).toBeUndefined()
  expect(JSON.parse(save.mock.calls[1][0]).metadata.id).not.toBe(JSON.parse(save.mock.calls[0][0]).metadata.id)
})
it('leaves the current project intact when a corrupt file is selected', async () => {
  render(<EditorProvider><ProjectFileControl /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '当前作品' } })
  const file = { size: 10, name: 'bad.draivio', text: async () => '{bad' }
  fireEvent.change(screen.getByLabelText('打开 Draivio 项目'), { target: { files: [file] } })
  await act(async () => {})
  expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('当前作品')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
})

it('retains the current document when an embedded image is not decodable', async () => {
  // This stand-in exercises the asynchronous decoder failure gate only; actual PNG decoding
  // is independently checked by projectFixture and must also be checked in the real browser.
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null
    onerror: (() => void) | null = null
    set src(value: string) { if (value) queueMicrotask(() => this.onerror?.()) }
  })
  render(<EditorProvider><ProjectFileControl /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '不可丢失的作品' } })
  const fixture = readFileSync('docs/implementation/fixtures/editable-project-v2.draivio', 'utf8')
  const file = { size: fixture.length, name: 'broken-pixels.draivio', text: async () => fixture }
  fireEvent.change(screen.getByLabelText('打开 Draivio 项目'), { target: { files: [file] } })
  await act(async () => {})
  expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('不可丢失的作品')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByLabelText('有未保存修改')).toBeInTheDocument()
})
it('retains the current document when a three-byte fake PNG is imported', async () => {
  render(<EditorProvider><ProjectFileControl /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '当前作品' } })
  const raw = JSON.parse(readFileSync('docs/implementation/fixtures/editable-project-v2.draivio', 'utf8'))
  raw.assets['image-1'] = 'data:image/png;base64,AQID'
  fireEvent.change(screen.getByLabelText('打开 Draivio 项目'), { target: { files: [{ size: 500, name: 'bad.draivio', text: async () => JSON.stringify(raw) }] } })
  await act(async () => {})
  expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('当前作品')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

function SessionRevision() { const { state } = useEditor(); return <output data-testid="session-revision">{state.documentRevision}</output> }
it('opening a saved project remains clean after creating a fresh session-history baseline', async () => {
  vi.stubGlobal('Image', class { onload?: () => void; naturalWidth = 2; naturalHeight = 2; set src(_value: string) { queueMicrotask(() => this.onload?.()) } })
  save.mockResolvedValue({ name: 'current.draivio' })
  render(<EditorProvider><ProjectFileControl /><SessionRevision /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '保存' }))
  await waitFor(() => expect(screen.getByLabelText('已保存')).toBeInTheDocument())
  const beforeRevision = screen.getByTestId('session-revision').textContent
  const contents = save.mock.calls[0][0]
  fireEvent.change(screen.getByLabelText('打开 Draivio 项目'), { target: { files: [{ size: contents.length, name: 'same.draivio', text: async () => contents }] } })
  await waitFor(() => expect(screen.getByTestId('session-revision').textContent).not.toBe(beforeRevision))
  await waitFor(() => expect(screen.getByLabelText('已保存')).toBeInTheDocument())
  expect(screen.queryByLabelText('有未保存修改')).not.toBeInTheDocument()
})
it('rejects malformed AI adoption imports before replacing current document or session', async () => {
  render(<EditorProvider><ProjectFileControl /><SessionRevision /></EditorProvider>)
  fireEvent.change(screen.getByRole('textbox', { name: '项目名称' }), { target: { value: '保留当前作品' } })
  const beforeRevision = screen.getByTestId('session-revision').textContent
  const fixture = JSON.parse(readFileSync('docs/implementation/fixtures/editable-project-v2.draivio', 'utf8'))
  for (const adoptions of ['', [{ kind: 'replace', layerId: 'any', originalLayer: { source: 'fixture' } }]]) {
    const raw = structuredClone(fixture); raw.document.aiResults[0].adoptions = adoptions
    const contents = JSON.stringify(raw)
    fireEvent.change(screen.getByLabelText('打开 Draivio 项目'), { target: { files: [{ size: contents.length, name: 'bad-ai.draivio', text: async () => contents }] } })
    await act(async () => {})
    expect(screen.getByRole('textbox', { name: '项目名称' })).toHaveValue('保留当前作品')
    expect(screen.getByTestId('session-revision').textContent).toBe(beforeRevision)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  }
})
