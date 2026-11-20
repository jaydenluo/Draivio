import {IDBFactory} from 'fake-indexeddb'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import type {AIResult} from '../state/editor'
import {resultArchive} from './resultArchive'
import {createResultDocument} from './resultDocument'
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
const result:AIResult={id:'generated-one',source:png,thumbnail:png,prompt:'海报',model:'image',provider:'proxy',size:'1024 × 1024',createdAt:'2026-11-19T00:00:00Z',favorite:false,adopted:false,status:'success'}
beforeEach(()=>vi.stubGlobal('indexedDB',new IDBFactory()))
afterEach(()=>vi.unstubAllGlobals())
it('persists original bytes independently of a project and lists metadata without private request context',async()=>{
 await resultArchive.save({...result,request:{privateSecret:'never-persist'} as any},'doc')
 const listed=await resultArchive.list();expect(listed).toHaveLength(1)
 expect(listed[0]).toMatchObject({id:result.id,documentId:'doc',prompt:'海报'})
 expect(listed[0]).not.toHaveProperty('source');expect(listed[0]).not.toHaveProperty('request')
 expect(JSON.stringify(listed)).not.toContain('never-persist')
 expect(await resultArchive.load(result.id)).toBe(png)
 await resultArchive.remove(result.id);expect(await resultArchive.list()).toEqual([])
 await expect(resultArchive.load(result.id)).rejects.toThrow('本地图片不存在')
})
it('rejects remote links instead of pretending they were saved locally',async()=>{
 await expect(resultArchive.save({...result,source:'https://supplier.test/temp.png'},'doc')).rejects.toThrow('本地图片')
 expect(await resultArchive.list()).toEqual([])
})
it('uses actual dimensions instead of the requested output size when opening a new document',()=>{
 const document=createResultDocument(result)
 expect(document.state.documentWidth).toBe(1);expect(document.state.documentHeight).toBe(1)
 expect(document.state.layers).toHaveLength(1);expect(document.state.layers[0].source).toBe(png)
 expect(document.state.undoStack).toEqual([])
})

it('exports original image bytes instead of a scaled canvas preview',async()=>{
 const create=vi.fn().mockReturnValue('blob:result'),revoke=vi.fn()
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}))
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 try{expect(await resultArchive.export(result)).toBe(true);expect(click).toHaveBeenCalledOnce();const blob=create.mock.calls[0][0] as Blob;expect(blob.type).toBe('image/png');expect(blob.size).toBe(atob(png.split(',')[1]).length)}finally{click.mockRestore()}
})

it('does not store corrupt bytes or mislabeled image content as a local original',async()=>{
 await expect(resultArchive.save({...result,source:'data:image/png;base64,aGVsbG8='},'doc')).rejects.toThrow('格式与内容不一致')
 await expect(resultArchive.save({...result,source:png.replace('image/png','image/jpeg')},'doc')).rejects.toThrow('格式与内容不一致')
 expect(await resultArchive.list()).toEqual([])
})
it('keeps original ownership and global adoption across document copies while explicit favorite changes win',async()=>{
 await resultArchive.save(result,'original-doc')
 await resultArchive.save({...result,adopted:true},'new-doc')
 await resultArchive.save({...result,favorite:true},'original-doc',true)
 await resultArchive.save({...result,adopted:true},'new-doc')
 expect((await resultArchive.list())[0]).toMatchObject({documentId:'original-doc',adopted:true,favorite:true})
 await resultArchive.save(result,'original-doc',false)
 expect((await resultArchive.list())[0]).toMatchObject({documentId:'original-doc',adopted:true,favorite:false})
})

it('archives parameter provenance independently of private requests and preserves actual dimensions',async()=>{
 const p={model:'image',ratio:'1:1',size:'1024 × 1024',count:'1 张',strength:'强度 48%'}
 await resultArchive.save({...result,generationMetadata:{defaults:p,resolved:{...p,count:'2 张'},overrides:{count:2},sent:{size:'1024x1024'},operation:'generate',apiKey:'never-persist'} as any},'doc')
 const saved=(await resultArchive.list())[0]
 expect(saved.size).toBe('1 × 1');expect(saved.generationMetadata).toMatchObject({defaults:p,resolved:{count:'2 张'},overrides:{count:2},sent:{size:'1024x1024'}})
 expect(JSON.stringify(saved)).not.toContain('never-persist')
})

it('keeps the explanation for a returned original when local edit compositing failed',async()=>{
 await resultArchive.save({...result,error:'局部修改未合成，当前预览为模型返回的完整原图。'},'doc')
 expect((await resultArchive.list())[0].error).toBe('局部修改未合成，当前预览为模型返回的完整原图。')
})
