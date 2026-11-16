import { expect, test, vi, afterEach } from 'vitest'
import { ImageBatch } from './imageBatch'
import { ImageRequestError } from './openaiImages'
afterEach(() => vi.useRealTimers())
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((a,b) => { resolve=a; reject=b }); return { promise, resolve, reject } }
const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() }
test('limits concurrent requests, publishes each actual image and cancels unsent work', async () => {
 const calls: ReturnType<typeof deferred<string[]>>[] = []
 const images: string[] = []
 const batch = new ImageBatch(4, 'split', 2, () => { const item=deferred<string[]>(); calls.push(item); return item.promise }, image => images.push(image))
 const done = batch.run()
 expect(calls).toHaveLength(2)
 calls[0].resolve(['one']); await vi.waitFor(() => expect(calls).toHaveLength(3))
 expect(images).toEqual(['one']); expect(calls).toHaveLength(3)
 batch.cancel(); calls[1].resolve(['two']); calls[2].resolve(['three']); await done
 expect(calls).toHaveLength(3)
 expect(batch.getSnapshot().items.map(item => item.status)).toEqual(['succeeded','succeeded','succeeded','cancelled'])
})
test('single request shortfall does not silently trigger extra billable calls; manual retry keeps successes', async () => {
 const request = vi.fn().mockResolvedValueOnce(['one']).mockResolvedValueOnce(['two','three','four'])
 const images: string[] = []
 const batch = new ImageBatch(4, 'single', 2, request, image => images.push(image))
 await batch.run()
 expect(request).toHaveBeenCalledTimes(1)
 expect(batch.getSnapshot().items.filter(item => item.status === 'missing')).toHaveLength(3)
 await batch.retry()
 expect(request.mock.calls.map(args => args[0])).toEqual([4,3])
 expect(images).toEqual(['one','two','three','four'])
})
test('unknown outcomes require explicit retry and never automatically repeat a paid call', async () => {
 const request=vi.fn().mockRejectedValueOnce(new ImageRequestError('结果未知', true)).mockResolvedValueOnce(['one'])
 const batch = new ImageBatch(1, 'split', 2, request, () => {})
 await batch.run(); await batch.retry()
 expect(request).toHaveBeenCalledTimes(1)
 expect(batch.getSnapshot().items[0].status).toBe('unknown')
 await batch.retry(true)
 expect(request).toHaveBeenCalledTimes(2)
})
test('rate limiting reduces concurrency and delays queued tasks without repeating rejected calls', async () => {
 vi.useFakeTimers()
 const first=deferred<string[]>(), second=deferred<string[]>()
 const request=vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise).mockResolvedValue(['later'])
 const batch=new ImageBatch(4,'split',2,request,()=>{})
 const done=batch.run()
 first.reject(new ImageRequestError('限流',false,429,2000)); second.resolve(['two']); await tick()
 expect(request).toHaveBeenCalledTimes(2)
 await vi.advanceTimersByTimeAsync(1999); expect(request).toHaveBeenCalledTimes(2)
 await vi.advanceTimersByTimeAsync(1); await done
 expect(request).toHaveBeenCalledTimes(4)
 expect(batch.getSnapshot().items[0].status).toBe('failed')
})

test('cancelling a rate-limited queue completes immediately without waiting for cooldown', async () => {
 vi.useFakeTimers()
 const batch=new ImageBatch(3,'split',1,async()=>{throw new ImageRequestError('限流',false,429,60000)},()=>{})
 const done=batch.run(); await tick(); await tick()
 batch.cancel()
 await done
 expect(batch.getSnapshot().running).toBe(false)
 expect(batch.getSnapshot().items.filter(item=>item.status==='cancelled')).toHaveLength(2)
})

test('retains valid results while malformed entries remain unknown rather than retryable missing slots', async () => {
 const images: string[]=[]
 const batch=new ImageBatch(2,'single',2,async()=>['one',null],image=>images.push(image))
 await batch.run(); await batch.retry()
 expect(images).toEqual(['one'])
 expect(batch.getSnapshot().items.map(item=>item.status)).toEqual(['succeeded','unknown'])
})
