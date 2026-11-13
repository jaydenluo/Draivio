import { fireEvent, render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

test('selecting a drawing tool updates its pressed state and selection overlay', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '画笔 (B)' }))
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：选区' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '选区' }))
  expect(screen.getByLabelText('局部选区')).toBeInTheDocument()
})
