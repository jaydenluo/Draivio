import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import type { ToolId } from '../tools/toolTypes'
import { CanvasViewport } from './CanvasViewport'
import * as raster from './rasterTools'
import { CanvasScene } from './CanvasScene'
import { extractLayerScene } from './layerExtraction'
import { createSelection } from './selectionGeometry'
import { TopBar } from '../components/TopBar'
const capture = vi.hoisted(() => ({ source: '' }))
vi.mock('../render/ExportDialog', () => ({ ExportDialog: ({ svgSource }: { svgSource: (range: 'layer') => string }) => <button onClick={() => { capture.source = svgSource('layer') }}>捕获图层导出</button> }))

const imported = 'data:image/png;base64,aW1wb3J0ZWQ='
function Setup({ tool }: { tool: ToolId }) {
  const { dispatch } = useEditor()
  return <><button onClick={() => {
    dispatch({ type: 'restore-project', document: { ...initialEditorState, documentWidth: 2, documentHeight: 2, selectedLayerId: 'child', selectedLayerIds: ['child'], documentBackground: '#ffffff', layers: [
      { ...initialEditorState.layers[0], id: 'group', source: undefined, children: ['child'], opacity: 50 },
      { ...initialEditorState.layers[0], id: 'child', source: imported, groupId: 'group', opacity: 40 },
      { ...initialEditorState.layers[0], id: 'outside', source: 'outside' },
    ] } })
    dispatch({ type: 'select-tool', tool })
  }}>准备</button><CanvasViewport /></>
}
afterEach(() => vi.restoreAllMocks())

test.each(['brush', 'eraser', 'fill', 'clone-stamp', 'smudge', 'perspective-crop'] as ToolId[])('%s rasterizes nonempty grouped imported content without parent or own opacity being baked twice', async (tool) => {
  const inputs: SVGElement[] = []
  const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16).fill(255) }
  vi.spyOn(raster, 'rasterizeSvgPixels').mockImplementation(async (svg) => { inputs.push(svg); return pixels })
  vi.spyOn(raster, 'cloneImage').mockImplementation(async (svg) => { inputs.push(svg); return imported })
  vi.spyOn(raster, 'smudgeImage').mockImplementation(async (svg) => { inputs.push(svg); return imported })
  const canvas = document.createElement('canvas')
  vi.spyOn(canvas, 'getContext').mockReturnValue({ getImageData: () => pixels } as unknown as CanvasRenderingContext2D)
  vi.spyOn(raster, 'rasterizeSvg').mockImplementation(async (svg) => { inputs.push(svg); return canvas })
  vi.spyOn(raster, 'imageToPng').mockReturnValue(imported)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ createImageData: () => ({ data: new Uint8ClampedArray(16) }), putImageData: () => {} } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(imported)
  const view = render(<EditorProvider><Setup tool={tool} /></EditorProvider>)
  fireEvent.click(screen.getByText('准备'))
  const board = view.container.querySelector('.artboard')!
  if (tool === 'perspective-crop') fireEvent.click(screen.getByLabelText('确认透视裁剪'))
  else {
    if (tool === 'clone-stamp') fireEvent.pointerDown(board, { pointerId: 1, clientX: 0, clientY: 0, button: 0, altKey: true })
    fireEvent.pointerDown(board, { pointerId: 2, clientX: 1, clientY: 1, button: 0 })
    fireEvent.pointerUp(board, { pointerId: 2, clientX: 1, clientY: 1, button: 0 })
  }
  await waitFor(() => expect(inputs.length).toBe(1))
  const svg = inputs[0]
  expect(svg.querySelector('image')).toHaveAttribute('href', imported)
  expect(svg.querySelector('[data-layer-id="outside"]')).toBeNull()
  expect(svg.querySelector('[data-layer-id="child"]')).toHaveAttribute('opacity', '1')
  expect(svg.querySelector('[data-layer-id="group"]')).toBeNull()
  expect(svg.querySelector('[data-stroke]')).toBeNull()
})

// These assertions use the real scene tree; raster-boundary mocks above only avoid
// depending on jsdom's missing native bitmap decoder and canvas implementation.


test.each([false, true])('visual extraction preserves the ancestor chain and selected group subtree from scene/thumbnail (%s)', (thumbnail) => {
  const layer = initialEditorState.layers[0]
  const state = { ...initialEditorState, documentBackground: '#ffffff', layers: [
    { ...layer, id: 'root', source: undefined, children: ['group'], opacity: 50 },
    { ...layer, id: 'group', source: undefined, groupId: 'root', children: ['child', 'sibling'], opacity: 40 },
    { ...layer, id: 'child', source: imported, groupId: 'group' },
    { ...layer, id: 'sibling', source: 'sibling', groupId: 'group' },
    { ...layer, id: 'outside', source: 'outside' },
  ] }
  const view = render(<CanvasScene state={state} thumbnail={thumbnail} />)
  const original = view.container.querySelector('svg')!
  const selectedChild = extractLayerScene(original, 'child')
  expect(selectedChild.querySelector('[data-layer-id="root"]')).toHaveAttribute('opacity', '0.5')
  expect(selectedChild.querySelector('[data-layer-id="group"]')).toHaveAttribute('opacity', '0.4')
  expect(selectedChild.querySelector('image')).toHaveAttribute('href', imported)
  expect(selectedChild.querySelector('[data-layer-id="sibling"]')).toBeNull()
  expect(selectedChild.querySelector('[data-layer-id="outside"]')).toBeNull()
  expect(selectedChild.querySelector('svg > rect')).toBeNull()
  const selectedGroup = extractLayerScene(original, 'group')
  expect(selectedGroup.querySelectorAll('image')).toHaveLength(2)
  expect(selectedGroup.querySelector('[data-layer-id="outside"]')).toBeNull()
  expect(original.querySelector('[data-layer-id="outside"]')).toBeInTheDocument()
})

test('own-source extraction bakes own transform/mask, excludes parent transform/mask, and leaves opacity/filter for the document', () => {
  const layer = initialEditorState.layers[0]
  const transform = { kind: 'transform' as const, rect: { x: 20, y: 20, width: 60, height: 60 }, rotation: 20, flipX: false, flipY: false }
  const mask = { selection: createSelection('rectangle', { x: 10, y: 10, width: 80, height: 80 }), strokes: [], inverted: false, applied: true }
  const state = { ...initialEditorState, layers: [
    { ...layer, id: 'group', source: undefined, children: ['child'], opacity: 50, transform },
    { ...layer, id: 'child', source: imported, groupId: 'group', transform, opacity: 40, adjustments: { ...layer.adjustments!, brightness: 20 } },
  ], layerMasks: { group: mask, child: mask } }
  const view = render(<CanvasScene state={state} />)
  const original = view.container.querySelector('svg')!
  const visual = extractLayerScene(original, 'child')
  expect(visual.querySelector('[data-layer-transform="group"]')).toHaveAttribute('transform')
  expect(visual.querySelector('[data-layer-mask="group"]')).toHaveAttribute('mask')
  const own = extractLayerScene(original, 'child', { mode: 'raster-source' })
  expect(own.querySelector('[data-layer-transform="group"]')).toBeNull()
  expect(own.querySelector('[data-layer-mask="group"]')).toBeNull()
  expect(own.querySelector('[data-layer-transform="child"]')).toHaveAttribute('transform')
  const ownMask = own.querySelector('[data-layer-mask="child"]')!.getAttribute('mask')!
  expect(own.querySelector(`[id="${ownMask.slice(5, -1)}"]`)).not.toBeNull()
  expect(own.querySelector('[data-layer-id="child"]')).toHaveAttribute('opacity', '1')
  expect((own.querySelector('[data-layer-id="child"]') as SVGElement).style.filter).toBe('')
  expect(original.querySelector('[data-layer-id="child"]')).toHaveAttribute('opacity', '0.4')
})

test('the actual top bar layer-export path retains grouped imported content and ancestor compositing', () => {
  const view = render(<EditorProvider><Setup tool="select" /><TopBar /></EditorProvider>)
  fireEvent.click(screen.getByText('准备'))
  Object.defineProperty(view.container.querySelector('.canvas-art')!, 'viewBox', { value: { baseVal: { x: 0, y: 0, width: 2, height: 2 } } })
  fireEvent.click(screen.getByText('捕获图层导出'))
  const exported = new DOMParser().parseFromString(capture.source, 'image/svg+xml')
  expect(exported.querySelector('parsererror')?.textContent ?? '', capture.source).toBe('')
  expect(exported.querySelector('image')?.getAttribute('href')).toBe(imported)
  expect(exported.querySelector('[data-layer-id="group"]')?.getAttribute('opacity')).toBe('0.5')
  expect(exported.querySelector('[data-layer-id="child"]')?.getAttribute('opacity')).toBe('0.4')
  expect(exported.querySelector('[data-layer-id="outside"]')).toBeNull()
})
