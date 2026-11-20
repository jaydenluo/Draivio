import {expect,it,vi} from 'vitest'
import {imageMime,nativeEditingError,readNativeOriginal} from './imageImportSource'
import type {ImageAssetResource,ImageAssetMetadata} from './imageAssetTypes'
const metadata:ImageAssetMetadata={width:400,height:200,bands:3,sampleType:'u8',orientation:6,pages:1,format:'jpeg',editingSupported:true,profileHash:null}
const resource:ImageAssetResource={resourceId:'r',session:'s',assetId:'a',revision:1,role:'original',mime:'image/jpeg',bytes:300000,width:400,height:200,coordinateSpace:'source',resourceUrl:'native://opaque',displayTransformHash:null}
it('reads only bounded original ranges and preserves encoded bytes',async()=>{
 const source=Uint8Array.from({length:resource.bytes},(_,i)=>i%256)
 const fetcher=vi.fn(async(_url:string,init:RequestInit)=>{const [start,end]=(init.headers as {Range:string}).Range.slice(6).split('-').map(Number);return new Response(source.slice(start,end+1),{status:206,headers:{'Content-Range':`bytes ${start}-${end}/${source.length}`}})})
 vi.stubGlobal('fetch',fetcher)
 expect(await readNativeOriginal(resource,new AbortController().signal)).toEqual(source)
 expect(fetcher).toHaveBeenCalledTimes(2)
})
it('rejects an unbounded full response before consuming its body',async()=>{
 const response=new Response(new Uint8Array(3),{status:200});const cancel=vi.spyOn(response.body!,'cancel')
 vi.stubGlobal('fetch',vi.fn(async()=>response))
 await expect(readNativeOriginal(resource,new AbortController().signal)).rejects.toThrow('响应无效')
 expect(cancel).toHaveBeenCalled()
})
it('cancels between chunks without requesting the next block',async()=>{
 const controller=new AbortController()
 const fetcher=vi.fn(async()=>{controller.abort();return new Response(new Uint8Array(256*1024),{status:206,headers:{'Content-Range':`bytes 0-262143/${resource.bytes}`}})})
 vi.stubGlobal('fetch',fetcher)
 await expect(readNativeOriginal(resource,controller.signal)).rejects.toThrow()
 expect(fetcher).toHaveBeenCalledTimes(1)
})
it('uses oriented source bounds and gates unsupported precision and bands',()=>{
 expect(nativeEditingError(metadata)).toBeNull()
 expect(nativeEditingError({...metadata,bands:5})).toBeTruthy()
 expect(nativeEditingError({...metadata,width:20000})).toBeTruthy()
 expect(nativeEditingError({...metadata,sampleType:'u16'})).toBeTruthy()
})
it('sniffs supported container bytes rather than MIME',()=>{
 expect(imageMime(new Uint8Array([255,216,255,224]))).toBe('image/jpeg')
 expect(()=>imageMime(new TextEncoder().encode('fake png'))).toThrow()
})
