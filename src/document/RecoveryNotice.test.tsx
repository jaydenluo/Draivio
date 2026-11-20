import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { RecoveryNotice } from './RecoveryNotice'

const documents = [
  { id: 'a', name: '春日海报', width: 500, height: 625 },
  { id: 'b', name: '产品照片', width: 1200, height: 800 },
]

test('shows document names and dimensions with a clear restore action', () => {
  const restore = vi.fn()
  render(<RecoveryNotice documents={documents} onRestore={restore} onDiscard={vi.fn()} />)
  const notice = screen.getByRole('dialog', { name: '恢复编辑' })
  expect(notice).toHaveAttribute('aria-modal', 'false')
  expect(within(notice).getByText('发现 2 个未关闭文档')).toBeInTheDocument()
  expect(within(notice).getByText('春日海报')).toBeInTheDocument()
  expect(within(notice).getByText('500 × 625')).toBeInTheDocument()
  fireEvent.click(within(notice).getByRole('button', { name: '恢复副本' }))
  expect(restore).toHaveBeenCalledOnce()
})

test.each(['稍后', '收起恢复提示'])('%s collapses into a reopenable entry without discarding', (name) => {
  const discard = vi.fn()
  render(<RecoveryNotice documents={documents} onRestore={vi.fn()} onDiscard={discard} />)
  fireEvent.click(screen.getByRole('button', { name }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const entry = screen.getByRole('button', { name: '查看待恢复的 2 个文档' })
  expect(entry).toHaveFocus()
  fireEvent.click(entry)
  expect(screen.getByRole('dialog', { name: '恢复编辑' })).toBeInTheDocument()
  expect(discard).not.toHaveBeenCalled()
})

test('requires confirmation before discarding and supports cancelling', () => {
  const discard = vi.fn()
  render(<RecoveryNotice documents={documents} onRestore={vi.fn()} onDiscard={discard} />)
  fireEvent.click(screen.getByRole('button', { name: '丢弃' }))
  expect(discard).not.toHaveBeenCalled()
  expect(screen.getByText('丢弃这些恢复副本？')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '保留副本' }))
  expect(screen.getByRole('button', { name: '恢复副本' })).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: '丢弃' }))
  fireEvent.click(screen.getByRole('button', { name: '确认丢弃' }))
  expect(discard).toHaveBeenCalledOnce()
})

test('Escape collapses the card and keeps document names out of an unbounded list', () => {
  render(<RecoveryNotice documents={[...documents, { ...documents[0], id: 'c' }, { ...documents[1], id: 'd' }]} onRestore={vi.fn()} onDiscard={vi.fn()} />)
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(screen.getByText('另有 1 个文档')).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.getByRole('button', { name: '查看待恢复的 4 个文档' })).toHaveFocus()
})
