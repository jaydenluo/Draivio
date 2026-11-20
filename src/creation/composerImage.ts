export type ComposerImage = { source: string; name: string }
const MAX_IMAGE_BYTES = 8 * 1024 * 1024

export function clipboardImage(data: Pick<DataTransfer, 'files' | 'items'>): File | null {
  return Array.from(data.files ?? []).find(file => file.type.startsWith('image/'))
    ?? Array.from(data.items ?? []).find(item => item.kind === 'file' && item.type.startsWith('image/'))?.getAsFile()
    ?? null
}

export async function readComposerImage(file: File): Promise<ComposerImage> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('请选择 PNG、JPEG 或 WebP 图片')
  if (!file.size || file.size > MAX_IMAGE_BYTES) throw new Error('图片大小需在 8MB 以内')
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('图片读取失败，请重新添加'))
    reader.onerror = () => reject(new Error('图片读取失败，请重新添加'))
    reader.readAsDataURL(file)
  })
  // Image edit APIs require PNG file parts; keep the preview and transmitted image identical.
  if (file.type === 'image/png') return { source, name: file.name || '粘贴的图片.png' }
  const png = await new Promise<string>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      try {
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，请缩小后重试')
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')
        if (!context) throw new Error('无法处理图片，请重新添加')
        context.drawImage(image, 0, 0)
        const result = canvas.toDataURL('image/png')
        if (!result.startsWith('data:image/png;base64,') || result.length > 12 * 1024 * 1024) throw new Error('图片转换后过大，请缩小后重试')
        resolve(result)
      } catch (error) { reject(error) }
    }
    image.onerror = () => reject(new Error('无法识别图片，请重新添加'))
    image.src = source
  })
  return { source: png, name: file.name || '粘贴的图片.png' }
}
