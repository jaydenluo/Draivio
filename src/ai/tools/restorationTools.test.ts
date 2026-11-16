import { expect,it,vi,afterEach } from 'vitest'
import { generateRestoration,requestRestorationTile,restorationWarning } from './restorationTools'
import { initialEditorState,editorReducer } from '../../state/editor'
import { testMaskedIO } from '../maskedEdit/testIO'
import { upscalePixels } from '../../imaging/enhancement'
import { encodeProject,decodeProject } from '../../document/projectFormat'
const source=testMaskedIO.encode({width:2,height:1,data:new Uint8ClampedArray([30,50,70,255,200,100,20,128])})
const state=()=>({...initialEditorState,layers:[{...initialEditorState.layers[0],source,contentWidth:2,contentHeight:1}],documentWidth:2,documentHeight:1})
afterEach(()=>vi.unstubAllGlobals())
it('creates an independent candidate with original source and stale-result protection',async()=>{
 const s=state(),before=JSON.stringify(s),result=await generateRestoration(s,'doc',{scale:4,mode:'size',backend:'contract-fixture'},async tile=>upscalePixels(tile,4),{io:testMaskedIO})
 expect(JSON.stringify(s)).toBe(before);expect(result.adopted).toBe(false);expect(result.request?.reference?.source).toBe(source)
 expect(await testMaskedIO.decode(result.source!)).toMatchObject({width:8,height:4})
 const candidate=editorReducer(s,{type:'add-ai-result',result});expect(candidate.layers).toEqual(s.layers)
 const persisted=decodeProject(await encodeProject(candidate,{id:'doc',name:'restoration'})).document
 expect(persisted.aiResults?.[0].request?.reference?.source).toBe(source)
 const adopted=editorReducer(candidate,{type:'adopt-ai-result-as-layer',id:result.id});expect(adopted.layers).toHaveLength(2);expect(adopted.layers[0]).toMatchObject({contentWidth:8,contentHeight:4});expect(editorReducer({...candidate,documentWidth:3},{type:'adopt-ai-result-as-layer',id:result.id}).layers).toHaveLength(1);expect(editorReducer(candidate,{type:'replace-layer-with-ai-result',targetId:'art',resultId:result.id}).layers).toEqual(s.layers);expect(editorReducer(adopted,{type:'undo'}).layers).toEqual(s.layers)
 expect(editorReducer({...s,documentWidth:3},{type:'add-ai-result',result}).aiResults).toHaveLength(0)
})
it('rejects missing backend, locks, and mode/scale mismatch without mutation',async()=>{
 const infer=vi.fn(async tile=>tile),s=state();await expect(generateRestoration(s,'doc',{scale:2,mode:'size',backend:''},infer,{io:testMaskedIO})).rejects.toThrow('后端')
 await expect(generateRestoration({...s,layers:[{...s.layers[0],locked:true}]},'doc',{scale:2,mode:'size',backend:'x'},infer,{io:testMaskedIO})).rejects.toThrow('锁定');expect(infer).not.toHaveBeenCalled()
 expect(restorationWarning('detail')).toMatch(/文字.*人脸.*不代表还原真实信息/)
})
it('sends real HTTP inference contract through shared request and validates response',async()=>{
 const fetch=vi.fn(async(_url:unknown,_options:any)=>new Response(JSON.stringify({width:2,height:2,data:Array(16).fill(255)}),{status:200}));vi.stubGlobal('fetch',fetch)
 const tile={width:1,height:1,data:new Uint8ClampedArray([1,2,3,255])}
 expect(await requestRestorationTile({endpoint:'http://localhost:8001/restore',model:'real-model',mode:'detail',scale:2,image:tile})).toMatchObject({width:2,height:2})
 expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({protocol:'draivio-restoration-v1',model:'real-model',scale:2,mode:'detail'})
 vi.stubGlobal('fetch',async()=>new Response(JSON.stringify({width:2,height:2,data:[0]}),{status:200}))
 await expect(requestRestorationTile({endpoint:'http://localhost:8001/restore',model:'x',mode:'size',scale:2,image:tile})).rejects.toThrow('像素')
})
it('surfaces backend memory errors without creating a candidate',async()=>{
 vi.stubGlobal('fetch',async()=>new Response('{}',{status:507}))
 await expect(requestRestorationTile({endpoint:'http://localhost:8001/restore',model:'x',mode:'size',scale:2,image:{width:1,height:1,data:new Uint8ClampedArray([1,2,3,255])}})).rejects.toThrow('显存或内存不足')
})
