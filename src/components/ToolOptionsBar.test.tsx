import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ToolOptionsBar } from './ToolOptionsBar'
import type { ToolId } from '../tools/toolTypes'

function ToolProbe() {
  const { state, dispatch } = useEditor()
  return <>
    <output data-testid="active-tool">{state.activeTool}</output>
    <output data-testid="tool-options">{JSON.stringify(state.toolOptions)}</output>
    <output data-testid="brush-color">{state.brushColor}</output>
    {['mask', 'gradient-fill', 'shape', 'magic-wand', 'clone-stamp', 'subject-select'].map((tool) => <button key={tool} onClick={() => dispatch({ type: 'select-tool', tool: tool as ToolId })}>切到{tool}</button>)}
    <button type="button" onClick={() => dispatch({ type: 'select-tool', tool: 'brush' })}>切到画笔</button>
    <button type="button" onClick={() => dispatch({ type: 'select-tool', tool: 'rectangle-select' })}>切到矩形选框</button>
    <button type="button" onClick={() => dispatch({ type: 'select-tool', tool: 'text' })}>切到文字</button>
    <button type="button" onClick={() => dispatch({ type: 'select-tool', tool: 'crop' })}>切到裁剪</button>
    <button type="button" onClick={() => dispatch({ type: 'select-tool', tool: 'select' })}>切到选择</button>
  </>
}

function renderBar() {
  return render(<EditorProvider><ToolOptionsBar /><ToolProbe /></EditorProvider>)
}

test('shows selection controls and persists numeric options through editor state', () => {
  renderBar()

  fireEvent.click(screen.getByRole('button', { name: '切到矩形选框' }))
  expect(screen.getByRole('toolbar', { name: '工具选项' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选区模式：新建' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '选区模式：添加' })).toBeInTheDocument()
  for (const mode of ['新建', '添加', '减去', '相交']) {
    expect(screen.getByRole('button', { name: `选区模式：${mode}` }).querySelector('svg')).toBeInTheDocument()
  }
  expect(screen.getByRole('spinbutton', { name: '羽化' })).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: '固定比例' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '选区创建蒙版' })).toBeInTheDocument()

  const feather = screen.getByRole('spinbutton', { name: '羽化' })
  fireEvent.change(feather, { target: { value: '999' } })
  expect(feather).toHaveValue(100)
  expect(screen.getByTestId('tool-options')).toHaveTextContent('"feather":100')
})

test('updates option fields when switching between brush, text, crop, and navigation tools', () => {
  renderBar()

  fireEvent.click(screen.getByRole('button', { name: '切到画笔' }))
  expect(screen.getByRole('spinbutton', { name: '大小' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '硬度' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '不透明度' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '流量' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '平滑' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '切到文字' }))
  expect(screen.getByRole('combobox', { name: '字体' })).toBeInTheDocument()
  expect(screen.getByRole('spinbutton', { name: '字号' })).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '字重' })).toBeInTheDocument()
  expect(screen.getByLabelText('文字颜色')).toBeInTheDocument()
  expect(screen.getByRole('combobox', { name: '对齐' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '切到裁剪' }))
  expect(screen.getByRole('combobox', { name: '裁剪比例' })).toBeInTheDocument()

  fireEvent.click(screen.getByRole('button', { name: '切到选择' }))
  expect(screen.getByText('当前工具：选择')).toBeInTheDocument()
  expect(screen.queryByRole('spinbutton', { name: '大小' })).not.toBeInTheDocument()
})

test('applies and remembers the text color option', () => {
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: '切到文字' }))
  fireEvent.change(screen.getByLabelText('文字颜色'), { target: { value: '#12abef' } })
  expect(screen.getByTestId('tool-options')).toHaveTextContent('"textColor":"#12abef"')
  fireEvent.click(screen.getByRole('button', { name: '打开颜色选择器：文字颜色' }))
  expect(screen.getByRole('button', { name: '最近颜色 #12abef' })).toBeInTheDocument()
})

test('restores the last text color when the editor starts again', () => {
  localStorage.setItem('draivio-text-color', '#345678')
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: '切到文字' }))
  expect(screen.getByLabelText('文字颜色')).toHaveValue('#345678')
  localStorage.removeItem('draivio-text-color')
})

test('offers quick brush size presets beside the detailed controls', () => {
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: '切到画笔' }))
  const presets = screen.getByRole('group', { name: '常用画笔大小' })
  expect(presets).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '48' }))
  expect(screen.getByRole('spinbutton', { name: '大小' })).toHaveValue(48)
})

test('edits the shared foreground color for painting and provides mask actions', () => {
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: '切到画笔' }))
  fireEvent.change(screen.getByLabelText('前景色'), { target: { value: '#123456' } })
  expect(screen.getByTestId('brush-color')).toHaveTextContent('#123456')
  fireEvent.click(screen.getByRole('button', { name: '切到mask' }))
  expect(screen.getByRole('spinbutton', { name: '大小' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '反转蒙版' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '清空蒙版' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '应用蒙版' })).toBeInTheDocument()
})

test('provides fill and shape colors, wand tolerance and service or sampling guidance', () => {
  renderBar()
  fireEvent.click(screen.getByRole('button', { name: '切到gradient-fill' }))
  fireEvent.change(screen.getByLabelText('渐变末色'), { target: { value: '#654321' } })
  expect(screen.getByTestId('tool-options')).toHaveTextContent('"gradientEndColor":"#654321"')
  fireEvent.click(screen.getByRole('button', { name: '切到shape' }))
  expect(screen.getByLabelText('前景色')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '切到magic-wand' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '容差' }), { target: { value: '999' } })
  expect(screen.getByRole('spinbutton', { name: '容差' })).toHaveValue(255)
  fireEvent.click(screen.getByRole('button', { name: '切到clone-stamp' }))
  expect(screen.getByText(/Alt.*取样/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '切到subject-select' }))
  expect(screen.getByText(/主体选择.*云端.*服务/)).toBeInTheDocument()
})

