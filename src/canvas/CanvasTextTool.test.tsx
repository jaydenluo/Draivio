import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'

function Probe() {
  const { state } = useEditor()
  return <output data-testid="text-state">{JSON.stringify({ layers: state.layers, texts: state.canvasTexts, selected: state.selectedLayerId, activeTool: state.activeTool, notice: state.notice, undoCount: state.undoStack.length, sceneOrder: state.sceneOrder })}</output>
}

function setup() {
  render(<EditorProvider><AppShell /><Probe /></EditorProvider>)
  const artboard = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.click(screen.getByRole('button', { name: '打开工具组菜单：文字/形状' }))
  fireEvent.click(screen.getByRole('menuitem', { name: /文字/ }))
  return screen.getByLabelText('画布交互层')
}

function state() {
  return JSON.parse(screen.getByTestId('text-state').textContent ?? '{}') as { layers: Array<{ id: string; kind?: string; textObjectId?: string; transform?: { rect: { x: number; y: number; width: number; height: number } } }>; texts: Array<{ id: string; layerId: string; x: number; y: number; layout?: string; width?: number; text: string }>; selected: string; undoCount: number; sceneOrder: string[] }
}

function ExistingTextFixture() {
  const { dispatch } = useEditor()
  return <button onClick={() => {
    dispatch({ type: 'restore-project', document: { documentWidth: 500, documentHeight: 625, layers: [{ id: 'existing-text', name: '已有文字', className: 'layer-text', kind: 'text', textObjectId: 'existing-text', visible: true, opacity: 100, blendMode: '正常' }], selectedLayerId: 'existing-text', selectedLayerIds: ['existing-text'], canvasTexts: [{ id: 'existing-text', layerId: 'existing-text', x: 20, y: 20, text: '已有文字', fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#000000', align: 'left' }], canvasShapes: [], brushStrokes: [], layerMasks: {}, sceneOrder: ['existing-text'] } })
    dispatch({ type: 'select-tool', tool: 'text' })
  }}>load existing text</button>
}

function SelectionFixture() {
  const { dispatch } = useEditor()
  return <button onClick={() => {
    dispatch({ type: 'restore-project', document: {
      documentWidth: 500,
      documentHeight: 625,
      layers: [
        { id: 'art', name: '文字层', className: 'layer-text', kind: 'text', visible: true, opacity: 100, blendMode: '正常' },
        { id: 'background', name: '背景', className: 'layer-image', kind: 'image', source: 'fixture', visible: true, opacity: 100, blendMode: '正常' },
      ],
      selectedLayerId: 'background',
      selectedLayerIds: ['background'],
      canvasTexts: [
        { id: 'text-a', layerId: 'art', x: 12, y: 10, text: '文字 A', fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#000000', align: 'left' },
        { id: 'text-b', layerId: 'art', x: 12, y: 42, text: '文字 B', fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#000000', align: 'left' },
      ],
      canvasShapes: [], brushStrokes: [], layerMasks: {}, sceneOrder: ['background', 'art'],
    } })
    dispatch({ type: 'select-tool', tool: 'select' })
  }}>load selection fixture</button>
}

test('clicking the text tool starts a blank draft and only creates point text after input', () => {
  const target = setup()
  const before = state()

  fireEvent.pointerDown(target, { pointerId: 1, clientX: 100, clientY: 120, button: 0 })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: 100, clientY: 120, button: 0 })

  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  expect(input).toHaveValue('')
  expect(input).toHaveFocus()
  expect(state().texts).toEqual(before.texts)
  expect(state().undoCount).toBe(before.undoCount)
  expect(document.querySelector('.selection-overlay')).toBeNull()
  expect(document.querySelector('.canvas-text-object')).toHaveClass('canvas-text-layout-point')
  fireEvent.change(input, { target: { value: '新标题' } })
  fireEvent.keyDown(input, { key: 'Enter' })
  const current = state()
  expect(current.texts[0].layout).toBe('point')
  expect(current.texts[0].text).toBe('新标题')
  expect(current.layers).toHaveLength(before.layers.length)
  expect(current.texts[0].layerId).toBe(current.selected)
  expect(current.undoCount).toBe(before.undoCount + 1)
  fireEvent.click(screen.getByRole('region', { name: '主画布' }).querySelector('[aria-label="撤销"]')!)
  expect(state().texts).toEqual(before.texts)
  fireEvent.click(screen.getByRole('region', { name: '主画布' }).querySelector('[aria-label="重做"]')!)
  expect(state().texts[0].text).toBe('新标题')
  fireEvent.click(screen.getByLabelText('工具组：选择/移动'))
  const existing = document.querySelector('.canvas-text-object')!
  fireEvent.pointerDown(existing, { pointerId: 30, clientX: 110, clientY: 125, button: 0 })
  fireEvent.pointerUp(existing, { pointerId: 30, clientX: 110, clientY: 125, button: 0 })
  fireEvent.click(existing)
  expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('新标题')
})

test('dragging the text tool creates a paragraph text box instead of a point text layer', () => {
  const target = setup()

  fireEvent.pointerDown(target, { pointerId: 2, clientX: 80, clientY: 100, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 2, clientX: 300, clientY: 260, buttons: 1 })
  fireEvent.pointerUp(target, { pointerId: 2, clientX: 300, clientY: 260, button: 0 })
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  expect(input).toHaveValue('')
  expect(state().texts).toHaveLength(0)
  fireEvent.change(input, { target: { value: '第一行\n第二行' } })
  fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
  const current = state()
  expect(current.texts[0].layout).toBe('paragraph')
  expect(current.texts[0].width).toBeGreaterThan(200)
})

test.each(['blur', 'Enter', 'Escape', 'whitespace', 'cleared', 'typed Escape', 'switch tool'])('new text is discarded without objects or history on %s', (finishWith) => {
  const target = setup()
  const before = state()
  fireEvent.pointerDown(target, { pointerId: 9, clientX: 100, clientY: 120, button: 0 })
  fireEvent.pointerUp(target, { pointerId: 9, clientX: 100, clientY: 120, button: 0 })
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  if (finishWith === 'whitespace') fireEvent.change(input, { target: { value: ' \n　' } })
  if (finishWith === 'cleared' || finishWith === 'typed Escape') fireEvent.change(input, { target: { value: '放弃的内容' } })
  if (finishWith === 'cleared') fireEvent.change(input, { target: { value: '' } })
  if (finishWith === 'switch tool') fireEvent.click(screen.getByLabelText('工具组：选择/移动'))
  else if (finishWith.includes('Escape')) fireEvent.keyDown(input, { key: 'Escape' })
  else if (finishWith === 'Enter') fireEvent.keyDown(input, { key: 'Enter' })
  else fireEvent.blur(input)
  expect(state().texts).toEqual(before.texts)
  expect(state().layers).toEqual(before.layers)
  expect(state().sceneOrder).toEqual(before.sceneOrder)
  expect(state().undoCount).toBe(before.undoCount)
  expect(screen.queryByRole('textbox', { name: '编辑画布文字' })).toBeNull()
  expect(document.querySelector('.canvas-text-object')).toBeNull()
})

test('blurring a new text with content creates it once and cancelling an existing edit preserves it', () => {
  const target = setup()
  const before = state()
  fireEvent.pointerDown(target, { pointerId: 11, clientX: 100, clientY: 120, button: 0 })
  fireEvent.pointerUp(target, { pointerId: 11, clientX: 100, clientY: 120, button: 0 })
  const input = screen.getByRole('textbox', { name: '编辑画布文字' })
  fireEvent.change(input, { target: { value: '保留内容' } })
  fireEvent.blur(input)
  expect(state().texts).toHaveLength(1)
  expect(state().texts[0].text).toBe('保留内容')
  expect(state().undoCount).toBe(before.undoCount + 1)
  fireEvent.click(document.querySelector('.canvas-text-object')!)
  const editor = screen.getByRole('textbox', { name: '编辑画布文字' })
  fireEvent.change(editor, { target: { value: '' } })
  fireEvent.keyDown(editor, { key: 'Escape' })
  expect(state().texts[0].text).toBe('保留内容')
  expect(state().undoCount).toBe(before.undoCount + 1)
})

test('an empty paragraph editor is discarded on blur', () => {
  const target = setup()
  const before = state()
  fireEvent.pointerDown(target, { pointerId: 12, clientX: 100, clientY: 120, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 12, clientX: 240, clientY: 180, buttons: 1 })
  fireEvent.pointerUp(target, { pointerId: 12, clientX: 240, clientY: 180, button: 0 })
  fireEvent.blur(screen.getByRole('textbox', { name: '编辑画布文字' }))
  expect(state().texts).toEqual(before.texts)
  expect(state().undoCount).toBe(before.undoCount)
  expect(document.querySelector('.canvas-text-object')).toBeNull()
})

test('cancelling the paragraph creation gesture does not leave an empty text object', () => {
  const target = setup()
  const before = state()
  fireEvent.pointerDown(target, { pointerId: 10, clientX: 100, clientY: 120, button: 0 })
  fireEvent.pointerMove(target, { pointerId: 10, clientX: 240, clientY: 180, buttons: 1 })
  fireEvent.pointerCancel(target, { pointerId: 10 })
  expect(state().texts).toEqual(before.texts)
  expect(state().undoCount).toBe(before.undoCount)
  expect(document.querySelector('.canvas-text-object')).toBeNull()
})

test('clicking an existing text object enters its editor instead of creating another layer', () => {
  render(<EditorProvider><AppShell /><Probe /><ExistingTextFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load existing text'))

  const textObject = document.querySelector('.canvas-text-object') as HTMLElement
  fireEvent.click(textObject)

  expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('已有文字')
  expect(document.querySelector('[data-text="existing-text"]')).toHaveAttribute('data-editor-hidden', 'true')
  expect(state().texts).toHaveLength(1)
})

test('clicking the canvas inside an existing text bounds edits it instead of creating text', () => {
  render(<EditorProvider><AppShell /><Probe /><ExistingTextFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load existing text'))
  const artboard = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.pointerDown(artboard, { pointerId: 8, clientX: 110, clientY: 125, button: 0 })
  fireEvent.pointerUp(artboard, { pointerId: 8, clientX: 110, clientY: 125, button: 0 })

  expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('已有文字')
  expect(state().texts).toHaveLength(1)
})

test('dragging an existing text with the text tool moves it without opening a new editor or layer', () => {
  render(<EditorProvider><AppShell /><Probe /><ExistingTextFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load existing text'))
  const textObject = document.querySelector('.canvas-text-object') as HTMLElement
  fireEvent.pointerDown(textObject, { pointerId: 7, clientX: 100, clientY: 100, button: 0 })
  fireEvent.pointerMove(textObject, { pointerId: 7, clientX: 145, clientY: 125, buttons: 1 })
  fireEvent.pointerUp(textObject, { pointerId: 7, clientX: 145, clientY: 125, button: 0 })

  expect(screen.queryByRole('textbox', { name: '编辑画布文字' })).toBeNull()
  expect(state().texts).toHaveLength(1)
  expect(JSON.parse(screen.getByTestId('text-state').textContent ?? '{}').texts[0].x).toBeGreaterThan(20)
})

test('changing text color while an existing text is selected updates that text', () => {
  render(<EditorProvider><AppShell /><Probe /><ExistingTextFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load existing text'))
  fireEvent.change(screen.getByLabelText('文字颜色'), { target: { value: '#12abef' } })

  expect(state().texts[0]).toMatchObject({ color: '#12abef' })
})

test('select tool edits only the clicked text object when multiple texts share a layer', () => {
  render(<EditorProvider><AppShell /><Probe /><SelectionFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load selection fixture'))

  const textObjects = Array.from(document.querySelectorAll<HTMLElement>('.canvas-text-object'))
  expect(textObjects).toHaveLength(2)
  expect(screen.queryAllByRole('button', { name: '旋转文字' })).toHaveLength(0)

  const board = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  fireEvent.pointerDown(textObjects[0], { pointerId: 31, clientX: 70, clientY: 80, button: 0 })
  fireEvent.pointerUp(textObjects[0], { pointerId: 31, clientX: 70, clientY: 80, button: 0 })
  fireEvent.click(textObjects[0])

  expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('文字 A')
  expect(textObjects[0]).toHaveClass('selected')
  expect(textObjects[1]).not.toHaveClass('selected')
})

test('select tool moves the selected text independently and background independently', () => {
  render(<EditorProvider><AppShell /><Probe /><SelectionFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load selection fixture'))
  const artboard = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  const textObjects = Array.from(document.querySelectorAll<HTMLElement>('.canvas-text-object'))
  const before = state()
  const secondBefore = before.texts.find((item) => item.id === 'text-b')!

  fireEvent.pointerDown(textObjects[0], { pointerId: 17, clientX: 90, clientY: 80, button: 0 })
  fireEvent.pointerMove(textObjects[0], { pointerId: 17, clientX: 130, clientY: 110, buttons: 1 })
  fireEvent.pointerUp(textObjects[0], { pointerId: 17, clientX: 130, clientY: 110, button: 0 })

  const afterTextMove = state()
  expect(afterTextMove.texts.find((item) => item.id === 'text-a')!.x).toBeGreaterThan(before.texts.find((item) => item.id === 'text-a')!.x)
  expect(afterTextMove.texts.find((item) => item.id === 'text-b')).toMatchObject({ x: secondBefore.x, y: secondBefore.y })
  expect(afterTextMove.layers).toHaveLength(before.layers.length)

  fireEvent.pointerDown(artboard, { pointerId: 18, clientX: 450, clientY: 550, button: 0 })
  fireEvent.pointerMove(artboard, { pointerId: 18, clientX: 470, clientY: 570, buttons: 1 })
  fireEvent.pointerUp(artboard, { pointerId: 18, clientX: 470, clientY: 570, button: 0 })

  const afterBackgroundMove = state()
  expect(afterBackgroundMove.layers.find((layer) => layer.id === 'background')?.transform?.rect.x).toBeGreaterThan(0)
  expect(afterBackgroundMove.layers.find((layer) => layer.id === 'art')?.transform).toBeUndefined()
  expect(screen.queryAllByRole('button', { name: '旋转文字' })).toHaveLength(0)
})

test('a drag followed by a browser click moves text once, while the next single click edits it', () => {
  render(<EditorProvider><AppShell /><Probe /><SelectionFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load selection fixture'))
  const board = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  const object = document.querySelector('.canvas-text-object')!
  const before = state()
  fireEvent.pointerDown(object, { pointerId: 22, clientX: 90, clientY: 80, button: 0 })
  fireEvent.pointerMove(object, { pointerId: 22, clientX: 130, clientY: 110, buttons: 1 })
  fireEvent.pointerUp(object, { pointerId: 22, clientX: 130, clientY: 110, button: 0 })
  fireEvent.click(object)
  expect(screen.queryByRole('textbox', { name: '编辑画布文字' })).toBeNull()
  expect(state().texts.find(item => item.id === 'text-a')!.x).not.toBe(before.texts.find(item => item.id === 'text-a')!.x)
  expect(state().undoCount).toBe(before.undoCount + 1)
  fireEvent.pointerDown(object, { pointerId: 23, clientX: 130, clientY: 110, button: 0 })
  fireEvent.pointerUp(object, { pointerId: 23, clientX: 130, clientY: 110, button: 0 })
  fireEvent.click(object)
  expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('文字 A')
  expect(state().undoCount).toBe(before.undoCount + 1)
})

test('a tiny pointer wobble still counts as a single click and does not move text', () => {
  render(<EditorProvider><AppShell /><Probe /><ExistingTextFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load existing text'))
  const board = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  const object = document.querySelector('.canvas-text-object')!
  const before = state()
  fireEvent.pointerDown(object, { pointerId: 24, clientX: 110, clientY: 125, button: 0 })
  fireEvent.pointerMove(object, { pointerId: 24, clientX: 111, clientY: 126, buttons: 1 })
  fireEvent.pointerUp(object, { pointerId: 24, clientX: 111, clientY: 126, button: 0 })
  fireEvent.click(object)
  expect(screen.getByRole('textbox', { name: '编辑画布文字' })).toHaveValue('已有文字')
  expect(state().texts).toEqual(before.texts)
  expect(state().undoCount).toBe(before.undoCount)
})

test('the text tool can drag text on an unselected layer on the first gesture', () => {
  render(<EditorProvider><AppShell /><Probe /><SelectionFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load selection fixture'))
  fireEvent.click(screen.getByLabelText('工具组：文字/形状'))
  const board = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(board, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  const object = document.querySelector('.canvas-text-object')!
  const before = state()
  fireEvent.pointerDown(object, { pointerId: 25, clientX: 90, clientY: 80, button: 0 })
  fireEvent.pointerMove(object, { pointerId: 25, clientX: 130, clientY: 110, buttons: 1 })
  fireEvent.pointerUp(object, { pointerId: 25, clientX: 130, clientY: 110, button: 0 })
  fireEvent.click(object)
  expect(screen.queryByRole('textbox', { name: '编辑画布文字' })).toBeNull()
  expect(state().texts.find(item => item.id === 'text-a')!.x).toBeGreaterThan(12)
  expect(state().texts).toHaveLength(2)
  expect(state().undoCount).toBe(before.undoCount + 1)
})

test('select tool shows the text at its live drag position before pointerup', () => {
  render(<EditorProvider><AppShell /><Probe /><SelectionFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load selection fixture'))
  const artboard = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  const textObject = document.querySelector('.canvas-text-object') as HTMLElement

  fireEvent.pointerDown(textObject, { pointerId: 19, clientX: 90, clientY: 80, button: 0 })
  fireEvent.pointerMove(textObject, { pointerId: 19, clientX: 130, clientY: 110, buttons: 1 })

  expect(textObject).toHaveClass('is-transforming')
  const sceneText = document.querySelector('.canvas-art [data-text="text-a"]')!
  expect(sceneText).toHaveAttribute('x', '100')
  expect(sceneText).not.toHaveAttribute('data-editor-hidden')
  expect(state().texts.find((text) => text.id === 'text-a')?.x).toBe(12)

  fireEvent.pointerUp(textObject, { pointerId: 19, clientX: 130, clientY: 110, button: 0 })
  expect(textObject).not.toHaveClass('is-transforming')
})

test.each(['pointercancel', 'Escape'])('cancelling text movement with %s restores the real text without committing', (cancelWith) => {
  render(<EditorProvider><AppShell /><Probe /><SelectionFixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load selection fixture'))
  const artboard = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  const textObject = document.querySelector('.canvas-text-object') as HTMLElement
  const original = state().texts
  fireEvent.pointerDown(textObject, { pointerId: 20, clientX: 90, clientY: 80, button: 0 })
  fireEvent.pointerMove(textObject, { pointerId: 20, clientX: 130, clientY: 110, buttons: 1 })
  if (cancelWith === 'pointercancel') fireEvent.pointerCancel(textObject, { pointerId: 20 })
  else fireEvent.keyDown(window, { key: 'Escape' })
  fireEvent.click(textObject)
  expect(screen.queryByRole('textbox', { name: '编辑画布文字' })).toBeNull()
  expect(document.querySelector('.canvas-art [data-text="text-a"]')).toHaveAttribute('x', '60')
  expect(textObject).not.toHaveClass('is-transforming')
  expect(state().texts).toEqual(original)
})
