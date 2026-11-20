import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'
import * as rasterTools from './rasterTools'

afterEach(() => vi.restoreAllMocks())

test('routes WebKit trackpad pinch to the canvas while preventing page zoom', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  const canvas = screen.getByRole('region', { name: '主画布' })
  const board = canvas.querySelector<HTMLElement>('.artboard')!
  const pinch = (target: Element, type: string, scale: number) => {
    const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), { scale })
    fireEvent(target, event)
    expect(event.defaultPrevented).toBe(true)
  }

  pinch(board, 'gesturestart', 1)
  pinch(board, 'gesturechange', 1.5)
  expect(board.style.transform).toContain('scale(1.5)')
  pinch(board, 'gesturechange', 0.8)
  expect(board.style.transform).toContain('scale(0.8)')
  pinch(board, 'gestureend', 0.8)
  pinch(board, 'gesturechange', 2)
  expect(board.style.transform).toContain('scale(0.8)')

  pinch(board, 'gesturestart', 1)
  pinch(board, 'gesturechange', 1.25)
  expect(board.style.transform).toContain('scale(1)')
  pinch(board, 'gestureend', 1.25)

  const header = screen.getByRole('banner')
  pinch(header, 'gesturestart', 1)
  pinch(board, 'gesturechange', 2)
  pinch(header, 'gestureend', 2)
  const prompt = screen.getByRole('textbox', { name: 'AI 操作' })
  pinch(prompt, 'gesturestart', 1)
  pinch(prompt, 'gesturechange', 2)
  pinch(prompt, 'gestureend', 2)
  expect(board.style.transform).toContain('scale(1)')
})

test('selecting a drawing or selection tool does not invent a selection', () => {
  render(<EditorProvider><AppShell /></EditorProvider>)
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：画笔' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^画笔 \(/i }))
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：选区' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '选区' }))
  expect(screen.queryByLabelText('局部选区')).toBeNull()
})

test('cancels an in-flight healing gesture at non-default zoom and rotation without writing a repair layer', async () => {
  let activeSignal: AbortSignal | undefined
  vi.spyOn(rasterTools, 'rasterizeSvgPixels').mockImplementation((_svg, signal) => new Promise((_resolve, reject) => {
    activeSignal = signal
    signal?.addEventListener('abort', () => reject(new Error('操作已取消')), { once: true })
  }))
  render(<EditorProvider><AppShell /><FixtureProbe /></EditorProvider>)
  const before = JSON.parse(screen.getByTestId('retouch-state').textContent!)
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：导航' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /旋转画布/ }))
  fireEvent.click(screen.getByRole('button', { name: '顺时针旋转 15°' }))
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：擦除/修复' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /^修复画笔 \(/i }))
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  const artboard = document.querySelector('.artboard') as HTMLElement
  fireEvent.pointerDown(artboard, { pointerId: 1, clientX: 120, clientY: 140, button: 0 })
  fireEvent.pointerMove(artboard, { pointerId: 1, clientX: 160, clientY: 180, buttons: 1 })
  fireEvent.pointerUp(artboard, { pointerId: 1, clientX: 160, clientY: 180, button: 0 })
  const area = screen.getByRole('region', { name: '主画布' })
  await waitFor(() => expect(area).toHaveAttribute('aria-busy', 'true'))
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(area).toHaveAttribute('aria-busy', 'false'))
  expect(activeSignal?.aborted).toBe(true)
  const after = JSON.parse(screen.getByTestId('retouch-state').textContent!)
  expect(after.layers).toEqual(before.layers)
  expect(after.undoStack).toEqual(before.undoStack)
  expect(after.history).toEqual(before.history)
  expect(screen.queryByRole('dialog', { name: '确认修复结果' })).toBeNull()
  expect(screen.queryByText('修复完成，已写入当前图层，可撤销')).toBeNull()
})

test('clones document pixels through pointer input with transformed layer, 200% zoom and 90 degree viewport rotation', async () => {
  const { Resvg } = await import('@resvg/resvg-js')
  let input: rasterTools.PixelImage | undefined
  let output: rasterTools.PixelImage | undefined
  vi.spyOn(rasterTools, 'rasterizeSvgPixels').mockImplementation(async svg => {
    const rendered = new Resvg(rasterTools.serializeSvg(svg).source, { font: { loadSystemFonts: false } }).render()
    input = { width: rendered.width, height: rendered.height, data: new Uint8ClampedArray(rendered.pixels) }
    return input
  })
  vi.spyOn(rasterTools, 'imageToPng').mockImplementation(image => { output = image; return 'data:image/png;base64,repair' })
  render(<EditorProvider><AppShell /><FixtureProbe /></EditorProvider>)
  fireEvent.click(screen.getByText('load retouch fixture'))
  const artboard = document.querySelector('.artboard') as HTMLElement
  Object.defineProperties(artboard, { offsetWidth: { value: 120 }, offsetHeight: { value: 80 } })
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 20, top: -20, width: 160, height: 240, right: 180, bottom: 220, x: 20, y: -20, toJSON: () => ({}) })
  // Rotating a 240 x 160 viewport by 90 degrees maps document (25,50) to (100,40).
  fireEvent.pointerDown(artboard, { pointerId: 1, clientX: 100, clientY: 40, altKey: true, button: 0 })
  fireEvent.pointerDown(artboard, { pointerId: 2, clientX: 100, clientY: 160, button: 0 })
  fireEvent.pointerUp(artboard, { pointerId: 2, clientX: 100, clientY: 160, button: 0 })
  await screen.findByRole('dialog', { name: '确认修复结果' })
  expect(input?.width).toBe(120); expect(input?.height).toBe(80)
  expect(output!.data[3]).toBe(0)
  expect(Array.from(output!.data.slice((40 * 120 + 30) * 4, (40 * 120 + 30) * 4 + 4))).toEqual([0, 0, 0, 0])
  const sourceIndex = (40 * 120 + 30) * 4, targetIndex = (40 * 120 + 89) * 4
  expect(Array.from(input!.data.slice(sourceIndex, sourceIndex + 4))).toEqual([255, 0, 0, 255])
  expect(Array.from(input!.data.slice(targetIndex, targetIndex + 4))).toEqual([0, 0, 255, 255])
  expect(Array.from(output!.data.slice(targetIndex, targetIndex + 4))).toEqual([255, 0, 0, 255])
  const before = JSON.parse(screen.getByTestId('retouch-state').textContent!)
  fireEvent.click(screen.getByRole('button', { name: '确认' }))
  const after = JSON.parse(screen.getByTestId('retouch-state').textContent!)
  expect(after.layers).toHaveLength(before.layers.length + 1)
  expect(after.undoStack).toHaveLength(before.undoStack.length + 1)
  expect(after.layers.find((layer: { id: string }) => layer.id === 'retouch')).toEqual(before.layers[0])
}, 30000)

function FixtureProbe() {
  const { state, dispatch } = useEditor()
  return <><button onClick={() => {
    dispatch({ type: 'restore-project', document: { documentWidth: 120, documentHeight: 80, layers: [{ id: 'retouch', name: 'Fixture', className: 'fixture', visible: true, opacity: 100, blendMode: '正常', transform: { kind: 'transform', rect: { x: 10, y: 10, width: 80, height: 80 }, rotation: 0, flipX: false, flipY: false } }], selectedLayerId: 'retouch', selectedLayerIds: ['retouch'], selectionVisible: false, brushStrokes: [], canvasTexts: [], canvasShapes: [{ id: 'red', layerId: 'retouch', kind: 'rectangle', rect: { x: 0, y: 0, width: 50, height: 100 }, color: '#ff0000', opacity: 100, strokeWidth: 0 }, { id: 'blue', layerId: 'retouch', kind: 'rectangle', rect: { x: 50, y: 0, width: 50, height: 100 }, color: '#0000ff', opacity: 100, strokeWidth: 0 }], layerMasks: {}, sceneOrder: [] } })
    dispatch({ type: 'set-zoom', zoom: 200 }); dispatch({ type: 'set-canvas-rotation', rotation: 90 })
    dispatch({ type: 'select-tool', tool: 'clone-stamp' }); dispatch({ type: 'set-tool-options', options: { size: 4, opacity: 100, hardness: 100 } })
  }}>load retouch fixture</button><output data-testid="retouch-state">{JSON.stringify(state)}</output></>
}


test('clone alignment and patch sampling controls update the options actually consumed by repair', () => {
  render(<EditorProvider><AppShell /><FixtureProbe /></EditorProvider>)
  fireEvent.click(screen.getByText('load retouch fixture'))
  const alignment = screen.getByRole('checkbox', { name: '对齐仿制源' })
  expect(alignment).toBeChecked()
  fireEvent.click(alignment)
  expect(JSON.parse(screen.getByTestId('retouch-state').textContent!).toolOptions.cloneAligned).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：擦除/修复' }))
  fireEvent.click(screen.getByRole('menuitem', { name: '修补工具' }))
  fireEvent.change(screen.getByRole('combobox', { name: '采样范围' }), { target: { value: 'below' } })
  expect(JSON.parse(screen.getByTestId('retouch-state').textContent!).toolOptions.sampleScope).toBe('below')
})
