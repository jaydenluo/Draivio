import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { ColorPicker } from './ColorPicker'

test('opens a custom color panel and updates HEX and RGB values', () => {
  const onChange = vi.fn()
  render(<ColorPicker label="前景色" value="#ff765f" onChange={onChange} recentColors={['#123456']} />)

  fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器：前景色' }))
  expect(screen.getByRole('dialog', { name: '前景色颜色选择器' })).toBeInTheDocument()
  expect(screen.getByLabelText('前景色 HEX')).toHaveValue('#ff765f')
  expect(screen.getByLabelText('前景色 R')).toHaveValue('255')
  expect(screen.getByText('高级色 · 按当前色系推荐')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^推荐颜色/ })).toHaveLength(10)

  fireEvent.change(screen.getByLabelText('前景色 HEX'), { target: { value: '#123456' } })
  expect(onChange).toHaveBeenLastCalledWith('#123456')
  fireEvent.change(screen.getByLabelText('前景色 G'), { target: { value: '200' } })
  expect(onChange).toHaveBeenLastCalledWith('#12c856')
})

test('applies a curated color recommendation', () => {
  const onChange = vi.fn()
  render(<ColorPicker label="颜色" value="#ffffff" onChange={onChange} />)
  fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器：颜色' }))
  fireEvent.click(screen.getByRole('button', { name: '推荐颜色 珊瑚红 #FF6B5F' }))
  expect(onChange).toHaveBeenCalledWith('#FF6B5F')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('selecting a recent color closes the panel and restores it', () => {
  const onChange = vi.fn()
  const onRecentSelect = vi.fn()
  render(<ColorPicker label="颜色" value="#ffffff" onChange={onChange} onRecentSelect={onRecentSelect} recentColors={['#123456']} />)
  fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器：颜色' }))
  fireEvent.click(screen.getByRole('button', { name: '最近颜色 #123456' }))
  expect(onRecentSelect).toHaveBeenCalledWith('#123456')
  expect(onChange).toHaveBeenCalledWith('#123456')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
