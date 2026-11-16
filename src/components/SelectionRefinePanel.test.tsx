import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createSelection } from '../canvas/selectionGeometry'
import { SelectionRefinePanel, type SelectionRefinePreviewMode } from './SelectionRefinePanel'

const selection = createSelection('rectangle', { x: 20, y: 20, width: 40, height: 35 })

function renderPanel(overrides: Partial<React.ComponentProps<typeof SelectionRefinePanel>> = {}) {
  const props: React.ComponentProps<typeof SelectionRefinePanel> = {
    selection,
    previewMode: 'overlay',
    brushMode: 'add',
    brushSize: 80,
    documentWidth: 500,
    documentHeight: 625,
    onSelectionChange: vi.fn(),
    onPreviewModeChange: vi.fn(),
    onBrushModeChange: vi.fn(),
    onBrushSizeChange: vi.fn(),
    onApply: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  }
  return { ...render(<SelectionRefinePanel {...props} />), props }
}

describe('SelectionRefinePanel', () => {
  it('switches preview mode without closing the refine workspace', () => {
    const onPreviewModeChange = vi.fn<(mode: SelectionRefinePreviewMode) => void>()
    renderPanel({ onPreviewModeChange })

    fireEvent.click(screen.getByRole('button', { name: '黑底预览' }))

    expect(onPreviewModeChange).toHaveBeenCalledWith('black')
    expect(screen.getByRole('heading', { name: '选择并遮住' })).toBeInTheDocument()
  })

  it('applies the refined selection as a layer mask', () => {
    const onApply = vi.fn()
    renderPanel({ onApply })

    fireEvent.click(screen.getByRole('radio', { name: '输出为图层蒙版' }))
    fireEvent.click(screen.getByRole('button', { name: '应用' }))

    expect(onApply).toHaveBeenCalledWith(selection, 'mask', { smooth: 0, shift: 0, feather: 0, density: 100, decontaminate: 0, colorCorrection: true })
  })

  it('changes brush mode and size for edge refinement', () => {
    const onBrushModeChange = vi.fn()
    const onBrushSizeChange = vi.fn()
    renderPanel({ onBrushModeChange, onBrushSizeChange })

    fireEvent.click(screen.getByRole('button', { name: '减去选区' }))
    fireEvent.change(screen.getByRole('slider', { name: '画笔大小' }), { target: { value: '140' } })

    expect(onBrushModeChange).toHaveBeenCalledWith('subtract')
    expect(onBrushSizeChange).toHaveBeenCalledWith(140)
  })

  it('cancels without applying the draft', () => {
    const onCancel = vi.fn()
    const onApply = vi.fn()
    renderPanel({ onCancel, onApply })

    fireEvent.click(screen.getByRole('button', { name: '取消' }))

    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onApply).not.toHaveBeenCalled()
  })
})
