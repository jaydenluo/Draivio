import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import type { ToolId } from '../tools/toolTypes'
import { CanvasViewport } from './CanvasViewport'
import * as raster from './rasterTools'

const source = 'data:image/png;base64,b3JpZ2luYWw='
function Setup({ tool }: { tool: ToolId }) {
  const { state, dispatch } = useEditor()
  return <><button onClick={() => { dispatch({ type: 'restore-project', document: { ...initialEditorState, documentId: 'project', documentWidth: 2, documentHeight: 2, layers: [{ ...initialEditorState.layers[0], source }] } }); dispatch({ type: 'select-tool', tool }); dispatch({ type: 'rename-layer', id: 'art', name: 'new' }) }}>准备</button><button onClick={() => dispatch({ type: 'undo' })}>撤销待处理</button><button onClick={() => dispatch({ type: 'restore-project', document: { ...initialEditorState, documentId: state.documentId, layers: [{ ...initialEditorState.layers[0], source }] } })}>重开相同ID</button><output data-testid="async-state">{JSON.stringify({ source: state.layers[0].source, notice: state.notice, undo: state.undoStack.length })}</output><CanvasViewport /></>
}
afterEach(() => vi.restoreAllMocks())
for (const tool of ['fill', 'brush', 'eraser', 'clone-stamp', 'smudge', 'background-eraser', 'perspective-crop'] as ToolId[]) test.each(['undo', 'same-id-reopen'])(`${tool} rejects its pending pixel callback after %s`, async (mode) => {
  let finish!: () => void
  const pixels = { width: 2, height: 2, data: new Uint8ClampedArray(16) }
  const canvas = document.createElement('canvas')
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ getImageData: () => pixels, createImageData: () => pixels, putImageData: () => {} } as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,bGF0ZQ==')
  const method = tool === 'perspective-crop' ? 'rasterizeSvg' : tool === 'clone-stamp' ? 'cloneImage' : tool === 'smudge' ? 'smudgeImage' : tool === 'background-eraser' ? 'eraseBackground' : 'rasterizeSvgPixels'
  const rasterize = vi.spyOn(raster, method).mockImplementation(() => new Promise<never>(resolve => { finish = () => resolve((tool === 'perspective-crop' ? canvas : ['clone-stamp', 'smudge', 'background-eraser'].includes(tool) ? 'data:image/png;base64,bGF0ZQ==' : pixels) as never) }))
  vi.spyOn(raster, 'imageToPng').mockReturnValue('data:image/png;base64,bGF0ZS1yZXN1bHQ=')
  const view = render(<EditorProvider><Setup tool={tool} /></EditorProvider>)
  fireEvent.click(screen.getByText('准备'))
  const board = view.container.querySelector('.artboard')!
  if (tool === 'perspective-crop') fireEvent.click(screen.getByLabelText('确认透视裁剪'))
  else {
    if (tool === 'clone-stamp') fireEvent.pointerDown(board, { pointerId: 1, button: 0, clientX: 0, clientY: 0, altKey: true })
    fireEvent.pointerDown(board, { pointerId: 2, button: 0, clientX: 1, clientY: 1 })
    if (tool !== 'fill' && tool !== 'background-eraser') fireEvent.pointerUp(board, { pointerId: 2, button: 0, clientX: 1, clientY: 1 })
  }
  await waitFor(() => expect(rasterize).toHaveBeenCalledOnce())
  fireEvent.click(screen.getByText(mode === 'undo' ? '撤销待处理' : '重开相同ID'))
  await act(async () => finish())
  const result = JSON.parse(screen.getByTestId('async-state').textContent!)
  expect(result.source).toBe(source)
  expect(result.undo).toBe(0)
  expect(result.notice).toMatch(/文档.*更改|过期/)
})
