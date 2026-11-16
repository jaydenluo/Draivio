import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRecoveryScheduler } from './recoveryScheduler'
import type { RecoveryStore } from './recoveryStore'
beforeEach(() => vi.useFakeTimers()); afterEach(() => vi.useRealTimers())
function setup() {
 const store = { reserve: vi.fn(() => ({ documentId: 'a', generation: 1 })), invalidate: vi.fn(), save: vi.fn(async () => true) } as unknown as RecoveryStore
 const status = vi.fn(), scheduler = createRecoveryScheduler(store, status)
 const job = (fingerprint: string, sessionId = 's') => ({ documentId: 'a', sessionId, fingerprint, encode: vi.fn(async () => ({ documentId: 'a', projectVersion: 1, savedAt: 1, payload: '{}' })) })
 return { store, status, scheduler, job }
}
it('debounces document edits and same fingerprint navigation does not cancel them', async () => {
 const { store, scheduler, job } = setup(); scheduler.update(job('1')); await vi.advanceTimersByTimeAsync(500); scheduler.update(job('1')); await vi.advanceTimersByTimeAsync(400)
 expect(store.save).toHaveBeenCalledOnce(); scheduler.dispose()
})
it('periodically captures latest continuous typing even before debounce settles', async () => {
 const { store, scheduler, job } = setup()
 for (let i = 0; i < 30; i++) { scheduler.update(job(String(i))); await vi.advanceTimersByTimeAsync(500) }
 expect(store.save).toHaveBeenCalledOnce(); expect(store.reserve).toHaveBeenCalledOnce(); scheduler.dispose()
})
it('drops delayed encoding from a previous session or after disable/discard', async () => {
 const { store, scheduler, job } = setup(); let finish!: (x: Awaited<ReturnType<ReturnType<typeof job>['encode']>>) => void
 const slow = { ...job('old'), encode: vi.fn(() => new Promise<Awaited<ReturnType<ReturnType<typeof job>['encode']>>>(r => { finish = r })) }
 scheduler.update(slow); await vi.advanceTimersByTimeAsync(900); expect(store.reserve).toHaveBeenCalledOnce()
 scheduler.update(job('new', 'new-session')); finish({ documentId: 'a', projectVersion: 1, savedAt: 1, payload: '{}' }); await Promise.resolve(); expect(store.save).not.toHaveBeenCalled()
 scheduler.setEnabled(false); await vi.advanceTimersByTimeAsync(15000); expect(store.save).not.toHaveBeenCalled(); scheduler.dispose()
})
it('shows a concrete error, keeps pending snapshot and retries', async () => {
 const { store, status, scheduler, job } = setup(); vi.mocked(store.save).mockRejectedValueOnce(new Error('磁盘已满'))
 scheduler.update(job('1')); await vi.advanceTimersByTimeAsync(900); expect(status).toHaveBeenLastCalledWith('error', '磁盘已满')
 scheduler.retry(); await vi.advanceTimersByTimeAsync(0); expect(store.save).toHaveBeenCalledTimes(2); expect(status).toHaveBeenLastCalledWith('saved'); scheduler.dispose()
})
it('cancels a pending newer snapshot when undo returns to the already saved state', async () => {
 const { store, scheduler, job } = setup(); scheduler.update(job('A')); await vi.advanceTimersByTimeAsync(900); expect(store.save).toHaveBeenCalledOnce()
 scheduler.update(job('B')); await vi.advanceTimersByTimeAsync(200); scheduler.update(job('A')); await vi.advanceTimersByTimeAsync(15000)
 expect(store.save).toHaveBeenCalledOnce(); scheduler.dispose()
})
it('does not starve a slow active encoder while continuous edits replace pending state', async () => {
 const { store, status, scheduler, job } = setup(); let finish!: (x: Awaited<ReturnType<ReturnType<typeof job>['encode']>>) => void
 scheduler.update({ ...job('slow'), encode: vi.fn(() => new Promise<Awaited<ReturnType<ReturnType<typeof job>['encode']>>>(r => { finish = r })) })
 await vi.advanceTimersByTimeAsync(900)
 for (let i = 0; i < 40; i++) { scheduler.update(job(String(i))); await vi.advanceTimersByTimeAsync(500) }
 expect(store.save).not.toHaveBeenCalled(); finish({ documentId: 'a', projectVersion: 1, savedAt: 1, payload: '{}' }); await vi.advanceTimersByTimeAsync(0)
 expect(store.save).toHaveBeenCalledOnce(); expect(status).not.toHaveBeenLastCalledWith('saved')
 await vi.advanceTimersByTimeAsync(900); expect(store.save).toHaveBeenCalledTimes(2); expect(status).toHaveBeenLastCalledWith('saved'); scheduler.dispose()
})
it('does not save an in-flight abandoned edit when undo returns to the last saved version', async () => {
 const { store, scheduler, job } = setup(); scheduler.update(job('A')); await vi.advanceTimersByTimeAsync(900)
 let finish!: (x: Awaited<ReturnType<ReturnType<typeof job>['encode']>>) => void
 scheduler.update({ ...job('B'), encode: vi.fn(() => new Promise<Awaited<ReturnType<ReturnType<typeof job>['encode']>>>(r => { finish = r })) }); await vi.advanceTimersByTimeAsync(900)
 scheduler.update(job('A')); finish({ documentId: 'a', projectVersion: 2, savedAt: 2, payload: '{}' }); await vi.advanceTimersByTimeAsync(15000)
 expect(store.save).toHaveBeenCalledOnce(); scheduler.dispose()
})
it('rearms maxWait after both timers expire while a slow encode is active', async () => {
 const { store, scheduler, job } = setup(); let finish!: (x: Awaited<ReturnType<ReturnType<typeof job>['encode']>>) => void
 scheduler.update({ ...job('slow'), encode: vi.fn(() => new Promise<Awaited<ReturnType<ReturnType<typeof job>['encode']>>>(resolve => { finish = resolve })) })
 await vi.advanceTimersByTimeAsync(900)
 for (let i = 0; i < 40; i++) { scheduler.update(job(`before-${i}`)); await vi.advanceTimersByTimeAsync(500) }
 // Both maxWait and the last debounce fired during the in-flight encode.
 await vi.advanceTimersByTimeAsync(1000)
 finish({ documentId: 'a', projectVersion: 1, savedAt: 1, payload: '{}' }); await vi.advanceTimersByTimeAsync(0)
 expect(store.save).toHaveBeenCalledOnce()
 // More continuous typing must be checkpointed even though no debounce can settle.
 for (let i = 0; i < 80; i++) { scheduler.update(job(`after-${i}`)); await vi.advanceTimersByTimeAsync(500) }
 expect(vi.mocked(store.save).mock.calls.length).toBeGreaterThanOrEqual(3)
 scheduler.dispose()
})
