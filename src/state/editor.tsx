import { planAlignment, type AlignmentRequest } from '../document/alignment'
import { demoImage } from '../creation/demoImage'
import { documentSnapshot, handleHistoryAction, initializeHistory, recordDocumentCommit, type DocumentSnapshot, type HistoryTransaction } from './documentHistory'
import { deleteLayerTrees, duplicateLayerTree, layerWriteIsLocked, layerSubtreeIds, moveLayerSubtree, reorderLayerSubtree } from './layerHierarchy'
import { selectionToLayer } from '../canvas/layerCoordinates'
import { dimensionError, resizedDocument, layerPixelScale, type DocumentAnchor } from '../document/documentGeometry'
import { ImageGenerationProvider } from '../creation/ImageGeneration'
import { defaultGenerationCount, readGenerationCount, saveGenerationCount } from '../creation/composerPreferences'
import { isValidOutputFormat, type OutputRatio } from '../creation/outputFormats'
import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type Dispatch, type ReactNode } from 'react'
import { createSelection, invertSelection, morphSelection, type Selection, type SelectionRect } from '../canvas/selectionGeometry'
import type { BrushStroke } from '../canvas/BrushEngine'
import type { CanvasTextObject } from '../canvas/TextObject'
import type { TransformDraft } from '../canvas/TransformOverlay'
import type { CanvasShape, LayerMask } from '../canvas/documentTypes'
import { getTool } from '../tools/toolRegistry'
import type { ToolGroupId, ToolId, ToolOptions } from '../tools/toolTypes'
import type { ModelSourceId } from '../creation/modelSources'
import { composeMergedSource, createMergePlan, transformGroup, ungroupPreserveWorld, type MergeMode, type Matrix } from '../document/groupTransforms'

/** Legacy alias retained for existing canvas and rail consumers. */
export type Tool = ToolId
export type InspectorTab = 'generate' | 'edit' | 'layers' | 'results'
export type HistoryItem = { kind?: 'operation' | 'result'; id: string; label: string; tone: 'original' | 'warm' | 'violet' | 'upscale' | 'mint'; snapshot?: DocumentSnapshot }
export type ComposerMode = 'generate' | 'edit'
export type ComposerPlacement = 'floating' | 'right'
export type ComposerParameter = 'model' | 'size' | 'ratio' | 'count' | 'strength'
export type ComposerParameters = Record<ComposerParameter, string>
export type HistoryTab = 'operations' | 'results' | 'compare'
export type AIOperation = { batchId?: string; sourceImage?: string; mode: ComposerMode; prompt: string; sourceLayerId: string; selection: Selection | null; parameters: ComposerParameters; sourceId?: ModelSourceId; modelCode?: string }
export type LayerAdjustments = { brightness: number; contrast: number; saturation: number; temperature: number; sharpness: number; blur: number; shadows: number; highlights: number; exposureEV?: number; tint?: number }
export const neutralAdjustments: LayerAdjustments = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, blur: 0, shadows: 0, highlights: 0 }
export type AIResultStatus = 'loading' | 'success' | 'partial-failure' | 'error'
export type AIAdoption = { kind: 'add' | 'replace'; layerId: string; originalLayer?: Layer }
export type AIResult = { batchId?: string; adoptions?: AIAdoption[]; id: string; source?: string; thumbnail?: string; prompt: string; model: string; provider: string; size: string; createdAt: string; status: AIResultStatus; favorite: boolean; adopted: boolean; error?: string; request?: AIOperation }
export type Layer = { adjustmentsEnabled?: boolean; contentWidth?: number; contentHeight?: number; source?: string; thumbnail?: string; transform?: TransformDraft; aiOperation?: AIOperation; maskId?: string; id: string; name: string; className: string; visible: boolean; locked?: boolean; opacity: number; blendMode: string; groupId?: string; children?: string[]; collapsed?: boolean; adjustments?: LayerAdjustments }
export type CanvasStroke = { id: string; x: number; y: number; size: number; color: string }
export type CanvasText = { id: string; x: number; y: number; text: string }
export type { SelectionRect } from '../canvas/selectionGeometry'
type EditorSnapshot = DocumentSnapshot
export type EditorState = { documentSessionId: string; currentAiBatchId?: string; documentRevision: string; historyTransaction: HistoryTransaction | null; documentId: string; documentWidth: number; documentHeight: number; documentBackground: string; activeTool: Tool; activeToolGroup: ToolGroupId; activeToolId: ToolId; recentToolByGroup: Record<ToolGroupId, ToolId>; toolOptions: ToolOptions; inspectorTab: InspectorTab; selectionVisible: boolean; selection: Selection; selectionRect: SelectionRect; zoom: number; selectedHistoryId: string; history: HistoryItem[]; historyTab: HistoryTab; historyCollapsed: boolean; isGenerating: boolean; prompt: string; composerMode: ComposerMode; composerPlacement: ComposerPlacement; composerMinimized: boolean; composerSourceId: ModelSourceId; composerParameters: ComposerParameters; layers: Layer[]; selectedLayerId: string; selectedLayerIds: string[]; aiResults: AIResult[]; notice: string | null; brushColor: string; recentColors: string[]; brushStrokes: BrushStroke[]; canvasTexts: CanvasTextObject[]; canvasShapes: CanvasShape[]; layerMasks: Record<string, LayerMask>; cropRect: SelectionRect | null; canvasRotation: number; sceneOrder: string[]; canvasOffset: { x: number; y: number }; undoStack: EditorSnapshot[]; redoStack: EditorSnapshot[] }
export type EditorAction = EditorActionPayload & { expectedDocumentId?: string; expectedRevision?: string; expectedDocumentSessionId?: string }
type EditorActionPayload =
  | { type: 'align-layers'; request: AlignmentRequest }
  | { type: 'begin-transaction'; label: string; documentId?: string; revision?: string }
  | { type: 'end-transaction' | 'cancel-transaction'; documentId?: string; revision?: string }
  | { type: 'select-tool'; tool: Tool }
  | { type: 'set-temporary-tool'; tool: Tool }
  | { type: 'set-tool-options'; options: ToolOptions }
  | { type: 'select-tab'; tab: InspectorTab }
  | { type: 'select-history'; id: string }
  | { type: 'set-prompt'; prompt: string }
  | { type: 'set-generating'; value: boolean; expectedDocumentSessionId?: string }
  | { type: 'append-history'; item: HistoryItem }
  | { type: 'append-ai-result'; expectedDocumentSessionId?: string; id: string; request: AIOperation; image: string; index: number }
  | { type: 'add-ai-result'; result: AIResult }
  | { type: 'start-ai-batch'; batchId: string }
  | { type: 'continue-ai-result'; id: string }
  | { type: 'fail-ai-result-image'; id: string }
  | { type: 'toggle-ai-result-favorite'; id: string }
  | { type: 'adopt-ai-result-as-layer'; id: string }
  | { type: 'replace-layer-with-ai-result'; targetId: string; resultId: string }
  | { type: 'delete-ai-result'; id: string }
  | { type: 'complete-ai-operation'; expectedDocumentSessionId?: string; id: string; request: AIOperation }
  | { type: 'set-zoom'; zoom: number }
  | { type: 'set-selection-visible'; visible: boolean }
  | { type: 'set-selection-rect'; rect: SelectionRect }
  | { type: 'commit-selection'; selection: Selection }
  | { type: 'invert-selection' }
  | { type: 'morph-selection'; amount: number }
  | { type: 'set-composer-mode'; mode: ComposerMode }
  | { type: 'set-composer-source'; sourceId: ModelSourceId }
  | { type: 'set-composer-placement'; placement: ComposerPlacement }
  | { type: 'set-composer-minimized'; minimized: boolean }
  | { type: 'set-output-format'; ratio: OutputRatio; size: string }
  | { type: 'set-composer-parameter'; parameter: ComposerParameter; value: string }
  | { type: 'set-history-tab'; tab: HistoryTab }
  | { type: 'set-history-collapsed'; collapsed: boolean }
  | { type: 'clear-history' }
  | { type: 'set-notice'; message: string | null }
  | { type: 'add-layer' }
  | { type: 'select-layer'; id: string; additive?: boolean }
  | { type: 'toggle-layer-selection'; id: string }
  | { type: 'batch-toggle-layer'; ids: string[]; property: 'visible' | 'locked' }
  | { type: 'batch-delete-layers'; ids: string[] }
  | { type: 'group-layers'; ids: string[] }
  | { type: 'transform-group'; id: string; matrix: Matrix }
  | { type: 'ungroup-layer'; id: string }
  | { type: 'merge-layers'; ids: string[]; mode?: MergeMode; keepHidden?: boolean }
  | { type: 'toggle-group'; id: string }
  | { type: 'toggle-layer'; id: string }
  | { type: 'set-layer-opacity'; id: string; opacity: number }
  | { type: 'set-layer-blend'; id: string; blendMode: string }
  | { type: 'rename-layer'; id: string; name: string }
  | { type: 'toggle-layer-lock'; id: string }
  | { type: 'duplicate-layer'; id: string }
  | { type: 'delete-layer'; id: string }
  | { type: 'reorder-layer'; id: string; direction: 'up' | 'down' }
  | { type: 'move-layer'; id: string; toIndex?: number; targetId?: string }
  | { type: 'add-result-layer'; resultId: string }
  | { type: 'replace-layer-with-result'; targetId: string; resultId: string }
  | { type: 'set-layer-adjustment'; id: string; key: keyof LayerAdjustments; value: number }
  | { type: 'reset-layer-adjustments'; id: string }
  | { type: 'toggle-layer-adjustments-preview'; id: string }
  | { type: 'add-stroke'; stroke: CanvasStroke }
  | { type: 'remove-stroke'; id: string }
  | { type: 'add-canvas-text'; text: CanvasText }
  | { type: 'set-canvas-offset'; x: number; y: number }
  | { type: 'set-brush-color'; color: string }
  | { type: 'commit-brush-stroke'; stroke: BrushStroke }
  | { type: 'upsert-text'; object: CanvasTextObject }
  | { type: 'add-shape'; shape: CanvasShape }
  | { type: 'selection-to-mask'; selection?: Selection }
  | { type: 'commit-mask'; mask: LayerMask }
  | { type: 'invert-mask' }
  | { type: 'clear-mask' }
  | { type: 'apply-mask' }
  | { type: 'commit-layer-transform'; layerId: string; transform: TransformDraft }
  | { type: 'commit-crop'; rect: SelectionRect }
  | { type: 'set-canvas-rotation'; rotation: number }
  | { type: 'rasterize-layer'; id: string; source: string }
  | { type: 'set-layer-source'; id: string; source: string }
  | { type: 'import-image'; id: string; name: string; source: string; width?: number; height?: number; autoSize?: boolean }
  | { type: 'resize-document'; width: number; height: number; mode: 'canvas' | 'image'; anchor?: DocumentAnchor; background?: string }
  | { type: 'new-document'; width: number; height: number; background?: string }
  | { type: 'restore-project'; document: Partial<EditorState> }
  | { type: 'undo' }
  | { type: 'redo' }

function readRecentColors() {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem('draivio-recent-colors') ?? '[]')
    return Array.isArray(value) ? value.filter((color): color is string => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 20) : []
  } catch { return [] }
}

function rememberColor(colors: string[], color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return colors
  return [color.toLowerCase(), ...colors.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 20)
}

export const initialEditorState: EditorState = {
  documentSessionId: crypto.randomUUID(), documentRevision: 'initial', historyTransaction: null,
  documentId: crypto.randomUUID(),
  documentWidth: 500, documentHeight: 625, documentBackground: 'transparent',
  activeTool: 'select', activeToolGroup: 'select-move', activeToolId: 'select', recentToolByGroup: { 'select-move': 'select', selection: 'selection', brush: 'brush', 'erase-heal': 'eraser', mask: 'mask', 'crop-transform': 'crop', 'text-shape': 'text', 'color-fill': 'picker', navigation: 'pan' }, toolOptions: {}, inspectorTab: 'layers', selectionVisible: true, selection: createSelection('rectangle', { x: 27, y: 26, width: 46, height: 40 }), selectionRect: { x: 27, y: 26, width: 46, height: 40 }, zoom: 100, selectedHistoryId: 'original',
  history: [{ id: 'original', label: '初始文档', tone: 'original' }], historyTab: 'operations', historyCollapsed: false, isGenerating: false, prompt: '一张春日黄昏海报，暖色天空，远山和树影，安静、留白、杂志感', composerMode: 'edit', composerPlacement: 'floating', composerMinimized: false, composerSourceId: 'draivio-cloud',
  composerParameters: { model: 'Image Pro', size: '1024 × 1024', ratio: '1:1', count: defaultGenerationCount, strength: '强度 48%' },
  layers: [{ id: 'art', source: 'fixture', name: '春日海报 · 变体 1', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }, { id: 'mask', name: '局部蒙版', className: 'layer-mask', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }, { id: 'original', source: 'fixture', name: '原图', className: 'layer-original', visible: false, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }], selectedLayerId: 'art', selectedLayerIds: ['art'], aiResults: [], notice: null, brushColor: '#ff765f', recentColors: [], brushStrokes: [], canvasTexts: [], canvasShapes: [], layerMasks: {}, cropRect: null, canvasRotation: 0, sceneOrder: [], canvasOffset: { x: 0, y: 0 }, undoStack: [], redoStack: [],
}

const snapshot = documentSnapshot
function commit(state: EditorState, next: EditorState): EditorState { return { ...next, undoStack: [...state.undoStack, snapshot(state)].slice(-30), redoStack: [] } }

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  if (action.expectedDocumentSessionId && action.expectedDocumentSessionId !== state.documentSessionId || action.expectedDocumentId && action.expectedDocumentId !== state.documentId || action.expectedRevision && action.expectedRevision !== state.documentRevision) return { ...state, notice: '文档或版本已更改，已放弃过期操作' }
  const handled = handleHistoryAction(state, action)
  if (handled) return handled
  const next = reduceEditorAction(state, action)
  if (action.type === 'restore-project' || action.type === 'new-document' && next.documentId !== state.documentId) return initializeHistory(next, action.type === 'new-document' ? '新建文档' : '打开项目')
  return next.undoStack !== state.undoStack ? recordDocumentCommit(state, next, action) : next
}

function reduceEditorAction(state: EditorState, action: EditorAction): EditorState {
  if (layerWriteIsLocked(state, action)) return { ...state, notice: '图层或其祖先已锁定，请先解锁后再编辑' }
  switch (action.type) {
    case 'select-tool': { const definition = getTool(action.tool); if (!definition) return state; return { ...state, activeTool: action.tool, activeToolGroup: definition.groupId, activeToolId: definition.id, recentToolByGroup: { ...state.recentToolByGroup, [definition.groupId]: definition.id }, selectionVisible: definition.groupId === 'selection' || action.tool === 'mask' || state.selectionVisible } }
    case 'set-temporary-tool': { const definition = getTool(action.tool); if (!definition) return state; return { ...state, activeTool: definition.id, activeToolGroup: definition.groupId, activeToolId: definition.id } }
    case 'set-tool-options': {
      const options = { ...state.toolOptions, ...action.options }
      const ratio = options.fixedRatio === true ? String(options.selectionRatio ?? '1:1').split(':').map(Number) : null
      const mode = ['new', 'add', 'subtract', 'intersect'].includes(String(options.selectionMode)) ? options.selectionMode as Selection['mode'] : state.selection.mode
      const selection = { ...state.selection, mode, feather: typeof options.feather === 'number' ? Math.min(100, Math.max(0, options.feather)) : state.selection.feather, fixedRatio: ratio && ratio[0] > 0 && ratio[1] > 0 ? ratio[0] / ratio[1] : null }
      const next = { ...state, toolOptions: options, selection }
      return selection.feather !== state.selection.feather ? commit(state, next) : next
    }
    case 'select-tab': return { ...state, inspectorTab: action.tab }
    case 'select-history': return { ...state, selectedHistoryId: action.id }
    case 'set-prompt': return commit(state, { ...state, prompt: action.prompt })
    case 'set-generating': if (action.expectedDocumentSessionId && action.expectedDocumentSessionId !== state.documentSessionId) return state; return { ...state, isGenerating: action.value }
    case 'append-history': return { ...state, history: [...state.history, action.item], selectedHistoryId: action.item.id }
    case 'start-ai-batch': return { ...state, currentAiBatchId: action.batchId }
    case 'append-ai-result': {
      if (action.expectedDocumentSessionId && action.expectedDocumentSessionId !== state.documentSessionId) return state
      if (!action.image) return { ...state, notice: '接口未返回可用图片' }
      const result: AIResult = { id: action.id, batchId: action.request.batchId ?? action.id, source: action.image, thumbnail: action.image, prompt: action.request.prompt, model: action.request.modelCode ?? action.request.parameters.model, provider: action.request.sourceId ?? 'unknown', size: action.request.parameters.size, createdAt: new Date().toISOString(), status: 'success', favorite: false, adopted: false, request: action.request }
      return commit(state, { ...state, aiResults: [result, ...state.aiResults], notice: `已收到第 ${action.index + 1} 张候选图片，采用后加入图层` })
    }
    case 'continue-ai-result': {
      const result = state.aiResults.find(item => item.id === action.id)
      if (!result?.request) return { ...state, notice: '该结果没有完整生成参数' }
      const request = result.request
      const source = state.layers.find(layer => layer.id === request.sourceLayerId)
      return commit(state, { ...state, prompt: request.prompt, composerParameters: { ...request.parameters }, composerSourceId: request.sourceId ?? result.provider, composerMode: request.mode, composerMinimized: false,
        ...(source ? { selectedLayerId: source.id, selectedLayerIds: [source.id] } : {}),
        selectionVisible: !!request.selection, ...(request.selection ? { selection: structuredClone(request.selection), selectionRect: { ...request.selection.rect } } : {}),
        notice: source ? '已恢复生成输入与全部参数' : '已恢复生成参数；原始图层已删除，请重新选择编辑来源' })
    }
    case 'add-ai-result': return commit(state, { ...state, aiResults: [action.result, ...state.aiResults], notice: action.result.status === 'error' ? 'AI 结果生成失败' : '已收到 AI 结果' })
    case 'fail-ai-result-image': return commit(state, { ...state, aiResults: state.aiResults.map(result => result.id === action.id ? { ...result, status: 'error' as const, error: '图片加载失败，请重新生成或检查图片地址' } : result) })
    case 'toggle-ai-result-favorite': return commit(state, { ...state, aiResults: state.aiResults.map((result) => result.id === action.id ? { ...result, favorite: !result.favorite } : result) })
    case 'delete-ai-result': return commit(state, { ...state, aiResults: state.aiResults.filter((result) => result.id !== action.id), notice: '已删除 AI 结果' })
    case 'adopt-ai-result-as-layer': {
      const result = state.aiResults.find((item) => item.id === action.id)
      if (!result || result.status !== 'success' || !result.source) return { ...state, notice: result?.error ?? '该结果暂不可采用' }
      const layer: Layer = { id: `layer-${crypto.randomUUID()}`, aiOperation: result.request, name: `生成结果 · ${state.layers.length + 1}`, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: result.source, thumbnail: result.thumbnail, adjustments: { ...neutralAdjustments } }
      return commit(state, { ...state, aiResults: state.aiResults.map((item) => item.id === action.id ? { ...item, adopted: true, adoptions: [...(item.adoptions ?? []), { kind: 'add' as const, layerId: layer.id }] } : item), layers: [layer, ...state.layers], selectedLayerId: layer.id, selectedLayerIds: [layer.id], notice: '已将 AI 结果新增为图层' })
    }
    case 'replace-layer-with-ai-result': {
      const result = state.aiResults.find((item) => item.id === action.resultId)
      const target = state.layers.find((item) => item.id === action.targetId)
      if (!result || result.status !== 'success' || !result.source) return { ...state, notice: result?.error ?? '该结果暂不可采用' }
      if (target?.children?.length) return { ...state, notice: '请先选择图片图层，不能直接替换图层组' }
      if (!target || target.locked) return { ...state, notice: target?.locked ? '目标图层已锁定' : '找不到目标图层' }
      return commit(state, { ...state, aiResults: state.aiResults.map((item) => item.id === result.id ? { ...item, adopted: true, adoptions: [...(item.adoptions ?? []), { kind: 'replace' as const, layerId: target.id, originalLayer: structuredClone(target) }] } : item), layers: state.layers.map((item) => item.id === target.id ? { ...item, source: result.source, thumbnail: result.thumbnail, aiOperation: result.request, name: `替换 · ${result.model}` } : item), selectedLayerId: target.id, notice: '已替换当前图层，原图可通过撤销恢复' })
    }
    case 'complete-ai-operation': {
      if (action.expectedDocumentSessionId && action.expectedDocumentSessionId !== state.documentSessionId) return state
      const { request } = action
      const count = Math.min(8, Math.max(1, Number.parseInt(request.parameters.count, 10) || 1))
      const results: AIResult[] = Array.from({ length: count }, (_, index) => ({ id: `${action.id}-${index + 1}`, batchId: request.batchId ?? action.id, source: demoImage(index), thumbnail: demoImage(index), prompt: request.prompt, model: request.modelCode ?? request.parameters.model, provider: request.sourceId ?? 'unknown', size: request.parameters.size, createdAt: new Date().toISOString(), status: 'success', favorite: false, adopted: false, request }))
      return commit(state, { ...state, currentAiBatchId: request.batchId ?? action.id, aiResults: [...results, ...state.aiResults], isGenerating: false, notice: `已生成 ${count} 个模拟候选，确认后再加入图层` })
    }
    case 'set-zoom': return { ...state, zoom: Math.min(400, Math.max(10, action.zoom)) }
    case 'set-selection-visible': return { ...state, selectionVisible: action.visible }
    case 'set-selection-rect': return { ...state, selection: createSelection(state.selection.kind, action.rect, state.selection), selectionRect: action.rect, selectionVisible: true }
    case 'commit-selection': return commit(state, { ...state, selection: action.selection, selectionRect: action.selection.rect, selectionVisible: true })
    case 'invert-selection': { const selection = invertSelection(state.selection); return commit(state, { ...state, selection, selectionRect: selection.rect, selectionVisible: true }) }
    case 'morph-selection': { const selection = morphSelection(state.selection, action.amount, state.documentWidth, state.documentHeight); return commit(state, { ...state, selection, selectionRect: selection.rect, selectionVisible: true }) }
    case 'set-composer-mode': return commit(state, { ...state, composerMode: action.mode })
    case 'set-composer-source': return commit(state, { ...state, composerSourceId: action.sourceId })
    case 'set-composer-placement': return { ...state, composerPlacement: action.placement }
    case 'set-composer-minimized': return { ...state, composerMinimized: action.minimized }
    case 'set-output-format': return isValidOutputFormat(action.ratio, action.size) ? commit(state, { ...state, composerParameters: { ...state.composerParameters, ratio: action.ratio, size: action.size } }) : state
    case 'set-composer-parameter': return commit(state, { ...state, composerParameters: { ...state.composerParameters, [action.parameter]: action.value } })
    case 'set-history-tab': return { ...state, historyTab: action.tab }
    case 'set-history-collapsed': return { ...state, historyCollapsed: action.collapsed }
    case 'clear-history': return { ...state, history: state.history.filter((item) => item.id === 'original'), selectedHistoryId: 'original', notice: '已清空生成历史' }
    case 'set-notice': return { ...state, notice: action.message }
    case 'add-layer': { const id = `layer-${Date.now()}`; return commit(state, { ...state, layers: [{ id, name: `新图层 ${state.layers.length + 1}`, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }, ...state.layers], selectedLayerId: id, selectedLayerIds: [id], notice: '已新建图层' }) }
    case 'select-layer': return { ...state, selectedLayerId: action.id, selectedLayerIds: action.additive ? Array.from(new Set([...state.selectedLayerIds, action.id])) : [action.id] }
    case 'toggle-layer-selection': return { ...state, selectedLayerIds: state.selectedLayerIds.includes(action.id) ? (state.selectedLayerIds.length > 1 ? state.selectedLayerIds.filter((id) => id !== action.id) : state.selectedLayerIds) : [...state.selectedLayerIds, action.id], selectedLayerId: action.id }
    case 'batch-toggle-layer': {
      const ids = [...new Set(action.ids)].filter((id) => state.layers.some((layer) => layer.id === id))
      const allowed = ids.filter((id) => !layerWriteIsLocked(state, action.property === 'locked' ? { type: 'toggle-layer-lock', id } : { type: 'toggle-layer', id }))
      const skipped = ids.length - allowed.length
      const notice = skipped ? `已跳过 ${skipped} 个锁定图层，其余 ${allowed.length} 个已处理` : '已批量更新图层'
      if (!allowed.length) return { ...state, notice }
      return commit(state, { ...state, layers: state.layers.map((layer) => allowed.includes(layer.id) ? { ...layer, [action.property]: !layer[action.property] } : layer), notice })
    }
    case 'batch-delete-layers': {
      const ids = [...new Set(action.ids)].filter((id) => state.layers.some((layer) => layer.id === id))
      const allowed = ids.filter((id) => !layerWriteIsLocked(state, { type: 'delete-layer', id }))
      const skipped = ids.length - allowed.length
      const next = { ...deleteLayerTrees(state, allowed) }
      if (skipped) next.notice = `已跳过 ${skipped} 个锁定图层；${next.layers === state.layers ? next.notice ?? '没有可删除图层' : '其余图层已删除'}`
      return next.layers === state.layers ? next : commit(state, next)
    }
    case 'group-layers': {
      const selected = [...new Set(action.ids)].filter((id) => state.layers.some((layer) => layer.id === id))
      const ids = selected.filter((id) => !layerWriteIsLocked(state, { type: 'delete-layer', id }))
      const skipped = selected.length - ids.length
      const skippedNotice = skipped ? `已跳过 ${skipped} 个锁定图层；` : ''
      if (ids.length < 2) return { ...state, notice: `${skippedNotice}至少选择两个可编辑图层才能分组` }
      const groupId = `group-${crypto.randomUUID()}`
      const group: Layer = { id: groupId, name: '图层组', className: 'layer-group', visible: true, opacity: 100, blendMode: '正常', children: ids, collapsed: false }
      return commit(state, { ...state, layers: [group, ...state.layers.map((layer) => ids.includes(layer.id) ? { ...layer, groupId, children: layer.children?.filter((id) => !ids.includes(id)) } : layer.children?.some((id) => ids.includes(id)) ? { ...layer, children: layer.children.filter((id) => !ids.includes(id)) } : layer)], selectedLayerId: groupId, selectedLayerIds: [groupId], notice: `${skippedNotice}已创建图层组` })
    }
    case 'transform-group': {
      const group = state.layers.find(layer => layer.id === action.id)
      if (!group?.children?.length && !state.layers.some(layer => layer.groupId === action.id)) return { ...state, notice: '请选择包含图层的组' }
      const layers = transformGroup(state.layers, action.id, action.matrix)
      return layers === state.layers ? state : commit(state, { ...state, layers, notice: '已整体变换图层组，可撤销' })
    }
    case 'ungroup-layer': {
      const group = state.layers.find(layer => layer.id === action.id)
      if (!group || group.className !== 'layer-group') return { ...state, notice: '请选择图层组' }
      return commit(state, { ...state, layers: ungroupPreserveWorld(state.layers, action.id).filter(layer => layer.id !== action.id), selectedLayerId: group.children?.[0] ?? state.selectedLayerId, selectedLayerIds: group.children?.slice(0, 1) ?? state.selectedLayerIds, notice: '已取消编组，子图层位置保持不变' })
    }
    case 'merge-layers': {
      const mode = action.mode ?? 'selected'; const plan = createMergePlan(state.layers, action.ids, mode, action.keepHidden ?? true)
      if (plan.layerIds.length < 2) return { ...state, notice: '至少选择两个可合并图层' }
      const selected = new Set(plan.layerIds); const source = state.layers.find(layer => selected.has(layer.id))
      if (!source) return { ...state, notice: '找不到可合并图层' }
      const sourceLayers = state.layers.filter(layer => selected.has(layer.id))
      const merged: Layer = { ...source, id: `merged-${crypto.randomUUID()}`, name: mode === 'flatten' ? '拼合图像' : '合并图层', groupId: undefined, children: undefined, className: 'layer-art', blendMode: '正常', locked: false, source: composeMergedSource(sourceLayers, state.documentWidth, state.documentHeight) ?? source.source, contentWidth: state.documentWidth, contentHeight: state.documentHeight }
      const layers = [merged, ...state.layers.filter(layer => !selected.has(layer.id))]
      return commit(state, { ...state, layers, selectedLayerId: merged.id, selectedLayerIds: [merged.id], notice: plan.warning ? `${plan.warning}已完成合并` : '已合并图层，可撤销' })
    }
    case 'toggle-group': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, collapsed: !layer.collapsed } : layer) })
    case 'toggle-layer': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, visible: !layer.visible } : layer) })
    case 'set-layer-opacity': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, opacity: Math.max(0, Math.min(100, action.opacity)) } : layer) })
    case 'set-layer-blend': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, blendMode: action.blendMode } : layer) })
    case 'rename-layer': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, name: action.name.trim() || layer.name } : layer) })
    case 'toggle-layer-lock': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, locked: !layer.locked } : layer) })
    case 'duplicate-layer': { const next = duplicateLayerTree(state, action.id); return next === state ? state : commit(state, next) }
    case 'delete-layer': { const next = deleteLayerTrees(state, [action.id]); return next.layers === state.layers ? next : commit(state, next) }
    case 'reorder-layer': {
      const layers = reorderLayerSubtree(state.layers, action.id, action.direction)
      return layers === state.layers ? state : commit(state, { ...state, layers })
    }
    case 'move-layer': {
      const from = state.layers.findIndex((layer) => layer.id === action.id)
      const targetId = action.targetId ?? state.layers[Math.max(0, Math.min(state.layers.length - 1, action.toIndex ?? from))]?.id
      if (from < 0 || !targetId) return state
      const target = state.layers.findIndex((layer) => layer.id === targetId)
      const layers = moveLayerSubtree(state.layers, action.id, targetId, target < from ? 'before' : 'after')
      return layers === state.layers ? state : commit(state, { ...state, layers })
    }
    case 'add-result-layer': { const next = duplicateLayerTree(state, action.resultId, true); return next === state ? state : commit(state, { ...next, notice: '已将结果新增为图层' }) }
    case 'replace-layer-with-result': {
      const source = state.layers.find((layer) => layer.id === action.resultId)
      const target = state.layers.find((layer) => layer.id === action.targetId)
      if (!source || !target || target.locked) return { ...state, notice: target?.locked ? '目标图层已锁定' : '找不到结果图层' }
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === target.id ? { ...layer, name: source.name, source: source.source, thumbnail: source.thumbnail, transform: source.transform, aiOperation: source.aiOperation } : layer), selectedLayerId: target.id, notice: '已替换当前图层' })
    }
    case 'add-stroke': return state // Legacy point API is replaced by atomic continuous strokes.
    case 'remove-stroke': return commit(state, { ...state, brushStrokes: state.brushStrokes.filter((stroke) => stroke.id !== action.id) })
    case 'add-canvas-text': return commit(state, { ...state, canvasTexts: [...state.canvasTexts, { ...action.text, layerId: state.selectedLayerId, fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: state.brushColor, align: 'left' }], notice: '已添加文字' })
    case 'set-canvas-offset': return { ...state, canvasOffset: { x: action.x, y: action.y } }
    case 'set-brush-color': return { ...state, brushColor: action.color, recentColors: rememberColor(state.recentColors, action.color), notice: `已取色 ${action.color}` }
    case 'commit-brush-stroke': return commit(state, { ...state, brushStrokes: [...state.brushStrokes, action.stroke], sceneOrder: [...state.sceneOrder, action.stroke.id] })
    case 'upsert-text': return commit(state, { ...state, canvasTexts: [...state.canvasTexts.filter((object) => object.id !== action.object.id), action.object], sceneOrder: state.sceneOrder.includes(action.object.id) ? state.sceneOrder : [...state.sceneOrder, action.object.id] })
    case 'add-shape': return commit(state, { ...state, canvasShapes: [...state.canvasShapes, action.shape], sceneOrder: [...state.sceneOrder, action.shape.id] })
    case 'selection-to-mask': {
      const selection = action.selection ?? (state.selectionVisible ? state.selection : undefined)
      if (!selection || selection.rect.width <= 0 || selection.rect.height <= 0) return { ...state, notice: '请先创建有效选区或闭合路径' }
      const layer = state.layers.find((item) => item.id === state.selectedLayerId)
      return commit(state, { ...state, layerMasks: { ...state.layerMasks, [state.selectedLayerId]: { selection: { ...selectionToLayer(selection, layer?.transform, state.documentWidth, state.documentHeight), feather: selection.feather / layerPixelScale(layer, state.documentWidth, state.documentHeight).mean }, strokes: [], inverted: false, applied: false } }, notice: '选区已创建为图层蒙版' })
    }
    case 'commit-mask': return commit(state, { ...state, layerMasks: { ...state.layerMasks, [state.selectedLayerId]: action.mask } })
    case 'invert-mask': {
      const mask = state.layerMasks[state.selectedLayerId]
      if (!mask) return { ...state, notice: '当前图层没有蒙版' }
      if (mask.applied) return { ...state, notice: '蒙版已应用，无法继续反转；可撤销后编辑' }
      return commit(state, { ...state, layerMasks: { ...state.layerMasks, [state.selectedLayerId]: { ...mask, inverted: !mask.inverted } } })
    }
    case 'clear-mask': {
      if (!state.layerMasks[state.selectedLayerId]) return state
      const masks = { ...state.layerMasks }; delete masks[state.selectedLayerId]
      return commit(state, { ...state, layerMasks: masks, notice: '已清空当前图层蒙版' })
    }
    case 'apply-mask': {
      const mask = state.layerMasks[state.selectedLayerId]
      if (!mask) return { ...state, notice: '请先绘制蒙版或将选区转为蒙版' }
      return commit(state, { ...state, layerMasks: { ...state.layerMasks, [state.selectedLayerId]: { ...mask, applied: true } }, notice: '已应用蒙版，可撤销恢复' })
    }
    case 'align-layers': {
      const plan = planAlignment(state, action.request)
      if (plan.error) return { ...state, notice: plan.error }
      const prefix = plan.skipped ? `已排除 ${plan.skipped} 个锁定、隐藏或重复子层；` : ''
      if (!Object.keys(plan.transforms).length) return { ...state, notice: `${prefix}对象已在目标位置` }
      return commit(state, { ...state, layers: state.layers.map(layer => plan.transforms[layer.id] ? { ...layer, transform: plan.transforms[layer.id] } : layer), notice: `${prefix}${action.request.operation.startsWith('distribute') ? '已等距分布' : '已对齐'}，可撤销` })
    }
    case 'commit-layer-transform': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.layerId && !layer.locked ? { ...layer, transform: action.transform } : layer) })
    case 'set-layer-adjustment':
      if (!Number.isFinite(action.value)) return { ...state, notice: '调整值必须是有限数字，已保留原值' }
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, [action.key]: Math.max(-100, Math.min(100, action.value)) } } : layer) })
    case 'toggle-layer-adjustments-preview': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustmentsEnabled: layer.adjustmentsEnabled === false } : layer) })
    case 'reset-layer-adjustments': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments } } : layer) })
    case 'commit-crop': return commit(state, { ...state, cropRect: action.rect, selectionVisible: false, notice: '裁剪已应用，可撤销' })
    case 'set-canvas-rotation': return { ...state, canvasRotation: ((action.rotation % 360) + 360) % 360 }
    case 'rasterize-layer': {
      if (layerSubtreeIds(state.layers, action.id).length > 1 || state.layers.find((layer) => layer.id === action.id)?.children) return { ...state, notice: '图层组暂不支持破坏性像素编辑，请先选择组内的具体图层' }
      const layerMasks = { ...state.layerMasks }; delete layerMasks[action.id]
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, source: action.source, transform: undefined, contentWidth: state.documentWidth, contentHeight: state.documentHeight } : layer), layerMasks, brushStrokes: state.brushStrokes.filter((s) => s.layerId !== action.id), canvasTexts: state.canvasTexts.filter((s) => s.layerId !== action.id), canvasShapes: state.canvasShapes.filter((s) => s.layerId !== action.id) })
    }
    case 'set-layer-source': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, source: action.source } : layer) })
    case 'restore-project': {
      const keys = ['documentId', 'history', 'documentWidth', 'documentHeight', 'documentBackground', 'layers', 'selectedLayerId', 'selectedLayerIds', 'aiResults', 'brushStrokes', 'canvasTexts', 'canvasShapes', 'layerMasks', 'selection', 'selectionRect', 'selectionVisible', 'cropRect', 'sceneOrder', 'prompt', 'composerMode', 'composerSourceId', 'composerParameters'] as const
      const next = { ...state }
      for (const key of keys) if (action.document[key] !== undefined) Object.assign(next, { [key]: action.document[key] })
      return { ...next, documentSessionId: crypto.randomUUID(), currentAiBatchId: undefined, documentId: action.document.documentId ?? crypto.randomUUID(), history: action.document.history ?? [], undoStack: [], redoStack: [], isGenerating: false, notice: '已打开项目' }
    }
    case 'new-document': {
      const error = dimensionError(action.width, action.height)
      if (error) return { ...state, notice: error }
      return { ...state, documentSessionId: crypto.randomUUID(), documentId: crypto.randomUUID(), currentAiBatchId: undefined, aiResults: [], history: [], undoStack: [], redoStack: [], prompt: '', selectedHistoryId: '', isGenerating: false, selection: createSelection('rectangle', { x: 0, y: 0, width: 0, height: 0 }), selectionRect: { x: 0, y: 0, width: 0, height: 0 }, documentWidth: action.width, documentHeight: action.height, documentBackground: action.background ?? 'transparent', layers: [{ id: 'blank', name: '图层 1', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' }], selectedLayerId: 'blank', selectedLayerIds: ['blank'], brushStrokes: [], canvasTexts: [], canvasShapes: [], layerMasks: {}, sceneOrder: [], cropRect: null, selectionVisible: false, notice: '已新建文档' }
    }
    case 'resize-document': {
      if (action.mode === 'image' && Math.abs(action.width / state.documentWidth - action.height / state.documentHeight) > Math.max(1 / state.documentWidth, 1 / state.documentHeight)) return { ...state, notice: '图像大小须保持原比例；改变比例请使用画布大小' }
      const error = dimensionError(action.width, action.height)
      if (error) return { ...state, notice: error }
      return commit(state, { ...resizedDocument(state, action.width, action.height, action.mode, action.anchor), documentBackground: action.background ?? state.documentBackground, notice: action.mode === 'canvas' ? '已调整画布大小，超出边缘的内容已裁切，可撤销' : '已缩放全部图像内容，可撤销' })
    }
    case 'import-image': {
      const error = action.width !== undefined && action.height !== undefined ? dimensionError(action.width, action.height) : null
      if (error) return { ...state, notice: error }
      const auto = action.autoSize && action.width && action.height
      const importedState = auto ? resizedDocument(state, action.width!, action.height!, 'canvas', 'top-left') : state

      const historyItem = { id: action.id, label: `导入 · ${action.name}`, tone: 'original' as const }
      return commit(state, { ...importedState, layers: [{ contentWidth: auto ? action.width : state.documentWidth, contentHeight: auto ? action.height : state.documentHeight, id: action.id, name: action.name, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: action.source }, ...importedState.layers], selectedLayerId: action.id, selectedLayerIds: [action.id], history: [...state.history, historyItem], selectedHistoryId: action.id, notice: `已导入 ${action.name}` })
    }
    case 'undo': { const previous = state.undoStack.at(-1); if (!previous) return { ...state, notice: '没有可撤销的操作' }; return { ...state, ...previous, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, snapshot(state)], notice: '已撤销' } }
    case 'redo': { const next = state.redoStack.at(-1); if (!next) return { ...state, notice: '没有可重做的操作' }; return { ...state, ...next, undoStack: [...state.undoStack, snapshot(state)], redoStack: state.redoStack.slice(0, -1), notice: '已重做' } }
    default: return state
  }
}

const EditorContext = createContext<{ state: EditorState; dispatch: Dispatch<EditorAction> } | null>(null)
export function EditorProvider({ children, initialState, onStateChange }: { children: ReactNode; initialState?: EditorState; onStateChange?: (state: EditorState) => void }) {
  const [state, dispatch] = useReducer(editorReducer, initialState ?? initialEditorState, (base) => initialState ?? ({
    ...initializeHistory({ ...base, documentSessionId: crypto.randomUUID(), documentId: crypto.randomUUID() }, '初始文档'), recentColors: readRecentColors(), composerParameters: { ...base.composerParameters, count: readGenerationCount() },
  }))
  useEffect(() => { onStateChange?.(state) }, [state, onStateChange])
  useEffect(() => { saveGenerationCount(state.composerParameters.count) }, [state.composerParameters.count])
  useEffect(() => {
    try { window.localStorage.setItem('draivio-recent-colors', JSON.stringify(state.recentColors)) } catch { /* Storage can be disabled in private/webview contexts. */ }
  }, [state.recentColors])
  const value = useMemo(() => ({ state, dispatch }), [state])
  return <EditorContext.Provider value={value}><ImageGenerationProvider state={state} dispatch={dispatch}>{children}</ImageGenerationProvider></EditorContext.Provider>
}
export function useEditor() { const context = useContext(EditorContext); if (!context) throw new Error('useEditor must be used within EditorProvider'); return context }


/** Numeric controls keep the initiating document/version token across rerenders. */
export function useDocumentTransaction(label: string) {
  const { state, dispatch } = useEditor()
  const token = useRef<{ documentId: string; revision: string } | null>(null)
  useEffect(() => () => { if (token.current) { dispatch({ type: 'cancel-transaction', ...token.current }); token.current = null } }, [dispatch])
  return {
    onEditStart: () => {
      if (token.current) return
      token.current = { documentId: state.documentId, revision: state.documentRevision }
      dispatch({ type: 'begin-transaction', label, ...token.current })
    },
    onEditEnd: () => { if (token.current) { dispatch({ type: 'end-transaction', ...token.current }); token.current = null } },
    onEditCancel: () => { if (token.current) { dispatch({ type: 'cancel-transaction', ...token.current }); token.current = null } },
  }
}
