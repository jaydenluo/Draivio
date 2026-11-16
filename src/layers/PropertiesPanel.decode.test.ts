import { expect, it, vi } from 'vitest'
import { decodeSource } from './PropertiesPanel'

it('draws the decoded image before reading pixels', async () => {
 const previous = globalThis.Image
 const drawImage = vi.fn()
 const pixels = new Uint8ClampedArray([128, 64, 32, 255])
 vi.stubGlobal('Image', class { naturalWidth=1; naturalHeight=1; onload?:()=>void; onerror?:()=>void; set src(_: string) { queueMicrotask(() => this.onload?.()) } } as unknown as typeof Image)
 const oldCreate = document.createElement.bind(document)
 vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
   if (tag === 'canvas') return { width: 0, height: 0, getContext: () => ({ drawImage, getImageData: () => ({ data: pixels }) }) } as unknown as HTMLElement
   return oldCreate(tag)
 }) as typeof document.createElement)
 await expect(decodeSource('data:image/png;base64,fixture')).resolves.toEqual({ pixels, width: 1, height: 1 })
 expect(drawImage).toHaveBeenCalledTimes(1)
 vi.restoreAllMocks(); vi.stubGlobal('Image', previous)
})
