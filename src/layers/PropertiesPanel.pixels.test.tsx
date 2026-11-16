import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider } from '../state/editor'
import { PropertiesPanel } from './PropertiesPanel'
it('shows actual pixel dimensions by default and supports percentage display', () => {
 render(<EditorProvider><PropertiesPanel /></EditorProvider>)
 expect(screen.getByLabelText('宽度')).toHaveValue(500)
 expect(screen.getByLabelText('高度')).toHaveValue(625)
 fireEvent.change(screen.getByLabelText('属性单位'), { target: { value: '%' } })
 expect(screen.getByLabelText('宽度')).toHaveValue(100)
})
