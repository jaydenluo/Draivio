import type { EditorState } from '../../state/editor'
import type { PlanStep } from '../planning/planner'
import { executeEditorCommand, type EditorCommand } from '../tools/editorTools'
import { assertRegionRasterCapability } from '../../render/regionScene'

export type NumericEditParameter = { key: string; label: string; min?: number; max?: number; step: number }
/** Only numeric arguments of real reducer-backed EditorCommands are exposed. */
export const editNumericParameters: Partial<Record<EditorCommand['op'], readonly NumericEditParameter[]>> = {
 adjustment: [{ key: 'value', label: '颜色调整值', min: -100, max: 100, step: 1 }],
 move: [{ key: 'dx', label: '水平移动（像素）', step: 1 }, { key: 'dy', label: '垂直移动（像素）', step: 1 }],
 rotate: [{ key: 'degrees', label: '旋转（度）', step: 1 }],
 scale: [{ key: 'sx', label: '水平缩放', min: .01, step: .1 }, { key: 'sy', label: '垂直缩放', min: .01, step: .1 }],
 opacity: [{ key: 'value', label: '不透明度（%）', min: 0, max: 100, step: 1 }],
}
export type EditPreviewCandidate = {
 id: string; documentId: string; revision: EditorState; base: EditorState
 steps: PlanStep[]; scopeIds: string[]; document: EditorState
}
let serial = 0
const commandFields: Record<EditorCommand['op'], readonly string[]> = {
 adjustment:['layerId','key','value','scope'],
 filter:['layerId','kind','radius','amount','angle','size','seed','threshold','scope'],
 move: ['layerId','layerIds','dx','dy'], scale: ['layerId','layerIds','sx','sy'], rotate: ['layerId','layerIds','degrees'], flip: ['layerId','layerIds','axis'],
 opacity: ['layerId','value'], visibility: ['layerId','visible'], blend: ['layerId','blendMode'], rename: ['layerId','name'], duplicate: ['layerId'], delete: ['layerId'], lock: ['layerId','locked'], reorder: ['layerId','direction'], group: ['layerIds'], align: ['layerIds','mode','target'], distribute: ['layerIds','axis'],
}
/** No selection fallback or model-provided operation override is authorized here. */
export function executePreviewStep(draft: EditorState, step: Pick<PlanStep,'tool'|'args'>, scopeIds: readonly string[]): EditorState {
 const allowed = commandFields[step.tool]
 if (!allowed || Object.keys(step.args).some(key => !allowed.includes(key))) throw new Error('工具包含未声明的参数')
 const single = step.args.layerId
 const multiple = step.args.layerIds
 if (single !== undefined && (typeof single !== 'string' || !single)) throw new Error('需要明确目标图层')
 if (multiple !== undefined && (!Array.isArray(multiple) || !multiple.length || multiple.some(id => typeof id !== 'string' || !id))) throw new Error('需要明确目标图层')
 const targets: string[] = [...(typeof single === 'string' ? [single] : []), ...(Array.isArray(multiple) ? multiple : [])]
 if (!targets.length) throw new Error('需要明确目标图层，不能回退当前选中对象')
 if (targets.some(id => !scopeIds.includes(id) || !draft.layers.some(layer => layer.id === id))) throw new Error('目标不在所选编辑范围内')
 for (const id of targets) {
  const layer = draft.layers.find(item => item.id === id)
  if (layer?.rasterRef) assertRegionRasterCapability({ width: layer.contentWidth ?? draft.documentWidth, height: layer.contentHeight ?? draft.documentHeight, rasterRef: layer.rasterRef, nativeTiles: false }, 'ai')
 }
 const next = executeEditorCommand(draft, { ...step.args, op: step.tool } as EditorCommand)
 if (next.notice?.includes('锁定') && next.layers === draft.layers) throw new Error(next.notice)
 return next
}
function build(base: EditorState, steps: PlanStep[], scopeIds: string[]): EditorState {
 let draft = structuredClone(base)
 for (const step of steps) {
  draft = executePreviewStep(draft, step, scopeIds)
 }
 return { ...draft, undoStack: base.undoStack, redoStack: base.redoStack }
}
export function createEditPreview(base: EditorState, documentId: string, steps: PlanStep[], scopeIds: string[], executed?: EditorState): EditPreviewCandidate {
 const snapshot = structuredClone(base), copiedSteps = structuredClone(steps)
 return { id: `edit-preview-${++serial}`, documentId, revision: base, base: snapshot, steps: copiedSteps, scopeIds: [...scopeIds], document: executed ? { ...executed, undoStack: snapshot.undoStack, redoStack: snapshot.redoStack } : build(snapshot, copiedSteps, scopeIds) }
}
export function rebuildEditPreview(candidate: EditPreviewCandidate, stepId: string, key: string, value: number): EditPreviewCandidate {
 const step = candidate.steps.find(item => item.id === stepId)
 const field = step && editNumericParameters[step.tool]?.find(item => item.key === key)
 if (!field || !Number.isFinite(value) || (field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) throw new Error('参数无效，请输入工具允许范围内的数字')
 const steps = candidate.steps.map(item => item.id === stepId ? { ...item, args: { ...item.args, [key]: value } } : item)
 return { ...candidate, steps, document: build(candidate.base, steps, candidate.scopeIds) }
}
export function previewCanCommit(candidate: EditPreviewCandidate, state: EditorState, documentId: string): boolean {
 return candidate.revision === state && candidate.documentId === documentId
}
