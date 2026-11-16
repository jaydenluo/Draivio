import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { HistoryStrip } from './HistoryStrip'
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), character => character.charCodeAt(0))
function Probe() { const { state } = useEditor(); return <output>{state.documentWidth} × {state.documentHeight} · {state.undoStack.length}</output> }
it('uploads a file through the importer with default Auto natural dimensions', async () => {
 class DecodedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } }
 vi.stubGlobal('Image', DecodedImage)
 render(<EditorProvider><HistoryStrip /><Probe /></EditorProvider>)
 expect(screen.getByLabelText('导入尺寸')).toHaveValue('auto')
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File([png], 'landscape.png', { type: 'image/png' })] } })
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1200 × 800 · 1'))
})

function ChangeDocument() { const { dispatch } = useEditor(); return <button onClick={() => dispatch({ type: 'new-document', width: 640, height: 480 })}>切换文档</button> }
it('discards an import finishing after the initiating document has changed', async () => {
 const callbacks: Array<() => void> = []
 class DelayedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { callbacks.push(() => this.onload?.()) } }
 vi.stubGlobal('Image', DelayedImage)
 render(<EditorProvider><HistoryStrip /><Probe /><ChangeDocument /></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File([png], 'slow.png', { type: 'image/png' })] } })
 await waitFor(() => expect(callbacks).toHaveLength(1))
 fireEvent.click(screen.getByText('切换文档'))
 callbacks.shift()!()
 await waitFor(() => expect(callbacks).toHaveLength(1))
 callbacks.shift()!()
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('640 × 480 · 1'))
 expect(screen.queryByText('导入 · slow.png')).not.toBeInTheDocument()
})
