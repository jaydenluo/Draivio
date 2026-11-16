import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { CanvasViewport } from './CanvasViewport'
import { configureCanvasCloudServices } from './cloudToolServices'
import { combineSelection, createSelection, type Selection } from './selectionGeometry'
import * as raster from './rasterTools'

const region = createSelection('rectangle', { x: 10, y: 10, width: 20, height: 20 })
function Harness() {
  const { state, dispatch } = useEditor()
  return <>
    <button onClick={() => { dispatch({ type: 'commit-selection', selection: region }); dispatch({ type: 'select-tool', tool: 'mask-subject' }) }}>主体蒙版工具</button>
    <button onClick={() => dispatch({ type: 'new-document', width: 640, height: 480 })}>新文档</button>
    <button onClick={() => dispatch({ type: 'undo' })}>撤销文档</button>
    <button onClick={() => dispatch({ type: 'select-layer', id: 'original' })}>切换图层</button>
    <button onClick={() => {
      dispatch({ type: 'import-image', id: 'pixels', name: 'pixels', source: 'data:image/png;base64,test', width: 4, height: 4, autoSize: true })
      dispatch({ type: 'commit-selection', selection: combineSelection(region, createSelection('rectangle', { x: 80, y: 80, width: 10, height: 10 }), 'intersect') })
      dispatch({ type: 'select-tool', tool: 'fill' })
    }}>空交集填充</button>
    <output data-testid="async-doc">{JSON.stringify(state)}</output><CanvasViewport />
  </>
}
const doc = () => JSON.parse(screen.getByTestId('async-doc').textContent!)
afterEach(() => { configureCanvasCloudServices({}); vi.restoreAllMocks() })

function startSubject() {
  let resolve!: (selection: Selection) => void
  const service = vi.fn(() => new Promise<Selection>((done) => { resolve = done }))
  configureCanvasCloudServices({ selectSubject: service })
  render(<EditorProvider><Harness /></EditorProvider>)
  fireEvent.click(screen.getByText('主体蒙版工具'))
  fireEvent.pointerDown(screen.getByLabelText('画布交互层'), { button: 0, pointerId: 1, clientX: 100, clientY: 100 })
  return { resolve, service }
}

test('discards a subject mask returned after opening a different document', async () => {
  const { resolve } = startSubject()
  fireEvent.click(screen.getByText('新文档'))
  const before = doc()
  await act(async () => { resolve(region) })
  expect(doc().layerMasks).toEqual({})
  expect(doc().undoStack).toEqual(before.undoStack)
  expect(doc().notice).toContain('文档已更改')
})

test('does not apply a pending mask to a newly selected layer', async () => {
  const { resolve } = startSubject()
  fireEvent.click(screen.getByText('切换图层'))
  await act(async () => { resolve(region) })
  expect(doc().layerMasks).toEqual({})
})

test('keeps undo and redo intact when undo occurs during processing', async () => {
  const { resolve } = startSubject()
  fireEvent.click(screen.getByText('撤销文档'))
  const before = doc()
  await act(async () => { resolve(region) })
  expect(doc().layerMasks).toEqual({})
  expect(doc().undoStack).toEqual(before.undoStack)
  expect(doc().redoStack).toEqual(before.redoStack)
})

test('applies a successful mask as one undo operation when its document is unchanged', async () => {
  const { resolve, service } = startSubject()
  const undoCount = doc().undoStack.length
  fireEvent.pointerDown(screen.getByLabelText('画布交互层'), { button: 0, pointerId: 2, clientX: 100, clientY: 100 })
  await act(async () => { resolve(region) })
  expect(service).toHaveBeenCalledTimes(1)
  expect(doc().layerMasks.art.selection).toEqual(region)
  expect(doc().undoStack).toHaveLength(undoCount + 1)
})

test('an empty intersection constrains pixel fill instead of filling the whole image', async () => {
  const image = { width: 4, height: 4, data: new Uint8ClampedArray(64) }
  vi.spyOn(raster, 'rasterizeSvgPixels').mockResolvedValue(image)
  const encode = vi.spyOn(raster, 'imageToPng').mockReturnValue('data:image/png;base64,output')
  render(<EditorProvider><Harness /></EditorProvider>)
  fireEvent.click(screen.getByText('空交集填充'))
  expect(doc().selection.rect.width).toBe(0)
  await act(async () => { fireEvent.pointerDown(screen.getByLabelText('画布交互层'), { button: 0, pointerId: 1, clientX: 1, clientY: 1 }) })
  expect(encode).toHaveBeenCalled()
  expect(encode.mock.calls[0][0].data).toEqual(image.data)
})
