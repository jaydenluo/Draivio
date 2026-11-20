import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider } from '../state/editor'
import { TopBar } from './TopBar'
import { AIComposer } from '../creation/AIComposer'

const tools = ['操作配方', '海报排版', '人像自然精修', '配方批处理', '产品抠图与投影', '双重曝光', 'AI 布光', '识字与文字替换']

test('opens advanced tools from the top bar without adding them to the composer', () => {
  render(<EditorProvider><TopBar /><AIComposer /></EditorProvider>)
  const composer = screen.getByRole('region', { name: 'AI 操作' })
  for (const name of tools) expect(within(composer).queryByRole('button', { name })).toBeNull()
  fireEvent.click(screen.getByRole('menuitem',{name:'工具'}))
  fireEvent.click(screen.getByRole('menuitem', { name: '创作工具' }))
  const panel = screen.getByRole('dialog', { name: '创作工具' })
  expect(screen.getByRole('menubar')).toBeInTheDocument()
  expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  for (const name of tools) expect(within(panel).getByRole('button', { name })).toBeInTheDocument()
  fireEvent.click(within(panel).getByRole('button', { name: '海报排版' }))
  expect(screen.getByLabelText('海报标题')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('textbox', { name: 'AI 操作' }), { target: { value: '保留提示词' } })
  fireEvent.click(within(panel).getByRole('button', { name: '关闭创作工具' }))
  expect(screen.queryByRole('dialog', { name: '创作工具' })).toBeNull()
  expect(screen.getByRole('textbox', { name: 'AI 操作' })).toHaveValue('保留提示词')
  fireEvent.click(screen.getByRole('menuitem',{name:'工具'}))
  fireEvent.click(screen.getByRole('menuitem', { name: '创作工具' }))
  fireEvent.keyDown(screen.getByRole('dialog', { name: '创作工具' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: '创作工具' })).toBeNull()
})
