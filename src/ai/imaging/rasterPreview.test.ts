import {expect,it} from 'vitest'
import {RasterPreviewQueue} from './rasterPreview'
import {solidImage} from '../../engine/raster/composite'
it('downsamples previews, reuses only an explicit revision, and releases owned results',async()=>{
 const queue=new RasterPreviewQueue(),request={width:24,height:16,layers:[{image:solidImage(24,16,[8,40,99,255])}]}
 const first=await queue.run(request,{revisionKey:'doc:a:rev1',maxDimension:12,debounceMs:0})
 expect(first.image).toMatchObject({width:12,height:8});expect([...first.image.data.slice(0,4)]).toEqual([8,40,99,255])
 const cached=await queue.run(request,{revisionKey:'doc:a:rev1',maxDimension:12,debounceMs:0});expect(cached.image).toBe(first.image);expect(cached.cacheHit).toBe(true)
 const second=await queue.run(request,{revisionKey:'doc:a:rev2',maxDimension:12,debounceMs:0});expect(second.image).not.toBe(first.image);expect(first.image.data.every(v=>v===0)).toBe(true)
 queue.dispose();expect(second.image.data.every(v=>v===0)).toBe(true);expect(queue.retainedBytes).toBe(0)
})
it('debounces parameter bursts and cancels stale work before publication',async()=>{
 const queue=new RasterPreviewQueue(),request={width:8,height:8,layers:[{image:solidImage(8,8,[8,40,99,255])}]}
 const first=queue.run(request,{revisionKey:'rev1',debounceMs:30});const rejection=expect(first).rejects.toMatchObject({name:'AbortError'})
 const second=queue.run(request,{revisionKey:'rev2',debounceMs:0});await rejection;expect((await second).cacheHit).toBe(false);queue.dispose()
})
