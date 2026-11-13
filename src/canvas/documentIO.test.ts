import { expect, test, vi } from 'vitest'
import { isImageFile, readImageFile, serializeEditorSvg } from './documentIO'

test('serializes a complete SVG and crops by percentage without editor overlays', () => {
  document.body.innerHTML = '<svg class="canvas-art" viewBox="0 0 500 625"><g data-layer-id="art"><rect width="500" height="625" fill="red"/></g><g data-editor-overlay="true"><rect fill="blue"/></g></svg>'
  const svg = document.querySelector('svg')!
  const output = serializeEditorSvg(svg, { x: 10, y: 20, width: 50, height: 40 })
  expect(output).toContain('xmlns="http://www.w3.org/2000/svg"')
  expect(output).toContain('viewBox="50 125 250 250"')
  expect(output).toContain('width="250"')
  expect(output).not.toContain('data-editor-overlay')
  expect(output).toContain('fill="red"')
})

test('reads image data only after the browser confirms it can decode the file', async () => {
  expect(isImageFile(new File(['x'], 'a.png', { type: 'image/png' }))).toBe(true)
  expect(isImageFile(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBe(false)
  class MockImage { static next = true; onload?: () => void; onerror?: () => void; set src(value: string) { queueMicrotask(() => MockImage.next ? this.onload?.() : this.onerror?.()) } }
  vi.stubGlobal('Image', MockImage)
  const source = await readImageFile(new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' }))
  expect(source).toMatch(/^data:image\/png;base64,/) 
  MockImage.next = false
  await expect(readImageFile(new File(['bad'], 'bad.png', { type: 'image/png' }))).rejects.toThrow('无法解码')
})
