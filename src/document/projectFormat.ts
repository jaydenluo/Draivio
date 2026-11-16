import { validateRawSourceRecord } from '../raw/rawPipeline'
import { validateProductRecord } from '../ai/recipes/product'
import { contentRevision, contextCanCommit } from '../ai/context/editorContext'
import { redactProjectCredentials, validateAIRecovery } from '../ai/persistence/editRecord'
import { validateCmykRaster } from '../color/cmykRaster'
import { validateSavedRecipes } from '../ai/recipes/runner'
import { validateConversationRuns } from '../ai/conversation/session'
import { validatePrecisionAsset } from '../render/precisionAsset'
import { validateSmartFilters } from '../render/filterPipeline'
import { validateDocument as validateDocumentSchema } from './projectValidation'
import { normalizePreset } from '../adjustments/presets'
import { resolveBlendMode } from '../render/blendModes'
import { validateClipping } from '../state/clipping'
import { defaultGuideSettings, validateGuideSettings } from './guides'
import { normalizeColorManagement } from '../color/iccPipeline'
import { validateSoftProofSettings, type SoftProofSettings } from '../color/softProof'
import type { CmykProfile } from '../color/cmykDocument'
import type { EditorState } from '../state/editor'
import { smartObjectState, validateSmartObjectGraph, type SmartObjectSource } from './smartObjects'
import { validateGeometryCommand } from '../ai/tools/geometryTools'

export const PROJECT_FORMAT = 'draivio'
export const PROJECT_SCHEMA_VERSION = 3

export type ProjectMetadata = { id: string; name: string; updatedAt?: string }
export type ProjectDocument = Partial<EditorState> & { documentWidth: number; documentHeight: number; layers: EditorState['layers']; colorModel?: 'rgb' | 'cmyk'; cmykProfile?: CmykProfile }
type ProjectState = EditorState | ProjectDocument
type ProjectFile = { format: typeof PROJECT_FORMAT; schemaVersion: number; metadata: ProjectMetadata; assets: Record<string, string>; document: ProjectDocument }
type FetchAsset = (url: string) => Promise<string>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isRemoteSource(value: unknown): value is string {
  return typeof value === 'string' && /^https?:\/\//i.test(value)
}

function isImageSource(value: unknown): value is string {
  return typeof value === 'string' && (/^data:image\//i.test(value) || /^blob:/i.test(value) || isRemoteSource(value))
}

async function defaultFetchAsset(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`资源下载失败：${response.status}`)
  if (Number(response.headers.get('content-length')) > 64 * 1024 * 1024) throw new Error('项目图片资源超过内存预算')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > 64 * 1024 * 1024) throw new Error('项目图片资源超过内存预算')
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  const type = response.headers.get('content-type') || 'image/png'
  return `data:${type};base64,${btoa(binary)}`
}

/** Preflight before JSON clones: reserve original/working samples and eight string
 * copies for JSON materialization, parser, resource walk and IPC. Excluded undo/
 * redo stacks are removed before this walk and are never serialized temporarily. */
export function assertPrecisionProjectBudget(value: unknown) {
  let rawBytes = 0, stringUnits = 0
  const walk = (item: unknown, key = '') => {
    if (typeof item === 'string') { stringUnits += item.length; return }
    if (!item || typeof item !== 'object') return
    if (key === 'highPrecision') {
      const asset = item as {width:number;height:number;format:string}
      rawBytes += asset.width * asset.height * 4 * (asset.format === 'rgba16' ? 2 : 4)
    }
    if (key === 'rawSource' && Array.isArray((item as { bytes?: unknown }).bytes)) {
      validateRawSourceRecord(item)
      rawBytes += item.bytes.length
      walk(item.metadata); walk(item.settings); walk(item.checksum)
      return
    }
    for (const field in item) walk((item as Record<string,unknown>)[field], field)
  }
  walk(value)
  if (!Number.isFinite(rawBytes) || rawBytes * 4 + stringUnits * 8 > 512 * 1024 * 1024) throw new Error('高精度项目序列化超出 512 MiB 保守内存预算；原始资源保留')
}

function serializableDocument(state: ProjectState): ProjectDocument {
  const document = { ...state } as Partial<EditorState> & Record<string, unknown>
  if (state.colorManagement) document.colorManagement = { ...state.colorManagement, profile: { ...state.colorManagement.profile, bytes: Array.from(state.colorManagement.profile.bytes) as unknown as Uint8Array } }
  if (state.proofSettings?.targetProfile) document.proofSettings = { ...state.proofSettings, targetProfile: { ...state.proofSettings.targetProfile, bytes: Array.from(state.proofSettings.targetProfile.bytes) as unknown as Uint8Array } }
  const cmykProfile = document.cmykProfile as CmykProfile | undefined
  if (cmykProfile && cmykProfile.iccBytes instanceof Uint8Array) document.cmykProfile = { ...cmykProfile, iccBytes: Array.from(cmykProfile.iccBytes) as unknown as Uint8Array }
  delete document.curvePreviewOffLayerId
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
  if (state.isGenerating) document.aiRecovery = { status: 'interrupted', model: state.composerParameters?.model ?? '', sourceId: state.composerSourceId ?? '' }
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
  assertPrecisionProjectBudget(document)
  return redactProjectCredentials(clone(document)) as ProjectDocument
}

const RESOURCE_KEYS = new Set(['source', 'thumbnail', 'previewSource', 'dataUrl'])
async function materializeSources(value: unknown, assets: Record<string, string>, sourceMap: Map<string, string>, fetchAsset: FetchAsset, resourceField = false): Promise<unknown> {
  if (Array.isArray(value) && value.every(item => typeof item === 'number')) return value.slice()
  if (Array.isArray(value)) return Promise.all(value.map((item) => materializeSources(item, assets, sourceMap, fetchAsset, resourceField)))
  if (!value || typeof value !== 'object') {
    if (!resourceField || !isImageSource(value)) return value
    const source = isRemoteSource(value) || /^blob:/i.test(value) ? await fetchAsset(value) : value
    if (!/^data:image\//i.test(source)) throw new Error('项目图片资源未能下载为离线数据')
    const existing = sourceMap.get(source)
    if (existing) return `asset:${existing}`
    const id = `image-${Object.keys(assets).length + 1}`
    sourceMap.set(source, id); assets[id] = source
    return `asset:${id}`
  }
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) output[key] = await materializeSources(child, assets, sourceMap, fetchAsset, RESOURCE_KEYS.has(key))
  return output
}

function restoreSources(value: unknown, assets: Record<string, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => restoreSources(item, assets))
  if (typeof value === 'string' && value.startsWith('asset:')) {
    const id = value.slice('asset:'.length)
    if (!assets[id]) throw new Error(`项目资源缺失：${id}`)
    return assets[id]
  }
  if (!value || typeof value !== 'object') return value
  const output: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) output[key] = restoreSources(child, assets)
  return output
}

function restoreProofBytes(settings: SoftProofSettings): SoftProofSettings {
  const target = settings?.targetProfile
  if (!target || !Array.isArray(target.bytes)) return settings
  if (target.bytes.length > 16 * 1024 * 1024 || target.bytes.some(byte => typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('软打样 ICC 字节无效')
  return { ...settings, targetProfile: { ...target, bytes: new Uint8Array(target.bytes) } }
}

function validateDocument(document: ProjectDocument) {
  if (!document || !Array.isArray(document.layers)) throw new Error('项目文档结构无效')
  if (document.pixelFormat !== undefined && !['rgba8', 'rgba16', 'rgba32f'].includes(document.pixelFormat)) throw new Error('项目文档结构无效：pixelFormat')
  if (document.colorModel !== undefined && !['rgb', 'cmyk'].includes(document.colorModel)) throw new Error('项目文档结构无效：colorModel')
  if (document.proofSettings !== undefined) validateSoftProofSettings(restoreProofBytes(document.proofSettings))
  if (document.cmykProfile !== undefined) {
    const profile = document.cmykProfile
    if (!profile || typeof profile.id !== 'string' || !profile.id || !Number.isFinite(profile.totalInkLimit) || profile.totalInkLimit <= 0 || profile.totalInkLimit > 4) throw new Error('项目文档结构无效：cmykProfile')
    if (profile.iccBytes !== undefined && !Array.isArray(profile.iccBytes) && !(profile.iccBytes instanceof Uint8Array)) throw new Error('项目文档结构无效：cmykProfile.iccBytes')
  }
  if (document.adjustmentPresets !== undefined) { if (!Array.isArray(document.adjustmentPresets) || document.adjustmentPresets.length > 100) throw new Error('项目预设无效'); document.adjustmentPresets = document.adjustmentPresets.map((preset) => normalizePreset(preset)) as unknown as Array<Record<string, unknown>> }
  if (document.cmykRaster !== undefined) { validateCmykRaster(document.cmykRaster); if (document.cmykRaster.sourceDocument) validateDocument(document.cmykRaster.sourceDocument as ProjectDocument) }
  if (document.colorModel === 'cmyk' && !document.cmykRaster) throw new Error('CMYK 文档缺少原始四通道像素')
  if (document.aiRecovery !== undefined) validateAIRecovery(document.aiRecovery)
  if (document.savedRecipes !== undefined) validateSavedRecipes(document.savedRecipes)
  if (document.conversationRuns !== undefined) validateConversationRuns(document.conversationRuns)
  const ids = new Set<string>()
  for (const layer of document.layers) {
    if (!layer.id || ids.has(layer.id)) throw new Error(`项目图层 ID 重复：${layer.id || '空值'}`)
    ids.add(layer.id)
    if (layer.productRecipe !== undefined) validateProductRecord(layer.productRecipe)
    if (layer.highPrecision !== undefined) validatePrecisionAsset(layer.highPrecision)
    if (layer.rawSource !== undefined) validateRawSourceRecord(layer.rawSource)
    resolveBlendMode(layer.blendMode)
    if (layer.smartFilters !== undefined) validateSmartFilters(layer.smartFilters)
    if (layer.warpRecipe !== undefined) { const recipe = layer.warpRecipe; if (recipe.kind === 'perspective') validateGeometryCommand({ op: 'geometry', kind: 'perspective', quad: recipe.quad }); else if (recipe.kind === 'radial') validateGeometryCommand({ op: 'geometry', kind: 'radial', distortion: recipe.distortion, center: recipe.center }); else if (recipe.kind === 'mesh') validateGeometryCommand({ op: 'geometry', kind: 'mesh', controls: recipe.controls }); else throw new Error('项目形变方案类型无效') }
    if(layer.clipBaseId!==undefined && (typeof layer.clipBaseId!=='string'||!layer.clipBaseId))throw new Error('剪贴基底ID无效')
  }
  validateClipping(document.layers)
  const sources = (document as ProjectDocument & { smartObjectSources?: Record<string, SmartObjectSource> }).smartObjectSources
  if (sources !== undefined || document.layers.some(layer => layer.smartObject)) {
    if (!sources || typeof sources !== 'object' || Array.isArray(sources) || Object.keys(sources).length > 1000) throw new Error('智能对象源索引无效')
    for (const layer of document.layers) {
      if (!layer.smartObject) continue
      const source = sources[layer.smartObject.sourceId]
      if (!source) throw new Error(`项目智能对象源缺失：${layer.smartObject.sourceId}`)
      validateSmartObjectGraph(sources, source.id)
    }
    for (const sourceId of Object.keys(sources)) {
      validateSmartObjectGraph(sources, sourceId)
      const source = sources[sourceId]
      if (source.document) validateDocumentSchema({ ...smartObjectState(document as EditorState, source), smartObjectSources: undefined })
    }
  }
}

export async function encodeProject(state: ProjectState, metadata: ProjectMetadata, fetchAsset: FetchAsset = defaultFetchAsset): Promise<string> {
  const sources = state.smartObjectSources
  if (sources) for (const sourceId of Object.keys(sources)) validateSmartObjectGraph(sources, sourceId)
  const assets: Record<string, string> = {}
  const downloads = new Map<string, Promise<string>>()
  const materialize = (url: string) => {
    let pending = downloads.get(url)
    if (!pending) { pending = Promise.resolve().then(() => fetchAsset(url)); downloads.set(url, pending) }
    return pending
  }
  const document = await materializeSources(serializableDocument(state), assets, new Map(), materialize) as ProjectDocument
  assertPrecisionProjectBudget({ document, assets })
  // Re-encoding resources changes byte identity without changing the artwork.
  // Refresh only candidates whose captured context was valid before saving;
  // stale candidates must remain stale after a round trip.
  const offline = restoreSources(document, assets) as EditorState
  for (const result of document.aiResults ?? []) {
    const context = result.request?.context
    const original = state.aiResults?.find(item => item.id === result.id)?.request?.context
    if (!context || !original || !contextCanCommit(state as EditorState, original)) continue
    const revision = contentRevision(offline, context.requestId)
    context.revision = revision
    for (const layer of document.layers) if (layer.aiOperation?.context?.requestId === context.requestId) layer.aiOperation.context.revision = revision
  }
  validateDocument(document)
  const file: ProjectFile = { format: PROJECT_FORMAT, schemaVersion: PROJECT_SCHEMA_VERSION, metadata: { ...redactProjectCredentials(metadata), updatedAt: metadata.updatedAt ?? new Date().toISOString() }, assets, document }
  return JSON.stringify(file)
}

export function decodeProject(serialized: string): { metadata: ProjectMetadata; document: ProjectDocument } {
  if (serialized.length * 8 > 512 * 1024 * 1024) throw new Error('项目解析超出 512 MiB 保守内存预算')
  let raw: ProjectFile & { document?: ProjectDocument }
  try { raw = JSON.parse(serialized) as ProjectFile & { document?: ProjectDocument } } catch { throw new Error('无法读取项目文件：JSON 损坏') }
  assertPrecisionProjectBudget(raw)
  raw = redactProjectCredentials(raw)
  if (raw.format !== PROJECT_FORMAT) throw new Error('无法读取项目文件：格式不受支持')
  if (!Number.isInteger(raw.schemaVersion) || raw.schemaVersion < 1) throw new Error('无法读取项目文件：格式版本无效')
  if (raw.schemaVersion > PROJECT_SCHEMA_VERSION) throw new Error('无法读取项目文件：需要更新版本')
  if (raw.schemaVersion === 1) {
    const legacy = clone(raw.document ?? {}) as ProjectDocument
    // Early JSON snapshots encoded Uint8Array as a numeric-key object.
    // Migrate only contiguous bounded byte keys; retain checksum validation.
    const profile = legacy.colorManagement?.profile
    if (profile && profile.bytes && !Array.isArray(profile.bytes) && !(profile.bytes instanceof Uint8Array)) {
      const entries = Object.entries(profile.bytes)
      if (entries.length > 4 * 1024 * 1024 || entries.some(([key, byte], index) => key !== String(index) || typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255)) throw new Error('ICC 字节数据无效')
      profile.bytes = entries.map(([, byte]) => byte) as unknown as Uint8Array
    }
    legacy.colorManagement = normalizeColorManagement(legacy.colorManagement)
    if (legacy.proofSettings) legacy.proofSettings = restoreProofBytes(legacy.proofSettings)
    legacy.pixelFormat ??= 'rgba8'
    legacy.guideSettings = legacy.guideSettings ? validateGuideSettings(legacy.guideSettings) : defaultGuideSettings(); legacy.documentWidth ??= 500; legacy.documentHeight ??= 625; validateDocument(legacy)
    return { metadata: raw.metadata, document: legacy }
  }
  if (!raw.assets || typeof raw.assets !== 'object') throw new Error('无法读取项目文件：资源索引无效')
  for (const source of Object.values(raw.assets)) if (typeof source !== 'string' || !/^data:image\//i.test(source)) throw new Error('无法读取项目文件：离线资源数据无效')
  const document = restoreSources(raw.document, raw.assets) as ProjectDocument
  if (document.proofSettings) document.proofSettings = restoreProofBytes(document.proofSettings)
  if (document.cmykProfile?.iccBytes && Array.isArray(document.cmykProfile.iccBytes)) document.cmykProfile = { ...document.cmykProfile, iccBytes: new Uint8Array(document.cmykProfile.iccBytes) }
  document.guideSettings = document.guideSettings ? validateGuideSettings(document.guideSettings) : defaultGuideSettings()
  document.colorManagement = normalizeColorManagement(document.colorManagement)
  if (document.proofSettings === undefined) document.proofSettings = { enabled: false, renderingIntent: 'relative-colorimetric', blackPointCompensation: true, simulatePaperWhite: false, simulateBlackInk: false, totalInkLimit: 3 }
  validateDocument(document)
  return { metadata: raw.metadata, document }
}

export function projectFingerprint(state: ProjectState): string {
  const document = serializableDocument(state)
  return JSON.stringify(document)
}
