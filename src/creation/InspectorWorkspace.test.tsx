import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

test('switches the right workspace between layers, properties and AI results', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '属性' }))
  expect(screen.getByRole('region', { name: '图层属性' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'AI 结果' }))
  expect(screen.getByRole('region', { name: 'AI 结果' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '图层' }))
  expect(screen.getByRole('heading', { name: '图层' })).toBeInTheDocument()
})

test('renames, duplicates, locks and reorders a layer from the right panel', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '重命名' }))
  fireEvent.change(screen.getByRole('textbox', { name: '图层名称' }), { target: { value: '海报主体' } })
  fireEvent.click(screen.getByRole('button', { name: '确定' }))
  expect(screen.getByRole('button', { name: '海报主体图层' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '复制' }))
  expect(screen.getByRole('button', { name: '海报主体 副本图层' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '海报主体 副本锁定' }))
  expect(screen.getByRole('button', { name: '海报主体 副本解锁' })).toBeInTheDocument()
})

test('filters layers and exposes batch actions', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.change(screen.getByRole('searchbox', { name: '搜索图层' }), { target: { value: '蒙版' } })
  expect(screen.getByRole('button', { name: '局部蒙版图层' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '春日海报 · 变体 1图层' })).not.toBeInTheDocument()
})

test('shows adjustment controls for the selected layer', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '属性' }))
  expect(screen.getByText('图像调整')).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '亮度' })).toBeInTheDocument()
})
