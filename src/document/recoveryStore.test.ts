import 'fake-indexeddb/auto'
import { webcrypto } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRecoveryStore, type RecoverySnapshot } from './recoveryStore'
const payload = (version: number, image = 'data:image/png;base64,pixels') => JSON.stringify({ assets: { 'image-1': image }, document: { version } })
function snapshot(version: number): RecoverySnapshot { return { documentId: 'doc-a', projectVersion: version, savedAt: version, payload: payload(version) } }
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
describe('IndexedDB recovery store', () => {
  it('keeps five snapshots per document, shares image resources and survives a new store instance', async () => {
    const name = crypto.randomUUID(), store = createRecoveryStore(name)
    for (let i = 1; i <= 6; i++) await store.save(snapshot(i))
    await store.save({ ...snapshot(1), documentId: 'doc-b' })
    const second = createRecoveryStore(name)
    expect((await second.list('doc-a')).map(item => item.projectVersion)).toEqual([6, 5, 4, 3, 2])
    expect((await second.list('doc-b'))).toHaveLength(1)
    expect(JSON.parse((await second.list('doc-a'))[0].payload).assets).toEqual({ 'image-1': 'data:image/png;base64,pixels' })
    const db = await new Promise<IDBDatabase>(resolve => { const r = indexedDB.open(name); r.onsuccess = () => resolve(r.result) })
    const assets = await new Promise<number>(resolve => { const r = db.transaction('assets').objectStore('assets').count(); r.onsuccess = () => resolve(r.result) }); db.close()
    expect(assets).toBe(1)
    expect(localStorage.getItem('draivio-recovery-snapshots')).toBeNull()
  })
  it('allocates tokens before encoding and rejects stale encoding after newer requests or discard', async () => {
    const store = createRecoveryStore(crypto.randomUUID()), older = store.reserve('doc-a'), newer = store.reserve('doc-a')
    expect(await store.save(snapshot(2), newer)).toBe(true)
    expect(await store.save(snapshot(1), older)).toBe(false)
    const discarded = store.reserve('doc-a'); await store.discard('doc-a')
    expect(await store.save(snapshot(3), discarded)).toBe(false)
    expect(await store.list('doc-a')).toEqual([])
  })
  it('discards one document without deleting shared resources still referenced by another', async () => {
    const store = createRecoveryStore(crypto.randomUUID())
    await store.save(snapshot(1)); await store.save({ ...snapshot(1), documentId: 'doc-b' }); await store.discard('doc-a')
    expect(await store.list('doc-a')).toEqual([])
    expect(JSON.parse((await store.list('doc-b'))[0].payload).assets['image-1']).toContain('pixels')
  })
  it('preserves previous snapshots when encoding or quota writes fail', async () => {
    const store = createRecoveryStore(crypto.randomUUID()); await store.save(snapshot(1))
    const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(() => { throw new DOMException('磁盘已满', 'QuotaExceededError') })
    await expect(store.save(snapshot(2))).rejects.toThrow('磁盘已满'); put.mockRestore()
    expect((await store.list('doc-a')).map(item => item.projectVersion)).toEqual([1])
  })
})
it('aborts all writes when a failure happens after an asset write but before snapshot commit', async () => {
 const store = createRecoveryStore(crypto.randomUUID()); await store.save(snapshot(1))
 const original = IDBObjectStore.prototype.put; let calls = 0
 const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, ...args: Parameters<IDBObjectStore['put']>) { if (++calls === 2) throw new DOMException('拒绝写入快照', 'QuotaExceededError'); return original.apply(this, args) })
 await expect(store.save({ ...snapshot(2), payload: payload(2, 'different-resource') })).rejects.toThrow('拒绝写入快照'); put.mockRestore()
 expect((await store.list('doc-a')).map(item => item.projectVersion)).toEqual([1])
})
