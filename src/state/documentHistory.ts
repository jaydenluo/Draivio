import type { EditorAction, EditorState, HistoryItem } from './editor'

export const HISTORY_LIMIT = 30
const snapshotKeys = ['documentWidth', 'documentHeight', 'documentBackground', 'layers', 'selectedLayerId', 'selectedLayerIds', 'aiResults', 'selectionVisible', 'selection', 'selectionRect', 'prompt', 'composerMode', 'composerSourceId', 'composerParameters', 'brushStrokes', 'canvasTexts', 'canvasShapes', 'layerMasks', 'cropRect', 'sceneOrder'] as const
export type DocumentSnapshot = Pick<EditorState, typeof snapshotKeys[number]>
export type HistoryTransaction = { documentId: string; revision: string; label: string; actionKey?: string; baseline: DocumentSnapshot; dirty: boolean }
export function documentSnapshot(state: EditorState): DocumentSnapshot {
  return Object.fromEntries(snapshotKeys.map((key) => [key, state[key]])) as DocumentSnapshot
}
function equal(left: DocumentSnapshot, right: DocumentSnapshot) {
  return snapshotKeys.every((key) => left[key] === right[key] || JSON.stringify(left[key]) === JSON.stringify(right[key]))
}
const freshVersion = () => `version-${crypto.randomUUID()}`

const labels: Partial<Record<EditorAction['type'], string>> = {
  'rename-layer': '重命名图层', 'toggle-layer': '图层可见性', 'toggle-layer-lock': '图层锁定',
  'set-layer-opacity': '图层不透明度', 'set-layer-blend': '图层混合模式', 'add-layer': '新建图层',
  'duplicate-layer': '复制图层', 'delete-layer': '删除图层', 'batch-delete-layers': '批量删除图层',
  'batch-toggle-layer': '批量更新图层', 'group-layers': '创建图层组', 'reorder-layer': '图层排序', 'move-layer': '移动图层',
  'align-layers': '对齐与等距分布', 'commit-layer-transform': '变换图层', 'commit-brush-stroke': '画笔笔画', 'remove-stroke': '删除笔画',
  'upsert-text': '编辑文字', 'add-canvas-text': '添加文字', 'add-shape': '添加形状',
  'selection-to-mask': '选区转蒙版', 'commit-mask': '绘制蒙版', 'invert-mask': '反转蒙版', 'clear-mask': '清空蒙版', 'apply-mask': '应用蒙版',
  'set-layer-adjustment': '图像调整', 'toggle-layer-adjustments-preview': '切换调整预览', 'reset-layer-adjustments': '重置图像调整', 'commit-selection': '修改选区',
  'invert-selection': '反转选区', 'morph-selection': '调整选区', 'commit-crop': '裁剪画布', 'resize-document': '调整文档尺寸',
  'rasterize-layer': '编辑图层像素', 'set-layer-source': '更新图层内容', 'set-prompt': '修改提示词',
  'set-composer-parameter': '修改生成参数', 'set-output-format': '修改输出尺寸', 'set-composer-mode': '修改生成模式', 'set-composer-source': '修改服务来源',
  'replace-layer-with-ai-result': '替换 AI 结果', 'adopt-ai-result-as-layer': '采用 AI 结果',
  'replace-layer-with-result': '替换图层', 'add-result-layer': '新增结果图层', 'add-ai-result': '收到 AI 候选',
  'toggle-ai-result-favorite': '收藏 AI 结果', 'delete-ai-result': '删除 AI 结果', 'toggle-group': '图层组展开状态',
}

/** Seed only real restorable rows; legacy decorative rows have no version to restore. */
export function initializeHistory(state: EditorState, label = '当前文档'): EditorState {
  const id = freshVersion()
  return { ...state, history: [{ id, label, tone: 'original', snapshot: documentSnapshot(state) }], selectedHistoryId: id, documentRevision: id, historyTransaction: null, undoStack: [], redoStack: [] }
}
function hydrated(state: EditorState): EditorState {
  if (state.history.some((item) => item.id === state.selectedHistoryId && item.snapshot)) return state
  const id = state.selectedHistoryId || freshVersion()
  return { ...state, history: [{ id, label: state.history.find((item) => item.id === id)?.label ?? '当前文档', tone: 'original', snapshot: documentSnapshot(state) }] }
}
function rebuildStacks(state: EditorState, history: HistoryItem[], selectedHistoryId: string): EditorState {
  const index = history.findIndex((item) => item.id === selectedHistoryId)
  return { ...state, history, selectedHistoryId, undoStack: history.slice(0, index).map((item) => item.snapshot!), redoStack: history.slice(index + 1).reverse().map((item) => item.snapshot!) }
}
function appendVersion(state: EditorState, next: EditorState, label: string, kind: HistoryItem['kind'] = 'operation'): EditorState {
  const base = hydrated(state)
  const cursor = base.history.findIndex((item) => item.id === base.selectedHistoryId)
  const id = freshVersion()
  const history: HistoryItem[] = [...base.history.slice(0, cursor + 1), { id, label, kind, tone: 'mint' as const, snapshot: documentSnapshot(next) }].slice(-HISTORY_LIMIT - 1)
  return rebuildStacks({ ...next, documentRevision: id, historyTransaction: null }, history, id)
}

function transactionActionKey(action: EditorAction): string | undefined {
  switch (action.type) {
    case 'set-prompt': return action.type
    case 'set-layer-opacity': return `${action.type}:${action.id}`
    case 'set-layer-adjustment': return `${action.type}:${action.id}:${action.key}`
    case 'commit-layer-transform': return `${action.type}:${action.layerId}`
    default: return undefined
  }
}

export function recordDocumentCommit(state: EditorState, next: EditorState, action: EditorAction): EditorState {
  if (equal(documentSnapshot(state), documentSnapshot(next))) return { ...next, history: state.history, selectedHistoryId: state.selectedHistoryId, undoStack: state.undoStack, redoStack: state.redoStack }
  const transaction = state.historyTransaction
  if (transaction) {
    const key = transactionActionKey(action)
    if (key && (!transaction.actionKey || transaction.actionKey === key)) return { ...next, history: state.history, selectedHistoryId: state.selectedHistoryId, undoStack: state.undoStack, redoStack: state.redoStack, documentRevision: freshVersion(), historyTransaction: { ...transaction, actionKey: key, dirty: true } }
    // An unrelated edit closes this transaction before receiving its own version.
    // A later Escape may cancel the old control, but must never discard this edit.
    const settled = handleHistoryAction(state, { type: 'end-transaction' })!
    return recordDocumentCommit(settled, { ...next, historyTransaction: null }, action)
  }
  const added = next.history.find((item) => !state.history.some((old) => old.id === item.id))
  return appendVersion(state, next, added?.label ?? labels[action.type] ?? '编辑文档', ['append-ai-result', 'add-ai-result', 'complete-ai-operation'].includes(action.type) ? 'result' : 'operation')
}

function restoreVersion(state: EditorState, id: string) {
  const base = hydrated(state)
  const item = base.history.find((entry) => entry.id === id)
  if (!item?.snapshot) return { ...state, notice: '该历史版本不可恢复' }
  return rebuildStacks({ ...state, ...item.snapshot, documentRevision: freshVersion(), historyTransaction: null, notice: `已恢复：${item.label}` }, base.history, item.id)
}

type TransactionAction = Extract<EditorAction, { type: 'begin-transaction' | 'end-transaction' | 'cancel-transaction' }>
export function handleHistoryAction(state: EditorState, action: EditorAction): EditorState | undefined {
  if (action.type === 'begin-transaction' || action.type === 'end-transaction' || action.type === 'cancel-transaction') {
    const token = action as TransactionAction
    if (token.documentId && token.documentId !== state.documentId) return { ...state, notice: '文档已更改，已放弃过期编辑' }
    const revision = action.type === 'begin-transaction' ? state.documentRevision : state.historyTransaction?.revision
    if (token.revision && token.revision !== revision) return { ...state, notice: '文档版本已更改，已放弃过期编辑' }
    if (action.type === 'begin-transaction') return state.historyTransaction ? state : { ...hydrated(state), historyTransaction: { documentId: state.documentId, revision: state.documentRevision, label: action.label, baseline: documentSnapshot(state), dirty: false } }
    const transaction = state.historyTransaction
    if (!transaction) return state
    if (action.type === 'cancel-transaction') return { ...state, ...transaction.baseline, historyTransaction: null, documentRevision: transaction.dirty ? freshVersion() : state.documentRevision }
    if (!transaction.dirty || equal(transaction.baseline, documentSnapshot(state))) return { ...state, historyTransaction: null }
    // The canonical selected row is the pre-transaction version.
    return appendVersion({ ...state, ...transaction.baseline, historyTransaction: null }, state, transaction.label)
  }
  if (action.type === 'clear-history') return initializeHistory(state, '当前文档')
  if (action.type === 'select-history') return restoreVersion(state, action.id)
  if (action.type === 'undo' || action.type === 'redo') {
    // Escaping an in-flight preview first restores its baseline without recording it.
    if (state.historyTransaction) return { ...state, ...state.historyTransaction.baseline, historyTransaction: null, documentRevision: freshVersion() }
    const base = hydrated(state)
    const cursor = base.history.findIndex((item) => item.id === base.selectedHistoryId)
    const target = base.history[cursor + (action.type === 'undo' ? -1 : 1)]
    return target ? restoreVersion(state, target.id) : { ...state, notice: action.type === 'undo' ? '没有可撤销的操作' : '没有可重做的操作' }
  }
}
