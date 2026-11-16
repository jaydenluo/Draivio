import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorProvider, editorReducer, initialEditorState, useEditor } from '../state/editor'
import { AppShell } from '../app/AppShell'
import { createSelection, selectionContains } from './selectionGeometry'
import { SelectionOverlay } from './SelectionOverlay'

function Probe() { const { state } = useEditor(); return <output data-testid="selection-state">{JSON.stringify({ selection: state.selection, history: state.undoStack.length, visible: state.selectionVisible })}</output> }
function setup() {
  const view = render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  vi.spyOn(view.container.querySelector('.artboard')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  return screen.getByLabelText('画布交互层')
}
function tool(name: RegExp) { fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：选区' })); fireEvent.click(screen.getByRole('menuitem', { name })) }
function state() { return JSON.parse(screen.getByTestId('selection-state').textContent!) }
function drag(target: Element, start = [100, 100], end = [250, 300], modifiers = {}) {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: start[0], clientY: start[1], buttons: 1, ...modifiers })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: end[0], clientY: end[1], buttons: 1, ...modifiers })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: end[0], clientY: end[1], ...modifiers })
}

test('the independent overlay exposes eight handles, four edges and geometry mask', () => {
  render(<SelectionOverlay selection={createSelection('ellipse', { x: 20, y: 20, width: 40, height: 40 })} clientPoint={(x, y) => ({ x, y })} onPreview={() => {}} onCommit={() => {}} onCancel={() => {}} />)
  expect(screen.getAllByRole('button', { name: /^调整选区(nw|n|ne|e|se|s|sw|w)$/ })).toHaveLength(8)
  expect(screen.getAllByRole('button', { name: /^调整选区边/ })).toHaveLength(4)
  expect(document.querySelector('mask ellipse')).toBeInTheDocument()
})

test('draws an ellipse with physical Shift ratio and commits a whole gesture once', () => {
  const target = setup(); tool(/椭圆选框/)
  const before = state().history
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 100, buttons: 1 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 250, clientY: 300, buttons: 1, shiftKey: true, altKey: true })
  expect(state().history).toBe(before)
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 250, clientY: 300, shiftKey: true, altKey: true })
  expect(state().history).toBe(before + 1)
  expect(state().selection.kind).toBe('ellipse')
  const rect = state().selection.rect
  expect(rect.width / rect.height).toBeCloseTo(1.25)
  const selected = state().selection
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(state().selection).not.toEqual(selected)
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true })
  expect(state().selection).toEqual(selected)
})

test('Escape cancels a draft and restores the committed geometry without history', () => {
  const target = setup(); tool(/矩形选框/)
  const before = state()
  fireEvent.pointerDown(target, { pointerId: 2, clientX: 100, clientY: 100, buttons: 1 })
  fireEvent.pointerMove(target, { pointerId: 2, clientX: 250, clientY: 300, buttons: 1 })
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.pointerUp(target, { pointerId: 2, clientX: 250, clientY: 300 })
  expect(state()).toEqual(before)
})

test('Escape cancels a centered selection while Alt remains held', () => {
  const target = setup(); tool(/矩形选框/)
  const before = state()
  fireEvent.pointerDown(target, { pointerId: 2, clientX: 250, clientY: 312.5, buttons: 1, altKey: true })
  fireEvent.pointerMove(target, { pointerId: 2, clientX: 300, clientY: 375, buttons: 1, altKey: true })
  fireEvent.keyDown(window, { key: 'Escape', altKey: true })
  fireEvent.pointerUp(target, { pointerId: 2, clientX: 300, clientY: 375, altKey: true })
  expect(state()).toEqual(before)
})

test('selection tool in new mode can move the interior of a combined selection', () => {
  const target = setup(); tool(/矩形选框/)
  drag(target, [50, 62.5], [200, 250])
  fireEvent.click(screen.getByRole('button', { name: '选区模式：添加' }))
  drag(target, [250, 312.5], [400, 500])
  fireEvent.click(screen.getByRole('button', { name: '选区模式：新建' }))
  const before = state()
  drag(screen.getByLabelText('移动选区'), [100, 125], [125, 150])
  expect(state().selection.rect.x).toBeCloseTo(before.selection.rect.x + 5)
  expect(state().selection.rect.y).toBeCloseTo(before.selection.rect.y + 4)
  expect(state().history).toBe(before.history + 1)
})

test('moves the interior, adjusts edges, nudges with arrows and ignores input keys', () => {
  setup(); tool(/矩形选框/)
  const before = state().selection.rect
  drag(screen.getByLabelText('移动选区'), [150, 200], [175, 225])
  expect(state().selection.rect.x).toBeCloseTo(before.x + 5)
  const moved = state().selection.rect
  drag(screen.getByRole('button', { name: '调整选区边e' }), [300, 200], [325, 200])
  expect(state().selection.rect.width).toBeCloseTo(moved.width + 5)
  const width = state().selection.rect.width
  fireEvent.keyDown(screen.getByLabelText('局部选区'), { key: 'ArrowRight' })
  expect(state().selection.rect.width).toBe(width)
  expect(state().selection.rect.x).toBeCloseTo(moved.x + .2)
  const current = state().selection
  fireEvent.keyDown(screen.getByRole('spinbutton', { name: '羽化' }), { key: 'ArrowRight' })
  expect(state().selection).toEqual(current)
})

test('selection actions and option fields update actual geometry and state', () => {
  const target = setup(); tool(/矩形选框/); drag(target)
  fireEvent.change(screen.getByRole('spinbutton', { name: '羽化' }), { target: { value: '12' } })
  expect(state().selection.feather).toBe(12)
  expect(document.querySelector('feGaussianBlur')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '反选选区' }))
  expect(selectionContains(state().selection.path, { x: 90, y: 90 })).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '扩展选区' }))
  expect(state().selection.path.type).toBe('raster')
  fireEvent.click(screen.getByRole('button', { name: '收缩选区' }))
  expect(state().selection.path.type).toBe('raster')
})

test('combines ellipse and rectangle geometry through every mode and keeps controls available', () => {
  const target = setup(); tool(/矩形选框/); drag(target, [50, 62.5], [200, 250])
  tool(/椭圆选框/)
  fireEvent.click(screen.getByRole('button', { name: '选区模式：添加' }))
  drag(target, [250, 312.5], [400, 500])
  expect(selectionContains(state().selection.path, { x: 20, y: 20 })).toBe(true)
  expect(selectionContains(state().selection.path, { x: 45, y: 45 })).toBe(false)
  expect(selectionContains(state().selection.path, { x: 65, y: 65 })).toBe(true)
  expect(screen.getAllByRole('button', { name: /^调整选区(nw|n|ne|e|se|s|sw|w)$/ })).toHaveLength(8)
  fireEvent.click(screen.getByRole('button', { name: '选区模式：减去' }))
  drag(target, [75, 93.75], [175, 218.75])
  expect(selectionContains(state().selection.path, { x: 25, y: 25 })).toBe(false)
  expect(selectionContains(state().selection.path, { x: 65, y: 65 })).toBe(true)
  tool(/矩形选框/)
  fireEvent.click(screen.getByRole('button', { name: '选区模式：相交' }))
  drag(target, [225, 281.25], [425, 531.25])
  expect(selectionContains(state().selection.path, { x: 20, y: 20 })).toBe(false)
  expect(selectionContains(state().selection.path, { x: 65, y: 65 })).toBe(true)
})

test('honors fixed physical ratios and Alt while drawing, and cancels handle previews', () => {
  const target = setup(); tool(/矩形选框/)
  fireEvent.click(screen.getByRole('checkbox', { name: '固定比例' }))
  fireEvent.change(screen.getByRole('combobox', { name: '选区比例' }), { target: { value: '4:3' } })
  drag(target, [250, 312.5], [300, 350], { altKey: true })
  const before = state()
  expect(before.selection.fixedRatio).toBeCloseTo(4 / 3)
  expect(before.selection.rect.width * .8 / before.selection.rect.height).toBeCloseTo(4 / 3)
  expect(before.selection.rect.x + before.selection.rect.width / 2).toBeCloseTo(50)
  const handle = screen.getByRole('button', { name: '调整选区nw' })
  fireEvent.pointerDown(handle, { pointerId: 3, clientX: 200, clientY: 275, buttons: 1 })
  fireEvent.pointerMove(handle, { pointerId: 3, clientX: 100, clientY: 175, buttons: 1 })
  expect(screen.getByLabelText('局部选区')).not.toHaveStyle({ left: `${before.selection.rect.x}%` })
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.pointerUp(handle, { pointerId: 3, clientX: 100, clientY: 175 })
  expect(state()).toEqual(before)
  expect(screen.getByLabelText('局部选区')).toHaveStyle({ left: `${before.selection.rect.x}%` })
})

test('commits an empty intersection instead of retaining the previous selection', () => {
  const target = setup(); tool(/矩形选框/)
  drag(target, [50, 62.5], [150, 187.5])
  const before = state()
  fireEvent.click(screen.getByRole('button', { name: '选区模式：相交' }))
  drag(target, [350, 437.5], [450, 562.5])
  expect(selectionContains(state().selection.path, { x: 20, y: 20 })).toBe(false)
  expect(state().selection.rect.width).toBe(0)
  expect(state().history).toBe(before.history + 1)
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true })
  expect(selectionContains(state().selection.path, { x: 20, y: 20 })).toBe(true)
})

test('the reducer retains selection data and legacy rect through undo/redo', () => {
  const selection = createSelection('ellipse', { x: 1, y: 2, width: 30, height: 40 }, { mode: 'add', feather: 12, fixedRatio: 1 })
  const next = editorReducer(initialEditorState, { type: 'commit-selection', selection })
  expect(next.selection).toEqual(selection)
  expect(next.selectionRect).toEqual(selection.rect)
  const undone = editorReducer(next, { type: 'undo' })
  expect(undone.selection).toEqual(initialEditorState.selection)
  expect(undone.selectionRect).toEqual(initialEditorState.selectionRect)
  expect(editorReducer(undone, { type: 'redo' }).selection).toEqual(selection)
})
