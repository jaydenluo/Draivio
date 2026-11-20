import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ImageImportControl } from './ImageImportControl'
const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), character => character.charCodeAt(0))
function Probe() { const { state } = useEditor(); return <output>{state.documentWidth} × {state.documentHeight} · {state.undoStack.length}</output> }
it('uploads a file through the importer with default Auto natural dimensions', async () => {
 class DecodedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { queueMicrotask(() => this.onload?.()) } }
 vi.stubGlobal('Image', DecodedImage)
 render(<EditorProvider><ImageImportControl /><Probe /></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File([png], 'landscape.png', { type: 'image/png' })] } })
 expect(screen.getByLabelText('导入尺寸')).toHaveValue('auto')
 expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 0')
 fireEvent.click(screen.getByRole('button', {name:'导入'}))
 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('1200 × 800 · 1'))
})

function ChangeDocument() { const { dispatch } = useEditor(); return <button onClick={() => dispatch({ type: 'new-document', width: 640, height: 480 })}>切换文档</button> }
it('discards an import finishing after the initiating document has changed', async () => {
 const callbacks: Array<() => void> = []
 class DelayedImage { naturalWidth = 1200; naturalHeight = 800; onload?: () => void; set src(_value: string) { callbacks.push(() => this.onload?.()) } }
 vi.stubGlobal('Image', DelayedImage)
 render(<EditorProvider><ImageImportControl /><Probe /><ChangeDocument /></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'), { target: { files: [new File([png], 'slow.png', { type: 'image/png' })] } })
 fireEvent.click(screen.getByRole('button', {name:'导入'}))
 await waitFor(() => expect(callbacks).toHaveLength(1))
 fireEvent.click(screen.getByText('切换文档'))
 callbacks.shift()!()

 await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('640 × 480 · 1'))
 expect(screen.queryByText('导入 · slow.png')).not.toBeInTheDocument()
})

it('keeps canvas dimensions when requested and preserves one undoable import', async () => {
 class DecodedImage { naturalWidth=1200; naturalHeight=800; onload?:()=>void; set src(_value:string){queueMicrotask(()=>this.onload?.())} }
 vi.stubGlobal('Image', DecodedImage)
 render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'),{target:{files:[new File([png],'keep.png',{type:'image/png'})]}})
 fireEvent.change(screen.getByLabelText('导入尺寸'),{target:{value:'canvas'}})
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 1'))
 expect(screen.queryByRole('dialog',{name:'导入图片'})).not.toBeInTheDocument()
})

it('cancelling pending settings does not decode or change the document', () => {
 const image = vi.fn()
 vi.stubGlobal('Image',image)
 render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'),{target:{files:[new File([png],'cancel.png',{type:'image/png'})]}})
 fireEvent.click(screen.getByRole('button',{name:'关闭导入图片'}))
 expect(image).not.toHaveBeenCalled()
 expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 0')
})

it('reads a browser file once, without a preliminary Data URL read or second decode', async () => {
 const reads = vi.spyOn(FileReader.prototype, 'readAsArrayBuffer')
 const dataReads = vi.spyOn(FileReader.prototype, 'readAsDataURL')
 const decode = vi.fn()
 class DecodedImage { naturalWidth=1200; naturalHeight=800; onload?:()=>void; set src(_value:string){decode();queueMicrotask(()=>this.onload?.())} }
 vi.stubGlobal('Image', DecodedImage)
 render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'),{target:{files:[new File([png],'unknown.bin')]}})
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('1200 × 800 · 1'))
 expect(reads).toHaveBeenCalledTimes(1)
 expect(dataReads).not.toHaveBeenCalled()
 expect(decode).toHaveBeenCalledTimes(1)
})
it('rejects forged MIME and invalid dimensions without an undo entry', async()=>{
 class InvalidImage {naturalWidth=0;naturalHeight=800;onload?:()=>void;set src(_value:string){queueMicrotask(()=>this.onload?.())}}
 vi.stubGlobal('Image',InvalidImage)
 render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'),{target:{files:[new File(['not an image'],'fake.png',{type:'image/png'})]}})
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'导入'})).not.toBeDisabled())
 expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 0')
})

it('routes dropped HTML files through the same single-read compatibility settings', async()=>{
 class DecodedImage{naturalWidth=1200;naturalHeight=800;onload?:()=>void;set src(value:string){if(value)queueMicrotask(()=>this.onload?.())}}
 vi.stubGlobal('Image',DecodedImage)
 render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 const drop=new Event('drop',{bubbles:true,cancelable:true})
 Object.defineProperty(drop,'dataTransfer',{value:{files:[new File([png],'dropped.png')]}})
 fireEvent(window,drop)
 expect(drop.defaultPrevented).toBe(true)
 expect(screen.getByText('dropped.png')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('1200 × 800 · 1'))
})
it('cancels an active decode without applying its late result',async()=>{
 let finish:()=>void=()=>{}
 class DelayedImage{naturalWidth=1200;naturalHeight=800;onload?:()=>void;set src(value:string){if(value)finish=()=>this.onload?.()}}
 vi.stubGlobal('Image',DelayedImage)
 render(<EditorProvider><ImageImportControl/><Probe/></EditorProvider>)
 fireEvent.change(screen.getByLabelText('选择要导入的图片'),{target:{files:[new File([png],'cancel-active.png')]}})
 fireEvent.click(screen.getByRole('button',{name:'导入'}))
 await waitFor(()=>expect(screen.getByRole('button',{name:'正在导入…'})).toBeDisabled())
 fireEvent.click(screen.getByRole('button',{name:'关闭导入图片'}))
 finish()
 await new Promise(resolve=>setTimeout(resolve,20))
 expect(screen.getByRole('status')).toHaveTextContent('500 × 625 · 0')
})
