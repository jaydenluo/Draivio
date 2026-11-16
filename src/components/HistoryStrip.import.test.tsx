import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { HistoryStrip } from './HistoryStrip'
function Probe() { const { state } = useEditor(); return <><output>{state.documentWidth} × {state.documentHeight} · {state.undoStack.length}</output><p data-testid="import-notice">{state.notice}</p></> }
it('uploads a file through the importer with default Auto natural dimensions', async () => {
 class DecodedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } }
 vi.stubGlobal('Image', DecodedImage)
 render(<EditorProvider><HistoryStrip /><Probe /></EditorProvider>)
 expect(screen.getByLabelText('导入尺寸')).toHaveValue('auto')
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File([new Uint8Array([137,80,78,71])], 'landscape.png', { type: 'image/png' })] } })
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1200 × 800 · 1'))
})

function ChangeDocument() { const { dispatch } = useEditor(); return <button onClick={() => dispatch({ type: 'new-document', width: 640, height: 480 })}>切换文档</button> }
it('discards an import finishing after the initiating document has changed', async () => {
 const callbacks: Array<() => void> = []
 class DelayedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { callbacks.push(() => this.onload?.()) } }
 vi.stubGlobal('Image', DelayedImage)
 render(<EditorProvider><HistoryStrip /><Probe /><ChangeDocument /></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File(['image'], 'slow.png', { type: 'image/png' })] } })
 await waitFor(() => expect(callbacks).toHaveLength(1))
 fireEvent.click(screen.getByText('切换文档'))
 callbacks.shift()!()
 await waitFor(() => expect(callbacks).toHaveLength(1))
 callbacks.shift()!()
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('640 × 480 · 0'))
 await waitFor(() => expect(screen.getByTestId('import-notice')).toHaveTextContent('文档已更改'))
 expect(screen.queryByText('导入 · slow.png')).not.toBeInTheDocument()
})

function PreviewEdit() { const { dispatch } = useEditor(); return <button onClick={() => { dispatch({ type: 'begin-transaction', label: '亮度预览' }); dispatch({ type: 'set-layer-adjustment', id: 'art', key: 'brightness', value: 20 }) }}>预览编辑</button> }
it('discards an import after an in-progress edit changes revision without changing undo depth', async () => {
 const callbacks: Array<() => void> = []
 class DelayedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { callbacks.push(() => this.onload?.()) } }
 vi.stubGlobal('Image', DelayedImage)
 render(<EditorProvider><HistoryStrip /><Probe /><PreviewEdit /></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File(['image'], 'during-preview.png', { type: 'image/png' })] } })
 await waitFor(() => expect(callbacks).toHaveLength(1))
 fireEvent.click(screen.getByText('预览编辑'))
 expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 0')
 callbacks.shift()!()
 await waitFor(() => expect(callbacks).toHaveLength(1))
 callbacks.shift()!()
 await waitFor(() => expect(screen.getByTestId('import-notice')).toHaveTextContent('文档已更改'))
 expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 0')
 expect(screen.queryByText('导入 · during-preview.png')).not.toBeInTheDocument()
})
