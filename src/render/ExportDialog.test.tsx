import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ExportDialog } from './ExportDialog'

describe('ExportDialog', () => {
  it('requires explicit display-depth conversion for a document containing high precision originals', () => {
    render(<ExportDialog open hasHighPrecision svgSource={() => '<svg/>'} documentWidth={10} documentHeight={10} hasSelection={false} onClose={vi.fn()} />)
    expect(screen.getByRole('button',{name:'导出'})).toBeDisabled()
    expect(screen.getByLabelText('显式导出 8 位显示副本')).not.toBeChecked()
  })
  it('keeps the compact controls and disables selection without a selection', () => {
    render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection={false} onClose={vi.fn()} />)
    expect(screen.getByLabelText('格式')).toBeInTheDocument()
    expect(screen.getByRole('option', { name: /选区/ })).toBeDisabled()
    expect(screen.getByDisplayValue('800')).toBeInTheDocument()
  })
  it('updates the paired dimension while the ratio is locked', async () => {
    const user = userEvent.setup()
    render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={vi.fn()} />)
    await user.clear(screen.getByDisplayValue('800'))
    await user.type(screen.getByDisplayValue('0'), '400')
    expect(screen.getByDisplayValue('300')).toBeInTheDocument()
  })
})

it('validates stored preferences and defaults PNG to transparency', () => {
  localStorage.setItem('draivio-export-settings', JSON.stringify({ format: 'evil', width: -10, height: 'bad', lockRatio: 'bad' }))
  render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={vi.fn()} />)
  expect(screen.getByLabelText('格式')).toHaveValue('png')
  expect(screen.getByLabelText(/宽度/)).toHaveValue(800)
  expect(screen.getByLabelText(/高度/)).toHaveValue(600)
  localStorage.clear()
})
it('switches selection dimensions and locks to its own ratio', async () => {
  const user = userEvent.setup()
  render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} selectionWidth={200} selectionHeight={100} hasSelection onClose={vi.fn()} />)
  await user.selectOptions(screen.getByLabelText('范围'), 'selection')
  expect(screen.getByLabelText(/宽度/)).toHaveValue(200)
  expect(screen.getByLabelText(/高度/)).toHaveValue(100)
  await user.clear(screen.getByLabelText(/宽度/))
  await user.type(screen.getByLabelText(/宽度/), '400')
  expect(screen.getByLabelText(/高度/)).toHaveValue(200)
})
it('focuses dialog controls and Escape cancels without export', async () => {
 const onClose = vi.fn(), onExport = vi.fn()
 render(<ExportDialog open svgSource={() => '<svg/>'} documentWidth={800} documentHeight={600} hasSelection onClose={onClose} onExport={onExport} />)
 expect(screen.getByRole('button', { name: '关闭导出' })).toHaveFocus()
 await userEvent.setup().keyboard('{Escape}')
 expect(onClose).toHaveBeenCalledOnce()
 expect(onExport).not.toHaveBeenCalled()
})
