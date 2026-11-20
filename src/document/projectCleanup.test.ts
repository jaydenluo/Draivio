import {describe,it,expect,vi} from 'vitest'
import {ProjectCleanupQueue} from './projectCleanup'
describe('project cleanup survives owners and mounts',()=>{
 it('retries a transient disposal before releasing any durable roots',async()=>{
  const events:string[]=[],dispose=vi.fn(async()=>{events.push('dispose');if(events.length===1)throw new Error('transport')})
  const queue=new ProjectCleanupQueue()
  await queue.release('owner',{dispose,releaseRoots:async()=>{events.push('roots')}})
  expect(events).toEqual(['dispose','dispose','roots']);expect(queue.size).toBe(0)
 })
 it('retains roots after repeated failure and retries the same cleanup on the next open',async()=>{
  const dispose=vi.fn().mockRejectedValue(new Error('offline')),roots=vi.fn(async()=>{})
  const queue=new ProjectCleanupQueue()
  await expect(queue.release('owner',{dispose,releaseRoots:roots})).rejects.toThrow('offline')
  expect(roots).not.toHaveBeenCalled();expect(queue.size).toBe(1)
  dispose.mockResolvedValue(undefined);await queue.retry()
  expect(roots).toHaveBeenCalledOnce();expect(queue.size).toBe(0)
 })
 it('does not dispose confirmed leases again when root cleanup must retry',async()=>{
  const dispose=vi.fn(async()=>{}),releaseRoots=vi.fn().mockRejectedValue(new Error('root offline'))
  const queue=new ProjectCleanupQueue();await expect(queue.release('owner',{dispose,releaseRoots})).rejects.toThrow()
  releaseRoots.mockResolvedValue(undefined);await queue.retry();expect(dispose).toHaveBeenCalledOnce()
 })
})
