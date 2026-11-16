import { editorReducer, type EditorAction, type EditorState, type LayerAdjustments } from '../../state/editor'
import { effectiveLayerState, layerWriteIsLocked } from '../../state/layerHierarchy'
import type { TransformDraft } from '../../canvas/TransformOverlay'
import { ToolValidationError, validateSchema, type ToolSchema } from './schema'

export type ToolCall = { toolId: string; version: number; documentId: string; sessionId: string; revision: string; targetId: string; params: unknown }
export type ToolPolicy = { canEdit?: boolean; maxDocumentPixels?: number }
export type ToolDescriptor = { toolId: string; version: number; inputSchema: ToolSchema; outputSchema: ToolSchema; objectTypes: readonly string[]; scope: 'layer'; sideEffects: readonly string[]; cost: 'local' }
type Definition = ToolDescriptor & { action: (id: string, params: unknown) => EditorAction }
const string: ToolSchema = { type: 'string', minLength: 1, maxLength: 256, pattern: '\\S' }
const number = (minimum: number, maximum: number): ToolSchema => ({ type: 'number', minimum, maximum })
const object = (properties: Record<string, ToolSchema>): ToolSchema => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false })
const adjustmentKeys = ['brightness', 'contrast', 'saturation', 'temperature', 'sharpness', 'blur', 'shadows', 'highlights'] as const
const outputSchema = object({ targetId: string, revision: string })
const base = { version: 1, outputSchema, objectTypes: ['content-layer'], scope: 'layer' as const, sideEffects: ['document', 'history'], cost: 'local' as const }
const definitions: readonly Definition[] = [
  { ...base, toolId: 'layer.adjustment', inputSchema: { type: 'object', required: ['key', 'value'], additionalProperties: false, properties: { key: { type: 'string', maxLength: 32, enum: adjustmentKeys }, value: number(-100, 100) }, oneOf: [object({ key: { type: 'string', maxLength: 32, enum: ['blur'] }, value: number(0, 100) }), object({ key: { type: 'string', maxLength: 32, enum: adjustmentKeys.filter(key => key !== 'blur') }, value: number(-100, 100) })] }, action: (id, params) => ({ type: 'set-layer-adjustment', id, ...(params as { key: keyof LayerAdjustments; value: number }) }) },
  { ...base, toolId: 'layer.transform', inputSchema: object({ kind: { type: 'string', maxLength: 9, enum: ['transform'] }, rect: object({ x: number(-3276800, 3276800), y: number(-3276800, 3276800), width: number(.001, 3276800), height: number(.001, 3276800) }), rotation: number(-180, 180), flipX: { type: 'boolean' }, flipY: { type: 'boolean' } }), action: (layerId, params) => ({ type: 'commit-layer-transform', layerId, transform: structuredClone(params as TransformDraft) }) },
  { ...base, toolId: 'layer.rename', objectTypes: ['content-layer', 'group'], inputSchema: object({ name: string }), action: (id, params) => ({ type: 'rename-layer', id, name: (params as { name: string }).name }) },
]
const byId = new Map(definitions.map(item => [item.toolId, item]))
const envelopeSchema = object({ toolId: string, version: { type: 'integer', minimum: 1, maximum: 65535 }, documentId: string, sessionId: string, revision: string, targetId: string, params: object({}) })

/** Returns detached metadata only: callers cannot mutate the executable registry. */
export function listExecutableTools(version = 1): ToolDescriptor[] {
  return definitions.filter(tool => tool.version === version).map(({ action: _action, ...metadata }) => structuredClone(metadata))
}
export function bindToolCall(state: EditorState, toolId: string, targetId: string, params: unknown): ToolCall {
  return { toolId, version: 1, documentId: state.documentId, sessionId: state.documentSessionId, revision: state.documentRevision, targetId, params }
}
export type PreparedToolCall = { ok: true; action: EditorAction } | { ok: false; error: string }

/** Both UI and AI enter here before the existing reducer executes the operation. */
export function prepareToolCall(state: EditorState, input: unknown, policy: ToolPolicy = {}): PreparedToolCall {
  try {
    // Validate envelope without reading user-supplied getters, then validate the tool's closed params.
    if (!input || typeof input !== 'object') throw new ToolValidationError('工具调用无效')
    const descriptor = Object.getOwnPropertyDescriptor(input, 'params')
    if (!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new ToolValidationError('工具参数无效')
    const fields = Object.getOwnPropertyDescriptors(input)
    const shape = Object.create(Object.getPrototypeOf(input))
    Object.defineProperties(shape, { ...fields, params: { value: {}, enumerable: true, configurable: true } })
    validateSchema(envelopeSchema, shape, '工具调用')
    const call = input as ToolCall
    const definition = byId.get(call.toolId)
    if (!definition || definition.version !== call.version) throw new ToolValidationError('工具或版本不可用')
    validateSchema(definition.inputSchema, call.params)
    if (call.documentId !== state.documentId || call.sessionId !== state.documentSessionId || call.revision !== state.documentRevision) throw new ToolValidationError('文档或版本已更改')
    const policyDescriptors = Object.getOwnPropertyDescriptors(policy)
    if (![Object.prototype, null].includes(Object.getPrototypeOf(policy)) || Reflect.ownKeys(policy).some(key => typeof key !== 'string' || !['canEdit', 'maxDocumentPixels'].includes(key)) || Object.values(policyDescriptors).some(item => !Object.hasOwn(item, 'value'))) throw new ToolValidationError('执行策略无效')
    if (policy.canEdit !== undefined && typeof policy.canEdit !== 'boolean') throw new ToolValidationError('编辑权限无效')
    if (policy.canEdit === false) throw new ToolValidationError('没有文档编辑权限')
    const limit = policy.maxDocumentPixels ?? 64 * 1024 * 1024
    if (!Number.isSafeInteger(limit) || limit <= 0 || !Number.isSafeInteger(state.documentWidth) || state.documentWidth <= 0 || !Number.isSafeInteger(state.documentHeight) || state.documentHeight <= 0 || state.documentWidth * state.documentHeight > Math.min(limit, 64 * 1024 * 1024)) throw new ToolValidationError('文档超出资源限制')
    const layer = state.layers.find(item => item.id === call.targetId)
    if (!layer) throw new ToolValidationError('目标图层已失效')
    if (effectiveLayerState(state.layers, layer.id).locked) throw new ToolValidationError('图层或父组已锁定')
    if ((layer.children !== undefined || layer.className === 'layer-group') && call.toolId !== 'layer.rename') throw new ToolValidationError('该工具不支持图层组')
    const action = definition.action(call.targetId, call.params)
    if (layerWriteIsLocked(state, action)) throw new ToolValidationError('目标或子图层已锁定')
    return { ok: true, action: { ...action, expectedDocumentId: call.documentId, expectedDocumentSessionId: call.sessionId, expectedRevision: call.revision } }
  } catch (error) {
    return { ok: false, error: error instanceof ToolValidationError ? error.message : '工具调用格式无效' }
  }
}
export function executeToolCall(state: EditorState, input: unknown, policy: ToolPolicy = {}): { ok: boolean; state: EditorState; output?: { targetId: string; revision: string }; error?: string } {
  const prepared = prepareToolCall(state, input, policy)
  if (!prepared.ok) return { ...prepared, state }
  const next = editorReducer(state, prepared.action)
  const output = { targetId: (input as ToolCall).targetId, revision: next.documentRevision }
  validateSchema(outputSchema, output, '工具结果')
  return { ok: true, state: next, output }
}
