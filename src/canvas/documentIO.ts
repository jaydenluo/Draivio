import type { SelectionRect } from './selectionGeometry'

export function serializeEditorSvg(svg: SVGSVGElement, cropRect?: SelectionRect | null): string {
  const clone = svg.cloneNode(true) as SVGSVGElement
  clone.querySelectorAll('[data-editor-overlay], .selection-geometry, .selection-overlay, .transform-overlay, .transform-actions, .mask-preview').forEach((node) => node.remove())
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('version', '1.1')
  const source = svg.viewBox.baseVal
  if (cropRect && cropRect.width > 0 && cropRect.height > 0) {
    const x = source.x + cropRect.x / 100 * source.width
    const y = source.y + cropRect.y / 100 * source.height
    const width = cropRect.width / 100 * source.width
    const height = cropRect.height / 100 * source.height
    clone.setAttribute('viewBox', `${x} ${y} ${width} ${height}`)
    clone.setAttribute('width', `${Math.round(width)}`)
    clone.setAttribute('height', `${Math.round(height)}`)
  } else {
    clone.setAttribute('width', `${source.width}`)
    clone.setAttribute('height', `${source.height}`)
  }
  return new XMLSerializer().serializeToString(clone)
}

export function isImageFile(file: File) { return file.type.startsWith('image/') }

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) { reject(new Error('请选择图片文件')); return }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('图片读取失败'))
    reader.onload = () => {
      const source = typeof reader.result === 'string' ? reader.result : ''
      if (!source) { reject(new Error('图片读取失败')); return }
      const image = new Image()
      image.onload = () => resolve(source)
      image.onerror = () => reject(new Error('图片文件无法解码'))
      image.src = source
    }
    reader.readAsDataURL(file)
  })
}

/** Decode natural pixel dimensions rather than CSS/display dimensions. */
export function readImageMetadata(source: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      const width = image.naturalWidth, height = image.naturalHeight
      if (![width, height].every((value) => Number.isInteger(value) && value > 0)) return reject(new Error('无法读取图片像素尺寸'))
      resolve({ width, height })
    }
    image.onerror = () => reject(new Error('图片文件无法解码'))
    image.src = source
  })
}
