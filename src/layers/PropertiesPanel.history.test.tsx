import { CanvasViewport } from '../canvas/CanvasViewport'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import { PropertiesPanel } from './PropertiesPanel'
import { LayersPanel } from './LayersPanel'
import { HistoryStrip } from '../components/HistoryStrip'

function Probe() {
  const { state, dispatch } = useEditor()
  return <><output data-testid="history-state">{JSON.stringify({ undo: state.undoStack.length, history: state.history.length, brightness: state.layers[0].adjustments?.brightness, opacity: state.layers[0].opacity, revision: state.documentRevision })}</output><button onClick={() => dispatch({ type: 'undo' })}>撤销测试</button><button onClick={() => dispatch({ type: 'restore-project', document: { ...initialEditorState, layers: [
    { ...initialEditorState.layers[0], id: 'group', children: ['art'], locked: true },
    { ...initialEditorState.layers[0], groupId: 'group' },
  ] } })}>继承锁定测试</button></>
}
const read = () => JSON.parse(screen.getByTestId('history-state').textContent!)

test('actual property scrubbing commits once, history thumbnail is real, and a click restores it', () => {
  const view = render(<EditorProvider><PropertiesPanel /><HistoryStrip /><Probe /></EditorProvider>)
  const label = screen.getByRole('button', { name: '拖动调整亮度' })
  fireEvent.pointerDown(label, { pointerId: 1, button: 0, clientX: 0 })
  for (let index = 1; index <= 40; index++) fireEvent.pointerMove(label, { pointerId: 1, clientX: index * 2 })
  expect(read()).toMatchObject({ undo: 0, history: 1, brightness: 40 })
  fireEvent.pointerUp(label, { pointerId: 1 })
  expect(read()).toMatchObject({ undo: 1, history: 2, brightness: 40 })
  expect(view.container.querySelectorAll('.history-image .layer-thumbnail-art')).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: '初始文档' }))
  expect(read()).toMatchObject({ undo: 0, brightness: 0 })
  fireEvent.click(screen.getByRole('button', { name: '修改图层属性' }))
  expect(read()).toMatchObject({ undo: 1, brightness: 40 })
})

test('opacity input forms one undo and Escape cancels pending text edits', () => {
  render(<EditorProvider><LayersPanel /><Probe /></EditorProvider>)
  const input = screen.getByRole('spinbutton', { name: '图层不透明度' })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '8' } })
  fireEvent.change(input, { target: { value: '80' } })
  fireEvent.blur(input)
  expect(read()).toMatchObject({ undo: 1, opacity: 80 })
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '60' } })
  fireEvent.keyDown(input, { key: 'Escape' })
  expect(read()).toMatchObject({ undo: 1, opacity: 80 })
  fireEvent.click(screen.getByText('撤销测试'))
  expect(read()).toMatchObject({ undo: 0, opacity: 100 })
})

test('property controls are disabled when a parent is locked', () => {
  render(<EditorProvider><PropertiesPanel /><Probe /></EditorProvider>)
  fireEvent.click(screen.getByText('继承锁定测试'))
  expect(screen.getByRole('spinbutton', { name: '亮度' })).toBeDisabled()
  expect(screen.getByRole('spinbutton', { name: 'X' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '水平翻转' })).toBeDisabled()
})

function TransformProbe() {
  const { state, dispatch } = useEditor()
  return <><button onClick={() => dispatch({ type: 'select-tool', tool: 'move' })}>移动事务测试</button><output data-testid="transform-state">{JSON.stringify({ history: state.history.length, undo: state.undoStack.length, transform: state.layers[0].transform })}</output></>
}


test('a long canvas transform gesture commits once and cancelled preview leaves history and document untouched', () => {
  const view = render(<EditorProvider><CanvasViewport /><TransformProbe /></EditorProvider>)
  const readTransform = () => JSON.parse(screen.getByTestId('transform-state').textContent!)
  fireEvent.click(screen.getByText('移动事务测试'))
  const board = view.container.querySelector('.artboard')!
  fireEvent.pointerDown(board, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
  for (let index = 1; index <= 40; index++) fireEvent.pointerMove(board, { pointerId: 1, clientX: 20 + index, clientY: 20 })
  expect(readTransform()).toEqual({ history: 1, undo: 0 })
  fireEvent.pointerCancel(board, { pointerId: 1 })
  expect(readTransform()).toEqual({ history: 1, undo: 0 })
  fireEvent.pointerDown(board, { pointerId: 2, button: 0, clientX: 20, clientY: 20 })
  for (let index = 1; index <= 40; index++) fireEvent.pointerMove(board, { pointerId: 2, clientX: 20 + index, clientY: 20 })
  fireEvent.pointerUp(board, { pointerId: 2, clientX: 60, clientY: 20 })
  expect(readTransform()).toMatchObject({ history: 2, undo: 1 })
  expect(readTransform().transform).toBeDefined()
})

test('painting and undo preserve an already fitted viewport position and zoom', () => {
  function FitProbe() {
    const { state, dispatch } = useEditor()
    return <><button onClick={() => { dispatch({ type: 'set-canvas-offset', x: 0, y: -133 }); dispatch({ type: 'set-zoom', zoom: 72 }); dispatch({ type: 'select-tool', tool: 'brush' }) }}>适应后画笔</button><output data-testid="fit-state">{JSON.stringify({ offset: state.canvasOffset, zoom: state.zoom, strokes: state.brushStrokes.length })}</output></>
  }
  const view = render(<EditorProvider><CanvasViewport /><FitProbe /></EditorProvider>)
  fireEvent.click(screen.getByText('适应后画笔'))
  const board = view.container.querySelector('.artboard')!
  const transform = (board as HTMLElement).style.transform
  fireEvent.pointerDown(board, { pointerId: 1, button: 0, clientX: 20, clientY: 20 })
  fireEvent.pointerUp(board, { pointerId: 1, clientX: 40, clientY: 20 })
  expect(JSON.parse(screen.getByTestId('fit-state').textContent!).strokes).toBe(1)
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(JSON.parse(screen.getByTestId('fit-state').textContent!)).toEqual({ offset: { x: 0, y: -133 }, zoom: 72, strokes: 0 })
  expect((board as HTMLElement).style.transform).toBe(transform)
})
