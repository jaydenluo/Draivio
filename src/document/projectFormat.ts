import type { Layer } from '../state/editor'
import { initialEditorState, type EditorState } from '../state/editor'
import { requestImageData } from '../lib/http'
import { validateDocument, validateMetadata } from './projectValidation'

export const PROJECT_FORMAT = 'draivio'
export const PROJECT_SCHEMA_VERSION = 2

export type ProjectMetadata = { id: string; name: string; updatedAt?: string }
export type ProjectDocument = Partial<EditorState> & { documentWidth: number; documentHeight: number; layers: EditorState['layers'] }
type ProjectState = EditorState | ProjectDocument
type ProjectFile = { format: typeof PROJECT_FORMAT; schemaVersion: number; metadata: ProjectMetadata; assets: Record<string, string>; document: ProjectDocument }
type FetchAsset = (url: string) => Promise<string>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, child) => /^(apiKey|api_key|authorization|accessToken|refreshToken|password|credentials|secret)$/i.test(key) ? undefined : child)) as T
}

function isRemoteSource(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

const defaultFetchAsset: FetchAsset = requestImageData

function serializableDocument(state: ProjectState): ProjectDocument {
  const document = clone(state) as Partial<EditorState> & Record<string, unknown>
  delete document.activeTool
  delete document.activeToolGroup
  delete document.activeToolId
  delete document.recentToolByGroup
  delete document.toolOptions
  delete document.inspectorTab
  delete document.zoom
  delete document.selectedHistoryId
  delete document.historyTab
  delete document.historyCollapsed
  delete document.isGenerating
  delete document.composerPlacement
  delete document.composerMinimized
  delete document.notice
  delete document.brushColor
  delete document.recentColors
  delete document.canvasRotation
  delete document.canvasOffset
  delete document.undoStack
  delete document.redoStack
  delete document.apiKey
  if (Array.isArray(document.history)) document.history = document.history.map(({ id, label, tone }) => ({ id, label, tone }))
  const keys = ['documentWidth', 'documentHeight', 'documentBackground', 'layers', 'selectedLayerId', 'selectedLayerIds', 'aiResults', 'brushStrokes', 'canvasTexts', 'canvasShapes', 'layerMasks', 'selection', 'selectionRect', 'selectionVisible', 'cropRect', 'sceneOrder', 'prompt', 'composerMode', 'composerSourceId', 'composerParameters', 'history']
  return Object.fromEntries(keys.filter(key => key in document).map(key => [key, document[key]])) as ProjectDocument
}

/** Resource paths are part of the schema, never inferred from arbitrary strings. */
function imageFields(document: ProjectDocument) {
  type ResourceObject = { source?: string; thumbnail?: string; sourceImage?: string }
  type ResourceKey = keyof ResourceObject
  const fields: { item: ResourceObject; key: ResourceKey }[] = []
  const add = (item: ResourceObject | undefined, keys: ResourceKey[]) => {
    if (!item) return
    for (const key of keys) if (item[key] !== undefined) {
      if (typeof item[key] !== 'string') throw new Error('项目图片资源字段无效')
      fields.push({ item, key })
    }
  }
  const layer = (item: Layer) => { add(item, ['source', 'thumbnail']); add(item.aiOperation, ['sourceImage']) }
  document.layers.forEach(layer)
  for (const result of document.aiResults ?? []) {
    add(result, ['source', 'thumbnail'])
    add(result.request, ['sourceImage'])
    for (const adoption of result.adoptions ?? []) if (adoption.originalLayer) layer(adoption.originalLayer)
  }
  return fields
}

function inlineImage(source: unknown): source is string {
  if (typeof source !== 'string') return false
  const match = /^data:image\/(png|jpeg|webp|gif|avif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(source)
  if (!match) return false
  let bytes: string
  try { bytes = atob(match[2]) } catch { return false }
  const length = bytes.length
  if (match[1] === 'png') {
    if (length < 57 || bytes.slice(0, 8) !== '\x89PNG\r\n\x1a\n' || bytes.slice(12, 16) !== 'IHDR') return false
    // A complete chunk envelope is necessary; browser decoding below validates compressed pixels.
    let offset = 8, hasData = false
    while (offset + 12 <= length) {
      const size = ((bytes.charCodeAt(offset) * 0x1000000) + (bytes.charCodeAt(offset + 1) << 16) + (bytes.charCodeAt(offset + 2) << 8) + bytes.charCodeAt(offset + 3))
      if (size > length - offset - 12) return false
      const type = bytes.slice(offset + 4, offset + 8)
      if (type === 'IDAT') hasData = true
      offset += size + 12
      if (type === 'IEND') return hasData && size === 0 && offset === length
    }
    return false
  }
  if (match[1] === 'jpeg') return length > 4 && bytes.startsWith('\xff\xd8\xff') && bytes.endsWith('\xff\xd9')
  if (match[1] === 'gif') return length > 13 && /^GIF8[79]a/.test(bytes) && bytes.endsWith(';')
  if (match[1] === 'webp') return length > 20 && bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP'
  return length > 20 && bytes.slice(4, 8) === 'ftyp' && /avif|avis/.test(bytes.slice(8, 32))
}
function cleanMetadata(metadata: ProjectMetadata): ProjectMetadata {
  return { id: metadata.id, name: metadata.name, ...(metadata.updatedAt !== undefined ? { updatedAt: metadata.updatedAt } : {}) }
}

/** Native browser decoding is the final gate before replacing any current document. */
export async function validateProjectImages(document: ProjectDocument): Promise<void> {
  const sources = new Set(imageFields(document).map(({ item, key }) => item[key]!).filter(source => source !== 'fixture'))
  for (const source of sources) {
    if (!inlineImage(source)) throw new Error('项目图片资源损坏或类型不匹配，当前作品已保留')
    const image = new Image()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          image.onload = () => image.naturalWidth > 0 && image.naturalHeight > 0 && image.naturalWidth * image.naturalHeight <= 32 * 1024 * 1024 ? resolve() : reject(new Error('项目图片尺寸无效或超过32百万像素'))
          image.onerror = () => reject(new Error('项目图片解码失败，当前作品已保留'))
          image.src = source
        }),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('项目图片解码超时，当前作品已保留')), 15000) }),
      ])
    } finally { if (timer) clearTimeout(timer); image.onload = null; image.onerror = null; image.src = '' }
  }
}
async function materializeSources(document: ProjectDocument, assets: Record<string, string>, fetchAsset: FetchAsset) {
  const sources = new Map<string, string>(), downloads = new Map<string, string>()
  for (const { item, key } of imageFields(document)) {
    let source = item[key]!
    if (source === 'fixture') continue // Built-in deterministic artwork, available offline.
    if (source.startsWith('blob:')) throw new Error('临时 blob 图片无法持久保存，请重新导入图片后保存')
    if (isRemoteSource(source)) {
      if (!downloads.has(source)) downloads.set(source, await fetchAsset(source))
      source = downloads.get(source)!
    }
    if (!inlineImage(source)) throw new Error('项目图片资源格式无效，必须为可内嵌图片')
    let id = sources.get(source)
    if (!id) { id = `image-${Object.keys(assets).length + 1}`; sources.set(source, id); assets[id] = source }
    item[key] = `asset:${id}`
  }
  return document
}
function restoreSources(document: ProjectDocument, assets: Record<string, string>) {
  for (const { item, key } of imageFields(document)) {
    const source = item[key]!
    if (source === 'fixture') continue
    if (!source.startsWith('asset:')) throw new Error('项目图片未内嵌，无法离线恢复')
    const id = source.slice(6)
    if (!Object.hasOwn(assets, id)) throw new Error(`项目资源缺失：${id}`)
    item[key] = assets[id]
  }
  return document
}

export async function encodeProject(state: ProjectState, metadata: ProjectMetadata, fetchAsset: FetchAsset = defaultFetchAsset): Promise<string> {
  const assets: Record<string, string> = {}
  validateMetadata(metadata)
  const snapshot = serializableDocument(state)
  validateDocument(snapshot)
  const document = await materializeSources(snapshot, assets, fetchAsset)
  const file: ProjectFile = { format: PROJECT_FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, metadata: { ...cleanMetadata(metadata), updatedAt: metadata.updatedAt ?? new Date().toISOString() }, assets, document }
  return JSON.stringify(file)
}

export function decodeProject(serialized: string): { metadata: ProjectMetadata; document: ProjectDocument } {
  if (serialized.length > 256 * 1024 * 1024) throw new Error('项目文件超过 256MB')
  let raw: ProjectFile
  try { raw = JSON.parse(serialized) as ProjectFile } catch { throw new Error('无法读取项目文件：JSON 损坏') }
  if (!raw || typeof raw !== 'object' || raw.format !== PROJECT_FORMAT) throw new Error('无法读取项目文件：格式不受支持')
  if (raw.schemaVersion > PROJECT_SCHEMA_VERSION) throw new Error('无法读取项目文件：需要更新版本')
  if (raw.schemaVersion !== 1 && raw.schemaVersion !== PROJECT_SCHEMA_VERSION) throw new Error('无法读取项目文件：schema 版本不受支持')
  validateMetadata(raw.metadata)
  if (raw.schemaVersion === 1) {
    const legacy = { ...serializableDocument(initialEditorState), ...raw.document }
    validateDocument(legacy)
    for (const { item, key } of imageFields(legacy)) if (item[key] !== 'fixture' && !inlineImage(item[key])) throw new Error('旧版项目图片未内嵌，无法离线恢复')
    return { metadata: cleanMetadata(raw.metadata), document: legacy }
  }
  validateDocument(raw.document)
  if (!raw.assets || typeof raw.assets !== 'object' || Array.isArray(raw.assets)) throw new Error('无法读取项目文件：资源索引无效')
  if (Object.keys(raw.assets).length > 20000) throw new Error('项目资源条目数过多')
  for (const [id, source] of Object.entries(raw.assets)) if (!/^image-[1-9][0-9]*$/.test(id) || !inlineImage(source)) throw new Error(`项目资源索引无效：${id}`)
  const document = restoreSources(raw.document, raw.assets)
  return { metadata: cleanMetadata(raw.metadata), document }
}

export function projectFingerprint(state: ProjectState): string {
  const document = serializableDocument(state)
  // History IDs and labels belong to this editing session, not the saved artwork.
  delete document.history
  return JSON.stringify(document)
}
