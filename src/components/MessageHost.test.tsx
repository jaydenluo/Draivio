import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { MessageHost } from './MessageHost'
import { message } from '../ui/message'
import { SettingsDialog } from './SettingsDialog'

afterEach(() => { message.destroy(); vi.useRealTimers() })

test('updates a loading message in place, deduplicates by key and expires the result', () => {
  vi.useFakeTimers(); render(<MessageHost />)
  let feedback!: ReturnType<typeof message.loading>
  act(() => { feedback = message.loading('获取中', { key: 'models' }); message.loading('获取中', { key: 'models' }) })
  expect(screen.getAllByText('获取中')).toHaveLength(1)
  act(() => feedback.success('已获取模型'))
  expect(screen.queryByText('获取中')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('已获取模型')
  act(() => vi.advanceTimersByTime(4000))
  expect(screen.queryByText('已获取模型')).not.toBeInTheDocument()
})

test('shows errors globally and allows dismissing them', () => {
  render(<MessageHost />)
  act(() => { message.error('连接失败') })
  expect(screen.getByRole('alert')).toHaveTextContent('连接失败')
  fireEvent.click(screen.getByRole('button', { name: '关闭消息' }))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})

test('keeps messages in the active dialog accessibility tree', async () => {
  render(<><MessageHost /><SettingsDialog label="编辑来源" onClose={() => {}}>表单</SettingsDialog></>)
  act(() => { message.error('密钥无效') })
  await waitFor(() => expect(within(screen.getByRole('dialog', { name: '编辑来源' })).getByRole('alert')).toHaveTextContent('密钥无效'))
})
