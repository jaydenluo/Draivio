import type { EditorState } from '../state/editor'
import {
  serializableDocument,
  restoreProjectProfileBytes,
  validateProjectDocument,
  type ProjectMetadata,
  type ProjectDocument,
} from './projectFormat'
import {
  collectRasterReferences,
  validateRasterReference,
} from '../assets/imageAssetStore'
import type { RasterReference } from '../assets/imageAssetTypes'
export type ContainerAsset = {
  reference: RasterReference
  originalHash: string
  byteLength: number
  metadata: { format: string }
}
export type ProjectSource = { hash: string; byteLength: number; mime: string }
export type ContainerRequest = {
  metadata: ProjectMetadata
  document: ProjectDocument
  references: RasterReference[]
  workingDiffs: string[]
  legacySources: string[]
}
export type NativeContainer = {
  format: string
  schemaVersion: number
  metadata: ProjectMetadata
  document: ProjectDocument
  assets: ContainerAsset[]
  workingDiffs: string[]
  legacySources: Record<string, string>
  ownerId: string
}

const RESOURCE_KEYS = new Set([
  'source',
  'thumbnail',
  'previewSource',
  'dataUrl',
])
const MAX_LEGACY_BYTES = 16 * 1024 * 1024
const HASH = /^[0-9a-f]{64}$/
function byteLength(source: string) {
  const payload = source.slice(source.indexOf(',') + 1)
  return (
    Math.ceil((payload.length * 3) / 4) -
    (payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0)
  )
}
function isSource(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^(data:image\/|blob:|https?:\/\/)/i.test(value)
  )
}
function walk(
  value: unknown,
  visit: (record: Record<string, unknown>, key: string, child: unknown) => void,
  depth = 0,
): void {
  if (depth > 64) throw new Error('项目结构嵌套超过限制')
  if (!value || typeof value !== 'object' || ArrayBuffer.isView(value)) return
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v === 'number')) return
    for (const v of value) walk(v, visit, depth + 1)
    return
  }
  const record = value as Record<string, unknown>
  for (const [key, child] of Object.entries(record)) {
    visit(record, key, child)
    walk(record[key], visit, depth + 1)
  }
}
export async function fetchLegacyProjectSource(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error('旧项目资源下载失败')
  if (
    Number(response.headers.get('content-length')) > MAX_LEGACY_BYTES ||
    !response.body
  )
    throw new Error('旧资源迁移超过 16 MiB 兼容预算')
  const reader = response.body.getReader(),
    chunks: Uint8Array<ArrayBuffer>[] = [],
    mime = response.headers.get('content-type')?.split(';')[0] ?? 'image/png'
  let bytes = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_LEGACY_BYTES)
        throw new Error('旧资源迁移超过 16 MiB 兼容预算')
      chunks.push(new Uint8Array(value))
    }
  } finally {
    await reader.cancel()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('旧资源读取失败'))
    reader.readAsDataURL(new Blob(chunks, { type: mime }))
  })
}
export async function prepareProjectContainer(
  state: EditorState,
  metadata: ProjectMetadata,
  options: {
    ownerId: string
    registerInline: (source: string, ownerId: string) => Promise<ProjectSource>
    fetchSource?: (url: string) => Promise<string>
  },
): Promise<ContainerRequest> {
  // The existing serializer excludes undo/redo and budgets precision data before
  // cloning. The native manifest contains only the document frozen at this call.
  const document = serializableDocument(state)
  walk(document, (record) => {
    if (record.rasterRef !== undefined) {
      validateRasterReference(record.rasterRef)
      for (const key of RESOURCE_KEYS) delete record[key]
    }
  })
  const sources = new Set<string>()
  walk(document, (_record, key, child) => {
    if (RESOURCE_KEYS.has(key) && isSource(child)) sources.add(child)
  })
  const portable = new Map<string, string>()
  let bytes = 0
  for (const source of sources) {
    const data = source.startsWith('data:')
      ? source
      : await (options.fetchSource ?? fetchLegacyProjectSource)(source)
    if (
      !/^data:image\/(png|jpeg|tiff|webp|gif|svg\+xml|bmp|avif|x-icon|vnd\.microsoft\.icon);base64,/i.test(
        data,
      )
    )
      throw new Error('v4 旧资源类型尚不支持，请保留旧项目')
    bytes += byteLength(data)
    if (bytes > MAX_LEGACY_BYTES)
      throw new Error(
        '旧资源迁移超过 16 MiB 兼容预算；大图必须使用持久原件引用',
      )
    portable.set(source, data)
  }
  const legacySources: string[] = [],
    sourceIds = new Map<string, string>(),
    registered = new Map<string, ProjectSource>()
  for (const [source, data] of portable) {
    let asset = registered.get(data)
    if (!asset) {
      asset = await options.registerInline(data, options.ownerId)
      if (
        !HASH.test(asset.hash) ||
        !Number.isSafeInteger(asset.byteLength) ||
        asset.byteLength < 1 ||
        asset.byteLength > MAX_LEGACY_BYTES
      )
        throw new Error('原生旧资源迁移结果无效')
      registered.set(data, asset)
    }
    if (!legacySources.includes(asset.hash)) legacySources.push(asset.hash)
    sourceIds.set(source, `project-source:${asset.hash}`)
  }
  walk(document, (record, key, child) => {
    if (
      RESOURCE_KEYS.has(key) &&
      typeof child === 'string' &&
      sourceIds.has(child)
    )
      record[key] = sourceIds.get(child)
  })
  validateProjectDocument(document, true)
  const references = collectRasterReferences(document)
  const workingDiffs = new Set<string>()
  walk(document, (_record, key, child) => {
    if (key === 'workingDiffHash') {
      if (typeof child !== 'string' || !HASH.test(child))
        throw new Error('项目差分引用无效')
      workingDiffs.add(child)
    }
    if (key === 'workingDiffs') {
      if (
        !Array.isArray(child) ||
        child.some((h) => typeof h !== 'string' || !HASH.test(h))
      )
        throw new Error('项目差分引用无效')
      for (const h of child) workingDiffs.add(h)
    }
  })
  const request = {
    metadata,
    document,
    references,
    workingDiffs: [...workingDiffs],
    legacySources,
  }
  if (
    new TextEncoder().encode(JSON.stringify(request)).byteLength >
    8 * 1024 * 1024
  )
    throw new Error(
      '项目清单超过 8 MiB；未迁移的精度或编辑数据需要原生差分资源',
    )
  return request
}
export function decodeProjectContainer(container: NativeContainer): {
  metadata: ProjectMetadata
  document: ProjectDocument
} {
  if (container.format !== 'draivio' || container.schemaVersion !== 4)
    throw new Error('项目容器版本不受支持，请更新应用')
  if (
    !container.metadata ||
    typeof container.metadata.id !== 'string' ||
    !container.metadata.id ||
    typeof container.metadata.name !== 'string' ||
    !container.metadata.name ||
    !Array.isArray(container.assets) ||
    container.assets.length > 4096 ||
    typeof container.ownerId !== 'string'
  )
    throw new Error('项目清单结构无效')
  const document = structuredClone(container.document),
    refs = collectRasterReferences(document),
    assets = new Map<string, ContainerAsset>()
  for (const asset of container.assets) {
    validateRasterReference(asset.reference)
    const key = `${asset.reference.assetId}:${asset.reference.revision}`
    if (assets.has(key) || !HASH.test(asset.originalHash))
      throw new Error('项目原件索引无效')
    assets.set(key, asset)
  }
  const required = new Set(refs.map((r) => `${r.assetId}:${r.revision}`))
  let bytes = 0
  walk(document, (record, key, child) => {
    if (typeof child !== 'string') return
    if (child.startsWith('project-source:')) {
      const hash = child.slice(15),
        source = container.legacySources?.[hash]
      if (
        !RESOURCE_KEYS.has(key) ||
        !HASH.test(hash) ||
        !source ||
        !/^data:image\/[^;]+;base64,/i.test(source)
      )
        throw new Error('旧项目资源缺失')
      record[key] = source
    } else if (
      child.startsWith('blob:') ||
      child.includes('draivio-image.localhost') ||
      child.includes('draivio-image:')
    )
      throw new Error('项目包含运行时显示资源')
  })
  for (const source of new Set(Object.values(container.legacySources ?? {}))) {
    bytes += byteLength(source)
    if (bytes > MAX_LEGACY_BYTES) throw new Error('旧资源超过 16 MiB 兼容预算')
  }
  if (
    required.size !== assets.size ||
    [...required].some((key) => !assets.has(key))
  )
    throw new Error('项目原件缺失或存在多余资源')
  validateProjectDocument(document, true)
  restoreProjectProfileBytes(document)
  return { metadata: container.metadata, document }
}
