import { beforeEach, describe, expect, it } from 'vitest'
import { createRecoveryStore, type RecoverySnapshot } from './recoveryStore'

function snapshot(version: number): RecoverySnapshot { return { documentId: 'doc-a', projectVersion: version, savedAt: version, payload: { version } } }

describe('recovery store', () => {
  beforeEach(() => localStorage.clear())
  it('keeps the newest five snapshots per document and isolates documents', async () => {
    const store = createRecoveryStore()
    for (let i = 1; i <= 6; i++) await store.save(snapshot(i))
    await store.save({ ...snapshot(1), documentId: 'doc-b' })
    expect((await store.list('doc-a')).map((item) => item.projectVersion)).toEqual([6, 5, 4, 3, 2])
    expect((await store.list('doc-b')).map((item) => item.projectVersion)).toEqual([1])
  })
  it('ignores an older async save completion after a newer snapshot', async () => {
    const store = createRecoveryStore()
    const slow = store.save(snapshot(1), 20)
    await store.save(snapshot(2))
    await slow
    expect((await store.list('doc-a'))[0].projectVersion).toBe(2)
  })
  it('removes only recovery data when discarded', async () => {
    const store = createRecoveryStore()
    await store.save(snapshot(1)); await store.discard('doc-a')
    expect(await store.list('doc-a')).toEqual([])
  })
})

it('ignores malformed envelopes and keeps valid documents isolated',async()=>{
 let text=JSON.stringify([null,{documentId:'doc-a',projectVersion:'bad',savedAt:2,payload:'{}'},snapshot(1),{...snapshot(2),documentId:'doc-b'}])
 const store=createRecoveryStore({read:()=>text,write:value=>{text=value}})
 expect(await store.list('doc-a')).toEqual([snapshot(1)])
 await store.discard('doc-a')
 expect((await store.list('doc-b')).map(item=>item.projectVersion)).toEqual([2])
})
it('does not let a delayed pre-discard save overwrite a new recovery generation',async()=>{
 const store=createRecoveryStore()
 const old=store.save(snapshot(1),10)
 await store.discard('doc-a')
 await store.save(snapshot(2))
 await old
 expect((await store.list('doc-a')).map(item=>item.projectVersion)).toEqual([2])
})
