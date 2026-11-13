import { render } from '@testing-library/react'
import { expect, test } from 'vitest'
import { initialEditorState, type EditorState } from '../state/editor'
import { CanvasScene } from './CanvasScene'
import { createSelection } from './selectionGeometry'
import { createBrushStroke } from './BrushEngine'

function stateWith(changes: Partial<EditorState> = {}): EditorState {
  return { ...initialEditorState, layers: [
    { id: 'top', name: '上层', className: 'layer-art', visible: true, opacity: 40, blendMode: '正片叠底', source: 'data:image/png;base64,aGVsbG8=' },
    { id: 'base', name: '底图', className: 'layer-original', visible: true, opacity: 100, blendMode: '正常', source: 'fixture' },
    { id: 'hidden', name: '隐藏', className: 'layer-art', visible: false, opacity: 100, blendMode: '正常', source: 'fixture' },
  ], selectedLayerId: 'top', ...changes }
}

test('renders actual layer order, visibility, opacity and blend in a single exportable scene', () => {
  const view = render(<CanvasScene state={stateWith()} />)
  const svg = view.container.querySelector('.canvas-art')!
  expect(svg).toHaveAttribute('viewBox', '0 0 500 625')
  expect([...svg.querySelectorAll('.scene-layer')].map((node) => node.getAttribute('data-layer-id'))).toEqual(['base', 'top'])
  expect(svg.querySelector('[data-layer-id="hidden"]')).toBeNull()
  expect(svg.querySelector('[data-layer-id="top"]')).toHaveAttribute('opacity', '0.4')
  expect(svg.querySelector('[data-layer-id="top"]')).toHaveStyle({ mixBlendMode: 'multiply' })
  expect(svg.querySelector('image')).toHaveAttribute('href', 'data:image/png;base64,aGVsbG8=')
  expect(svg.querySelectorAll('svg')).toHaveLength(0)
})

test('transforms a layer around its center and exports clipped shapes, multi-line text and erasing', () => {
  const state = stateWith()
  state.layers[0] = { ...state.layers[0], transform: { kind: 'transform', rect: { x: 10, y: 20, width: 50, height: 40 }, rotation: 90, flipX: true, flipY: false } }
  state.canvasShapes = [{ id: 'shape', layerId: 'top', kind: 'ellipse', rect: { x: 0, y: 0, width: 80, height: 80 }, color: '#123456', strokeWidth: 2, selection: createSelection('ellipse', { x: 20, y: 20, width: 40, height: 40 }) }]
  state.canvasTexts = [{ id: 'text', layerId: 'top', x: 40, y: 30, text: '第一行\n第二行', fontFamily: 'serif', fontSize: 24, fontWeight: '700', color: '#ffffff', align: 'center' }]
  state.brushStrokes = [createBrushStroke('eraser', 'erase', 'top', { x: 30, y: 30 }, { size: 20, hardness: 80, opacity: 100, flow: 100, smoothing: 0, color: '#000000' })]
  const view = render(<CanvasScene state={state} />)
  expect(view.container.querySelector('[data-layer-transform="top"]')).toHaveAttribute('transform', 'translate(175 250) rotate(90) scale(-0.5 0.4) translate(-250 -312.5)')
  expect(view.container.querySelector('[data-shape="shape"]')).toHaveAttribute('mask', expect.stringContaining('url(#'))
  expect(view.container.querySelector('[data-shape="shape"] > ellipse')).toHaveAttribute('fill', '#123456')
  expect(view.container.querySelector('[data-text="text"]')).toHaveAttribute('text-anchor', 'middle')
  expect(view.container.querySelectorAll('[data-text="text"] tspan')).toHaveLength(2)
  expect(view.container.querySelector('mask[data-eraser="eraser"]')).toBeInTheDocument()
  expect(view.container.querySelector('mask[data-eraser="eraser"]')!.parentElement!.nextElementSibling!.querySelector('image')).toBeInTheDocument()
})

test('applies masks only when committed and keeps red previews outside the export SVG', () => {
  const mask = { selection: createSelection('rectangle', { x: 25, y: 25, width: 50, height: 50 }), strokes: [], inverted: false, applied: false }
  const state = stateWith({ activeTool: 'mask', activeToolId: 'mask', activeToolGroup: 'mask', layerMasks: { top: mask } })
  const view = render(<CanvasScene state={state} />)
  expect(view.container.querySelector('[data-layer-mask="top"]')).not.toHaveAttribute('mask')
  expect(view.container.querySelector('[aria-label="蒙版红色预览"]')).toBeInTheDocument()
  expect(view.container.querySelector('.canvas-art [aria-label="蒙版红色预览"]')).toBeNull()
  view.rerender(<CanvasScene state={{ ...state, layerMasks: { top: { ...mask, applied: true } } }} />)
  expect(view.container.querySelector('[data-layer-mask="top"]')).toHaveAttribute('mask', expect.stringContaining('url(#'))
  expect(view.container.querySelector('[aria-label="蒙版红色预览"]')).toBeNull()
})

test('previews attach to the right layer without mutating document state or reusing SVG ids', () => {
  const state = stateWith()
  const stroke = createBrushStroke('draft', 'paint', 'top', { x: 10, y: 20 }, { size: 20, hardness: 80, opacity: 100, flow: 100, smoothing: 0, color: '#ff0000' })
  const view = render(<><CanvasScene state={state} strokePreview={stroke} /><CanvasScene state={state} /></>)
  expect(view.container.querySelectorAll('[data-stroke="draft"]')).toHaveLength(1)
  expect(state.brushStrokes).toHaveLength(0)
  const ids = [...view.container.querySelectorAll('[id]')].map((node) => node.id)
  expect(new Set(ids).size).toBe(ids.length)
})
