import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { AppShell } from '../app/AppShell'
import { EditorProvider, useEditor } from '../state/editor'

const text = { id: 'text-1', layerId: 'text-1', x: 20, y: 20, text: '可变换文字', layout: 'paragraph' as const, width: 180, height: 60, fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: '#fff', align: 'left' as const, lineHeight: 1.4, letterSpacing: 0 }
function Fixture() {
  const { state, dispatch } = useEditor()
  return <><button onClick={() => { dispatch({ type: 'restore-project', document: { documentWidth: 500, documentHeight: 625, layers: [{ id: 'text-1', name: '可变换文字', className: 'layer-text', kind: 'text', textObjectId: 'text-1', visible: true, opacity: 100, blendMode: '正常' }], selectedLayerId: 'text-1', selectedLayerIds: ['text-1'], canvasTexts: [text], canvasShapes: [], brushStrokes: [], layerMasks: {}, sceneOrder: ['text-1'] } }); dispatch({ type: 'select-tool', tool: 'select' }) }}>load text fixture</button><output data-testid="text-transform-state">{JSON.stringify(state.canvasTexts)}</output></>
}

function setup() {
  render(<EditorProvider><AppShell /><Fixture /></EditorProvider>)
  fireEvent.click(screen.getByText('load text fixture'))
  const artboard = document.querySelector('.artboard') as HTMLElement
  vi.spyOn(artboard, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, width: 500, height: 625, right: 500, bottom: 625, x: 0, y: 0, toJSON: () => ({}) })
  return document.querySelector('.canvas-text-object') as HTMLElement
}

test('selected text can be moved on the canvas and commits one object update', () => {
  const textObject = setup()
  fireEvent.pointerDown(textObject, { pointerId: 1, clientX: 100, clientY: 100, button: 0 })
  fireEvent.pointerMove(textObject, { pointerId: 1, clientX: 140, clientY: 130, buttons: 1 })
  fireEvent.pointerUp(textObject, { pointerId: 1, clientX: 140, clientY: 130, button: 0 })

  const current = JSON.parse(screen.getByTestId('text-transform-state').textContent ?? '[]') as Array<{ x: number; y: number }>
  expect(current[0].x).toBeGreaterThan(20)
  expect(current[0].y).toBeGreaterThan(20)
})

test('selected text exposes resize and rotation controls', () => {
  const textObject = setup()
  fireEvent.pointerDown(textObject, { pointerId: 8, clientX: 100, clientY: 125, button: 0 })
  fireEvent.pointerUp(textObject, { pointerId: 8, clientX: 100, clientY: 125, button: 0 })

  expect(screen.getByRole('button', { name: '缩放文字右下角' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '旋转文字' })).toBeInTheDocument()
  fireEvent.pointerDown(screen.getByRole('button', { name: '缩放文字右下角' }), { pointerId: 2, clientX: 190, clientY: 160, button: 0 })
  fireEvent.pointerMove(screen.getByRole('button', { name: '缩放文字右下角' }), { pointerId: 2, clientX: 240, clientY: 190, buttons: 1 })
  fireEvent.pointerUp(screen.getByRole('button', { name: '缩放文字右下角' }), { pointerId: 2, clientX: 240, clientY: 190, button: 0 })
  expect(JSON.parse(screen.getByTestId('text-transform-state').textContent ?? '[]')[0].width).toBeGreaterThan(180)
  void textObject
})

test('an inward corner drag shrinks the actual text before committing and can be undone', () => {
  const textObject = setup()
  fireEvent.pointerDown(textObject, { pointerId: 8, clientX: 100, clientY: 125, button: 0 })
  fireEvent.pointerUp(textObject, { pointerId: 8, clientX: 100, clientY: 125, button: 0 })
  const corner = screen.getByRole('button', { name: '缩放文字右下角' })
  fireEvent.pointerDown(corner, { pointerId: 3, clientX: 280, clientY: 185, button: 0 })
  fireEvent.pointerMove(corner, { pointerId: 3, clientX: 190, clientY: 185, buttons: 1 })
  const sceneText = document.querySelector('.canvas-art [data-text="text-1"]')!
  expect(Number(sceneText.getAttribute('font-size'))).toBeCloseTo(12)
  expect(JSON.parse(screen.getByTestId('text-transform-state').textContent!)[0].fontSize).toBe(24)
  fireEvent.pointerUp(corner, { pointerId: 3, clientX: 190, clientY: 185, button: 0 })
  expect(JSON.parse(screen.getByTestId('text-transform-state').textContent!)[0].fontSize).toBeCloseTo(12)
  fireEvent.click(screen.getByLabelText('撤销'))
  expect(sceneText).toHaveAttribute('font-size', '24')
})
