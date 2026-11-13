import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider } from '../state/editor'

test('renders the four-zone shell and primary generation action', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '画布工具' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '主画布' })).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '操作面板' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'AI 操作' })).toBeInTheDocument()
})
