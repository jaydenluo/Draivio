import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'
import { createBrushStroke } from './BrushEngine'

const red = `data:image/png;base64,${new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="red"/></svg>').render().asPng().toString('base64')}`
function Fixture() {
  const { state, dispatch } = useEditor()
  return <><button onClick={() => dispatch({ type: 'restore-project', document: {
    documentWidth: 100, documentHeight: 100, documentBackground: 'transparent',
    layers: [{ id: 'content', name: '混合内容', className: 'layer-image', source: red, visible: true, opacity: 100, blendMode: '正常' }],
    selectedLayerId: 'content', selectedLayerIds: ['content'], selectionVisible: false,
    canvasShapes: [{ id: 'shape', layerId: 'content', kind: 'rectangle', rect: { x: 30, y: 20, width: 10, height: 10 }, color: '#00ff00', opacity: 100, strokeWidth: 0 }],
    brushStrokes: [createBrushStroke('stroke', 'paint', 'content', { x: 30, y: 50 }, { size: 8, hardness: 100, opacity: 100, flow: 100, smoothing: 0, color: '#0000ff' })],
    canvasTexts: [{ id: 'text', layerId: 'content', x: 65, y: 65, text: 'A', fontSize: 8, fontFamily: 'sans-serif', fontWeight: '400', color: '#ffffff', align: 'left' }], layerMasks: {}, sceneOrder: ['shape', 'stroke', 'text'],
  } })}>加载移动样例</button><button onClick={() => dispatch({ type: 'restore-project', document: { layers: [{ ...state.layers[0], id: 'cover', name: '覆盖图片' }, ...state.layers] } })}>覆盖文字</button><output data-testid="live-state">{JSON.stringify(state)}</output></>
}
function setup(tool: string) {
  render(<EditorProvider><AppShell /><Fixture /></EditorProvider>)
  fireEvent.click(screen.getByText('加载移动样例'))
  if (tool === 'transform') {
    fireEvent.click(screen.getByLabelText('打开工具组菜单：裁剪/变换'))
    fireEvent.click(screen.getByRole('menuitem', { name: /^变换/ }))
  } else if (tool === 'move') {
    fireEvent.click(screen.getByLabelText('打开工具组菜单：选择/移动'))
    fireEvent.click(screen.getByRole('menuitem', { name: /^移动/ }))
  }
  const board = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) })
  return tool === 'transform' ? screen.getByLabelText('移动变换区域') : board
}
const current = () => JSON.parse(screen.getByTestId('live-state').textContent!)
function pixels() {
  const svg = document.querySelector('.canvas-art')!
  const image = new Resvg(new XMLSerializer().serializeToString(svg), { font: { loadSystemFonts: false } }).render()
  return (x: number, y: number) => Array.from(image.pixels.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4))
}

test.each(['transform'])('%s previews actual image, shape and brush pixels before committing', (tool) => {
  const target = setup(tool)
  const before = current()
  const original = pixels()
  expect(original(10, 10)).toEqual([255, 0, 0, 255])
  expect(original(35, 25)).toEqual([0, 255, 0, 255])
  expect(original(30, 50)).toEqual([0, 0, 255, 255])
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 10, clientY: 90, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 30, clientY: 90, buttons: 1 })
  const preview = pixels()
  expect(preview(10, 10)).toEqual([0, 0, 0, 0])
  expect(preview(30, 10)).toEqual([255, 0, 0, 255])
  expect(preview(55, 25)).toEqual([0, 255, 0, 255])
  expect(preview(50, 50)).toEqual([0, 0, 255, 255])
  expect(current().layers).toEqual(before.layers)
  expect(current().undoStack).toHaveLength(before.undoStack.length)
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 30, clientY: 90, button: 0 })
  if (tool === 'transform') fireEvent.click(screen.getByLabelText('确认变换'))
  expect(pixels()(55, 25)).toEqual(preview(55, 25))
  expect(current().undoStack).toHaveLength(before.undoStack.length + 1)
  fireEvent.click(screen.getByRole('region', { name: '主画布' }).querySelector('[aria-label="撤销"]')!)
  expect(pixels()(35, 25)).toEqual(original(35, 25))
})

test('Escape restores the layer pixels after a live movement without creating history', () => {
  const target = setup('move')
  const before = current()
  fireEvent.pointerDown(target, { pointerId: 2, clientX: 10, clientY: 90, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 2, clientX: 30, clientY: 90, buttons: 1 })
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.pointerUp(target, { pointerId: 2, clientX: 30, clientY: 90, button: 0 })
  expect(pixels()(10, 10)).toEqual([255, 0, 0, 255])
  expect(current().layers).toEqual(before.layers)
  expect(current().undoStack).toHaveLength(before.undoStack.length)
})


test.each(['select', 'move'])('%s moves only the clicked shape on a mixed layer, with live pixels and one undo', tool => {
  const target = setup(tool)
  const before = current()
  fireEvent.pointerDown(target, { pointerId: 3, clientX: 35, clientY: 25, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 3, clientX: 55, clientY: 25, buttons: 1, altKey: true })
  expect(pixels()(35, 25)).toEqual([255, 0, 0, 255])
  expect(pixels()(55, 25)).toEqual([0, 255, 0, 255])
  expect(pixels()(30, 50)).toEqual([0, 0, 255, 255])
  expect(current().canvasShapes).toEqual(before.canvasShapes)
  fireEvent.pointerUp(target, { pointerId: 3, clientX: 55, clientY: 25, button: 0, altKey: true })
  expect(current().layers).toEqual(before.layers)
  expect(current().canvasShapes[0].rect.x).toBeCloseTo(50)
  expect(current().canvasTexts).toEqual(before.canvasTexts)
  expect(current().undoStack).toHaveLength(before.undoStack.length + 1)
  fireEvent.click(screen.getByRole('region', { name: '主画布' }).querySelector('[aria-label="撤销"]')!)
  expect(current().canvasShapes).toEqual(before.canvasShapes)
})

test.each(['select', 'move'])('%s moves the clicked brush stroke without shifting its background or shape', tool => {
  const target = setup(tool)
  const before = current()
  fireEvent.pointerDown(target, { pointerId: 4, clientX: 30, clientY: 50, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 4, clientX: 50, clientY: 50, buttons: 1, altKey: true })
  expect(pixels()(30, 50)).toEqual([255, 0, 0, 255])
  expect(pixels()(50, 50)).toEqual([0, 0, 255, 255])
  expect(pixels()(35, 25)).toEqual([0, 255, 0, 255])
  fireEvent.pointerUp(target, { pointerId: 4, clientX: 50, clientY: 50, button: 0, altKey: true })
  expect(current().layers).toEqual(before.layers)
  expect(current().canvasShapes).toEqual(before.canvasShapes)
  expect(current().brushStrokes[0].points[0].x).toBe(50)
  expect(current().brushStrokes).toHaveLength(1)
})

test.each(['select', 'move'])('%s moves only the clicked text and does not create history on a stationary click', tool => {
  const target = setup(tool)
  const before = current()
  fireEvent.pointerDown(target, { pointerId: 5, clientX: 67, clientY: 69, button: 0 })
  fireEvent.pointerUp(target, { pointerId: 5, clientX: 67, clientY: 69, button: 0 })
  expect(current().undoStack).toHaveLength(before.undoStack.length)
  fireEvent.pointerDown(target, { pointerId: 6, clientX: 67, clientY: 69, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 6, clientX: 82, clientY: 79, buttons: 1, altKey: true })
  expect(document.querySelector('.canvas-art [data-text="text"]')?.getAttribute('x')).toBe('80')
  fireEvent.pointerUp(target, { pointerId: 6, clientX: 82, clientY: 79, button: 0, altKey: true })
  expect(current().canvasTexts[0]).toMatchObject({ x: 80, y: 75 })
  expect(current().layers).toEqual(before.layers)
  expect(current().canvasShapes).toEqual(before.canvasShapes)
})

test.each(['select', 'move'])('%s Shift-selects two objects and moves both without moving the image', tool => {
  const board = setup(tool)
  const before = current()
  fireEvent.pointerDown(board, { pointerId: 10, clientX: 35, clientY: 25, button: 0 })
  fireEvent.pointerUp(board, { pointerId: 10, clientX: 35, clientY: 25, button: 0 })
  fireEvent.pointerDown(board, { pointerId: 11, clientX: 30, clientY: 50, button: 0, shiftKey: true })
  fireEvent.pointerUp(board, { pointerId: 11, clientX: 30, clientY: 50, button: 0, shiftKey: true })
  fireEvent.pointerDown(board, { pointerId: 12, clientX: 35, clientY: 25, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 12, clientX: 45, clientY: 35, buttons: 1, altKey: true })
  expect(pixels()(45, 35)).toEqual([0, 255, 0, 255])
  expect(pixels()(40, 60)).toEqual([0, 0, 255, 255])
  expect(pixels()(10, 10)).toEqual([255, 0, 0, 255])
  fireEvent.pointerUp(board, { pointerId: 12, clientX: 45, clientY: 35, button: 0, altKey: true })
  expect(current().layers).toEqual(before.layers)
  expect(current().undoStack).toHaveLength(before.undoStack.length + 1)
  fireEvent.click(screen.getByRole('region', { name: '主画布' }).querySelector('[aria-label="撤销"]')!)
  expect(current().canvasShapes).toEqual(before.canvasShapes)
  expect(current().brushStrokes).toEqual(before.brushStrokes)
})

test.each(['select', 'move'])('%s does not drag the previously selected content when starting on empty space', tool => {
  const board = setup(tool)
  fireEvent.pointerDown(board, { pointerId: 13, clientX: 35, clientY: 25, button: 0 })
  fireEvent.pointerUp(board, { pointerId: 13, clientX: 35, clientY: 25, button: 0 })
  const before = current()
  fireEvent.pointerDown(board, { pointerId: 14, clientX: 110, clientY: 25, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 14, clientX: 130, clientY: 35, buttons: 1 })
  fireEvent.pointerUp(board, { pointerId: 14, clientX: 130, clientY: 35, button: 0 })
  expect(current().layers).toEqual(before.layers)
  expect(current().canvasShapes).toEqual(before.canvasShapes)
  expect(current().undoStack).toHaveLength(before.undoStack.length)
  expect(screen.queryByLabelText('已选对象边框')).toBeNull()
})

test('Escape restores the independently moved shape and records no history', () => {
  const board = setup('move')
  const before = current()
  fireEvent.pointerDown(board, { pointerId: 15, clientX: 35, clientY: 25, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 15, clientX: 55, clientY: 25, buttons: 1, altKey: true })
  expect(pixels()(55, 25)).toEqual([0, 255, 0, 255])
  fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.pointerUp(board, { pointerId: 15, clientX: 55, clientY: 25, button: 0 })
  expect(pixels()(35, 25)).toEqual([0, 255, 0, 255])
  expect(current().canvasShapes).toEqual(before.canvasShapes)
  expect(current().undoStack).toHaveLength(before.undoStack.length)
})


test('select does not edit text hidden behind a front image, even when its invisible DOM overlay receives the click', () => {
  setup('select')
  fireEvent.click(screen.getByText('覆盖文字'))
  const text = document.querySelector('.canvas-text-object')!
  fireEvent.pointerDown(text, { pointerId: 16, clientX: 67, clientY: 69, button: 0 })
  fireEvent.pointerUp(text, { pointerId: 16, clientX: 67, clientY: 69, button: 0 })
  fireEvent.click(text)
  expect(current().selectedLayerId).toBe('cover')
  expect(screen.queryByLabelText('编辑画布文字')).toBeNull()
})

test.each(['select', 'move'])('%s moves only the clicked background image, keeping objects on the same layer fixed', tool => {
  const board = setup(tool)
  const before = current()
  fireEvent.pointerDown(board, { pointerId: 17, clientX: 10, clientY: 90, button: 0 })
  fireEvent.pointerMove(board, { pointerId: 17, clientX: 30, clientY: 90, buttons: 1, altKey: true })
  expect(pixels()(10, 10)).toEqual([0, 0, 0, 0])
  expect(pixels()(35, 25)).toEqual([0, 255, 0, 255])
  expect(pixels()(30, 50)).toEqual([0, 0, 255, 255])
  fireEvent.pointerUp(board, { pointerId: 17, clientX: 30, clientY: 90, button: 0, altKey: true })
  expect(current().canvasTexts).toEqual(before.canvasTexts)
  expect(current().canvasShapes).toEqual(before.canvasShapes)
  expect(current().brushStrokes).toEqual(before.brushStrokes)
  expect(current().undoStack).toHaveLength(before.undoStack.length + 1)
  fireEvent.click(screen.getByRole('region', { name: '主画布' }).querySelector('[aria-label="撤销"]')!)
  expect(current().layers).toEqual(before.layers)
})
