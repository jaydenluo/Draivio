import type { EditorState, EditorAction } from '../../state/editor'
import { editorReducer, snapshot } from '../../state/editor'

export type TransactionStep = {
  id: string
  apply: (state: EditorState) => EditorState | Promise<EditorState>
  resources?: string[]
}
export type TransactionResource = { id: string; release?: () => void | Promise<void> }
export type TransactionPlan = { id?: string; base?: string; steps: TransactionStep[]; resources?: TransactionResource[] }
export type TransactionCandidate = { id: string; base: string; state: EditorState; failedAt?: string }
export type TransactionOutcome =
  | { status: 'committed'; state: EditorState; transactionId: string }
  | { status: 'cancelled' | 'failed'; state: EditorState; transactionId: string; error?: Error }
  | { status: 'conflict'; state: EditorState; transactionId: string; candidate: TransactionCandidate }

const clone = <T>(value: T): T => structuredClone(value)
/** Fingerprint editable document content while excluding transient history and UI fields. */
export function editorDocumentFingerprint(state: EditorState): string {
  const { undoStack: _u, redoStack: _r, notice: _n, isGenerating: _g, ...document } = state
  return JSON.stringify(document)
}
export function transactionFromActions(id: string, actions: EditorAction[]): TransactionPlan {
  return { id, steps: actions.map((action, index) => ({ id: `${id}:${index + 1}`, apply: state => editorReducer(state, action) })) }
}

/** Run all steps against a private draft. Only a successful plan produces one undo entry. */
export async function executeTransaction(state: EditorState, plan: TransactionPlan, options: { signal?: AbortSignal; current?: () => EditorState } = {}): Promise<TransactionOutcome> {
  const transactionId = plan.id ?? `transaction-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const base = plan.base ?? editorDocumentFingerprint(state)
  const current = options.current?.() ?? state
  if (editorDocumentFingerprint(current) !== base) {
    const candidate: TransactionCandidate = { id: transactionId, base, state: clone(state) }
    return { status: 'conflict', state: current, transactionId, candidate }
  }
  const resources = new Map((plan.resources ?? []).map(resource => [resource.id, resource]))
  const release = async () => { for (const resource of resources.values()) await resource.release?.(); resources.clear() }
  const originalSnapshot = clone(snapshot(state))
  let draft = clone(state)
  try {
    for (const step of plan.steps) {
      if (options.signal?.aborted) { await release(); return { status: 'cancelled', state, transactionId } }
      draft = await step.apply(draft)
      if (options.signal?.aborted) { await release(); return { status: 'cancelled', state, transactionId } }
      if (!draft || editorDocumentFingerprint(draft) === '') throw new Error(`事务步骤无效：${step.id}`)
      for (const resourceId of step.resources ?? []) if (!resources.has(resourceId)) throw new Error(`事务资源缺失：${resourceId}`)
      const latest = options.current?.() ?? state
      if (editorDocumentFingerprint(latest) !== base) {
        const candidate: TransactionCandidate = { id: transactionId, base, state: clone(draft), failedAt: step.id }
        await release(); return { status: 'conflict', state: latest, transactionId, candidate }
      }
    }
    // Capture directly from the original document. Reducer history rolls at 30
    // entries, and pure draft steps need not create reducer snapshots at all.
    const changed = JSON.stringify(snapshot(draft)) !== JSON.stringify(originalSnapshot)
    const committed = { ...draft, undoStack: changed ? [...state.undoStack, originalSnapshot].slice(-30) : state.undoStack, redoStack: changed ? [] : state.redoStack }
    resources.clear()
    return { status: 'committed', state: committed, transactionId }
  } catch (cause) {
    await release()
    return { status: 'failed', state, transactionId, error: cause instanceof Error ? cause : new Error(String(cause)) }
  }
}
