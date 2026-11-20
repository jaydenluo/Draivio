import {expect,it,vi} from 'vitest'
import {releaseImportAsset} from './imageImportCleanup'
import type {ImageAssetClient} from './imageAssetClient'
import type {ImageAsset} from './imageAssetTypes'
it('retries uncertain disposal and only releases the transaction after confirmation',async()=>{
 const events:string[]=[]
 const dispose=vi.fn(async()=>{events.push('dispose');if(events.length===1)throw new Error('response lost')})
 const replace=vi.fn(async()=>{events.push('root')})
 const asset={assetId:'a'} as ImageAsset; const client={dispose} as unknown as ImageAssetClient
 await releaseImportAsset(client,asset,{replace})
 expect(events).toEqual(['dispose','dispose','root'])
 await releaseImportAsset(client,asset,{replace})
 expect(events).toEqual(['dispose','dispose','root'])
})
it('retains cleanup after all transport attempts fail, for a later retry',async()=>{
 const asset={assetId:'b'} as ImageAsset
 const dispose=vi.fn(async():Promise<void>=>{throw new Error('offline')})
 const replace=vi.fn(async()=>{})
 const client={dispose} as unknown as ImageAssetClient
 await expect(releaseImportAsset(client,asset,{replace})).rejects.toThrow('offline')
 expect(replace).not.toHaveBeenCalled()
 dispose.mockImplementation(async()=>{})
 await releaseImportAsset(client,asset,{replace})
 expect(replace).toHaveBeenCalledTimes(1)
})
