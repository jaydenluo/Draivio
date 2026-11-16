import { useState } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { ModelManagerDialog } from './ModelManagerDialog'

vi.mock('./modelApi', () => ({ modelApi: {
  getState: vi.fn(async () => ({ u2net: { modelId: 'u2net', status: 'downloading', downloadedBytes: 10, totalBytes: 100 } })),
  onProgress: vi.fn(async () => () => {}),
} }))

function Harness() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>打开模型管理</button><button>背景操作</button><ModelManagerDialog open={open} onClose={() => setOpen(false)} /></>
}

test('moves focus into the modal, contains keyboard navigation and restores its opener on Escape', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  const opener = screen.getByRole('button', { name: '打开模型管理' })
  await user.click(opener)
  const dialog = screen.getByRole('dialog', { name: '模型管理' })
  expect(dialog).toHaveFocus()
  await user.tab()
  const first = within(dialog).getByRole('button', { name: '关闭模型管理' })
  expect(first).toHaveFocus()
  await user.tab({ shift: true })
  expect(within(dialog).getByRole('button', { name: '完成' })).toHaveFocus()
  await user.tab()
  expect(first).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog', { name: '模型管理' })).not.toBeInTheDocument()
  expect(opener).toHaveFocus()
})

test('names model progress and exposes keyboard-operable model type controls', async () => {
  const user = userEvent.setup()
  render(<Harness />)
  await user.click(screen.getByRole('button', { name: '打开模型管理' }))
  expect(await screen.findByRole('progressbar', { name: 'U2Net 下载进度' })).toHaveAttribute('aria-valuenow', '10')
  const cutout = screen.getByRole('button', { name: '扣图' })
  expect(cutout).toHaveAttribute('aria-pressed', 'true')
  const upscale = screen.getByRole('button', { name: '超分' })
  upscale.focus()
  await user.keyboard('{Enter}')
  expect(upscale).toHaveAttribute('aria-pressed', 'true')
  expect(cutout).toHaveAttribute('aria-pressed', 'false')
  expect(screen.getByRole('heading', { name: 'Real-ESRGAN x4plus' })).toBeInTheDocument()
})
