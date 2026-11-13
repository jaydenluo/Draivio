import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'
function Probe() { const { state } = useEditor(); return <output data-testid="doc">{JSON.stringify(state)}</output> }
function setup() {
  const view = render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  vi.spyOn(view.container.querySelector('.artboard')!, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  return screen.getByLabelText('画布交互层')
}
const doc = () => JSON.parse(screen.getByTestId('doc').textContent!)
function tool(group: string, name: RegExp) { fireEvent.click(screen.getByRole('button', { name: `打开工具组菜单：${group}` })); fireEvent.click(screen.getByRole('menuitem', { name })) }
function drag(target: Element) {
  fireEvent.pointerDown(target, { pointerId: 1, clientX: 50, clientY: 60, buttons: 1 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 150, clientY: 180, buttons: 1 })
  fireEvent.pointerMove(target, { pointerId: 1, clientX: 250, clientY: 300, buttons: 1 })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 250, clientY: 300 })
}
test('continuous paint is a single undo operation and eraser masks the layer', () => {
  const target = setup(); tool('画笔', /^画笔 /); const before = doc().undoStack.length
  drag(target)
  expect(doc().brushStrokes).toHaveLength(1)
  expect(doc().brushStrokes[0].points.length).toBeGreaterThan(2)
  expect(doc().undoStack).toHaveLength(before + 1)
  tool('擦除/修复', /^橡皮 /); drag(target)
  expect(document.querySelector('mask[data-eraser]')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(doc().brushStrokes).toHaveLength(1)
})
test('mask brush, invert and apply affect the selected layer and can be undone', () => {
  const target = setup(); tool('蒙版', /^蒙版 /); drag(target)
  expect(doc().layerMasks.art.strokes).toHaveLength(1)
  expect(screen.getByLabelText('蒙版红色预览')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '反转蒙版' }))
  expect(doc().layerMasks.art.inverted).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: '应用蒙版' }))
  expect(document.querySelector('[data-layer-mask="art"][mask]')).toBeInTheDocument()
})
test('shapes are real canvas objects; text can be edited and undo restores its content', () => {
  const target = setup(); tool('文字/形状', /圆形/); drag(target)
  expect(doc().canvasShapes[0].kind).toBe('ellipse')
  expect(document.querySelector('.canvas-art [data-shape] > ellipse')).toBeInTheDocument()
  tool('文字/形状', /文字/)
  fireEvent.pointerDown(target, { pointerId: 2, clientX: 100, clientY: 100, buttons: 1 })
  fireEvent.pointerUp(target, { pointerId: 2, clientX: 100, clientY: 100 })
  fireEvent.doubleClick(document.querySelector('.canvas-text-object')!)
  fireEvent.change(screen.getByLabelText('编辑画布文字'), { target: { value: '春日' } })
  fireEvent.keyDown(screen.getByLabelText('编辑画布文字'), { key: 'Enter' })
  expect(doc().canvasTexts[0].text).toBe('春日')
  fireEvent.click(screen.getByRole('button', { name: '撤销' }))
  expect(doc().canvasTexts[0].text).toBe('双击编辑文字')
})
test('crop and layer transforms preview separately; Escape cancels and Enter commits', () => {
  const target = setup(); tool('裁剪/变换', /^裁剪 /); drag(target)
  expect(doc().cropRect).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(doc().cropRect).toBeNull()
  drag(target); fireEvent.keyDown(window, { key: 'Enter' })
  expect(doc().cropRect.width).toBeCloseTo(40)
  tool('裁剪/变换', /^变换/)
  fireEvent.change(screen.getByLabelText('变换旋转角度'), { target: { value: '35' } })
  expect(doc().layers[0].transform).toBeUndefined()
  fireEvent.keyDown(window, { key: 'Enter' })
  expect(doc().layers[0].transform.rotation).toBe(35)
})
