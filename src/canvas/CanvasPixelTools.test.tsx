import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { CanvasViewport } from './CanvasViewport'
function Setup() { const { state, dispatch } = useEditor(); return <><button onClick={() => { dispatch({ type: 'resize-document', width: 1000, height: 1250, mode: 'image' }); dispatch({ type: 'select-tool', tool: 'brush' }) }}>缩放并画笔</button><button onClick={() => dispatch({ type: 'select-tool', tool: 'text' })}>文字</button><button onClick={() => { dispatch({ type: 'resize-document', width: 1000, height: 1000, mode: 'canvas' }); dispatch({ type: 'select-tool', tool: 'fill' }) }}>扩边填充</button><button onClick={() => { dispatch({ type: 'resize-document', width: 1000, height: 1000, mode: 'canvas' }); dispatch({ type: 'select-tool', tool: 'mask-gradient' }) }}>扩边渐变蒙版</button><output data-testid="tools-state">{JSON.stringify({ brush: state.brushStrokes, text: state.canvasTexts, shapes: state.canvasShapes, masks: state.layerMasks })}</output><CanvasViewport /></> }
it('creates a 20px brush and 24px text after 2x image scaling without doubling their physical size', () => {
 const { container } = render(<EditorProvider><Setup /></EditorProvider>)
 fireEvent.click(screen.getByText('缩放并画笔'))
 const board = container.querySelector('.artboard')!
 fireEvent.pointerDown(board, { pointerId: 1, clientX: 50, clientY: 50, button: 0 }); fireEvent.pointerUp(board, { pointerId: 1, clientX: 50, clientY: 50 })
 expect(JSON.parse(screen.getByTestId('tools-state').textContent!).brush[0].size).toBe(10)
 fireEvent.click(screen.getByText('文字'))
 fireEvent.pointerDown(board, { pointerId: 2, clientX: 50, clientY: 50, button: 0 })
 fireEvent.pointerUp(board, { pointerId: 2, clientX: 50, clientY: 50 })
 const input = screen.getByRole('textbox', { name: '编辑画布文字' })
 expect(JSON.parse(screen.getByTestId('tools-state').textContent!).text).toHaveLength(0)
 fireEvent.change(input, { target: { value: '尺寸验证' } })
 fireEvent.keyDown(input, { key: 'Enter' })
 expect(JSON.parse(screen.getByTestId('tools-state').textContent!).text[0].text).toBe('尺寸验证')
 expect(JSON.parse(screen.getByTestId('tools-state').textContent!).text[0].fontSize).toBe(12)
})
it('stores document fill selections in the resized layer local space', () => {
 const { container } = render(<EditorProvider><Setup /></EditorProvider>)
 fireEvent.click(screen.getByText('扩边填充'))
 fireEvent.pointerDown(container.querySelector('.artboard')!, { pointerId: 1, clientX: 50, clientY: 50, button: 0 })
 const selection = JSON.parse(screen.getByTestId('tools-state').textContent!).shapes[0].selection
 expect(selection.rect.x).toBeCloseTo(27)
 expect(selection.rect.y).toBeCloseTo(26)
})

it('commits both gradient mask endpoints in the transformed layer local space', () => {
 const { container } = render(<EditorProvider><Setup /></EditorProvider>)
 fireEvent.click(screen.getByText('扩边渐变蒙版'))
 const board = container.querySelector('.artboard')!
 board.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON() {} })
 fireEvent.pointerDown(board, { pointerId: 1, clientX: 500, clientY: 500, button: 0 })
 fireEvent.pointerMove(board, { pointerId: 1, clientX: 600, clientY: 500 })
 fireEvent.pointerUp(board, { pointerId: 1, clientX: 600, clientY: 500 })
 const gradient = JSON.parse(screen.getByTestId('tools-state').textContent!).masks.art.gradient
 expect(gradient.from.x).toBeCloseTo(50)
 expect(gradient.from.y).toBeCloseTo(50)
 expect(gradient.to.x).toBeCloseTo(70)
 expect(gradient.to.y).toBeCloseTo(50)
})
