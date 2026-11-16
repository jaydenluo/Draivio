import { TOOL_GROUPS } from './toolRegistry'
import type { ToolGroupId, ToolId } from './toolTypes'

export type ToolCapabilityStatus = 'real' | 'simulated' | 'missing'
export type ToolCapability = {
  toolId: ToolId
  groupId: ToolGroupId
  status: ToolCapabilityStatus
  behavior: string
  mapping: { reducerActions: string[]; renderPaths: string[]; schemaFields: string[] }
  scope: { document: string; layer: string; selection: string }
  sideEffects: string[]
  dependencies: string[]
  gapReason: string
  evidence: { level: 'source-and-offline-tests' | 'source-only'; tests: string[]; liveAudit: 'blocked_native_input_not_acceptance' }
  acceptanceTargets: { firstRelease: string[]; complete: string[] }
}

const ALL_TOOLS = TOOL_GROUPS.flatMap((group) => group.tools)
const missing = new Set<ToolId>(['subject-select', 'healing', 'mask-subject'])
const simulated = new Set<ToolId>(['select', 'gradient-brush', 'pen'])
const gaps: Record<string, string> = {
  'select-move': '对象命中测试与自动选层仍由后续 F05/A04 补齐', selection: '高级选区与语义分割由 F10/A16 补齐', brush: 'AI 工具适配与逐项像素验收由 A37 补齐',
  'erase-heal': '擦除/修复的完整像素工具链由 F19/A37 补齐', mask: '高级蒙版与语义分割由 F10/A16 补齐', 'crop-transform': '透视与变换完整验收由 F04/A14 补齐',
  'text-shape': '可编辑文字/路径对象由 F14/F22/A37 补齐', 'color-fill': '颜色/填充缺少浏览器像素验收，逐项能力由 A37 补齐', navigation: '跨平台完整工作流由 A35 补齐',
}
const paths: Record<ToolGroupId, string[]> = {
  'select-move': ['src/canvas/CanvasViewport.tsx', 'src/canvas/CanvasScene.tsx'], selection: ['src/canvas/SelectionOverlay.tsx', 'src/canvas/selectionGeometry.ts', 'src/canvas/selectionRaster.ts'], brush: ['src/canvas/CanvasViewport.tsx', 'src/canvas/BrushEngine.ts'], 'erase-heal': ['src/canvas/CanvasViewport.tsx', 'src/canvas/rasterTools.ts'], mask: ['src/canvas/MaskOverlay.tsx', 'src/state/editor.tsx'], 'crop-transform': ['src/canvas/CanvasViewport.tsx', 'src/canvas/TransformOverlay.tsx'], 'text-shape': ['src/canvas/CanvasViewport.tsx', 'src/canvas/documentTypes.ts'], 'color-fill': ['src/canvas/CanvasViewport.tsx', 'src/canvas/rasterTools.ts'], navigation: ['src/canvas/CanvasViewport.tsx', 'src/state/editor.tsx'],
}
const actions: Record<ToolGroupId, string[]> = {
  'select-move': ['set-notice', 'commit-selection'], selection: ['commit-selection'], brush: ['commit-brush-stroke'], 'erase-heal': ['set-layer-source', 'commit-brush-stroke'], mask: ['selection-to-mask', 'commit-mask', 'apply-mask'], 'crop-transform': ['commit-crop', 'commit-layer-transform'], 'text-shape': ['upsert-text', 'add-shape'], 'color-fill': ['set-brush-color', 'set-layer-source', 'commit-selection'], navigation: ['set-canvas-offset', 'set-zoom', 'set-canvas-rotation'],
}
const schemas: Record<ToolGroupId, string[]> = {
  'select-move': ['selection', 'layers[].transform', 'notice'], selection: ['selection', 'selectionRect', 'selectionVisible'], brush: ['brushStrokes', 'brushColor'], 'erase-heal': ['layers[].source', 'brushStrokes'], mask: ['layerMasks', 'selection'], 'crop-transform': ['cropRect', 'layers[].transform'], 'text-shape': ['canvasTexts', 'canvasShapes'], 'color-fill': ['brushColor', 'layers[].source', 'selection'], navigation: ['canvasOffset', 'zoom', 'canvasRotation'],
}
const tests: Record<ToolGroupId, string[]> = {
  'select-move': ['src/canvas/CanvasObjectTools.test.tsx', 'src/canvas/TransformOverlay.test.tsx'], selection: ['src/canvas/selectionGeometry.test.ts', 'src/canvas/SelectionOverlay.test.tsx'], brush: ['src/canvas/CanvasPixelTools.test.tsx', 'src/canvas/ToolInteraction.test.tsx'], 'erase-heal': ['src/canvas/rasterTools.test.ts'], mask: ['src/canvas/MaskOverlay.test.tsx', 'src/state/documentHistory.test.ts'], 'crop-transform': ['src/canvas/TransformOverlay.test.tsx', 'src/state/documentHistory.test.ts'], 'text-shape': ['src/canvas/PathWorkflow.test.tsx'], 'color-fill': ['src/canvas/CanvasPixelTools.test.tsx', 'src/canvas/rasterTools.test.ts'], navigation: ['src/state/documentHistory.test.ts'],
}

function capability(tool: (typeof ALL_TOOLS)[number]): ToolCapability {
  const status = missing.has(tool.id) ? 'missing' : simulated.has(tool.id) ? 'simulated' : 'real'
  const group = tool.groupId
  const gapReason = status === 'missing' ? `当前没有${tool.label}服务或本地算法绑定（没有主体分割/修复实现）；${gaps[group]}` : status === 'simulated' ? `入口存在但${tool.label}不满足完整语义：${gaps[group]}` : gaps[group]
  return { toolId: tool.id, groupId: group, status, behavior: status === 'real' ? `${tool.label}使用本地编辑路径并可产生对应文档状态变化` : status === 'simulated' ? `${tool.label}仅覆盖受限本地行为，不能视为完整能力` : `${tool.label}显示入口但没有可执行实现`, mapping: { reducerActions: actions[group], renderPaths: paths[group], schemaFields: schemas[group] }, scope: { document: '当前 documentId/session/revision', layer: 'selectedLayerId 与图层树', selection: '当前 selection/selectionRect；空选区按工具规则处理' }, sideEffects: schemas[group].filter((field) => !['selection', 'selectionRect', 'selectionVisible', 'notice', 'zoom', 'canvasOffset', 'canvasRotation', 'brushColor'].includes(field)), dependencies: ['editorReducer', ...paths[group]], gapReason, evidence: { level: tests[group].length ? 'source-and-offline-tests' : 'source-only', tests: tests[group], liveAudit: 'blocked_native_input_not_acceptance' }, acceptanceTargets: { firstRelease: ['本地路径有定向行为测试', '失败/取消不污染文档'], complete: ['浏览器逐工具确认像素、历史、保存重开与导出', '真实能力与状态/缺口保持一致'] } }
}

export const TOOL_CAPABILITIES: readonly ToolCapability[] = ALL_TOOLS.map(capability)
const byId = new Map<ToolId, ToolCapability>(TOOL_CAPABILITIES.map((item) => [item.toolId, item]))
export function listToolCapabilities(): readonly ToolCapability[] { return TOOL_CAPABILITIES }
export function getToolCapability(toolId: ToolId | string): ToolCapability | undefined { return byId.get(toolId as ToolId) }
