import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider } from '../state/editor'
import { DocumentSizeControl } from './DocumentSizeControl'
it('keeps invalid dimensions in the dialog and applies a valid canvas size', () => {
  render(<EditorProvider><DocumentSizeControl /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: /文档尺寸/ }))
  fireEvent.change(screen.getByLabelText('文档宽度'), { target: { value: '0' } })
  fireEvent.click(screen.getByRole('button', { name: '应用尺寸' }))
  expect(screen.getByRole('dialog')).toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('1–16384')
  fireEvent.change(screen.getByLabelText('文档宽度'), { target: { value: '1200' } })
  fireEvent.click(screen.getByRole('button', { name: '应用尺寸' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: /文档尺寸/ })).toHaveTextContent('1200 × 625')
})
