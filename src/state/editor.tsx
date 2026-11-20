import type { GenerationMetadata } from '../creation/generationMetadata'
import { useCloudModelDefaults } from '../account/useCloudModelDefaults'
import {resultSizeLabel} from '../creation/resultImage'
import {RasterProjectPreview} from '../document/RasterProjectPreview'
import type { RasterReference } from '../assets/imageAssetTypes'
import { validateRasterReference, editorResourceRoots, imageResourceOwnership } from '../assets/imageAssetStore'
import { layerStyleUnavailableReason } from '../layers/layerStyleCapability'
import { LayerStyleEditorProvider } from '../layers/LayerStyleEditor'
import { SmartFilterEditorProvider } from '../layers/SmartFilterEditor'
import { groupSelectedLayers, placeLayer, type LayerPlacement } from '../layers/layerPanelModel'
import { translateMoveTargets, type MoveTarget } from '../canvas/moveTargets'
import type { ProductRecord } from '../ai/recipes/product'
import type { AIRecovery } from '../ai/persistence/editRecord'
import type { CmykRaster } from '../color/cmykRaster'
import type { SavedRecipe } from '../ai/recipes/runner'
import type { ConversationRun } from '../ai/conversation/session'
import { rebaseOutpaintLayers } from '../ai/outpaint/rebase'
import type { OutpaintProvenance } from '../ai/outpaint/workflow'
import { validatePrecisionAsset, type PrecisionAsset } from '../render/precisionAsset'
import { validateSmartFilters, type SmartFilterChain } from '../render/filterPipeline'
import type { MaskedEditProvenance } from '../ai/maskedEdit/workflow'
import {validateEffects, type LayerEffects} from '../render/layerEffects'
import type { FillMetadata } from '../retouch/contentFill'
import { normalizePreset } from '../adjustments/presets'
import { contentRevision } from '../ai/context/editorContext'
import { clippingSiblings, createClipping, releaseInvalidClipping } from './clipping'
import { resolveBlendMode } from '../render/blendModes'
import { defaultProfile, type ColorManagementSettings } from '../color/iccPipeline'
import { applyLayerMerge, ungroupLayers, type MergeResult } from '../document/groupTransforms'
import { contextCanCommit } from '../ai/context/editorContext'
import type { EditorRequestContext } from '../ai/context/editorContext'
import { deleteLayerTrees, layerSubtreeIds, duplicateLayerTree, effectiveLayerState, layerWriteIsLocked, layerParentId } from './layerHierarchy'
import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { selectionToLayer } from '../canvas/layerCoordinates'
import { dimensionError, resizedDocument, layerPixelScale, type DocumentAnchor } from '../document/documentGeometry'
import { ImageGenerationProvider } from '../creation/ImageGeneration'
import { ResultDeliveryProvider } from '../creation/ResultDelivery'
import { ComposerDraftProvider } from '../creation/ComposerDraft'
import { createDocumentWorkspace, workspaceReducer, type DocumentSession, type WorkspaceAction } from '../document/documentWorkspace'
import { DocumentWorkspaceProvider } from '../document/DocumentWorkspaceProvider'
import { defaultGenerationCount, readComposerPreferences, readGenerationCount, saveComposerPreferences, saveGenerationCount } from '../creation/composerPreferences'
import { isValidOutputFormat, type OutputRatio } from '../creation/outputFormats'
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'
import { createSelection, invertSelection, morphSelection, type Selection, type SelectionRect } from '../canvas/selectionGeometry'
import type { BrushStroke } from '../canvas/BrushEngine'
import type { CanvasTextObject } from '../canvas/TextObject'
import type { TransformDraft } from '../canvas/TransformOverlay'
import type { CanvasShape, LayerMask } from '../canvas/documentTypes'
import { createSmartObjectSource, rasterizeSmartObject, replaceSmartObjectInstance, updateLinkedInstances, validateSmartObjectGraph, type SmartObjectInstance, type SmartObjectSource } from '../document/smartObjects'
import { getTool } from '../tools/toolRegistry'
import type { ToolGroupId, ToolId, ToolOptions } from '../tools/toolTypes'
import type { PixelFormat } from '../render/pixelBuffer'
import type { ModelSourceId } from '../creation/modelSources'
import { arrangeLayers, type AlignmentMode, type AlignmentTarget } from '../document/alignment'
import { defaultGuideSettings, updateGuideSettings, type GuideAction, type GuideSettings } from '../document/guides'
import { artboardReducer, duplicateArtboard, artboardCopyPreview, type Artboard } from '../canvas/artboards'
import { defaultSoftProofSettings, validateSoftProofSettings, type SoftProofSettings } from '../color/softProof'

/** Legacy alias retained for existing canvas and rail consumers. */
export type Tool = ToolId
export type InspectorTab = 'generate' | 'edit' | 'layers' | 'results'
export type HistoryItem = { id: string; label: string; tone: 'original' | 'warm' | 'violet' | 'upscale' | 'mint' }
export type ComposerMode = 'generate' | 'edit'
export type ComposerPlacement = 'floating' | 'right'
export type ComposerParameter = 'model' | 'size' | 'ratio' | 'count' | 'strength'
export type ComposerParameters = Record<ComposerParameter, string>
export type HistoryTab = 'operations' | 'results' | 'compare'
export type AIOperation = { generationMetadata?: GenerationMetadata; restoration?: {width:number;height:number;scale:2|4;mode:'size'|'detail'|'deblur';backend:string}; generationJob?: { batchId:string; jobId:string; attemptId:string }; outpaint?: OutpaintProvenance; maskedEdit?: MaskedEditProvenance; context?: EditorRequestContext; mode: ComposerMode; intent?: 'generate' | 'edit' | 'reference'; prompt: string; sourceLayerId: string; selection: Selection | null; parameters: ComposerParameters; sourceId?: ModelSourceId; modelCode?: string; reference?: { source: string; thumbnail?: string; layerId: string } }
import { defaultCurves, validateCurves, type CurvesSettings } from '../adjustments/curves'
import { defaultLevels, validateLevels, type LevelsSettings } from '../adjustments/levels'
import { defaultColorBalance, defaultHsl, type ColorBalanceSettings, type HslSettings } from '../adjustments/hsl'
import { shiftTextRunRanges } from '../text/paragraphLayout'
import { validateRawSourceRecord, type RawSourceRecord } from '../raw/rawPipeline'
import type { WarpRecipe } from '../filters/warp'
export type LayerAdjustments = { brightness: number; contrast: number; saturation: number; temperature: number; tint?: number; sharpness: number; blur: number; shadows: number; highlights: number; exposureEV?: number; whiteBalance?: { r: number; g: number; b: number }; curves?: CurvesSettings; levels?: LevelsSettings; hsl?: HslSettings; colorBalance?: ColorBalanceSettings }
export const neutralAdjustments: LayerAdjustments = { brightness: 0, contrast: 0, saturation: 0, temperature: 0, sharpness: 0, blur: 0, shadows: 0, highlights: 0, exposureEV: 0, curves: defaultCurves(), levels: defaultLevels(), hsl: defaultHsl(), colorBalance: defaultColorBalance() }
export type AIResultStatus = 'loading' | 'success' | 'partial-failure' | 'error'
export type AIResult = { generationMetadata?: GenerationMetadata; id: string; source?: string; thumbnail?: string; prompt: string; model: string; provider: string; size: string; createdAt: string; status: AIResultStatus; favorite: boolean; adopted: boolean; error?: string; request?: AIOperation }
export type Layer = { rasterRef?: RasterReference; sourceOffset?: { x: number; y: number }; posterProtection?: { reason: 'logo-protected' | 'source-protected'; sourceLayerId: string }; productRecipe?: ProductRecord; warpRecipe?: WarpRecipe; sourceInterpolation?: 'nearest'; highPrecision?: PrecisionAsset; rawSource?: RawSourceRecord; maskedCompositeSourceIds?: string[]; maskedCompositeBackground?: boolean; smartFilters?: SmartFilterChain; effects?: LayerEffects; smartObject?: SmartObjectInstance; contentFill?: FillMetadata & { sampling: 'automatic' | 'manual'; sourceRevision: string; sourceLayerId: string }; clipBaseId?: string; mergeBatchId?: string; inputProfile?: { bytes: number[]; checksum: string; policy: 'preserve' | 'assign' }; documentSpace?: boolean; preserveSourceAlpha?: boolean; repairCoverage?: string; repairSourceIds?: string[]; contentWidth?: number; contentHeight?: number; source?: string; thumbnail?: string; transform?: TransformDraft; aiOperation?: AIOperation; id: string; name: string; className: string; kind?: 'image' | 'text' | 'shape' | 'group' | 'mask' | 'adjustment' | 'ai-result'; textObjectId?: string; visible: boolean; locked?: boolean; opacity: number; blendMode: string; groupId?: string; children?: string[]; collapsed?: boolean; adjustments?: LayerAdjustments }
export type CanvasStroke = { id: string; x: number; y: number; size: number; color: string }
export type CanvasText = { id: string; x: number; y: number; text: string }
export type { SelectionRect } from '../canvas/selectionGeometry'
type EditorSnapshot = Pick<EditorState, 'colorModel' | 'cmykRaster' | 'aiRecovery' | 'savedRecipes' | 'conversationRuns' | 'pixelFormat' | 'documentWidth' | 'documentHeight' | 'documentBackground' | 'colorManagement' | 'proofSettings' | 'guideSettings' | 'layers' | 'smartObjectSources' | 'selectedCanvasTargets' | 'selectedLayerId' | 'selectedLayerIds' | 'aiResults' | 'history' | 'selectedHistoryId' | 'selectionVisible' | 'selection' | 'selectionRect' | 'prompt' | 'composerMode' | 'composerSourceId' | 'composerParameters' | 'brushStrokes' | 'canvasTexts' | 'canvasShapes' | 'layerMasks' | 'cropRect' | 'sceneOrder' | 'adjustmentPresets' | 'artboards' | 'activeArtboardId'>
export type EditorState = { rasterPreviewOnly?: boolean; selectedCanvasTargets?: MoveTarget[]; aiRecovery?: AIRecovery; colorModel?: 'rgb' | 'cmyk'; cmykRaster?: CmykRaster; savedRecipes?: SavedRecipe[]; conversationRuns?: ConversationRun[]; pixelFormat: PixelFormat; curvePreviewOffLayerId?: string; colorManagement: ColorManagementSettings; proofSettings: SoftProofSettings; guideSettings: GuideSettings; documentWidth: number; documentHeight: number; documentBackground: string; activeTool: Tool; activeToolGroup: ToolGroupId; activeToolId: ToolId; recentToolByGroup: Record<ToolGroupId, ToolId>; toolOptions: ToolOptions; inspectorTab: InspectorTab; selectionVisible: boolean; selection: Selection; selectionRect: SelectionRect; zoom: number; selectedHistoryId: string; history: HistoryItem[]; historyTab: HistoryTab; historyCollapsed: boolean; isGenerating: boolean; prompt: string; composerMode: ComposerMode; composerPlacement: ComposerPlacement; composerMinimized: boolean; composerSourceId: ModelSourceId; composerParameters: ComposerParameters; layers: Layer[]; smartObjectSources: Record<string, SmartObjectSource>; selectedLayerId: string; selectedLayerIds: string[]; aiResults: AIResult[]; notice: string | null; brushColor: string; backgroundColor?: string; recentColors: string[]; brushStrokes: BrushStroke[]; canvasTexts: CanvasTextObject[]; canvasShapes: CanvasShape[]; layerMasks: Record<string, LayerMask>; cropRect: SelectionRect | null; canvasRotation: number; sceneOrder: string[]; adjustmentPresets: Array<Record<string, unknown>>; canvasOffset: { x: number; y: number }; artboards: Artboard[]; activeArtboardId: string | null; undoStack: EditorSnapshot[]; redoStack: EditorSnapshot[] }
export type EditorAction = {type:'import-raster-reference';id:string;name:string;rasterRef:RasterReference;width:number;height:number} | {type:'apply-raw';id:string;name:string;record:RawSourceRecord;asset:PrecisionAsset;preview:string;expectedState:EditorState;replace:boolean} | {type:'import-precision-image';id:string;name:string;asset:PrecisionAsset;preview:string} | {type:'set-precision-resource';id:string;asset:PrecisionAsset;preview:string;expectedAsset:PrecisionAsset} | { type: 'set-smart-filters'; id: string; chain: SmartFilterChain; expectedLayer?: Layer; expectedSourceRevision?: number }
  | { type: 'set-layer-warp'; id: string; recipe: WarpRecipe } | {type:'set-layer-effects';id:string;effects:LayerEffects;expectedEffects?:LayerEffects|null}
  | { type: 'convert-to-smart-object'; id: string }
  | { type: 'replace-smart-object'; id: string; source: SmartObjectSource; expectedSource?: SmartObjectSource }
  | { type: 'update-smart-object-source'; sourceId: string; patch: Partial<SmartObjectSource>; baseRevision?: number; expectedSource?: SmartObjectSource }
  | { type: 'rasterize-smart-object'; id: string; source?: string; baseRevision?: number; expectedSource?: SmartObjectSource }
  | { type: 'duplicate-smart-object-independent'; id: string }
  | { type: 'ungroup-layers'; id: string }
  | { type: 'merge-layer-result'; result: MergeResult }
  | { type: 'set-color-management'; settings: ColorManagementSettings }
  | { type: 'set-soft-proof'; settings: SoftProofSettings }
  | { type: 'set-pixel-format'; format: PixelFormat }
  | { type: 'update-guide-settings'; action: GuideAction }
  | { type: 'select-tool'; tool: Tool }
  | { type: 'set-temporary-tool'; tool: Tool }
  | { type: 'set-tool-options'; options: ToolOptions }
  | { type: 'select-tab'; tab: InspectorTab }
  | { type: 'reveal-layer-in-inspector'; id: string }
  | { type: 'select-history'; id: string }
  | { type: 'set-prompt'; prompt: string }
  | { type: 'clear-submitted-prompt'; prompt: string }
  | { type: 'set-generating'; value: boolean }
  | { type: 'append-history'; item: HistoryItem }
  | { type: 'append-ai-result'; id: string; request: AIOperation; image: string; index: number }
  | { type: 'add-ai-result'; result: AIResult }
  | { type: 'toggle-ai-result-favorite'; id: string }
  | { type: 'adopt-ai-result-as-layer'; id: string }
  | { type: 'adopt-outpaint-result'; id: string }
  | { type: 'replace-layer-with-ai-result'; targetId: string; resultId: string }
  | { type: 'delete-ai-result'; id: string }
  | { type: 'complete-ai-operation'; id: string; request: AIOperation }
  | { type: 'set-zoom'; zoom: number }
  | { type: 'set-selection-visible'; visible: boolean }
  | { type: 'clear-selection' }
  | { type: 'set-selection-rect'; rect: SelectionRect }
  | { type: 'commit-selection'; selection: Selection }
  | { type: 'invert-selection' }
  | { type: 'morph-selection'; amount: number }
  | { type: 'set-composer-mode'; mode: ComposerMode }
  | { type: 'set-composer-source'; sourceId: ModelSourceId }
  | { type: 'set-default-composer-model'; sourceId: ModelSourceId; model: string }
  | { type: 'set-composer-placement'; placement: ComposerPlacement }
  | { type: 'set-composer-minimized'; minimized: boolean }
  | { type: 'set-output-format'; ratio: OutputRatio; size: string }
  | { type: 'set-composer-parameter'; parameter: ComposerParameter; value: string }
  | { type: 'set-history-tab'; tab: HistoryTab }
  | { type: 'set-history-collapsed'; collapsed: boolean }
  | { type: 'clear-history' }
  | { type: 'set-notice'; message: string | null }
  | { type: 'add-layer' }
  | { type: 'add-adjustment-layer' }
  | { type: 'set-selected-layer-properties'; ids: string[]; opacity?: number; blendMode?: string }
  | { type: 'place-layer'; id: string; targetId: string; placement: LayerPlacement }
  | { type: 'update-layer-mask'; id: string; operation: 'toggle' | 'invert' | 'apply' | 'delete' }
  | { type: 'add-layer-mask'; id: string }
  | { type: 'add-layer-group' }
  | { type:'select-canvas-targets'; targets:MoveTarget[] }
  | { type:'update-canvas-objects'; shapes?:CanvasShape[]; texts?:CanvasTextObject[] }
  | { type: 'select-layers'; ids: string[]; keyId?: string }
  | { type: 'select-layer'; id: string; additive?: boolean }
  | { type: 'toggle-layer-selection'; id: string }
  | { type: 'batch-toggle-layer'; ids: string[]; property: 'visible' | 'locked' }
  | { type: 'batch-delete-layers'; ids: string[] }
  | { type: 'group-layers'; ids: string[] }
  | { type: 'toggle-group'; id: string }
  | { type: 'toggle-layer'; id: string }
  | { type: 'set-layer-opacity'; id: string; opacity: number }
  | { type: 'create-clipping' | 'release-clipping'; id: string }
  | { type: 'set-layer-blend'; id: string; blendMode: string }
  | { type: 'rename-layer'; id: string; name: string }
  | { type: 'toggle-layer-lock'; id: string }
  | { type: 'duplicate-layer'; id: string }
  | { type: 'delete-layer'; id: string }
  | { type: 'reorder-layer'; id: string; direction: 'up' | 'down' }
  | { type: 'move-layer'; id: string; toIndex: number }
  | { type: 'align-layers'; mode: AlignmentMode; target?: AlignmentTarget; reference?: SelectionRect }
  | { type: 'distribute-layers'; axis: 'horizontal' | 'vertical' }
  | { type: 'add-result-layer'; resultId: string }
  | { type: 'replace-layer-with-result'; targetId: string; resultId: string }
  | { type: 'set-layer-adjustment'; id: string; key: keyof LayerAdjustments; value: number }
  | { type: 'set-layer-adjustments'; id: string; adjustments: LayerAdjustments }
  | { type: 'set-adjustment-presets'; presets: Array<Record<string, unknown>> }
  | { type: 'set-curve-preview'; id?: string }
  | { type: 'set-layer-curves'; id: string; curves: CurvesSettings }
  | { type: 'set-layer-levels'; id: string; levels: LevelsSettings }
  | { type: 'set-layer-white-balance'; id: string; value: { r: number; g: number; b: number } }
  | { type: 'set-layer-hsl'; id: string; channel: 'global' | 'red' | 'orange' | 'yellow' | 'green' | 'cyan' | 'blue'; key: 'hue' | 'saturation' | 'lightness' | 'range'; value: number }
  | { type: 'set-layer-color-balance'; id: string; tone: 'shadows' | 'midtones' | 'highlights'; key: 'cyanRed' | 'magentaGreen' | 'yellowBlue'; value: number }
  | { type: 'set-layer-preserve-luminosity'; id: string; value: boolean }
  | { type: 'reset-layer-adjustments'; id: string }
  | { type: 'add-stroke'; stroke: CanvasStroke }
  | { type: 'remove-stroke'; id: string }
  | { type: 'add-canvas-text'; text: CanvasText }
  | { type: 'create-text-layer'; object: CanvasTextObject }
  | { type: 'set-canvas-offset'; x: number; y: number }
  | { type: 'set-brush-color'; color: string }
  | { type: 'set-background-color'; color: string }
  | { type: 'swap-colors' }
  | { type: 'reset-colors' }
  | { type: 'commit-brush-stroke'; stroke: BrushStroke }
  | { type: 'upsert-text'; object: CanvasTextObject }
  | { type: 'create-shape-layer'; shape: CanvasShape }
  | { type: 'add-shape'; shape: CanvasShape }
  | { type: 'update-shape'; shape: CanvasShape }
  | { type: 'combine-shapes'; shape: CanvasShape; sourceIds: string[] }
  | { type: 'selection-to-mask'; selection?: Selection; refinement?: LayerMask['refinement']; layerId?: string }
  | { type: 'commit-mask'; mask: LayerMask }
  | { type: 'invert-mask' }
  | { type: 'clear-mask' }
  | { type: 'apply-mask' }
  | { type: 'move-canvas-targets'; targets: MoveTarget[]; delta: { x: number; y: number } }
  | { type: 'commit-layer-transform'; layerId: string; transform: TransformDraft }
  | { type: 'commit-crop'; rect: SelectionRect }
  | { type: 'set-canvas-rotation'; rotation: number }
  | { type: 'rasterize-layer'; id: string; source: string }
  | { type: 'add-repair-layer'; preserveSourceAlpha?: boolean; source: string; name: string; baseLayerId: string; baseContentRevision?: string; contentFill?: Layer['contentFill']; baseUndoLength?: number; rootPlacement?: boolean; placementParentId?: string; frontierParentId?: string; repairCoverage?: string; repairSourceIds?: string[] }
  | { type: 'set-layer-source'; id: string; source: string }
  | { type: 'import-image'; inputProfile?: Layer['inputProfile']; id: string; name: string; source: string; width?: number; height?: number; autoSize?: boolean }
  | { type: 'resize-document'; width: number; height: number; mode: 'canvas' | 'image'; anchor?: DocumentAnchor; background?: string }
  | { type: 'new-document'; width: number; height: number; background?: string; colorManagement?: ColorManagementSettings }
  | { type: 'add-artboard'; board: Artboard }
  | { type: 'update-artboard'; id: string; name: string; x: number; y: number }
  | { type: 'reorder-artboard'; id: string; direction: 'up' | 'down' }
  | { type: 'remove-artboard'; id: string }
  | { type: 'move-artboard'; id: string; x: number; y: number }
  | { type: 'duplicate-artboard'; sourceId: string; id: string; name: string; width: number; height: number; mode: 'scale' | 'crop' }
  | { type: 'set-active-artboard'; id: string | null }
  | { type: 'move-layer-to-artboard'; layerId: string; from: string; to: string }
  | { type: 'restore-project'; document: Partial<EditorState> }
  | { type: 'apply-edit-plan' | 'apply-conversation-undo'; document: Partial<EditorState> }
  | { type: 'apply-cmyk-document'; document: Partial<EditorState>; expectedState: EditorState }
  | { type: 'undo' }
  | { type: 'redo' }

function readRecentColors() {
  if (typeof window === 'undefined') return []
  try {
    const value = JSON.parse(window.localStorage.getItem('draivio-recent-colors') ?? '[]')
    return Array.isArray(value) ? value.filter((color): color is string => /^#[0-9a-f]{6}$/i.test(color)).slice(0, 20) : []
  } catch { return [] }
}

function readStoredTextColor() {
  if (typeof window === 'undefined') return undefined
  try {
    const value = window.localStorage.getItem('draivio-text-color') ?? ''
    return /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined
  } catch { return undefined }
}

function rememberColor(colors: string[], color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return colors
  return [color.toLowerCase(), ...colors.filter((item) => item.toLowerCase() !== color.toLowerCase())].slice(0, 20)
}

export const initialEditorState: EditorState = {
  pixelFormat: 'rgba8',
  colorManagement: { profile: defaultProfile(), renderingIntent: 'relative-colorimetric' }, proofSettings: defaultSoftProofSettings(), guideSettings: defaultGuideSettings(), documentWidth: 500, documentHeight: 625, documentBackground: 'transparent',
  activeTool: 'select', activeToolGroup: 'select-move', activeToolId: 'select', recentToolByGroup: { 'select-move': 'select', selection: 'selection', brush: 'brush', 'erase-heal': 'eraser', mask: 'mask', 'crop-transform': 'crop', 'text-shape': 'text', 'color-fill': 'picker', navigation: 'pan', cutout: 'cutout', upscale: 'upscale' }, toolOptions: {}, inspectorTab: 'layers', selectionVisible: false, selection: createSelection('rectangle', { x: 0, y: 0, width: 0, height: 0 }), selectionRect: { x: 0, y: 0, width: 0, height: 0 }, zoom: 100, selectedHistoryId: 'original',
  history: [
    { id: 'original', label: '原图 · 现在', tone: 'original' }, { id: 'variation-1', label: '文生图 · 1', tone: 'warm' },
    { id: 'variation-2', label: '文生图 · 2', tone: 'violet' }, { id: 'upscale-1', label: '放大 · 1', tone: 'upscale' },
  ], historyTab: 'operations', historyCollapsed: false, isGenerating: false, prompt: '一张春日黄昏海报，暖色天空，远山和树影，安静、留白、杂志感', composerMode: 'edit', composerPlacement: 'floating', composerMinimized: false, composerSourceId: 'draivio-cloud',
  composerParameters: { model: 'Image Pro', size: '1024 × 1024', ratio: '1:1', count: defaultGenerationCount, strength: '强度 48%' },
  layers: [{ id: 'art', source: 'fixture', name: '春日海报 · 变体 1', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }, { id: 'original', source: 'fixture', name: '原图', className: 'layer-original', visible: false, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }], smartObjectSources: {}, selectedLayerId: 'art', selectedLayerIds: ['art'], aiResults: [], notice: null, brushColor: '#ff765f', backgroundColor: '#ffffff', recentColors: [], brushStrokes: [], canvasTexts: [], canvasShapes: [], layerMasks: {}, cropRect: null, canvasRotation: 0, sceneOrder: [], adjustmentPresets: [], canvasOffset: { x: 0, y: 0 },
  artboards: [{ id: 'board-1', name: '画板 1', x: 0, y: 0, width: 500, height: 625, background: 'transparent', layerIds: ['art', 'original'] }], activeArtboardId: 'board-1', undoStack: [], redoStack: [],
}

export function snapshot(state: EditorState): EditorSnapshot {
  const { pixelFormat, colorManagement, proofSettings, documentWidth, documentHeight, documentBackground, layers, smartObjectSources, selectedCanvasTargets, selectedLayerId, selectedLayerIds, aiResults, history, selectedHistoryId, selectionVisible, selection, selectionRect, prompt, composerMode, composerSourceId, composerParameters, brushStrokes, canvasTexts, canvasShapes, layerMasks, cropRect, sceneOrder, adjustmentPresets, artboards, activeArtboardId } = state
  return { colorModel: state.colorModel, cmykRaster: state.cmykRaster, aiRecovery: state.aiRecovery, savedRecipes: state.savedRecipes, conversationRuns: state.conversationRuns, pixelFormat, colorManagement, proofSettings, guideSettings: state.guideSettings, documentWidth, documentHeight, documentBackground, layers, smartObjectSources, selectedCanvasTargets, selectedLayerId, selectedLayerIds, aiResults, history, selectedHistoryId, selectionVisible, selection, selectionRect, prompt, composerMode, composerSourceId, composerParameters, brushStrokes, canvasTexts, canvasShapes, layerMasks, cropRect, sceneOrder, adjustmentPresets, artboards, activeArtboardId }
}
function commit(state: EditorState, next: EditorState): EditorState {
 const layers=releaseInvalidClipping(next.layers)
 // Reordering/deleting a base must not implicitly release a locked dependent.
 if(layers.some(l=>state.layers.find(old=>old.id===l.id)?.clipBaseId!==l.clipBaseId && effectiveLayerState(state.layers,l.id).locked))return {...state,notice:'操作会改变锁定图层的剪贴链，请先解锁'}
 const liveIds = new Set(layers.map(layer => layer.id))
 const priorIds = new Set(state.layers.map(layer => layer.id))
 const added = layers.filter(layer => !priorIds.has(layer.id)).map(layer => layer.id)
 const assigned = new Set(next.artboards.flatMap(board => board.layerIds))
 const singleLegacy = next.artboards.length === 1
 const artboards = next.artboards.map(board => ({ ...board, layerIds: singleLegacy ? [...liveIds] : [...board.layerIds.filter(id => liveIds.has(id)), ...(board.id === next.activeArtboardId ? added.filter(id => !assigned.has(id)) : [])] }))
 return { ...next, layers, artboards, undoStack: [...state.undoStack, snapshot(state)].slice(-30), redoStack: [] }
}

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  // Consuming a submitted draft is UI state, not a canvas edit or undo entry.
  if(action.type==='clear-submitted-prompt')return state.prompt===action.prompt?{...state,prompt:''}:state
  if(state.rasterPreviewOnly && action.type!=='set-notice')return {...state,notice:'此项目当前为只读预览；原件已保留，尚未启用区域编辑与原始精度导出'}
  if(action.type==='set-layer-effects'){const reason=layerStyleUnavailableReason(state,action.id);if(reason)return {...state,notice:reason};if(action.expectedEffects!==undefined&&JSON.stringify(state.layers.find(l=>l.id===action.id)?.effects??null)!==JSON.stringify(action.expectedEffects))return {...state,notice:'图层样式已被其他操作修改，请恢复打开时状态后重新编辑。'}}
  if (action.type === 'apply-cmyk-document' && action.expectedState !== state) return { ...state, notice: '文档已更改，请重新预览 CMYK 转换' }
  // A CMYK raster is authoritative; RGB-only tools must use an explicit working copy.
  if (state.colorModel === 'cmyk') {
    const ui = new Set(['select-canvas-targets','set-brush-color','set-background-color','swap-colors','reset-colors','undo','redo','restore-project','set-notice','select-tab','reveal-layer-in-inspector','select-layer','select-layers','set-zoom','set-canvas-offset','set-canvas-rotation','set-active-tool','set-tool','set-active-tool-group','set-tool-option','set-prompt','set-composer-mode','set-composer-placement','set-composer-minimized','set-composer-parameter','set-composer-source','set-output-format','set-selection-visible','clear-selection','toggle-selection','select-history','set-history-tab','set-history-collapsed','select-tool','set-temporary-tool','set-tool-options','toggle-layer-selection','new-document','select-artboard','set-active-artboard','set-generating'])
    const conversion = action.type === 'apply-cmyk-document' && (action.document.colorModel === 'rgb' || action.document.colorModel === 'cmyk' && action.document.cmykRaster !== state.cmykRaster)
    if (!ui.has(action.type) && !conversion) return { ...state, notice: 'CMYK 通道保持不变。此工具仅支持 RGB，请先在文档模式中显式创建 RGB 工作副本。' }
  }

  if(action.type==='import-raster-reference') {
    validateRasterReference(action.rasterRef)
    const error=dimensionError(action.width,action.height)
    if(error)return {...state,notice:error}
    return commit(state,{...state,layers:[{id:action.id,name:action.name,className:'layer-art',kind:'image',visible:true,opacity:100,blendMode:'正常',rasterRef:{...action.rasterRef},contentWidth:action.width,contentHeight:action.height},...state.layers],selectedLayerId:action.id,selectedLayerIds:[action.id]})
  }
  if (layerWriteIsLocked(state, action)) return { ...state, notice: '图层或其祖先已锁定，请先解锁后再编辑' }
  const precisionTargetId = 'targetId' in action && typeof action.targetId === 'string' ? action.targetId : 'layerId' in action && typeof action.layerId === 'string' ? action.layerId : 'id' in action && typeof action.id === 'string' ? action.id : state.selectedLayerId
  const precisionTarget = state.layers.find(layer => layer.id === precisionTargetId)?.highPrecision
  const byteOnlyAction = /^(?:set-layer-adjustment|set-layer-adjustments|set-layer-curves|set-layer-levels|set-layer-white-balance|set-layer-hsl|set-layer-color-balance|set-layer-preserve-luminosity|set-layer-effects|set-smart-filters|convert-to-smart-object|set-layer-source|rasterize-layer|replace-layer-with-result|replace-layer-with-ai-result|add-stroke|commit-stroke|commit-brush-stroke|add-repair-layer)$/.test(action.type)
  const byteOnlyTool = (action.type === 'select-tool' || action.type === 'set-temporary-tool') && ['brush','erase-heal','color-fill','cutout','upscale'].includes(getTool(action.tool)?.groupId ?? '')
  if (precisionTarget && (byteOnlyAction || byteOnlyTool)) return {...state,notice:'此工具仅处理 8 位像素。请使用“高精度资源”中的曝光/曲线，或显式创建 8 位副本；原始资源未变。'}
  if (action.type === 'set-layer-hsl' || action.type === 'set-layer-color-balance') {
    if (!Number.isFinite(action.value)) return { ...state, notice: '调整参数必须是有限数值' }
    if (action.type === 'set-layer-hsl' && (!['global','red','orange','yellow','green','cyan','blue'].includes(action.channel) || !['hue','saturation','lightness','range'].includes(action.key))) return { ...state, notice: 'HSL 参数无效' }
    if (action.type === 'set-layer-color-balance' && (!['shadows','midtones','highlights'].includes(action.tone) || !['cyanRed','magentaGreen','yellowBlue'].includes(action.key))) return { ...state, notice: '色彩平衡参数无效' }
  }
  if (action.type === 'set-layer-adjustments') {
    try {
      normalizePreset({version:1,name:'validate',hsl:action.adjustments.hsl,colorBalance:action.adjustments.colorBalance})
      const finite = (value: unknown): boolean => typeof value === 'number' ? Number.isFinite(value) : !value || typeof value !== 'object' || Object.values(value).every(finite)
      if (!finite(action.adjustments)) throw new Error('调整参数必须是有限数值')
    } catch (error) { return { ...state, notice: error instanceof Error ? error.message : '调整无效' } }
  }
  switch (action.type) {
    case 'convert-to-smart-object': {
      const layer = state.layers.find(item => item.id === action.id)
      if (!layer) return { ...state, notice: '找不到智能对象图层' }
      if (layer.locked) return { ...state, notice: '图层已锁定，无法转换为智能对象' }
      if (layer.smartObject) return { ...state, notice: '图层已经是智能对象' }
      if (layer.children || layer.kind === 'adjustment') return { ...state, notice: '请先将分组或调整图层合成为独立内容' }
      const sourceId = `smart-source-${action.id}-${Date.now()}`
      const source = createSmartObjectSource(layer, sourceId, state)
      const sources = { ...state.smartObjectSources, [sourceId]: source }
      return commit(state, { ...state, smartObjectSources: sources, sceneOrder: state.sceneOrder.filter(id => !source.document!.sceneOrder.includes(id)), canvasTexts: state.canvasTexts.filter(item => item.layerId !== layer.id), canvasShapes: state.canvasShapes.filter(item => item.layerId !== layer.id), brushStrokes: state.brushStrokes.filter(item => item.layerId !== layer.id), layers: state.layers.map(item => item.id === action.id ? { ...item, sourceOffset: undefined, contentWidth: source.width, contentHeight: source.height, smartObject: { sourceId, linked: true, instanceWidth: source.width, instanceHeight: source.height } } : item), notice: '已转换为智能对象' })
    }
    case 'duplicate-smart-object-independent': {
      const layer = state.layers.find(item => item.id === action.id)
      const source = layer?.smartObject && state.smartObjectSources[layer.smartObject.sourceId]
      if (!source) return { ...state, notice: '智能对象源内容缺失' }
      const copied = duplicateLayerTree(state, action.id)
      const id = `smart-source-${crypto.randomUUID()}`
      return commit(state, { ...copied, smartObjectSources: { ...state.smartObjectSources, [id]: { ...structuredClone(source), id } }, layers: copied.layers.map(item => item.id === copied.selectedLayerId && item.smartObject ? { ...item, smartObject: { ...item.smartObject, sourceId: id, linked: true } } : item), notice: '已建立独立智能对象副本；普通复制共享源内容' })
    }
    case 'replace-smart-object': {
      const layer = state.layers.find(item => item.id === action.id)
      if (!layer?.smartObject) return { ...state, notice: '目标不是智能对象' }
      if (layer.locked) return { ...state, notice: '智能对象已锁定' }
      const sourceId = layer.smartObject.sourceId
      if (action.expectedSource && state.smartObjectSources[sourceId] !== action.expectedSource) return { ...state, notice: '源内容已改变，未替换过期结果' }
      const replacement = { ...action.source, id: sourceId, revision: (state.smartObjectSources[sourceId]?.revision ?? 0) + 1 }
      try { validateSmartObjectGraph({ ...state.smartObjectSources, [sourceId]: replacement }, sourceId); return commit(state, { ...state, smartObjectSources: { ...state.smartObjectSources, [sourceId]: replacement }, layers: state.layers.map(item => item.smartObject?.sourceId === sourceId && item.smartObject.linked ? replaceSmartObjectInstance(item, replacement) : item), notice: '智能对象内容已替换，共享实例一起更新' }) } catch (error) { return { ...state, notice: error instanceof Error ? error.message : '智能对象替换失败' } }
    }
    case 'update-smart-object-source': {
      const source = state.smartObjectSources[action.sourceId]
      if (!source) return { ...state, notice: '智能对象源内容缺失' }
      if (action.expectedSource && source !== action.expectedSource) return { ...state, notice: '源内容已改变，未回写过期草稿' }
      if (action.baseRevision !== undefined && action.baseRevision !== source.revision) return { ...state, notice: '源内容已改变，未回写过期草稿' }
      const next = { ...source, ...action.patch, id: source.id, revision: source.revision + 1 }
      try { validateSmartObjectGraph({ ...state.smartObjectSources, [action.sourceId]: next }, action.sourceId); return commit(state, { ...state, smartObjectSources: { ...state.smartObjectSources, [action.sourceId]: next }, layers: updateLinkedInstances(state.layers, action.sourceId, next), notice: '智能对象源内容已更新' }) } catch (error) { return { ...state, notice: error instanceof Error ? error.message : '智能对象更新失败' } }
    }
    case 'rasterize-smart-object': {
      const layer = state.layers.find(item => item.id === action.id)
      if (!layer?.smartObject) return { ...state, notice: '目标不是智能对象' }
      const source = state.smartObjectSources[layer.smartObject.sourceId]
      if (!source) return { ...state, notice: '智能对象源内容缺失' }
      if (action.expectedSource && source !== action.expectedSource) return { ...state, notice: '源内容已改变，已取消过期栅格化' }
      if (action.baseRevision !== undefined && action.baseRevision !== source.revision) return { ...state, notice: '源内容已改变，已取消过期栅格化' }
      if (source.document && !action.source) return { ...state, notice: '请先渲染智能对象源内容再栅格化' }
      return commit(state, { ...state, layers: state.layers.map(item => item.id === action.id ? rasterizeSmartObject(item, { ...source, source: action.source ?? source.source }) : item), notice: '智能对象已栅格化，可撤销恢复' })
    }
    case 'ungroup-layers': { try { return commit(state, ungroupLayers(state,action.id)) } catch(e) { return {...state,notice:e instanceof Error?e.message:'解组失败'} } }
    case 'merge-layer-result': { try { return commit(state,applyLayerMerge(state,action.result)) } catch(e) { return {...state,notice:e instanceof Error?e.message:'合并失败'} } }
    case 'set-color-management': return commit(state, { ...state, colorManagement: action.settings, notice: '已更新文档色彩空间' })
    case 'set-soft-proof': validateSoftProofSettings(action.settings); return { ...state, proofSettings: action.settings, notice: action.settings.enabled ? '已开启软打样' : '已关闭软打样' }
    case 'apply-raw': {
      if (state !== action.expectedState) return {...state, notice:'文档已改变，未应用过期RAW显影'}
      const old=state.layers.find(l=>l.id===action.id)
      if (action.replace && (!old?.rawSource || effectiveLayerState(state.layers,action.id).locked)) return {...state,notice:'RAW图层已改变或锁定'}
      try {validateRawSourceRecord(action.record);validatePrecisionAsset(action.asset)} catch(e){return {...state,notice:e instanceof Error?e.message:'RAW资源无效'}}
      if(!action.preview.startsWith('data:image/png;base64,'))return state
      const layer:Layer={...(old??{id:action.id,name:action.name,className:'layer-art',kind:'image',visible:true,opacity:100,blendMode:'正常'}),rasterRef:undefined,rawSource:action.record,highPrecision:action.asset,source:action.preview,thumbnail:action.preview,contentWidth:action.asset.width,contentHeight:action.asset.height}
      return commit(state,{...state,pixelFormat:'rgba16',layers:action.replace?state.layers.map(l=>l.id===layer.id?layer:l):[layer,...state.layers],selectedLayerId:layer.id,selectedLayerIds:[layer.id],notice:'已应用RAW显影；原始字节和参数保留，可撤销重开'})
    }
    case 'import-precision-image': {
      let asset: PrecisionAsset
      try { asset = validatePrecisionAsset(action.asset) } catch (error) { return { ...state, notice: error instanceof Error ? error.message : '高精度资源无效' } }
      if (state.layers.some(layer => layer.id === action.id) || !action.preview.startsWith('data:image/png;base64,')) return { ...state, notice: '高精度图层或预览无效' }
      const layer: Layer = {id: action.id, name: action.name, className:'layer-art',kind:'image',visible:true,opacity:100,blendMode:'正常',source:action.preview,thumbnail:action.preview,highPrecision:asset,contentWidth:asset.width,contentHeight:asset.height}
      return commit(state,{...state,pixelFormat:asset.format,layers:[layer,...state.layers],selectedLayerId:layer.id,selectedLayerIds:[layer.id],notice:'已导入高精度原始资源；画布仅显示8位预览，原始数值独立保留'})
    }
    case 'set-precision-resource': {
      const layer=state.layers.find(item=>item.id===action.id)
      if(!layer?.highPrecision || layer.highPrecision!==action.expectedAsset || effectiveLayerState(state.layers,layer.id).locked) return {...state,notice:'图层已改变或锁定，未应用过期高精度结果'}
      let asset: PrecisionAsset
      try { asset=validatePrecisionAsset(action.asset) } catch(error) {return {...state,notice:error instanceof Error?error.message:'高精度资源无效'}}
      if(asset.width!==layer.highPrecision.width||asset.height!==layer.highPrecision.height||!action.preview.startsWith('data:image/png;base64,'))return {...state,notice:'高精度结果尺寸或预览无效'}
      return commit(state,{...state,pixelFormat:asset.format,layers:state.layers.map(item=>item.id===layer.id?{...item,rasterRef:undefined,highPrecision:asset,source:action.preview,thumbnail:action.preview}:item),notice:'已应用高精度处理；原始资源可撤销恢复'})
    }
    case 'set-pixel-format': { if (!['rgba8','rgba16','rgba32f'].includes(action.format)) return { ...state, notice: '不支持的文档位深' }; return commit(state, { ...state, pixelFormat: action.format, notice: action.format === 'rgba8' ? '已切换 8 位文档' : '高精度格式将在导出时按能力矩阵处理' }) }
    case 'update-guide-settings': { try { return commit(state, { ...state, guideSettings: updateGuideSettings(state.guideSettings, action.action) }) } catch (error) { return { ...state, notice: error instanceof Error ? error.message : '参考线设置无效' } } }
    case 'select-tool': { const definition = getTool(action.tool); if (!definition) return state; return { ...state, activeTool: action.tool, activeToolGroup: definition.groupId, activeToolId: definition.id, recentToolByGroup: { ...state.recentToolByGroup, [definition.groupId]: definition.id } } }
    case 'set-temporary-tool': { const definition = getTool(action.tool); if (!definition) return state; return { ...state, activeTool: definition.id, activeToolGroup: definition.groupId, activeToolId: definition.id } }
    case 'set-tool-options': {
      const options = { ...state.toolOptions, ...action.options }
      const textColor = typeof action.options.textColor === 'string' && /^#[0-9a-f]{6}$/i.test(action.options.textColor) ? action.options.textColor.toLowerCase() : undefined
      const recentColors = textColor ? rememberColor(state.recentColors, textColor) : state.recentColors
      const ratio = options.fixedRatio === true ? String(options.selectionRatio ?? '1:1').split(':').map(Number) : null
      const mode = ['new', 'add', 'subtract', 'intersect'].includes(String(options.selectionMode)) ? options.selectionMode as Selection['mode'] : state.selection.mode
      const selection = { ...state.selection, mode, feather: typeof options.feather === 'number' ? Math.min(100, Math.max(0, options.feather)) : state.selection.feather, fixedRatio: ratio && ratio[0] > 0 && ratio[1] > 0 ? ratio[0] / ratio[1] : null }
      const next = { ...state, toolOptions: options, recentColors, selection }
      return selection.feather !== state.selection.feather ? commit(state, next) : next
    }
    case 'select-tab': return { ...state, inspectorTab: action.tab }
    case 'reveal-layer-in-inspector': {
      const ancestors = new Set<string>()
      let parent = layerParentId(state.layers, action.id)
      while (parent && !ancestors.has(parent)) {
        ancestors.add(parent)
        parent = layerParentId(state.layers, parent)
      }
      if (!state.layers.some(layer => layer.collapsed && ancestors.has(layer.id))) return state
      return { ...state, layers: state.layers.map(layer => layer.collapsed && ancestors.has(layer.id) ? { ...layer, collapsed: false } : layer) }
    }
    case 'select-history': return { ...state, selectedHistoryId: action.id }
    case 'set-prompt': return commit(state, { ...state, prompt: action.prompt })
    case 'set-generating': return { ...state, isGenerating: action.value }
    case 'append-history': return { ...state, history: [...state.history, action.item], selectedHistoryId: action.item.id }
    case 'append-ai-result': {
      if(state.aiResults.some(result=>result.id===action.id)) return state
      const result: AIResult = { id: action.id, source: action.image, thumbnail: action.image, prompt: action.request.prompt, model: action.request.modelCode ?? action.request.parameters.model, provider: action.request.sourceId ?? 'unknown', size: resultSizeLabel(action.image,action.request.parameters.size), createdAt: new Date().toISOString(), status: 'success', favorite: false, adopted: false, request: action.request, generationMetadata: action.request.generationMetadata }
      return { ...state, aiResults: [result, ...state.aiResults], notice: `已收到第 ${action.index + 1} 张候选图片，确认采用后才加入图层` }
    }
    case 'add-ai-result': return { ...state, aiResults: [action.result, ...state.aiResults], notice: action.result.status === 'error' ? 'AI 结果生成失败' : '已收到 AI 结果' }
    case 'toggle-ai-result-favorite': return commit(state, { ...state, aiResults: state.aiResults.map((result) => result.id === action.id ? { ...result, favorite: !result.favorite } : result) })
    case 'delete-ai-result': return commit(state, { ...state, aiResults: state.aiResults.filter((result) => result.id !== action.id), notice: '已删除 AI 结果' })
    case 'adopt-outpaint-result': {
      const result=state.aiResults.find(r=>r.id===action.id),p=result?.request?.outpaint,context=result?.request?.context
      if(!result?.source||!p||!context||state.isGenerating)return {...state,notice:'扩图候选尚不可采用'}
      if(!contextCanCommit(state,context))return {...state,notice:'画布或内容已改变，扩图候选已过期，请重新生成'}
      if(effectiveLayerState(state.layers,result.request!.sourceLayerId).locked)return {...state,notice:'扩图目标已锁定'}
      const e=p.expansion,error=dimensionError(e.width,e.height)
      if(error||e.originalWidth!==state.documentWidth||e.originalHeight!==state.documentHeight)return {...state,notice:error??'原画布尺寸不匹配'}
      const resized=resizedDocument(state,e.width,e.height,'canvas','top-left')
      const sourceIds=state.layers.map(l=>l.id)
      const layers=rebaseOutpaintLayers(state,e)
      const layer:Layer={id:`expanded-${crypto.randomUUID()}`,name:`生成扩展 · ${e.width} × ${e.height}`,className:'layer-art',kind:'image',source:result.source,thumbnail:result.source,visible:true,opacity:100,blendMode:'正常',documentSpace:true,contentWidth:e.width,contentHeight:e.height,maskedCompositeSourceIds:sourceIds,maskedCompositeBackground:true,aiOperation:result.request}
      return commit(state,{...resized,layers:[layer,...layers],selectedLayerId:layer.id,selectedLayerIds:[layer.id],selectionVisible:false,cropRect:null,aiResults:state.aiResults.map(r=>r.id===result.id?{...r,adopted:true}:r),notice:'已采用扩图快照，画布和内容可一起撤销；原图层保留'})
    }
    case 'adopt-ai-result-as-layer': {
      const result = state.aiResults.find((item) => item.id === action.id)
      if(result?.request?.outpaint)return {...state,notice:'请使用采用扩图，同时更新画布与内容'}
      if(result?.request?.restoration && (!result.request.context || !contextCanCommit(state,result.request.context)))return {...state,notice:'文档已更改，请重新增强'}
      if (!result || result.status !== 'success' || !result.source) return { ...state, notice: result?.error ?? '该结果暂不可采用' }
      if(result.request?.maskedEdit && (!result.request.context || !contextCanCommit(state,result.request.context))) return {...state,notice:'文档已更改，请重新生成；局部合成不能覆盖新的文档内容'}
      const generated=result.request?.mode==='generate' && !result.request?.maskedEdit && !result.request?.restoration
      if(generated && (result.adopted || state.layers.some(layer=>layer.id===result.id)))return {...state,notice:'该生成候选已采用；可撤销采用'}
      if(generated && result.request?.context && !contextCanCommit(state,result.request.context))return {...state,notice:'文档内容已更改，生成候选已过期，请重新生成'}
      const layer: Layer = { id: generated ? result.id : `layer-${crypto.randomUUID()}`, name: generated ? `生成图片 · ${state.aiResults.indexOf(result)+1}` : `生成结果 · ${state.layers.length + 1}`, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: result.source, thumbnail: result.source, aiOperation: result.request, ...(result.request?.restoration ? {contentWidth:result.request.restoration.width,contentHeight:result.request.restoration.height,transform:state.layers.find(l=>l.id===result.request?.sourceLayerId)?.transform}:{}), ...(result.request?.maskedEdit ? {documentSpace:true,contentWidth:state.documentWidth,contentHeight:state.documentHeight,maskedCompositeSourceIds:state.layers.map(l=>l.id),maskedCompositeBackground:true}:{}), adjustments: generated ? undefined : { ...neutralAdjustments } }
      return commit(state, { ...state, aiResults: state.aiResults.map((item) => item.id === action.id ? { ...item, adopted: true } : item), layers: [layer, ...state.layers], selectedLayerId: layer.id, selectedLayerIds: [layer.id], notice: result.request?.maskedEdit ? '已新增完整画布合成快照；原图层保留，隐藏或删除快照可恢复' : '已将 AI 结果新增为图层' })
    }
    case 'replace-layer-with-ai-result': {
      const result = state.aiResults.find((item) => item.id === action.resultId)
      if(result?.request?.restoration)return {...state,notice:'增强结果请新增为独立图层，保留原图'}
      const target = state.layers.find((item) => item.id === action.targetId)
      if(result?.request?.outpaint)return {...state,notice:'请使用采用扩图，同时更新画布与内容'}
      if (!result || result.status !== 'success' || !result.source) return { ...state, notice: result?.error ?? '该结果暂不可采用' }
      if (!target || target.locked) return { ...state, notice: target?.locked ? '目标图层已锁定' : '找不到目标图层' }
      if(effectiveLayerState(state.layers,target.id).locked)return {...state,notice:'目标图层或所属组已锁定'}
      if(result.request?.mode==='generate' && result.request.context && !contextCanCommit(state,result.request.context))return {...state,notice:'文档内容已更改，生成候选已过期，请重新生成'}
      if(result.request?.maskedEdit) {
        if(target.id!==result.request.sourceLayerId || !result.request.context || !contextCanCommit(state,result.request.context)) return {...state,notice:'生成时的目标或文档已更改，请新增图层或重新生成'}
        const layer:Layer={id:`masked-${crypto.randomUUID()}`,name:`局部替换快照 · ${target.name}`,className:'layer-art',kind:'image',visible:true,opacity:100,blendMode:'正常',documentSpace:true,contentWidth:state.documentWidth,contentHeight:state.documentHeight,source:result.source,thumbnail:result.source,aiOperation:result.request,maskedCompositeSourceIds:state.layers.map(l=>l.id),maskedCompositeBackground:true}
        return commit(state,{...state,layers:[layer,...state.layers],selectedLayerId:layer.id,selectedLayerIds:[layer.id],aiResults:state.aiResults.map(r=>r.id===result.id?{...r,adopted:true}:r),notice:'已采用局部替换合成快照；原图层保留，隐藏或删除快照可恢复'})
      }
      return commit(state, { ...state, aiResults: state.aiResults.map((item) => item.id === result.id ? { ...item, adopted: true } : item), layers: state.layers.map((item) => item.id === target.id ? { ...item, rasterRef: undefined, source: result.source, thumbnail: result.thumbnail, aiOperation: result.request, name: `替换 · ${result.model}` } : item), selectedLayerId: target.id, notice: '已替换当前图层，原图可通过撤销恢复' })
    }
    case 'complete-ai-operation': {
      const { request } = action
      if (request.context && !contextCanCommit(state,request.context)) return {...state,isGenerating:false,notice:'文档内容已更改，结果未写入，请重新执行'}
      const count = Math.min(8, Math.max(1, Number.parseInt(request.parameters.count, 10) || 1))
      const results: AIResult[] = Array.from({ length: count }, (_, index) => ({ id: `${action.id}-${index + 1}`, prompt: request.prompt, model: request.modelCode ?? request.parameters.model, provider: request.sourceId ?? 'unknown', size: request.parameters.size, createdAt: new Date().toISOString(), status: 'loading', favorite: false, adopted: false, request }))
      return { ...state, aiResults: [...results, ...state.aiResults], isGenerating: false, inspectorTab: 'results', notice: `已创建 ${count} 个 AI 候选占位；没有完成图像时不可采用` }
    }
    case 'set-zoom': return { ...state, zoom: Math.min(400, Math.max(10, action.zoom)) }
    case 'clear-selection': return state.selectionVisible ? commit(state, { ...state, selectionVisible: false }) : state
    case 'set-selection-visible': return { ...state, selectionVisible: action.visible }
    case 'set-selection-rect': return { ...state, selection: createSelection(state.selection.kind, action.rect, state.selection), selectionRect: action.rect, selectionVisible: true }
    case 'commit-selection': return commit(state, { ...state, selection: action.selection, selectionRect: action.selection.rect, selectionVisible: true })
    case 'invert-selection': { const selection = invertSelection(state.selection); return commit(state, { ...state, selection, selectionRect: selection.rect, selectionVisible: true }) }
    case 'morph-selection': { const selection = morphSelection(state.selection, action.amount, state.documentWidth, state.documentHeight); return commit(state, { ...state, selection, selectionRect: selection.rect, selectionVisible: true }) }
    case 'set-composer-mode': return commit(state, { ...state, composerMode: action.mode })
    case 'set-composer-source': return commit(state, { ...state, composerSourceId: action.sourceId })
    case 'set-default-composer-model': return { ...state, composerSourceId: action.sourceId, composerParameters: { ...state.composerParameters, model: action.model } }
    case 'set-composer-placement': return { ...state, composerPlacement: action.placement }
    case 'set-composer-minimized': return { ...state, composerMinimized: action.minimized }
    case 'set-output-format': return isValidOutputFormat(action.ratio, action.size) ? commit(state, { ...state, composerParameters: { ...state.composerParameters, ratio: action.ratio, size: action.size } }) : state
    case 'set-composer-parameter': return commit(state, { ...state, composerParameters: { ...state.composerParameters, [action.parameter]: action.value } })
    case 'set-history-tab': return { ...state, historyTab: action.tab }
    case 'set-history-collapsed': return { ...state, historyCollapsed: action.collapsed }
    case 'clear-history': return { ...state, history: state.history.filter((item) => item.id === 'original'), selectedHistoryId: 'original', notice: '已清空生成历史' }
    case 'set-notice': return { ...state, notice: action.message }
    case 'add-layer': { const id = `layer-${Date.now()}`; return commit(state, { ...state, layers: [{ id, name: `新图层 ${state.layers.length + 1}`, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }, ...state.layers], selectedLayerId: id, selectedLayerIds: [id], notice: '已新建图层' }) }
    case 'add-adjustment-layer': {
      const id = `adjustment-${Date.now()}`
      const selectedIndex = state.layers.findIndex(layer => layer.id === state.selectedLayerId)
      const layer: Layer = { id, name: '调整图层', className: 'layer-adjustment', kind: 'adjustment', visible: true, opacity: 100, blendMode: '正常', adjustments: { ...neutralAdjustments } }
      const layers = selectedIndex < 0 ? [layer, ...state.layers] : [...state.layers.slice(0, selectedIndex + 1), layer, ...state.layers.slice(selectedIndex + 1)]
      return commit(state, { ...state, layers, selectedLayerId: id, selectedLayerIds: [id], notice: '已添加调整图层（影响其下方内容）' })
    }
    case 'set-selected-layer-properties': {
      const ids = [...new Set(action.ids)].filter(id => state.layers.some(l => l.id === id))
      if (!ids.length) return state
      if (ids.some(id => layerSubtreeIds(state.layers,id).some(key => effectiveLayerState(state.layers,key).locked))) return {...state,notice:'请先解锁所选图层'}
      if (action.opacity !== undefined && (!Number.isFinite(action.opacity) || action.opacity < 0 || action.opacity > 100)) return {...state,notice:'不透明度必须在 0–100% 之间'}
      if (action.blendMode !== undefined) { try { resolveBlendMode(action.blendMode) } catch { return {...state,notice:'不支持的混合模式'} } }
      const layers=state.layers.map(l=>ids.includes(l.id)?{...l,...(action.opacity!==undefined?{opacity:action.opacity}:{}),...(action.blendMode!==undefined?{blendMode:action.blendMode}:{})}:l)
      if(layers.every((l,i)=>l.opacity===state.layers[i].opacity&&l.blendMode===state.layers[i].blendMode))return state
      return commit(state,{...state,layers})
    }
    case 'place-layer': { try {const next=placeLayer(state,action.id,action.targetId,action.placement);return next===state?state:commit(state,next)} catch(e){return {...state,notice:e instanceof Error?e.message:'无法移动图层'}} }
    case 'add-layer-group': {
      const id=`group-${crypto.randomUUID()}`
      return commit(state,{...state,layers:[{id,name:'图层组',className:'layer-group',children:[],visible:true,opacity:100,blendMode:'正常'},...state.layers],selectedLayerId:id,selectedLayerIds:[id]})
    }
    case 'add-layer-mask': {
      if(!state.layers.some(l=>l.id===action.id)||layerSubtreeIds(state.layers,action.id).some(id=>effectiveLayerState(state.layers,id).locked)||state.layerMasks[action.id])return state
      const layer=state.layers.find(l=>l.id===action.id)!
      const selection=state.selectionVisible?selectionToLayer(state.selection,layer.transform,state.documentWidth,state.documentHeight):undefined
      return commit(state,{...state,layerMasks:{...state.layerMasks,[action.id]:{strokes:[],inverted:false,applied:true,...(selection?{selection}:{})}}})
    }
    case 'update-layer-mask': {
      if(layerSubtreeIds(state.layers,action.id).some(id=>effectiveLayerState(state.layers,id).locked))return {...state,notice:'请先解锁图层'}
      const mask=state.layerMasks[action.id];if(!mask)return state
      const layerMasks={...state.layerMasks}
      if(action.operation==='delete')delete layerMasks[action.id]
      else layerMasks[action.id]={...mask,...(action.operation==='toggle'?{disabled:!mask.disabled}:action.operation==='invert'?{inverted:!mask.inverted}:{applied:true,disabled:false})}
      return commit(state,{...state,layerMasks})
    }
    case 'select-canvas-targets': { const targets=action.targets.filter(t=>state.layers.some(l=>l.id===t.layerId));const ids=[...new Set(targets.map(t=>t.layerId))];return {...state,selectedCanvasTargets:targets,...(ids.length?{selectedLayerIds:ids,selectedLayerId:ids[0]}:{})} }
    case 'update-canvas-objects': {
      const shapes=action.shapes??[],texts=action.texts??[]
      if([...shapes,...texts].some(o=>{const l=state.layers.find(l=>l.id===o.layerId);return !l||!!l.highPrecision||!!l.smartObject||!effectiveLayerState(state.layers,o.layerId).visible}))return {...state,notice:'目标图层不可编辑'}
      if(shapes.some(shape=>layerWriteIsLocked(state,{type:'update-shape',shape}))||texts.some(object=>layerWriteIsLocked(state,{type:'upsert-text',object})))return {...state,notice:'请先解锁所有选中对象的图层'}
      if(!shapes.length&&!texts.length)return state
      const sm=new Map(shapes.map(o=>[o.id,o])),tm=new Map(texts.map(o=>[o.id,o]))
      return commit(state,{...state,canvasShapes:state.canvasShapes.map(o=>sm.get(o.id)?.layerId===o.layerId?sm.get(o.id)!:o),canvasTexts:state.canvasTexts.map(o=>{
        const next=tm.get(o.id);if(!next||next.layerId!==o.layerId)return o
        if(o.text===next.text||!o.runs)return next
        let prefix=0;while(prefix<o.text.length&&prefix<next.text.length&&o.text[prefix]===next.text[prefix])prefix++
        let suffix=0;while(suffix<o.text.length-prefix&&suffix<next.text.length-prefix&&o.text[o.text.length-suffix-1]===next.text[next.text.length-suffix-1])suffix++
        return {...next,runs:shiftTextRunRanges(o.runs,prefix,o.text.length-prefix-suffix,next.text.length-prefix-suffix) as typeof o.runs}
      })})
    }
    case 'select-layers': { const ids = [...new Set(action.ids)].filter(id => state.layers.some(l => l.id === id)); return { ...state, selectedCanvasTargets:[], selectedLayerIds: ids, selectedLayerId: action.keyId && ids.includes(action.keyId) ? action.keyId : ids[0] ?? state.selectedLayerId } }
    case 'select-layer': return { ...state, selectedCanvasTargets:[], selectedLayerId: action.id, selectedLayerIds: action.additive ? Array.from(new Set([...state.selectedLayerIds, action.id])) : [action.id] }
    case 'toggle-layer-selection': return { ...state, selectedLayerIds: state.selectedLayerIds.includes(action.id) ? (state.selectedLayerIds.length > 1 ? state.selectedLayerIds.filter((id) => id !== action.id) : state.selectedLayerIds) : [...state.selectedLayerIds, action.id], selectedLayerId: action.id }
    case 'batch-toggle-layer': {
      const ids = [...new Set(action.ids)].filter((id) => state.layers.some((layer) => layer.id === id))
      const allowed = ids.filter((id) => !layerWriteIsLocked(state, action.property === 'locked' ? { type: 'toggle-layer-lock', id } : { type: 'toggle-layer', id }))
      const skipped = ids.length - allowed.length
      const notice = skipped ? `已跳过 ${skipped} 个锁定图层，其余 ${allowed.length} 个已处理` : '已批量更新图层'
      if (!allowed.length) return { ...state, notice }
      return commit(state, { ...state, conversationRuns: action.property === 'locked' ? state.conversationRuns?.map(run => run.status === 'applied' ? { ...run, invalidatedLocks: [...new Set([...(run.invalidatedLocks ?? []), ...allowed.filter(id => run.patches.some(p => p.layerId === id && p.path[0] === 'locked'))])] } : run) : state.conversationRuns, layers: state.layers.map((layer) => allowed.includes(layer.id) ? { ...layer, [action.property]: !layer[action.property] } : layer), notice })
    }
    case 'batch-delete-layers': {
      const ids = [...new Set(action.ids)].filter((id) => state.layers.some((layer) => layer.id === id))
      const allowed = ids.filter((id) => !layerWriteIsLocked(state, { type: 'delete-layer', id }))
      const skipped = ids.length - allowed.length
      const next = { ...deleteLayerTrees(state, allowed) }
      if (skipped) next.notice = `已跳过 ${skipped} 个锁定图层；${next.layers === state.layers ? next.notice ?? '没有可删除图层' : '其余图层已删除'}`
      return next.layers === state.layers ? next : commit(state, next)
    }
    case 'group-layers': { try { const next=groupSelectedLayers(state,action.ids); return next===state?state:commit(state,next) } catch(e) { return {...state,notice:e instanceof Error?e.message:'编组失败'} } }
    case 'toggle-group': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, collapsed: !layer.collapsed } : layer) })
    case 'toggle-layer': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, visible: !layer.visible } : layer) })
    case 'set-layer-opacity': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, opacity: Math.max(0, Math.min(100, action.opacity)) } : layer) })
    case 'create-clipping': {
      try {const layers=createClipping(state.layers,action.id);return layers===state.layers?state:commit(state,{...state,layers,notice:'已创建剪贴蒙版；基底删除或链断开时释放剪贴'})}
      catch(error){return {...state,notice:error instanceof Error?error.message:'无法创建剪贴蒙版'}}
    }
    case 'release-clipping': {
      if(!state.layers.find(l=>l.id===action.id)?.clipBaseId)return state
      return commit(state,{...state,layers:state.layers.map(l=>l.id===action.id?{...l,clipBaseId:undefined}:l),notice:'已释放剪贴蒙版及其上方断开的链'})
    }
    case 'set-layer-blend': {
      try {resolveBlendMode(action.blendMode)}catch(error){return {...state,notice:error instanceof Error?error.message:'不支持的混合模式'}}
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, blendMode: action.blendMode } : layer) })
    }
    case 'rename-layer': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, name: action.name.trim() || layer.name } : layer) })
    case 'toggle-layer-lock': return commit(state, { ...state, conversationRuns: state.conversationRuns?.map(run => run.status === 'applied' && run.patches.some(p => p.layerId === action.id && p.path[0] === 'locked') ? { ...run, invalidatedLocks: [...new Set([...(run.invalidatedLocks ?? []), action.id])] } : run), layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, locked: !layer.locked } : layer) })
    case 'duplicate-layer': { const next = duplicateLayerTree(state, action.id); return next === state ? state : commit(state, next) }
    case 'delete-layer': { const next = deleteLayerTrees(state, [action.id]); return next.layers === state.layers ? next : commit(state, next) }
    case 'reorder-layer': case 'move-layer': {
      const source=state.layers.find(l=>l.id===action.id)
      if(!source)return state
      const siblings=clippingSiblings(state.layers,action.id),from=siblings.findIndex(l=>l.id===action.id)
      const destination=action.type==='reorder-layer'?from+(action.direction==='up'?-1:1):siblings.findIndex(l=>l.id===state.layers[Math.max(0,Math.min(state.layers.length-1,action.toIndex))]?.id)
      if(destination<0||destination>=siblings.length||from===destination)return state
      const order=[...siblings], [moved]=order.splice(from,1);order.splice(destination,0,moved)
      let index=0
      const parentId=layerParentId(state.layers,source.id),ids=new Set(siblings.map(l=>l.id))
      const layers=state.layers.map(l=>ids.has(l.id)?order[index++]:l).map(l=>l.id===parentId?{...l,children:order.map(child=>child.id)}:l)
      return commit(state,{...state,layers})
    }
    case 'align-layers': case 'distribute-layers': {
      const next = arrangeLayers(state, action)
      return next.layers === state.layers ? { ...state, notice: next.notice } : commit(state, { ...state, ...next })
    }
    case 'add-result-layer': { const next = duplicateLayerTree(state, action.resultId, true); return next === state ? state : commit(state, { ...next, notice: '已将结果新增为图层' }) }
    case 'replace-layer-with-result': {
      const source = state.layers.find((layer) => layer.id === action.resultId)
      const target = state.layers.find((layer) => layer.id === action.targetId)
      if (!source || !target || target.locked) return { ...state, notice: target?.locked ? '目标图层已锁定' : '找不到结果图层' }
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === target.id ? { ...layer, rasterRef: source.rasterRef, name: source.name, source: source.source, thumbnail: source.thumbnail, transform: source.transform, sourceOffset: source.sourceOffset, aiOperation: source.aiOperation } : layer), selectedLayerId: target.id, notice: '已替换当前图层' })
    }
    case 'add-stroke': return state // Legacy point API is replaced by atomic continuous strokes.
    case 'remove-stroke': return commit(state, { ...state, brushStrokes: state.brushStrokes.filter((stroke) => stroke.id !== action.id) })
    case 'add-canvas-text': return commit(state, { ...state, canvasTexts: [...state.canvasTexts, { ...action.text, layerId: state.selectedLayerId, fontFamily: 'sans-serif', fontSize: 24, fontWeight: '400', color: state.brushColor, align: 'left' }], notice: '已添加文字' })
    case 'create-text-layer': {
      const object = { ...action.object, layout: action.object.layout ?? 'point', width: action.object.width ?? 160, height: action.object.height ?? Math.max(1, action.object.fontSize * 1.4), lineHeight: action.object.lineHeight ?? 1.4, letterSpacing: action.object.letterSpacing ?? 0 }
      const currentLayer = state.layers.find((item) => item.id === object.layerId)
      if (currentLayer) {
        return commit(state, { ...state, selectedCanvasTargets:[{kind:'text' as const,id:object.id,layerId:object.layerId}], canvasTexts: [...state.canvasTexts, object], sceneOrder: [...state.sceneOrder, object.id], selectedLayerId: currentLayer.id, selectedLayerIds: [currentLayer.id], notice: '已在当前图层添加文字' })
      }
      const layer: Layer = { id: object.layerId, name: object.text.trim() || '文字图层', className: 'layer-text', kind: 'text', textObjectId: object.id, visible: true, opacity: 100, blendMode: '正常', contentWidth: state.documentWidth, contentHeight: state.documentHeight }
      const index = state.layers.findIndex((item) => item.id === state.selectedLayerId)
      const layers = index < 0 ? [layer, ...state.layers] : [...state.layers.slice(0, index), layer, ...state.layers.slice(index)]
      return commit(state, { ...state, layers, selectedCanvasTargets:[{kind:'text' as const,id:object.id,layerId:object.layerId}], canvasTexts: [...state.canvasTexts, object], sceneOrder: [...state.sceneOrder, object.id], selectedLayerId: layer.id, selectedLayerIds: [layer.id], notice: '已创建文字图层' })
    }
    case 'set-canvas-offset': return { ...state, canvasOffset: { x: action.x, y: action.y } }
    case 'set-background-color': return { ...state, backgroundColor: action.color, recentColors: rememberColor(state.recentColors, action.color) }
    case 'swap-colors': return { ...state, brushColor: state.backgroundColor ?? '#ffffff', backgroundColor: state.brushColor }
    case 'reset-colors': return { ...state, brushColor: '#000000', backgroundColor: '#ffffff' }
    case 'set-brush-color': return { ...state, brushColor: action.color, recentColors: rememberColor(state.recentColors, action.color), notice: `已取色 ${action.color}` }
    case 'commit-brush-stroke': return commit(state, { ...state, brushStrokes: [...state.brushStrokes, action.stroke], sceneOrder: [...state.sceneOrder, action.stroke.id] })
    case 'upsert-text': { const previous = state.canvasTexts.find(object => object.id === action.object.id); let object = action.object; if (previous && previous.text !== object.text && previous.runs) { let prefix = 0; while (prefix < previous.text.length && prefix < object.text.length && previous.text[prefix] === object.text[prefix]) prefix++; let suffix = 0; while (suffix < previous.text.length - prefix && suffix < object.text.length - prefix && previous.text[previous.text.length - suffix - 1] === object.text[object.text.length - suffix - 1]) suffix++; object = { ...object, runs: shiftTextRunRanges(previous.runs, prefix, previous.text.length - prefix - suffix, object.text.length - prefix - suffix) as typeof object.runs } } return commit(state, { ...state, canvasTexts: [...state.canvasTexts.filter((object) => object.id !== action.object.id), object], layers: state.layers.map((layer) => layer.textObjectId === action.object.id ? { ...layer, name: object.text.trim() || '文字图层' } : layer), sceneOrder: state.sceneOrder.includes(action.object.id) ? state.sceneOrder : [...state.sceneOrder, action.object.id] }) }
    case 'create-shape-layer': {
      const { shape } = action
      const names = { rectangle: '矩形', ellipse: '椭圆', line: '线条', arrow: '箭头' }
      if (shape.kind !== 'rectangle' && shape.kind !== 'ellipse' && shape.kind !== 'line' && shape.kind !== 'arrow') return state
      if (state.layers.some(layer => layer.id === shape.layerId)) return state
      const layer: Layer = {
        id: shape.layerId, name: names[shape.kind], kind: 'shape', className: 'layer-art',
        visible: true, opacity: 100, blendMode: '正常',
        contentWidth: state.documentWidth, contentHeight: state.documentHeight,
      }
      return commit(state, {
        ...state, layers: [layer, ...state.layers], canvasShapes: [...state.canvasShapes, shape],
        sceneOrder: [...state.sceneOrder, shape.id], selectedLayerId: layer.id, selectedLayerIds: [layer.id],
        selectedCanvasTargets: [{ kind: 'shape', id: shape.id, layerId: layer.id }],
      })
    }
    case 'add-shape': return commit(state, { ...state, ...(!['fill','gradient'].includes(action.shape.kind)?{selectedCanvasTargets:[{kind:'shape' as const,id:action.shape.id,layerId:action.shape.layerId}]}:{}), canvasShapes: [...state.canvasShapes, action.shape], sceneOrder: [...state.sceneOrder, action.shape.id] })
    case 'combine-shapes': return commit(state, { ...state, canvasShapes: [...state.canvasShapes.map(s => action.sourceIds.includes(s.id) ? {...s,hidden:true} : s), {...action.shape, boolean: action.shape.boolean ? {...action.shape.boolean, sourceIds: action.sourceIds.slice(0,2) as [string,string]} : undefined}], sceneOrder: [...state.sceneOrder,action.shape.id] })
    case 'update-shape': {
      const shapes = state.canvasShapes.map(s => s.id === action.shape.id ? action.shape : s)
      return commit(state, { ...state, canvasShapes: shapes.map(s => {
        if (!s.boolean?.sourceIds) return s
        const [leftId,rightId] = s.boolean.sourceIds
        const left = shapes.find(p => p.id === leftId)?.path, right = shapes.find(p => p.id === rightId)?.path
        return left && right ? {...s,boolean:{...s.boolean,left,right}} : s
      }) })
    }
    case 'selection-to-mask': {
      const selection = action.selection ?? (state.selectionVisible ? state.selection : undefined)
      if (!selection || selection.rect.width <= 0 || selection.rect.height <= 0) return { ...state, notice: '请先创建有效选区或闭合路径' }
      const targetLayerId = action.layerId ?? state.selectedLayerId
      const layer = state.layers.find((item) => item.id === targetLayerId)
      return commit(state, { ...state, layerMasks: { ...state.layerMasks, [targetLayerId]: { selection: { ...selectionToLayer(selection, layer?.transform, state.documentWidth, state.documentHeight), feather: selection.feather / layerPixelScale(layer, state.documentWidth, state.documentHeight).mean }, strokes: [], inverted: false, applied: false, ...(action.refinement ? { refinement: action.refinement } : {}) } }, notice: '选区已创建为图层蒙版' })
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
    case 'move-canvas-targets': { const next = translateMoveTargets(state, action.targets, action.delta); return next === state ? state : commit(state, { ...next, notice: '已移动所选内容，可撤销' }) }
    case 'commit-layer-transform': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.layerId && !layer.locked ? { ...layer, transform: action.transform } : layer) })
    case 'set-adjustment-presets': return commit(state, { ...state, adjustmentPresets: action.presets })
    case 'set-smart-filters': {
      const layer=state.layers.find(item=>item.id===action.id)
      if(!layer)return {...state,notice:'智能滤镜目标图层不存在'}
      if(effectiveLayerState(state.layers,layer.id).locked)return {...state,notice:'图层或其祖先已锁定，请先解锁后再编辑'}
      if(action.expectedLayer&&action.expectedLayer!==layer || action.expectedSourceRevision!==undefined&&action.expectedSourceRevision!==state.smartObjectSources[layer.smartObject?.sourceId??'']?.revision)return {...state,notice:'源内容或图层已更改，请重新预览智能滤镜'}
      try { const smartFilters=validateSmartFilters(action.chain);if(JSON.stringify(layer.smartFilters??{items:[]})===JSON.stringify(smartFilters))return state;return commit(state,{...state,layers:state.layers.map(item=>item.id===layer.id?{...item,smartFilters}:item),notice:'已更新智能滤镜'}) }
      catch(error){return {...state,notice:error instanceof Error?error.message:'智能滤镜无效'}}
    }
    case 'set-layer-effects': { try {const effects=validateEffects(action.effects);return commit(state,{...state,layers:state.layers.map(layer=>layer.id===action.id?{...layer,effects}:layer)})}catch(error){return {...state,notice:error instanceof Error?error.message:'效果无效'}} }
    case 'set-layer-warp': { const layer=state.layers.find(item=>item.id===action.id); if(!layer)return {...state,notice:'形变目标图层不存在'}; if(layer.locked)return {...state,notice:'图层已锁定，请先解锁后再编辑'}; return commit(state,{...state,layers:state.layers.map(item=>item.id===action.id?{...item,warpRecipe:structuredClone(action.recipe)}:item),notice:'形变已应用，可撤销'}) }
    case 'set-layer-adjustments': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...action.adjustments } } : layer) })
    case 'set-layer-adjustment': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, [action.key]: Math.max(-100, Math.min(100, action.value)) } } : layer) })
    case 'set-curve-preview': return {...state,curvePreviewOffLayerId:action.id}
    case 'set-layer-curves': { try {const curves=validateCurves(action.curves); return commit(state, { ...state, layers: state.layers.map(layer => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, curves } } : layer) })} catch(error) {return {...state,notice:error instanceof Error?error.message:'曲线无效'}} }
    case 'set-layer-levels': { try {const levels=validateLevels(action.levels); return commit(state, { ...state, layers: state.layers.map(layer => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, levels } } : layer) })} catch(error) {return {...state,notice:error instanceof Error?error.message:'色阶无效'}} }
    case 'set-layer-white-balance': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, whiteBalance: { r: Math.max(.01, Math.min(100, action.value.r)), g: Math.max(.01, Math.min(100, action.value.g)), b: Math.max(.01, Math.min(100, action.value.b)) } } } : layer) })
    case 'set-layer-hsl': return commit(state, { ...state, layers: state.layers.map((layer) => { if (layer.id !== action.id || layer.locked) return layer; const hsl = structuredClone(layer.adjustments?.hsl ?? defaultHsl()); const target = action.channel === 'global' ? hsl.global : hsl.channels[action.channel]; target[action.key] = Math.max(action.key === 'range' ? 1 : -100, Math.min(action.key === 'range' ? 120 : 100, action.value)); return { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, hsl } } }) })
    case 'set-layer-color-balance': return commit(state, { ...state, layers: state.layers.map((layer) => { if (layer.id !== action.id || layer.locked) return layer; const balance = structuredClone(layer.adjustments?.colorBalance ?? defaultColorBalance()); balance[action.tone][action.key] = Math.max(-100, Math.min(100, action.value)); return { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, colorBalance: balance } } }) })
    case 'set-layer-preserve-luminosity': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments, ...layer.adjustments, colorBalance: { ...(layer.adjustments?.colorBalance ?? defaultColorBalance()), preserveLuminosity: action.value } } } : layer) })
    case 'reset-layer-adjustments': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id && !layer.locked ? { ...layer, adjustments: { ...neutralAdjustments } } : layer) })
    case 'commit-crop': return commit(state, { ...state, cropRect: action.rect, selectionVisible: false, notice: '裁剪已应用，可撤销' })
    case 'set-canvas-rotation': return { ...state, canvasRotation: ((action.rotation % 360) + 360) % 360 }
    case 'rasterize-layer': {
      const layerMasks = { ...state.layerMasks }; delete layerMasks[action.id]
      return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, rasterRef: undefined, source: action.source, sourceOffset: undefined, transform: undefined, contentWidth: state.documentWidth, contentHeight: state.documentHeight } : layer), layerMasks, brushStrokes: state.brushStrokes.filter((s) => s.layerId !== action.id), canvasTexts: state.canvasTexts.filter((s) => s.layerId !== action.id), canvasShapes: state.canvasShapes.filter((s) => s.layerId !== action.id) })
    }
    case 'add-repair-layer': {
      if (action.baseContentRevision !== undefined && action.baseContentRevision !== contentRevision(state)) return { ...state, notice: '文档已更改，已取消过期补洞结果' }
      if (action.baseUndoLength !== undefined && action.baseUndoLength !== state.undoStack.length) return { ...state, notice: '文档已更改，已取消过期修复结果' }
      const id = `repair-${Date.now()}`
      const base = state.layers.find(layer => layer.id === action.baseLayerId)
      if (!base) return { ...state, notice: '找不到修复目标图层' }
      if (base.locked) return { ...state, notice: '修复目标图层已锁定，未写入结果' }
      const visited = new Set<string>(); let ancestorId = layerParentId(state.layers, base.id)
      while (ancestorId && !visited.has(ancestorId)) {
        visited.add(ancestorId)
        const ancestor = state.layers.find(layer => layer.id === ancestorId)
        if (ancestor?.locked) return { ...state, notice: '祖先图层组已锁定，未写入修复结果' }
        ancestorId = layerParentId(state.layers, ancestorId)
      }
      const parentId = action.frontierParentId ?? action.placementParentId ?? (action.rootPlacement ? undefined : layerParentId(state.layers, base.id))
      const layer: Layer = { id, name: action.name, className: 'layer-repair', visible: true, opacity: 100, blendMode: '正常', source: action.source, contentWidth: state.documentWidth, contentHeight: state.documentHeight, contentFill: action.contentFill, preserveSourceAlpha: action.preserveSourceAlpha, repairCoverage: action.repairCoverage, repairSourceIds: action.repairSourceIds, groupId: parentId, documentSpace: true }
      let rootBase = base
      if (action.rootPlacement) { const seen = new Set<string>(); let rootParent = layerParentId(state.layers, rootBase.id); while (rootParent && !seen.has(rootParent)) { seen.add(rootParent); rootBase = state.layers.find(item => item.id === rootParent)!; rootParent = layerParentId(state.layers, rootBase.id) } }
      // Root siblings paint in reverse state order. A below-scope crossing a
      // group must therefore sit after the target root group in state order
      // (before it in paint order), so the repair covers sampled lower roots
      // while leaving unsampled foreground siblings above it.
      const rootIndex = state.layers.indexOf(rootBase)
      const rootOf = (id: string) => {
        let current = state.layers.find(item => item.id === id)
        const seen = new Set<string>()
        while (current) {
          const parent = layerParentId(state.layers, current.id)
          if (!parent || seen.has(parent)) return current
          seen.add(parent); current = state.layers.find(item => item.id === parent)
        }
        return undefined
      }
      const sampledRootIndexes = (action.repairSourceIds ?? []).map(source => rootOf(source)).filter((item): item is Layer => !!item).map(item => state.layers.indexOf(item))
      const hasUnsampledForegroundAbove = sampledRootIndexes.some(index => index < rootIndex)
      const hasSampledRootBelow = sampledRootIndexes.some(index => index > rootIndex)
      const insertion = action.rootPlacement ? (hasUnsampledForegroundAbove || !hasSampledRootBelow ? rootIndex : rootIndex + 1) : rootIndex
      return commit(state, { ...state, layers: [...state.layers.slice(0, insertion), layer, ...state.layers.slice(insertion)].map(item => item.id === parentId && item.children ? { ...item, children: (() => { const at = action.frontierParentId ? 0 : Math.max(0, item.children.indexOf(base.id)); return [...item.children.slice(0, at), id, ...item.children.slice(at)] })() } : item), selectedLayerId: id, selectedLayerIds: [id], history: [...state.history, { id, label: action.name, tone: 'mint' }], selectedHistoryId: id, notice: `${action.name}已创建为独立修复层` })
    }
    case 'set-layer-source': return commit(state, { ...state, layers: state.layers.map((layer) => layer.id === action.id ? { ...layer, rasterRef: undefined, source: action.source } : layer) })
    case 'update-artboard': {
      if (!action.name.trim() || !Number.isFinite(action.x) || !Number.isFinite(action.y)) return { ...state, notice: '画板名称和位置无效' }
      return commit(state, { ...state, artboards: state.artboards.map(board => board.id === action.id ? { ...board, name: action.name.trim(), x: action.x, y: action.y } : board) })
    }
    case 'reorder-artboard': {
      const index = state.artboards.findIndex(board => board.id === action.id), target = index + (action.direction === 'up' ? -1 : 1)
      if (index < 0 || target < 0 || target >= state.artboards.length) return state
      const artboards = [...state.artboards]; [artboards[index],artboards[target]] = [artboards[target],artboards[index]]
      return commit(state, { ...state, artboards })
    }
    case 'add-artboard': {
      const next = artboardReducer({ artboards: state.artboards, activeId: state.activeArtboardId }, { type: 'add', board: action.board })
      return commit(state, { ...state, artboards: next.artboards, activeArtboardId: next.activeId, documentWidth: action.board.width, documentHeight: action.board.height, documentBackground: action.board.background, selectedLayerId: '', selectedLayerIds: [], cropRect: null, selectionVisible: false, notice: `已添加${action.board.name}` })
    }
    case 'remove-artboard': {
      if (state.artboards.length <= 1) return { ...state, notice: '至少保留一个画板' }
      const removedBoard = state.artboards.find(board => board.id === action.id)!
      const removedIds = new Set(removedBoard.layerIds.flatMap(id => layerSubtreeIds(state.layers,id)))
      const next = artboardReducer({ artboards: state.artboards, activeId: state.activeArtboardId }, { type: 'remove', id: action.id })
      const survivingIds = new Set(next.artboards.flatMap(board => board.layerIds))
      const doomed = new Set([...removedIds].filter(id => !survivingIds.has(id)))
      const board = next.artboards.find(board => board.id === next.activeId)!
      const layers = state.layers.filter(layer => !doomed.has(layer.id))
      const brushStrokes = state.brushStrokes.filter(item => !doomed.has(item.layerId)), canvasTexts = state.canvasTexts.filter(item => !doomed.has(item.layerId)), canvasShapes = state.canvasShapes.filter(item => !doomed.has(item.layerId))
      return commit(state, { ...state, layers, brushStrokes, canvasTexts, canvasShapes, layerMasks: Object.fromEntries(Object.entries(state.layerMasks).filter(([id]) => !doomed.has(id))), artboards: next.artboards, activeArtboardId: next.activeId, documentWidth: board.width, documentHeight: board.height, documentBackground: board.background, selectedLayerId: board.layerIds[0] ?? layers[0]?.id ?? '', selectedLayerIds: board.layerIds.slice(0,1), cropRect: null, selectionVisible: false, notice: '已删除画板' })
    }
    case 'move-artboard': {
      const next = artboardReducer({ artboards: state.artboards, activeId: state.activeArtboardId }, { type: 'move', id: action.id, x: action.x, y: action.y })
      return commit(state, { ...state, artboards: next.artboards, notice: '已移动画板' })
    }
    case 'duplicate-artboard': {
      const source = state.artboards.find(board => board.id === action.sourceId)
      if (!source) return { ...state, notice: '源画板不存在' }
      const board = duplicateArtboard(source, action.id, action.name, action.width, action.height, action.mode)
      const preview = artboardCopyPreview(source, action.width, action.height, action.mode)
      let copied = state
      const copiedIds: string[] = []
      const sourceIds = new Set(source.layerIds)
      for (const id of source.layerIds.filter(id => !sourceIds.has(layerParentId(state.layers, id) ?? ''))) {
        const before = new Set(copied.layers.map(layer => layer.id))
        copied = duplicateLayerTree(copied, id, true)
        const added = copied.layers.filter(layer => !before.has(layer.id))
        copiedIds.push(...added.map(layer => layer.id))
        const rootId = copied.selectedLayerId
        copied = { ...copied, layers: copied.layers.map(layer => {
          if (!added.some(item => item.id === layer.id)) return layer
          const base = { ...layer, contentWidth: layer.contentWidth ?? source.width, contentHeight: layer.contentHeight ?? source.height }
          if (layer.id !== rootId) return base
          const t = layer.transform ?? { kind: 'transform' as const, rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
          return { ...base, transform: { ...t, rect: { x: (t.rect.x * source.width / 100 * preview.scale + preview.offsetX) / action.width * 100, y: (t.rect.y * source.height / 100 * preview.scale + preview.offsetY) / action.height * 100, width: t.rect.width * source.width * preview.scale / action.width, height: t.rect.height * source.height * preview.scale / action.height } } }
        }) }
      }
      board.layerIds = copiedIds
      return commit(state, { ...copied, artboards: [...state.artboards, board], activeArtboardId: board.id, documentWidth: board.width, documentHeight: board.height, documentBackground: board.background, cropRect: null, selectionVisible: false, notice: `已复制${board.name}` })
    }
    case 'set-active-artboard': {
      const board = state.artboards.find(board => board.id === action.id)
      if (!board) return state
      return { ...state, activeArtboardId: board.id, documentWidth: board.width, documentHeight: board.height, documentBackground: board.background, selectedLayerId: board.layerIds[0] ?? '', selectedLayerIds: board.layerIds.slice(0, 1), cropRect: null, selectionVisible: false }
    }
    case 'move-layer-to-artboard': {
      const from = state.artboards.find(board => board.id === action.from), to = state.artboards.find(board => board.id === action.to)
      if (!from || !to || from.id === to.id || !from.layerIds.some(id => layerSubtreeIds(state.layers,id).includes(action.layerId))) return state
      if (effectiveLayerState(state.layers, action.layerId).locked) return { ...state, notice: '锁定图层不能跨画板移动' }
      const moving = new Set(layerSubtreeIds(state.layers, action.layerId))
      const artboards = state.artboards.map(board => board.id === from.id ? { ...board, layerIds: board.layerIds.filter(id => !moving.has(id)) } : board.id === to.id ? { ...board, layerIds: [...new Set([...board.layerIds, ...moving])] } : board)
      const nestedRoot = !!layerParentId(state.layers,action.layerId)
      const world = nestedRoot ? layerWorldPixelMatrix(state.layers,action.layerId,from.width,from.height) : null
      const layers = state.layers.map(layer => {
        if (!moving.has(layer.id)) return { ...layer, children: layer.children?.filter(id => id !== action.layerId), clipBaseId: layer.clipBaseId && moving.has(layer.clipBaseId) ? undefined : layer.clipBaseId }
        const t = layer.transform ?? { kind: 'transform' as const, rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
        const isRoot = layer.id === action.layerId
        const cw=layer.contentWidth ?? from.width,ch=layer.contentHeight ?? from.height
        const affine=t.affine ? [t.affine[0],t.affine[1]*from.height/from.width*to.width/to.height,t.affine[2]*from.width/from.height*to.height/to.width,t.affine[3],t.affine[4]*from.width/to.width,t.affine[5]*from.height/to.height] as [number,number,number,number,number,number] : undefined
        const transform:TransformDraft = world && isRoot ? {kind:'transform',rect:{x:0,y:0,width:cw/to.width*100,height:ch/to.height*100},rotation:0,flipX:false,flipY:false,affine:[world[0],world[1]*to.width/to.height,world[2]*to.height/to.width,world[3],world[4]/to.width*100,world[5]/to.height*100]} : { ...t, affine, rect: { x: t.rect.x * from.width / to.width, y: t.rect.y * from.height / to.height, width: t.rect.width * from.width / to.width, height: t.rect.height * from.height / to.height } }
        const effective=isRoot?effectiveLayerState(state.layers,layer.id):undefined
        return { ...layer, groupId: isRoot ? undefined : layer.groupId, clipBaseId: layer.clipBaseId&&!moving.has(layer.clipBaseId)?undefined:layer.clipBaseId, contentWidth:cw, contentHeight:ch, opacity:effective?effective.opacity*100:layer.opacity, visible:effective?.visible ?? layer.visible, transform }
      })
      return commit(state, { ...state, layers, artboards, activeArtboardId: to.id, documentWidth: to.width, documentHeight: to.height, documentBackground: to.background, cropRect: null, selectionVisible: false, notice: '图层已移动到目标画板，保持局部像素坐标' })
    }
    case 'restore-project': case 'apply-edit-plan': case 'apply-conversation-undo': case 'apply-cmyk-document': {
      const keys = ['pixelFormat', 'colorManagement', 'proofSettings', 'colorModel', 'cmykRaster', 'aiRecovery', 'savedRecipes', 'conversationRuns', 'guideSettings', 'documentWidth', 'documentHeight', 'documentBackground', 'layers', 'smartObjectSources', 'selectedLayerId', 'selectedLayerIds', 'aiResults', 'brushStrokes', 'canvasTexts', 'canvasShapes', 'layerMasks', 'selection', 'selectionRect', 'selectionVisible', 'cropRect', 'sceneOrder', 'prompt', 'composerMode', 'composerSourceId', 'composerParameters', 'artboards', 'activeArtboardId'] as const
      const next = { ...state }
      if (action.type === 'restore-project') { next.aiRecovery = action.document.aiRecovery; next.colorModel = action.document.colorModel ?? 'rgb'; next.cmykRaster = action.document.cmykRaster; next.savedRecipes = action.document.savedRecipes ?? []; next.smartObjectSources = action.document.smartObjectSources ?? {}; next.conversationRuns = action.document.conversationRuns ?? []; if (!action.document.artboards?.length) next.artboards = [{ id: 'board-1', name: '画板 1', x: 0, y: 0, width: next.documentWidth, height: next.documentHeight, background: next.documentBackground, layerIds: next.layers.map(layer => layer.id) }] }
      for (const key of keys) if (action.document[key] !== undefined) Object.assign(next, { [key]: action.document[key] })
      if (action.type === 'restore-project' && !action.document.artboards?.length) { next.artboards = [{ id: 'board-1', name: '画板 1', x: 0, y: 0, width: next.documentWidth, height: next.documentHeight, background: next.documentBackground, layerIds: next.layers.map(layer => layer.id) }]; next.activeArtboardId = 'board-1' }
      if (action.type === 'restore-project' && next.artboards.length === 1) next.artboards = [{ ...next.artboards[0], width: next.documentWidth, height: next.documentHeight, background: next.documentBackground, layerIds: next.layers.map(layer => layer.id) }]
      const restoredBoard = next.artboards.find(board => board.id === next.activeArtboardId); if (restoredBoard) { next.documentWidth = restoredBoard.width; next.documentHeight = restoredBoard.height; next.documentBackground = restoredBoard.background }
      if (action.type === 'apply-conversation-undo') {
        const inverse = commit(state, { ...next, isGenerating: false, notice: '已撤销 AI 修改，保留独立手动编辑' })
        return inverse.layers === next.layers || inverse.conversationRuns === next.conversationRuns ? { ...inverse, redoStack: [snapshot(state)] } : inverse
      }
      return (action.type === 'apply-edit-plan' || action.type === 'apply-cmyk-document') ? commit(state, { ...next, isGenerating: false, notice: '已应用编辑计划' }) : { ...next, undoStack: [], redoStack: [], isGenerating: false, notice: '已打开项目' }
    }
    case 'new-document': {
      const error = dimensionError(action.width, action.height)
      if (error) return { ...state, notice: error }
      return commit(state, { ...state, colorModel: 'rgb', cmykRaster: undefined, aiRecovery: undefined, conversationRuns: [], savedRecipes: [], documentWidth: action.width, documentHeight: action.height, documentBackground: action.background ?? 'transparent', guideSettings: defaultGuideSettings(), colorManagement: action.colorManagement ?? state.colorManagement, proofSettings: defaultSoftProofSettings(), smartObjectSources: {}, layers: [{ id: 'blank', name: '图层 1', className: 'layer-art', visible: true, opacity: 100, blendMode: '正常' }], selectedLayerId: 'blank', selectedLayerIds: ['blank'], artboards: [{ id: 'board-1', name: '画板 1', x: 0, y: 0, width: action.width, height: action.height, background: action.background ?? 'transparent', layerIds: ['blank'] }], activeArtboardId: 'board-1', brushStrokes: [], canvasTexts: [], canvasShapes: [], layerMasks: {}, sceneOrder: [], cropRect: null, selectionVisible: false, notice: '已新建文档' })
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
      return commit(state, { ...importedState, selectedCanvasTargets: [], layers: [{ inputProfile: action.inputProfile, contentWidth: auto ? action.width : state.documentWidth, contentHeight: auto ? action.height : state.documentHeight, id: action.id, name: action.name, className: 'layer-art', visible: true, opacity: 100, blendMode: '正常', source: action.source }, ...importedState.layers], selectedLayerId: action.id, selectedLayerIds: [action.id], history: [...state.history, historyItem], selectedHistoryId: action.id, notice: `已导入 ${action.name}` })
    }
    case 'undo': { const previous = state.undoStack.at(-1); if (!previous) return { ...state, notice: '没有可撤销的操作' }; return { ...state, ...previous, undoStack: state.undoStack.slice(0, -1), redoStack: [...state.redoStack, snapshot(state)], notice: '已撤销' } }
    case 'redo': { const next = state.redoStack.at(-1); if (!next) return { ...state, notice: '没有可重做的操作' }; return { ...state, ...next, undoStack: [...state.undoStack, snapshot(state)], redoStack: state.redoStack.slice(0, -1), notice: '已重做' } }
    default: return state
  }
}

type CurveDraft = { layerId: string; curves?: CurvesSettings; levels?: LevelsSettings } | null
const EditorContext = createContext<{ curveDraft: CurveDraft; setCurveDraft: Dispatch<SetStateAction<CurveDraft>>; state: EditorState; dispatch: Dispatch<EditorAction>; documentId: string; viewInitialized: boolean } | null>(null)
function DocumentSessionProvider({ document, dispatchWorkspace, children }: { document: DocumentSession; dispatchWorkspace: Dispatch<WorkspaceAction>; children?: ReactNode }) {
  const state = document.state
  useEffect(() => {
    let active=true
    imageResourceOwnership.replaceMany(editorResourceRoots(document.id,state)).catch(error=>{
      if(active)dispatchWorkspace({type:'edit',id:document.id,action:{type:'set-notice',message:`资源引用保护失败：${error instanceof Error?error.message:'存储不可用'}`}})
    })
    return ()=>{active=false}
  },[document.id,state.layers,state.smartObjectSources,state.undoStack,state.redoStack,dispatchWorkspace])
  const [curveDraft, setCurveDraft] = useState<CurveDraft>(null)
  const dispatch = useCallback((action: EditorAction) => dispatchWorkspace({ type: 'edit', id: document.id, action }), [document.id, dispatchWorkspace])
  const value = useMemo(() => ({ state, dispatch, curveDraft, setCurveDraft, documentId: document.id, viewInitialized: !!document.viewInitialized }), [state, dispatch, curveDraft, document.id, document.viewInitialized])
  if(state.rasterPreviewOnly)return <EditorContext.Provider value={value}>{children?<RasterProjectPreview state={state}/>:null}</EditorContext.Provider>
  return <EditorContext.Provider value={value}><LayerStyleEditorProvider active={!!children}><SmartFilterEditorProvider active={!!children}><ComposerDraftProvider documentId={document.id}><ResultDeliveryProvider><ImageGenerationProvider state={state} documentId={document.id} dispatch={dispatch}>{children}</ImageGenerationProvider></ResultDeliveryProvider></ComposerDraftProvider></SmartFilterEditorProvider></LayerStyleEditorProvider></EditorContext.Provider>
}
export function EditorProvider({ children }: { children: ReactNode }) {
  const storedComposer = readComposerPreferences()
  const [workspace, dispatchWorkspace] = useReducer(workspaceReducer, undefined, () => createDocumentWorkspace({
    ...structuredClone(initialEditorState),
    toolOptions: { ...initialEditorState.toolOptions, ...(readStoredTextColor() ? { textColor: readStoredTextColor() } : {}) },
    recentColors: readRecentColors(),
    composerMode: storedComposer.mode ?? initialEditorState.composerMode,
    composerSourceId: storedComposer.sourceId ?? initialEditorState.composerSourceId,
    composerParameters: {
      ...initialEditorState.composerParameters,
      ...(storedComposer.model ? { model: storedComposer.model } : {}),
      ...(storedComposer.ratio ? { ratio: storedComposer.ratio } : {}),
      ...(storedComposer.size ? { size: storedComposer.size } : {}),
      ...(storedComposer.count ? { count: storedComposer.count } : {}),
      ...(storedComposer.strength ? { strength: storedComposer.strength } : {}),
      count: storedComposer.count ?? readGenerationCount(),
    },
  }))
  const state = workspace.documents.find(document => document.id === workspace.activeId)!.state
  const chooseCloudImage = useCallback((model: string) => {
    dispatchWorkspace({ type: 'edit', id: workspace.activeId, action: { type: 'set-default-composer-model', sourceId: 'draivio-cloud', model } })
  }, [workspace.activeId])
  useCloudModelDefaults(chooseCloudImage)
  useEffect(() => { saveGenerationCount(state.composerParameters.count) }, [state.composerParameters.count])
  useEffect(() => { saveComposerPreferences({ mode: state.composerMode, sourceId: state.composerSourceId, ...state.composerParameters }) }, [state.composerMode, state.composerSourceId, state.composerParameters])
  useEffect(() => {
    try { window.localStorage.setItem('draivio-recent-colors', JSON.stringify(state.recentColors)) } catch { /* Storage can be disabled in private/webview contexts. */ }
  }, [state.recentColors])
  useEffect(() => {
    const color = state.toolOptions.textColor
    if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color)) return
    try { window.localStorage.setItem('draivio-text-color', color.toLowerCase()) } catch { /* Storage can be disabled in private/webview contexts. */ }
  }, [state.toolOptions.textColor])
  return <DocumentWorkspaceProvider workspace={workspace} dispatch={dispatchWorkspace}>{workspace.documents.map(document => <DocumentSessionProvider key={document.id} document={document} dispatchWorkspace={dispatchWorkspace}>{document.id === workspace.activeId ? children : null}</DocumentSessionProvider>)}</DocumentWorkspaceProvider>
}
export function useEditor() { const context = useContext(EditorContext); if (!context) throw new Error('useEditor must be used within EditorProvider'); return context }
