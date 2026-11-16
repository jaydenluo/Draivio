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
    canvasTexts: [], layerMasks: {}, sceneOrder: ['shape', 'stroke'],
  } })}>加载移动样例</button><output data-testid="live-state">{JSON.stringify(state)}</output></>
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

test.each(['select', 'move', 'transform'])('%s previews actual image, shape and brush pixels before committing', (tool) => {
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
  fireEvent.click(screen.getByLabelText('撤销'))
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
