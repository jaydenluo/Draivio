import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'

function Probe() { const { state } = useEditor(); return <output data-testid="rotation">{state.canvasRotation}</output> }
function selectRotate() {
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：导航' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '旋转画布 (R)' }))
}

test('rotate tool exposes angle controls and changes the canvas by explicit buttons', () => {
  render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  selectRotate()
  expect(screen.getByText('画布旋转 0°')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '顺时针旋转 15°' }))
  expect(screen.getByTestId('rotation')).toHaveTextContent('15')
  fireEvent.click(screen.getByRole('button', { name: '逆时针旋转 15°' }))
  expect(screen.getByTestId('rotation')).toHaveTextContent('0')
  fireEvent.click(screen.getByRole('button', { name: '重置画布旋转' }))
  expect(screen.getByTestId('rotation')).toHaveTextContent('0')
})

test('dragging the rotate tool changes rotation and clicking gives a visible step', () => {
  render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  selectRotate()
  const interaction = screen.getByLabelText('画布交互层')
  fireEvent.pointerDown(interaction, { pointerId: 1, clientX: 250, clientY: 300, buttons: 1 })
  fireEvent.pointerUp(interaction, { pointerId: 1, clientX: 250, clientY: 300 })
  expect(Number(screen.getByTestId('rotation').textContent)).toBe(15)
  fireEvent.pointerDown(interaction, { pointerId: 2, clientX: 250, clientY: 300, buttons: 1 })
  fireEvent.pointerMove(interaction, { pointerId: 2, clientX: 300, clientY: 300, buttons: 1 })
  fireEvent.pointerUp(interaction, { pointerId: 2, clientX: 300, clientY: 300 })
  expect(Number(screen.getByTestId('rotation').textContent)).toBeGreaterThan(15)
})
