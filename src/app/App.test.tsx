import { render, screen } from '@testing-library/react'
import { test, expect } from 'vitest'
import { App } from './App'

test('renders the Draivio workbench landmarks', () => {
  render(<App />)
  expect(screen.getByText('Draivio')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '主画布' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'AI 操作' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '操作历史' })).toBeInTheDocument()
})
