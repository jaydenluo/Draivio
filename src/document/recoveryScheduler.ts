import type { RecoveryStore, RecoverySnapshot } from './recoveryStore'
type Job = { documentId: string; sessionId: string; fingerprint: string; encode: () => Promise<RecoverySnapshot> }
/** One encoder at a time; continuous typing replaces only the pending job, never starves an active snapshot. */
export function createRecoveryScheduler(store: RecoveryStore, onStatus: (status: 'saving' | 'saved' | 'error', error?: string) => void, debounce = 900, maxWait = 15000) {
  let pending: Job | undefined, active: Job | undefined, lastSaved = '', identity = '', enabled = true
  let timer: ReturnType<typeof setTimeout> | undefined, periodic: ReturnType<typeof setTimeout> | undefined
  const clear = () => { clearTimeout(timer); clearTimeout(periodic); timer = periodic = undefined }
  const invalidateActive = () => { if (active) store.invalidate(active.documentId); active = undefined }
  const flush = async () => {
    if (active) return
    clear()
    const job = pending
    if (!enabled || !job) return
    pending = undefined; active = job
    const token = store.reserve(job.documentId)
    onStatus('saving')
    try {
      const snapshot = await job.encode()
      if (!enabled || active !== job) return
      if (await store.save(snapshot, token) && active === job) {
        lastSaved = job.fingerprint; active = undefined
        if (pending) {
          // Timers may already have fired while encoding was in progress. Reset both
          // handles so subsequent typing cannot postpone the next checkpoint forever.
          clear(); timer = setTimeout(() => void flush(), debounce); periodic = setTimeout(() => void flush(), maxWait)
        }
        else onStatus('saved')
      }
    } catch (error) {
      if (enabled && active === job) { active = undefined; pending ??= job; clear(); onStatus('error', error instanceof Error ? error.message : '恢复副本保存失败') }
    }
  }
  return {
    update(job: Job) {
      if (!enabled) return
      const nextIdentity = `${job.documentId}\0${job.sessionId}`
      if (identity !== nextIdentity) { invalidateActive(); if (pending) store.invalidate(pending.documentId); pending = undefined; clear(); lastSaved = ''; identity = nextIdentity }
      if (job.fingerprint === lastSaved) { invalidateActive(); pending = undefined; clear(); return }
      if (job.fingerprint === active?.fingerprint) { pending = undefined; clear(); return }
      if (job.fingerprint === pending?.fingerprint) return
      pending = job; clearTimeout(timer); timer = setTimeout(() => void flush(), debounce)
      if (!periodic) periodic = setTimeout(() => void flush(), maxWait)
    },
    retry: () => void flush(),
    setEnabled(value: boolean) { enabled = value; if (!value) { clear(); invalidateActive(); if (pending) store.invalidate(pending.documentId); pending = undefined; lastSaved = '' } },
    invalidate(documentId: string) { store.invalidate(documentId); if (pending?.documentId === documentId) { pending = undefined; clear() } if (active?.documentId === documentId) active = undefined; lastSaved = '' },
    dispose() { enabled = false; clear(); invalidateActive(); if (pending) store.invalidate(pending.documentId); pending = undefined },
  }
}
