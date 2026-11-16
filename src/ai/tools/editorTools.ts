import { executeAdjustmentCommand,type AdjustmentCommand } from './adjustmentTools'
import { executeFilterCommand, type FilterCommand } from './filterTools'
import { editorReducer, type EditorAction, type EditorState, type Layer } from '../../state/editor'
import type { AlignmentMode, AlignmentTarget } from '../../document/alignment'
import type { TransformDraft } from '../../canvas/TransformOverlay'

/** Structured, model-facing commands for the basic layer editor. Values use document pixels and degrees. */
export type EditorCommand =
  | AdjustmentCommand
  | FilterCommand
  | { op: 'move'; layerId?: string; layerIds?: string[]; dx: number; dy: number }
  | { op: 'scale'; layerId?: string; layerIds?: string[]; sx: number; sy?: number }
  | { op: 'rotate'; layerId?: string; layerIds?: string[]; degrees: number }
  | { op: 'flip'; layerId?: string; layerIds?: string[]; axis: 'horizontal' | 'vertical' }
  | { op: 'opacity'; layerId?: string; value: number }
  | { op: 'visibility'; layerId?: string; visible?: boolean }
  | { op: 'blend'; layerId?: string; blendMode: string }
  | { op: 'rename'; layerId?: string; name: string }
  | { op: 'duplicate'; layerId?: string }
  | { op: 'delete'; layerId?: string }
  | { op: 'lock'; layerId?: string; locked?: boolean }
  | { op: 'reorder'; layerId?: string; direction: 'up' | 'down' }
  | { op: 'group'; layerIds?: string[] }
  | { op: 'align'; layerIds?: string[]; mode: AlignmentMode; target?: AlignmentTarget }
  | { op: 'distribute'; layerIds?: string[]; axis: 'horizontal' | 'vertical' }

function targetIds(state: EditorState, ids?: string[]) {
  const requested = ids?.length ? ids : state.selectedLayerIds?.length ? state.selectedLayerIds : [state.selectedLayerId]
  const known = new Set(state.layers.map((layer) => layer.id))
  const result = [...new Set(requested)].filter((id) => known.has(id))
  if (!result.length) throw new Error('找不到可编辑图层')
  return result
}

function number(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label}必须是有限数字`)
  return value
}

function transformOf(layer: Layer): TransformDraft {
  // Command construction runs before reducer lock checks and snapshot capture.
  // Keep its mutable draft separate from both the live layer and undo history.
  return layer.transform ? { ...layer.transform, rect: { ...layer.transform.rect } } : { kind: 'transform', rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
}

function transformAction(state: EditorState, id: string, command: Extract<EditorCommand, { op: 'move' | 'scale' | 'rotate' | 'flip' }>): EditorAction {
  const layer = state.layers.find((item) => item.id === id)
  if (!layer) throw new Error(`找不到图层：${id}`)
  const current = transformOf(layer)
  const rect = { ...current.rect }
  if (command.op === 'move') {
    const dx = number(command.dx, '移动 x') / state.documentWidth * 100
    const dy = number(command.dy, '移动 y') / state.documentHeight * 100
    rect.x += dx; rect.y += dy
  } else if (command.op === 'scale') {
    const sx = number(command.sx, '缩放 x'), sy = number(command.sy ?? command.sx, '缩放 y')
    if (sx <= 0 || sy <= 0) throw new Error('缩放比例必须大于 0')
    rect.width *= sx; rect.height *= sy
  } else if (command.op === 'rotate') {
    current.rotation = (current.rotation + number(command.degrees, '旋转角度')) % 360
  } else if (command.op === 'flip') {
    if (command.axis === 'horizontal') current.flipX = !current.flipX
    else current.flipY = !current.flipY
  }
  return { type: 'commit-layer-transform', layerId: id, transform: { ...current, rect } }
}

function actionFor(state: EditorState, command: EditorCommand): EditorAction | null {
  const id = 'layerId' in command ? targetIds(state, command.layerId ? [command.layerId] : undefined)[0] : undefined
  switch (command.op) {
    case 'adjustment': return null
    case 'filter': return null
    case 'move': case 'scale': case 'rotate': case 'flip': return transformAction(state, id ?? targetIds(state)[0], command)
    case 'opacity': return { type: 'set-layer-opacity', id: id ?? targetIds(state)[0], opacity: number(command.value, '透明度') }
    case 'visibility': {
      const target = state.layers.find((layer) => layer.id === (id ?? targetIds(state)[0]))
      if (!target) throw new Error('找不到图层')
      return command.visible === undefined || command.visible !== target.visible ? { type: 'toggle-layer', id: target.id } : null
    }
    case 'blend': return { type: 'set-layer-blend', id: id ?? targetIds(state)[0], blendMode: command.blendMode }
    case 'rename': return { type: 'rename-layer', id: id ?? targetIds(state)[0], name: command.name }
    case 'duplicate': return { type: 'duplicate-layer', id: id ?? targetIds(state)[0] }
    case 'delete': return { type: 'delete-layer', id: id ?? targetIds(state)[0] }
    case 'lock': {
      const target = state.layers.find((layer) => layer.id === (id ?? targetIds(state)[0]))
      if (!target || command.locked === undefined || command.locked !== !!target.locked) return target ? { type: 'toggle-layer-lock', id: target.id } : null
      return null
    }
    case 'reorder': return { type: 'reorder-layer', id: id ?? targetIds(state)[0], direction: command.direction }
    case 'group': return { type: 'group-layers', ids: command.layerIds ?? state.selectedLayerIds }
    case 'align': return { type: 'align-layers', mode: command.mode, target: command.target }
    case 'distribute': return { type: 'distribute-layers', axis: command.axis }
  }
}

/** Apply one structured command through the same reducer used by direct UI editing. */
export function executeEditorCommand(state: EditorState, command: EditorCommand): EditorState {
  if(command.op==='adjustment')return executeAdjustmentCommand(state,command)
  if(command.op==='filter')return executeFilterCommand(state,command)
  const ids = 'layerIds' in command && command.layerIds?.length ? command.layerIds : undefined
  if (ids && ['move', 'scale', 'rotate', 'flip'].includes(command.op)) {
    return ids.reduce((current, id) => {
      const action = transformAction(current, id, command as Extract<EditorCommand, { op: 'move' | 'scale' | 'rotate' | 'flip' }>)
      return editorReducer(current, action)
    }, state)
  }
  if (ids && (command.op === 'align' || command.op === 'distribute')) {
    // Alignment reducers intentionally consume the selection; scope an explicit
    // command target through that same reducer path and restore UI selection.
    const selectedLayerIds = state.selectedLayerIds
    const selectedLayerId = state.selectedLayerId
    const scoped = { ...state, selectedLayerIds: ids, selectedLayerId: ids[0] }
    const action = actionFor(scoped, command)
    const next = action ? editorReducer(scoped, action) : scoped
    return { ...next, selectedLayerIds, selectedLayerId }
  }
  const action = actionFor(state, command)
  return action ? editorReducer(state, action) : state
}

