export type ModelKind = 'cutout' | 'upscale'
export type ModelId = 'u2net' | 'u2netp' | 'rmbg-2.0' | 'realesrgan-x4plus' | 'realesrgan-anime'

export type ModelDescriptor = {
  id: ModelId
  kind: ModelKind
  name: string
  description: string
  version: string
  sizeBytes: number
  requiredBytes: number
  sha256: string
  urls: string[]
  licenseUrl: string
}

const model = (descriptor: ModelDescriptor) => descriptor

export const MODEL_CATALOG: readonly ModelDescriptor[] = [
  model({ id: 'u2net', kind: 'cutout', name: 'U2Net', description: '通用扣图，适合人像和商品图。', version: '1.0', sizeBytes: 176_000_000, requiredBytes: 220_000_000, sha256: '', urls: [], licenseUrl: 'https://github.com/xuebinqin/U-2-Net' }),
  model({ id: 'u2netp', kind: 'cutout', name: 'U2Netp', description: '轻量扣图，适合快速预览。', version: '1.0', sizeBytes: 5_000_000, requiredBytes: 8_000_000, sha256: '', urls: [], licenseUrl: 'https://github.com/xuebinqin/U-2-Net' }),
  model({ id: 'rmbg-2.0', kind: 'cutout', name: 'RMBG-2.0', description: '高质量扣图，发丝和商品边缘更细致。', version: '2.0', sizeBytes: 1_100_000_000, requiredBytes: 1_250_000_000, sha256: '', urls: [], licenseUrl: 'https://huggingface.co/briaai/RMBG-2.0' }),
  model({ id: 'realesrgan-x4plus', kind: 'upscale', name: 'Real-ESRGAN x4plus', description: '通用照片 4 倍超分。', version: '1.0', sizeBytes: 65_000_000, requiredBytes: 90_000_000, sha256: '', urls: [], licenseUrl: 'https://github.com/xinntao/Real-ESRGAN' }),
  model({ id: 'realesrgan-anime', kind: 'upscale', name: 'Real-ESRGAN anime', description: '插画和动漫图像超分。', version: '1.0', sizeBytes: 18_000_000, requiredBytes: 30_000_000, sha256: '', urls: [], licenseUrl: 'https://github.com/xinntao/Real-ESRGAN' }),
]

export function getModel(modelId: ModelId): ModelDescriptor { return MODEL_CATALOG.find((item) => item.id === modelId) ?? MODEL_CATALOG[0] }
export function modelsForKind(kind: ModelKind): readonly ModelDescriptor[] { return MODEL_CATALOG.filter((item) => item.kind === kind) }
export function formatBytes(bytes: number): string { if (bytes >= 1_000_000_000) return `${(bytes / 1_000_000_000).toFixed(1)} GB`; return `${Math.max(1, Math.round(bytes / 1_000_000))} MB` }
