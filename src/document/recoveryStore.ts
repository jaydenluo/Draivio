export type RecoverySnapshot = { documentId: string; projectVersion: number; savedAt: number; payload: unknown; recoveryVersion?: number }

type StorageAdapter = { read: () => string | null; write: (value: string) => void }
const KEY = 'draivio-recovery-snapshots'

function defaultAdapter(): StorageAdapter {
  return { read: () => typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY), write: (value) => { if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, value) } }
}

export function createRecoveryStore(adapter: StorageAdapter = defaultAdapter()) {
  const pending = new Map<string, number>()
  const valid = (item: unknown): item is RecoverySnapshot => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const value = item as RecoverySnapshot
    return typeof value.documentId === 'string' && value.documentId.length > 0 && value.documentId.length <= 256 && Number.isSafeInteger(value.projectVersion) && value.projectVersion >= 0 && Number.isFinite(value.savedAt) && value.savedAt >= 0 && value.payload !== undefined && (value.recoveryVersion === undefined || Number.isSafeInteger(value.recoveryVersion) && value.recoveryVersion > 0)
  }
  const read = (): RecoverySnapshot[] => { try {
    const text = adapter.read() ?? '[]'
    if (text.length > 24 * 1024 * 1024) return []
    const data = JSON.parse(text)
    return Array.isArray(data) ? data.filter(valid) : []
  } catch { return [] } }
  const write = (items: RecoverySnapshot[]) => adapter.write(JSON.stringify(items))
  return {
    async save(snapshot: RecoverySnapshot, delay = 0) {
      if (!valid(snapshot)) throw new Error('恢复副本字段无效')
      const next = (pending.get(snapshot.documentId) ?? 0) + 1
      pending.set(snapshot.documentId, next)
      if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
      if (pending.get(snapshot.documentId) !== next) return false
      const items = read().filter((item) => !(item.documentId === snapshot.documentId && item.projectVersion === snapshot.projectVersion))
      const nextSnapshot = { ...snapshot, recoveryVersion: next }
      items.unshift(nextSnapshot)
      write(items.filter((item) => item.documentId !== snapshot.documentId || items.filter((candidate) => candidate.documentId === snapshot.documentId).indexOf(item) < 5))
      return true
    },
    async list(documentId: string) { return read().filter((item) => item.documentId === documentId).sort((a, b) => b.savedAt - a.savedAt) },
    async discard(documentId: string) { pending.set(documentId, (pending.get(documentId) ?? 0) + 1); write(read().filter((item) => item.documentId !== documentId)) },
  }
}
