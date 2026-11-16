import { it, expect } from 'vitest'
import { saveUniqueBrowserOutput, imageHeaderSize } from './batchIO'
it('never truncates an existing browser output and returns the actual collision-safe name',async()=>{
 const files=new Map<string,Blob>([['x.png',new Blob(['source'])]]);const writes:string[]=[]
 const dir={name:'out',getFileHandle:async(name:string,options?:{create?:boolean})=>{if(!options?.create&&!files.has(name))throw new DOMException('missing','NotFoundError');return {createWritable:async()=>({write:async(data:Blob)=>{files.set(name,data);writes.push(name)},close:async()=>{},abort:async()=>{}})}}}
 expect(await saveUniqueBrowserOutput(dir,'x.png',new Blob(['new']))).toBe('out/x-2.png');expect(writes).toEqual(['x-2.png']);expect(files.get('x.png')?.size).toBe(6)
})
it('reads fixed PNG dimensions and rejects compressed image bombs before decode',()=>{
 const png=new Uint8Array(24);png.set([137,80,78,71,13,10,26,10]);const view=new DataView(png.buffer);view.setUint32(16,400);view.setUint32(20,200)
 expect(imageHeaderSize(png)).toEqual({width:400,height:200});view.setUint32(16,100000);expect(()=>imageHeaderSize(png)).toThrow('8MP')
 expect(()=>imageHeaderSize(new Uint8Array([1,2,3]))).toThrow()
})
