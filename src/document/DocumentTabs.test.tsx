import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { DocumentWorkspaceProvider } from './DocumentWorkspaceProvider'
import { DocumentTabs } from './DocumentTabs'
import { useEditor } from '../state/editor'
function DirtyMarker() { const { dispatch } = useEditor(); return <button onClick={() => dispatch({ type: 'set-prompt', prompt: 'changed' })}>修改</button> }

it('creates, switches and closes independent document tabs', () => {
  render(<DocumentWorkspaceProvider><DocumentTabs /></DocumentWorkspaceProvider>)
  expect(screen.getAllByRole('tab')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '新建文档' }))
  expect(screen.getAllByRole('tab')).toHaveLength(2)
  const tabs = screen.getAllByRole('tab')
  fireEvent.click(tabs[0].querySelector('button')!)
  expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true')
  fireEvent.click(screen.getAllByRole('tab')[0].querySelectorAll('button')[1])
  expect(screen.getAllByRole('tab')).toHaveLength(1)
})

it('caps open documents at sixteen', () => {
  render(<DocumentWorkspaceProvider><DocumentTabs /></DocumentWorkspaceProvider>)
  for (let index = 0; index < 20; index++) fireEvent.click(screen.getByRole('button', { name: '新建文档' }))
  expect(screen.getAllByRole('tab')).toHaveLength(16)
})

it('asks before closing a dirty document and supports cancellation', () => {
  render(<DocumentWorkspaceProvider><DirtyMarker /><DocumentTabs /></DocumentWorkspaceProvider>)
  fireEvent.click(screen.getByRole('button', { name: '修改' }))
  fireEvent.click(screen.getByRole('button', { name: /关闭 未命名作品/ }))
  expect(screen.getByRole('dialog', { name: '关闭未保存文档' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '取消关闭' }))
  expect(screen.queryByRole('dialog', { name: '关闭未保存文档' })).toBeNull()
})
