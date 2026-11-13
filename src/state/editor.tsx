import { isValidOutputFormat, type OutputRatio } from '../creation/outputFormats'
import { createContext, useContext, useMemo, useReducer, type Dispatch, type ReactNode } from 'react'
import { createSelection, invertSelection, morphSelection, type Selection, type SelectionRect } from '../canvas/selectionGeometry'
import type { BrushStroke } from '../canvas/BrushEngine'
import type { CanvasTextObject } from '../canvas/TextObject'
import type { TransformDraft } from '../canvas/TransformOverlay'
import type { CanvasShape, LayerMask } from '../canvas/documentTypes'
import { getTool } from '../tools/toolRegistry'
import type { ToolGroupId, ToolId, ToolOptions } from '../tools/toolTypes'
import type { ModelSourceId } from '../creation/modelSources'

/** Legacy alias retained for existing canvas and rail consumers. */
export type Tool = ToolId
export type InspectorTab = 'generate' | 'edit' | 'layers'
export type HistoryItem = { id: string; label: string; tone: 'original' | 'warm' | 'violet' | 'upscale' | 'mint' }
export type ComposerMode = 'generate' | 'edit'
export type ComposerPlacement = 'floating' | 'right'
export type ComposerParameter = 'model' | 'size' | 'ratio' | 'count' | 'strength'
export type ComposerParameters = Record<ComposerParameter, string>
export type HistoryTab = 'operations' | 'results' | 'compare'
export type AIOperation = { mode: ComposerMode; prompt: string; sourceLayerId: string; selection: Selection | null; parameters: ComposerParameters; sourceId?: ModelSourceId; modelCode?: string }
export type Layer = { source?: string; transform?: TransformDraft; aiOperation?: AIOperation; id: string; name: string; className: string; visible: boolean; opacity: number; blendMode: string }
export type CanvasStroke = { id: string; x: number; y: number; size: number; color: string }
export type CanvasText = { id: string; x: number; y: number; text: string }
export type { SelectionRect } from '../canvas/selectionGeometry'
type EditorSnapshot = Pick<EditorState, 'layers' | 'selectedLayerId' | 'history' | 'selectedHistoryId' | 'selectionVisible' | 'selection' | 'selectionRect' | 'prompt' | 'composerMode' | 'composerSourceId' | 'composerParameters' | 'brushStrokes' | 'canvasTexts' | 'canvasShapes' | 'layerMasks' | 'cropRect' | 'sceneOrder'>
export type EditorState = { activeTool: Tool; activeToolGroup: ToolGroupId; activeToolId: ToolId; recentToolByGroup: Record<ToolGroupId, ToolId>; toolOptions: ToolOptions; inspectorTab: InspectorTab; selectionVisible: boolean; selection: Selection; selectionRect: SelectionRect; zoom: number; selectedHistoryId: string; history: HistoryItem[]; historyTab: HistoryTab; historyCollapsed: boolean; isGenerating: boolean; prompt: string; composerMode: ComposerMode; composerPlacement: ComposerPlacement; composerMinimized: boolean; composerSourceId: ModelSourceId; composerParameters: ComposerParameters; layers: Layer[]; selectedLayerId: string; notice: string | null; brushColor: string; brushStrokes: BrushStroke[]; canvasTexts: CanvasTextObject[]; canvasShapes: CanvasShape[]; layerMasks: Record<string, LayerMask>; cropRect: SelectionRect | null; canvasRotation: number; sceneOrder: string[]; canvasOffset: { x: number; y: number }; undoStack: EditorSnapshot[]; redoStack: EditorSnapshot[] }
export type EditorAction =
  | { type: 'select-tool'; tool: Tool }
  | { type: 'set-temporary-tool'; tool: Tool }
  | { type: 'set-tool-options'; options: ToolOptions }
  | { type: 'select-tab'; tab: InspectorTab }
  | { type: 'select-history'; id: string }
  | { type: 'set-prompt'; prompt: string }
  | { type: 'set-generating'; value: boolean }
  | { type: 'append-history'; item: HistoryItem }
  | { type: 'complete-ai-operation'; id: string; request: AIOperation }
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
  | { type: 'select-layer'; id: string }
  | { type: 'toggle-layer'; id: string }
  | { type: 'set-layer-opacity'; id: string; opacity: number }
  | { type: 'set-layer-blend'; id: string; blendMode: string }
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
  | { type: 'import-image'; id: string; name: string; source: string }
  | { type: 'undo' }
  | { type: 'redo' }

export const initialEditorState: EditorState = {
  activeTool: 'select', activeToolGroup: 'select-move', activeToolId: 'select', recentToolByGroup: { 'select-move': 'select', selection: 'selection', brush: 'brush', 'erase-heal': 'eraser', mask: 'mask', 'crop-transform': 'crop', 'text-shape': 'text', 'color-fill': 'picker', navigation: 'pan' }, toolOptions: {}, inspectorTab: 'generate', selectionVisible: true, selection: createSelection('rectangle', { x: 27, y: 26, width: 46, height: 40 }), selectionRect: { x: 27, y: 26, width: 46, height: 40 }, zoom: 100, selectedHistoryId: 'original',
  history: [
    { id: 'original', label: '原图 · 现在', tone: 'original' }, { id: 'variation-1', label: '文生图 · 1', tone: 'warm' },
    { id: 'variation-2', label: '文生图 · 2', tone: 'violet' }, { id: 'upscale-1', label: '放大 · 1', tone: 'upscale' },
  ], historyTab: 'operations', historyCollapsed: false, isGenerating: false, prompt: '一张春日黄昏海报，暖色天空，远山和树影，安静、留白、杂志感', composerMode: 'edit', composerPlacement: 'floating', composerMinimized: false, composerSourceId: 'draivio-cloud',
  composerParameters: { model: 'Image Pro', size: '1024 × 1024', ratio: '1:1', count: '4 张', strength: '强度 48%' },
  layers: [{ id: 'art', source: 'fixture', name: '春日海报 · 变体 1', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' }, { id: 'mask', name: '局部蒙版', className: 'layer-mask', visible: true, opacity: 100, blendMode: '正常' }, { id: 'original', source: 'fixture', name: '原图', className: 'layer-original', visible: false, opacity: 100, blendMode: '正常' }], selectedLayerId: 'art', notice: null, brushColor: '#ff765f', brushStrokes: [], canvasTexts: [], canvasShapes: [], layerMasks: {}, cropRect: null, canvasRotation: 0, sceneOrder: [], canvasOffset: { x: 0, y: 0 }, undoStack: [], redoStack: [],
}

function snapshot(state: EditorState): EditorSnapshot {
  const { layers, selectedLayerId, history, selectedHistoryId, selectionVisible, selection, selectionRect, prompt, composerMode, composerSourceId, composerParameters, brushStrokes, canvasTexts, canvasShapes, layerMasks, cropRect, sceneOrder } = state
  return { layers, selectedLayerId, history, selectedHistoryId, selectionVisible, selection, selectionRect, prompt, composerMode, composerSourceId, composerParameters, brushStrokes, canvasTexts, canvasShapes, layerMasks, cropRect, sceneOrder }
}
function commit(state: EditorState, next: EditorState): EditorState { return { ...next, undoStack: [...state.undoStack, snapshot(state)].slice(-30), redoStack: [] } }

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
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
    case 'set-generating': return { ...state, isGenerating: action.value }
    case 'append-history': return { ...state, history: [...state.history, action.item], selectedHistoryId: action.item.id }
    case 'complete-ai-operation': {
      const { request } = action
      const count = Math.min(8, Math.max(1, Number.parseInt(request.parameters.count, 10) || 1))
      const label = request.mode === 'edit' ? '修改当前图' : '生成新内容'
      const layers: Layer[] = Array.from({ length: count }, (_, index) => ({
        id: `${action.id}-${index + 1}`, name: `${label} · ${index + 1}`,
        className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', aiOperation: request,
      }))
      const history: HistoryItem[] = layers.map((layer) => ({ id: layer.id, label: layer.name, tone: 'mint' }))
      return commit(state, { ...state, layers: [...layers, ...state.layers], selectedLayerId: layers[0].id,
        history: [...state.history, ...history], selectedHistoryId: layers[0].id, isGenerating: false,
        notice: `已模拟新增 ${count} 个结果图层 · ${request.selection ? '选区范围' : '整张画布'}` })
    }
    case 'set-zoom': return { ...state, zoom: Math.min(400, Math.max(10, action.zoom)) }
    case 'set-selection-visible': return { ...state, selectionVisible: action.visible }
    case 'set-selection-rect': return { ...state, selection: createSelection(state.selection.kind, action.rect, state.selection), selectionRect: action.rect, selectionVisible: true }
    case 'commit-selection': return commit(state, { ...state, selection: action.selection, selectionRect: action.selection.rect, selectionVisible: true })
    case 'invert-selection': { const selection = invertSelection(state.selection); return commit(state, { ...state, selection, selectionRect: selection.rect, selectionVisible: true }) }
    case 'morph-selection': { const selection = morphSelection(state.selection, action.amount); return commit(state, { ...state, selection, selectionRect: selection.rect, selectionVisible: true }) }
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
    case 'add-layer': { const id = `layer-${Date.now()}`; return commit(state, { ...state, layers: [{ id, name: `新图层 ${state.layers.length + 1}`, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' }, ...state.layers], selectedLayerId: id, notice: '已新建图层' }) }
    case 'select-layer': return { ...state, selectedLayerId: action.id }
    case 'toggle-layer': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, visible: !layer.visible } : layer) })
    case 'set-layer-opacity': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, opacity: Math.max(0, Math.min(100, action.opacity)) } : layer) })
    case 'set-layer-blend': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, blendMode: action.blendMode } : layer) })
    case 'add-stroke': return state // Legacy point API is replaced by atomic continuous strokes.
    case 'remove-stroke': return commit(state, { ...state, brushStrokes: state.brushStrokes.filter((stroke) => stroke.id !== action.id) })
    case 'add-canvas-text': return commit(state, { ...state, canvasTexts: [...state.canvasTexts, { ...action.text, layerId: state.selectedLayerId, fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: state.brushColor, align: 'left' }], notice: '已添加文字' })
    case 'set-canvas-offset': return { ...state, canvasOffset: { x: action.x, y: action.y } }
    case 'set-brush-color': return { ...state, brushColor: action.color, notice: `已取色 ${action.color}` }
    case 'commit-brush-stroke': return commit(state, { ...state, brushStrokes: [...state.brushStrokes, action.stroke], sceneOrder: [...state.sceneOrder, action.stroke.id] })
    case 'upsert-text': return commit(state, { ...state, canvasTexts: [...state.canvasTexts.filter((object) => object.id !== action.object.id), action.object], sceneOrder: state.sceneOrder.includes(action.object.id) ? state.sceneOrder : [...state.sceneOrder, action.object.id] })
    case 'add-shape': return commit(state, { ...state, canvasShapes: [...state.canvasShapes, action.shape], sceneOrder: [...state.sceneOrder, action.shape.id] })
    case 'selection-to-mask': {
      const selection = action.selection ?? (state.selectionVisible ? state.selection : undefined)
      if (!selection || selection.rect.width <= 0 || selection.rect.height <= 0) return { ...state, notice: '请先创建有效选区或闭合路径' }
      return commit(state, { ...state, layerMasks: { ...state.layerMasks, [state.selectedLayerId]: { selection, strokes: [], inverted: false, applied: false } }, notice: '选区已创建为图层蒙版' })
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
    case 'commit-layer-transform': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.layerId ? { ...layer, transform: action.transform } : layer) })
    case 'commit-crop': return commit(state, { ...state, cropRect: action.rect, selectionVisible: false, notice: '裁剪已应用，可撤销' })
    case 'set-canvas-rotation': return { ...state, canvasRotation: ((action.rotation % 360) + 360) % 360 }
    case 'rasterize-layer': {
      const layerMasks = { ...state.layerMasks }; delete layerMasks[action.id]
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, source: action.source, transform: undefined } : layer), layerMasks, brushStrokes: state.brushStrokes.filter((s) => s.layerId !== action.id), canvasTexts: state.canvasTexts.filter((s) => s.layerId !== action.id), canvasShapes: state.canvasShapes.filter((s) => s.layerId !== action.id) })
    }
    case 'set-layer-source': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, source: action.source } : layer) })
    case 'import-image': {
      const historyItem = { id: action.id, label: `导入 · ${action.name}`, tone: 'original' as const }
      return commit(state, { ...state, layers: [{ id: action.id, name: action.name, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: action.source }, ...state.layers], selectedLayerId: action.id, history: [...state.history, historyItem], selectedHistoryId: action.id, notice: `已导入 ${action.name}` })
    }
    case 'undo': { const previous = state.undoStack.at(-1); if (!previous) return { ...state, notice: '没有可撤销的操作' }; return { ...state, ...previous, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, snapshot(state)], notice: '已撤销' } }
    case 'redo': { const next = state.redoStack.at(-1); if (!next) return { ...state, notice: '没有可重做的操作' }; return { ...state, ...next, undoStack: [...state.undoStack, snapshot(state)], redoStack: state.redoStack.slice(0, -1), notice: '已重做' } }
    default: return state
  }
}

const EditorContext = createContext<{ state: EditorState; dispatch: Dispatch<EditorAction> } | null>(null)
export function EditorProvider({ children }: { children: ReactNode }) { const [state, dispatch] = useReducer(editorReducer, initialEditorState); const value = useMemo(() => ({ state, dispatch }), [state]); return <EditorContext.Provider value={value}>{children}</EditorContext.Provider> }
export function useEditor() { const context = useContext(EditorContext); if (!context) throw new Error('useEditor must be used within EditorProvider'); return context }
