import { expect, it, vi } from 'vitest'
import { clipboardImage, readComposerImage } from './composerImage'

it('reads files and clipboard items without intercepting plain text', async () => {
  const file = new File(['png'], 'image.png', {type:'image/png'})
  expect(clipboardImage({files:[file], items:[]} as unknown as DataTransfer)).toBe(file)
  expect(clipboardImage({items:[{kind:'file',type:'image/png',getAsFile:()=>file}]} as unknown as DataTransfer)).toBe(file)
  expect(clipboardImage({files:[],items:[]} as unknown as DataTransfer)).toBeNull()
  expect(await readComposerImage(file)).toEqual({source:'data:image/png;base64,cG5n',name:'image.png'})
})

it('rejects unsupported and oversized attachments before reading', async () => {
  await expect(readComposerImage(new File(['gif'], 'x.gif', {type:'image/gif'}))).rejects.toThrow('PNG')
  await expect(readComposerImage(new File([new Uint8Array(8*1024*1024+1)], 'x.png', {type:'image/png'}))).rejects.toThrow('8MB')
})

it('converts JPEG and WebP to PNG before they reach multipart image APIs', async () => {
  const drawImage = vi.fn()
  const context = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({drawImage} as unknown as CanvasRenderingContext2D)
  const encode = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,cG5n')
  const original = globalThis.Image
  class DecodedImage {
    naturalWidth=20; naturalHeight=10; onload:(()=>void)|null=null
    set src(_source: string) { queueMicrotask(()=>this.onload?.()) }
  }
  vi.stubGlobal('Image', DecodedImage)
  try {
    for (const type of ['image/jpeg','image/webp']) expect((await readComposerImage(new File(['image'], 'reference', {type}))).source).toBe('data:image/png;base64,cG5n')
    expect(drawImage).toHaveBeenCalledTimes(2)
    expect(encode).toHaveBeenCalledWith('image/png')
  } finally { context.mockRestore(); encode.mockRestore(); vi.stubGlobal('Image', original) }
})
