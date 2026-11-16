export type RecoverySnapshot = { documentId: string; projectVersion: number; savedAt: number; payload: string; recoveryVersion?: number; sessionId?: string; name?: string; baseSavedFingerprint?: string; preview?: string }
export type RecoveryToken = { documentId: string; generation: number }
type StoredSnapshot = Omit<RecoverySnapshot, 'payload'> & { id: string; body: string; assetKeys: Record<string, string> }
type Asset = { id: string; source: string }
const DB_NAME = 'draivio-recovery-v2'
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => { value.onsuccess = () => resolve(value.result); value.onerror = () => reject(value.error) })
const completed = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onabort = () => reject(transaction.error ?? new Error('恢复副本写入已取消')); transaction.onerror = () => undefined })
function openDatabase(name: string): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('浏览器不支持恢复存储，请允许 IndexedDB 后重试'))
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1)
    r.onupgradeneeded = () => { r.result.createObjectStore('snapshots', { keyPath: 'id' }); r.result.createObjectStore('assets', { keyPath: 'id' }) }
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
    r.onblocked = () => reject(new Error('恢复存储被其他窗口占用，请关闭其他窗口后重试'))
  })
}
async function assetKey(source: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}
/** All mutations commit snapshots, shared assets and pruning in one IndexedDB transaction. */
export function createRecoveryStore(databaseName = DB_NAME) {
  const generations = new Map<string, number>()
  const transactions = new Map<string, IDBTransaction>()
  const reserve = (documentId: string): RecoveryToken => { try { transactions.get(documentId)?.abort() } catch { /* Already committed. */ } const generation = (generations.get(documentId) ?? 0) + 1; generations.set(documentId, generation); return { documentId, generation } }
  const current = (token: RecoveryToken) => generations.get(token.documentId) === token.generation
  const readStored = async () => { const db = await openDatabase(databaseName); try { return await request(db.transaction('snapshots').objectStore('snapshots').getAll()) as StoredSnapshot[] } finally { db.close() } }
  const hydrate = async (row: StoredSnapshot): Promise<RecoverySnapshot> => {
    const db = await openDatabase(databaseName)
    try {
      const tx = db.transaction('assets'); const assetStore = tx.objectStore('assets')
      const entries = await Promise.all(Object.entries(row.assetKeys).map(async ([id, key]) => { const asset = await request(assetStore.get(key)) as Asset | undefined; if (!asset) throw new Error('恢复副本图片资源缺失'); return [id, asset.source] }))
      const preview = entries.find(([id]) => id === '@preview')?.[1]
      const file = JSON.parse(row.body); file.assets = Object.fromEntries(entries.filter(([id]) => id !== '@preview'))
      const { id: _id, body: _body, assetKeys: _keys, ...metadata } = row
      return { ...metadata, preview: preview ?? Object.values(file.assets as Record<string, string>)[0], payload: JSON.stringify(file) }
    } finally { db.close() }
  }
  return {
    reserve, invalidate: (documentId: string) => { reserve(documentId) },
    async save(snapshot: RecoverySnapshot, token = reserve(snapshot.documentId)) {
      if (token.documentId !== snapshot.documentId || !current(token)) return false
      const file = JSON.parse(snapshot.payload)
      const assets = Object.entries((file.assets ?? {}) as Record<string, string>)
      if (snapshot.preview) assets.push(['@preview', snapshot.preview])
      const records = await Promise.all(assets.map(async ([id, source]) => ({ original: id, id: await assetKey(source), source })))
      if (!current(token)) return false
      const db = await openDatabase(databaseName)
      try {
        if (!current(token)) return false
        const tx = db.transaction(['snapshots', 'assets'], 'readwrite'); const done = completed(tx)
        transactions.set(snapshot.documentId, tx)
        const ss = tx.objectStore('snapshots'), as = tx.objectStore('assets')
        try {
        const all = await request(ss.getAll()) as StoredSnapshot[]
        if (!current(token)) { tx.abort(); await done.catch(() => undefined); return false }
        const { payload: _payload, preview: _preview, ...metadata } = snapshot
        file.assets = {}
        const row: StoredSnapshot = { ...metadata, recoveryVersion: token.generation, id: crypto.randomUUID(), body: JSON.stringify(file), assetKeys: Object.fromEntries(records.map(r => [r.original, r.id])) }
        const own = all.filter(item => item.documentId === snapshot.documentId).sort((a, b) => b.savedAt - a.savedAt)
        const remove = new Set(own.slice(4).map(item => item.id))
        for (const item of records) as.put({ id: item.id, source: item.source })
        ss.put(row)
        for (const id of remove) ss.delete(id)
        const referenced = new Set([...all.filter(item => !remove.has(item.id)), row].flatMap(item => Object.values(item.assetKeys)))
        const assetIds = await request(as.getAllKeys())
        for (const id of assetIds) if (!referenced.has(String(id))) as.delete(id)
        await done
        return true
        } catch (error) { try { tx.abort() } catch { /* Transaction may already be aborted. */ } await done.catch(() => undefined); throw error }
        finally { if (transactions.get(snapshot.documentId) === tx) transactions.delete(snapshot.documentId) }
      } finally { db.close() }
    },
    async list(documentId?: string) {
      const rows = (await readStored()).filter(row => !documentId || row.documentId === documentId).sort((a, b) => b.savedAt - a.savedAt)
      // Hydration errors stay visible as invalid payloads so the caller can fall back to older snapshots.
      return Promise.all(rows.map(async row => { try { return await hydrate(row) } catch { return { ...row, payload: '' } as RecoverySnapshot } }))
    },
    async discard(documentId: string) {
      reserve(documentId)
      const db = await openDatabase(databaseName)
      try {
        const tx = db.transaction(['snapshots', 'assets'], 'readwrite'), done = completed(tx), ss = tx.objectStore('snapshots'), as = tx.objectStore('assets')
        const all = await request(ss.getAll()) as StoredSnapshot[]
        for (const row of all) if (row.documentId === documentId) ss.delete(row.id)
        const referenced = new Set(all.filter(row => row.documentId !== documentId).flatMap(row => Object.values(row.assetKeys)))
        for (const id of await request(as.getAllKeys())) if (!referenced.has(String(id))) as.delete(id)
        await done
      } finally { db.close() }
    },
  }
}
export type RecoveryStore = ReturnType<typeof createRecoveryStore>
