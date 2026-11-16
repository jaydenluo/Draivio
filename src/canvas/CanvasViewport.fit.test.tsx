import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { useToolShortcuts } from '../tools/useToolShortcuts'
import { CanvasViewport } from './CanvasViewport'

let canvasHeight = 492
const resizeCallbacks = new Set<() => void>()

function Harness() {
  useToolShortcuts()
  const { state, dispatch } = useEditor()
  return <><button onClick={() => dispatch({ type: 'select-tool', tool: 'pan' })}>平移工具</button><output data-testid="view-state">{JSON.stringify({ zoom: state.zoom, offset: state.canvasOffset, undo: state.undoStack.length })}</output><CanvasViewport /></>
}
const view = () => JSON.parse(screen.getByTestId('view-state').textContent!)
const flush = () => { act(() => { vi.runOnlyPendingTimers() }); act(() => { vi.runOnlyPendingTimers() }) }

beforeEach(() => {
  canvasHeight = 492
  resizeCallbacks.clear()
  vi.useFakeTimers()
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(0), 0))
  vi.stubGlobal('cancelAnimationFrame', (id: number) => clearTimeout(id))
  vi.stubGlobal('ResizeObserver', class {
    constructor(private callback: () => void) { resizeCallbacks.add(callback) }
    observe() {}
    disconnect() { resizeCallbacks.delete(this.callback) }
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('canvas-area') ? 620 : 0 })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.classList.contains('canvas-area') ? canvasHeight : 0 })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const height = this.classList.contains('ai-composer') ? this.classList.contains('is-minimized') ? 40 : 160 : 0
    return { x: 0, y: 0, width: 620, height, left: 0, top: 0, right: 620, bottom: height, toJSON() {} }
  })
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

test('fits on startup, centers above the floating composer and leaves undo history untouched', () => {
  render(<EditorProvider><Harness /></EditorProvider>)
  flush()
  expect(view().zoom).toBeCloseTo(44.8)
  expect(view()).toMatchObject({ offset: { x: 0, y: -90 }, undo: 0 })
})

test('100 percent shortcut stays at actual pixels instead of immediately fitting again', () => {
  render(<EditorProvider><Harness /></EditorProvider>)
  flush()
  fireEvent.keyDown(window, { key: '1', ctrlKey: true })
  flush()
  expect(view().zoom).toBe(100)
})

test('follows canvas container resizing while in fit mode', () => {
  render(<EditorProvider><Harness /></EditorProvider>)
  flush()
  canvasHeight = 700
  act(() => resizeCallbacks.forEach((callback) => callback()))
  flush()
  expect(view().zoom).toBeCloseTo(78.08)
})

test('keeps manual zoom during container resizing and restores fitting with Ctrl+0', () => {
  render(<EditorProvider><Harness /></EditorProvider>)
  flush()
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  canvasHeight = 700
  act(() => resizeCallbacks.forEach((callback) => callback()))
  flush()
  expect(view().zoom).toBeCloseTo(54.8)
  fireEvent.keyDown(window, { key: '0', ctrlKey: true })
  flush()
  expect(view().zoom).toBeCloseTo(78.08)
})

test('adapts after minimizing the composer but keeps a manually panned view', () => {
  const { container } = render(<EditorProvider><Harness /></EditorProvider>)
  flush()
  fireEvent.click(screen.getByRole('button', { name: '最小化 AI 对话框' }))
  flush()
  expect(view()).toMatchObject({ zoom: 64, offset: { x: 0, y: -30 } })
  fireEvent.click(screen.getByText('平移工具'))
  const board = container.querySelector('.artboard')!
  fireEvent.pointerDown(board, { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 1, clientX: 150, clientY: 130 })
  fireEvent.pointerUp(board, { pointerId: 1, clientX: 150, clientY: 130 })
  const before = view()
  canvasHeight = 700
  act(() => resizeCallbacks.forEach((callback) => callback()))
  flush()
  expect(view()).toEqual(before)
})
