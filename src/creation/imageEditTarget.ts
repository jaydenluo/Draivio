import type { EditorState } from '../state/editor'

export type ImageEditTarget = 'auto' | 'selection' | 'object' | 'document' | 'upload'
export function editTargetIds(state: EditorState): string[] {
  const ids = state.selectedLayerIds.length ? state.selectedLayerIds : [state.selectedLayerId]
  return ids.filter(id => state.layers.some(layer => layer.id === id))
}
export function resolveImageEditTarget(state: EditorState, target: ImageEditTarget): Exclude<ImageEditTarget, 'auto'> {
  if (target !== 'auto') return target
  if (state.selectionVisible) return 'selection'
  return editTargetIds(state).length ? 'object' : 'document'
}
export const editTargetLabels = { selection: '当前选区', object: '选中对象', document: '整个画布', upload: '上传图片' }
