import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { test, expect } from 'vitest'
import { AppShell, layerOnlySvg } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'

function StateProbe() {
  const { state } = useEditor()
  return <output data-testid="selection-refine-state">{JSON.stringify({ selection: state.selection.rect, mask: state.layerMasks[state.selectedLayerId]?.selection?.rect })}</output>
}

test('renders the four-zone shell and primary generation action', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  expect(screen.getByRole('banner')).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '画布工具' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '主画布' })).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '操作面板' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'AI 操作' })).toBeInTheDocument()
})

test('opens the selection refine workspace from the selection tool options', async () => {
  render(<EditorProvider><AppShell /><StateProbe /></EditorProvider>)

  fireEvent.click(screen.getByRole('button', { name: '工具组：选区' }))
  fireEvent.click(screen.getByRole('button', { name: '选择并遮住' }))

  expect(screen.getByRole('heading', { name: '选择并遮住' })).toBeInTheDocument()
  expect(screen.getByRole('complementary', { name: '选择并遮住工作区' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('radio', { name: '输出为图层蒙版' }))
  fireEvent.click(screen.getByRole('button', { name: '应用' }))

  await waitFor(() => {
    const mask = JSON.parse(screen.getByTestId('selection-refine-state').textContent ?? '{}').mask
    expect(Math.abs(mask.x - 27)).toBeLessThan(0.2); expect(Math.abs(mask.y - 26)).toBeLessThan(0.2); expect(Math.abs(mask.width - 46)).toBeLessThan(0.2); expect(Math.abs(mask.height - 40)).toBeLessThan(0.2)
  })
})

test('cancels an in-flight refinement without creating a mask', async () => {
  render(<EditorProvider><AppShell /><StateProbe /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '工具组：选区' }))
  fireEvent.click(screen.getByRole('button', { name: '选择并遮住' }))
  fireEvent.click(screen.getByRole('radio', { name: '输出为图层蒙版' }))
  fireEvent.click(screen.getByRole('button', { name: '应用' }))
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.queryByRole('heading', { name: '选择并遮住' })).toBeNull()
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(JSON.parse(screen.getByTestId('selection-refine-state').textContent ?? '{}').mask).toBeUndefined()
})

test('captures refinement pixels from the target layer only', () => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.innerHTML = '<g data-layer-id="target" transform="rotate(12)"><mask id="target-mask" /><rect /></g><g data-layer-id="other"><rect /></g><g data-mask-preview="true" />'
  const isolated = layerOnlySvg(svg, 'target')
  expect(isolated.querySelector('[data-layer-id="target"]')).toBeTruthy()
  expect(isolated.querySelector('[data-layer-id="other"]')).toBeNull()
  expect(isolated.querySelector('[data-mask-preview]')).toBeNull()
  expect(isolated.querySelector('[data-layer-id="target"]')?.getAttribute('transform')).toBe('rotate(12)')
  expect(isolated.querySelector('#target-mask')).toBeTruthy()
})
