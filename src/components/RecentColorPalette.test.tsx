import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ToolRail } from './ToolRail'

test('picker flyout shows up to twenty recent colors and selecting one restores it', () => {
  function Seed() {
    const { dispatch } = useEditor()
    return <button onClick={() => { for (let index = 0; index < 22; index += 1) dispatch({ type: 'set-brush-color', color: `#${String(index).padStart(2, '0')}1122` }) }}>seed</button>
  }
  function Probe() { const { state } = useEditor(); return <output data-testid="color">{state.brushColor}</output> }
  render(<EditorProvider><Seed /><ToolRail /><Probe /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'seed' }))
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：颜色/填充' }))
  expect(screen.getByRole('group', { name: '最近取色' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /^最近颜色/ })).toHaveLength(20)
  fireEvent.click(screen.getByRole('button', { name: '最近颜色 #151122' }))
  expect(screen.getByTestId('color')).toHaveTextContent('#151122')
})
