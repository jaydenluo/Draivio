import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorProvider } from '../state/editor'
import { ProjectFileControl } from './ProjectFileControl'
import { saveProjectFile } from './projectStorage'
vi.mock('./projectStorage', () => ({ hasProjectPicker: () => false, openProjectFile: vi.fn(), saveProjectFile: vi.fn() }))
const save = vi.mocked(saveProjectFile)
beforeEach(() => { save.mockReset() })
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
