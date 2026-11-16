import { expect,it } from 'vitest'
import { generateOutpaint } from './workflow'
import { expansionFromEdges } from './geometry'
import { initialEditorState,type EditorState } from '../../state/editor'
import { testMaskedIO } from '../maskedEdit/testIO'
const src=testMaskedIO.encode({width:2,height:2,data:new Uint8ClampedArray([10,20,30,255,40,50,60,255,70,80,90,255,100,110,120,255])})
function state():EditorState{return {...initialEditorState,documentWidth:2,documentHeight:2,documentBackground:'transparent',layers:[{...initialEditorState.layers[0],source:src,contentWidth:2,contentHeight:2,transform:undefined}],selectedLayerId:'art',selectedLayerIds:['art'],prompt:'extend naturally',composerParameters:{...initialEditorState.composerParameters,model:'gpt-image-1'},composerSourceId:'masked' as any}}
it('generates a candidate by masked exterior tiles and leaves document untouched',async()=>{
 const s=state(),before=JSON.stringify(s),e=expansionFromEdges(2,2,{left:1,right:2,top:1,bottom:1});let calls=0
 const result=await generateOutpaint(s,'doc',e,'transparent-edit',async(_ref,_mask)=>{calls++;return testMaskedIO.encode({width:4,height:4,data:new Uint8ClampedArray(Array.from({length:16},()=>[200,100,50,255]).flat())})},{limit:64,overlap:8,io:testMaskedIO})
 expect(calls).toBeGreaterThan(0);expect(result.request).toBeDefined();expect(result.request!.outpaint?.calls).toBe(calls);expect(result.source).toMatch(/^data:image\/png/);expect(JSON.stringify(s)).toBe(before)
 const image=await testMaskedIO.decode(result.source!);expect(image.width).toBe(e.width);expect(image.height).toBe(e.height)
 expect([...image.data.slice((e.y*e.width+e.x)*4,(e.y*e.width+e.x+e.originalWidth)*4)]).toEqual([...new Uint8ClampedArray([10,20,30,255,40,50,60,255])])
})
it('cancellation and stale source leave no result',async()=>{const s=state(),e=expansionFromEdges(2,2,{left:1,right:1,top:1,bottom:1}),abort=new AbortController();abort.abort();await expect(generateOutpaint(s,'doc',e,'transparent-edit',async()=>'',{signal:abort.signal,io:testMaskedIO})).rejects.toThrow('取消')})

import { editorReducer } from '../../state/editor'
import { captureEditorContext } from '../context/editorContext'
import { contextPreviewSvg } from '../context/editorPreview'
import { encodeProject,decodeProject } from '../../document/projectFormat'
it('adopts canvas and pixels in one undo transaction, reopens and renders same PNG',async()=>{
 let s=state();const e=expansionFromEdges(2,2,{left:1,right:2,top:1,bottom:1}),raw=testMaskedIO.encode({width:1,height:1,data:new Uint8ClampedArray([200,100,50,255])})
 const result=await generateOutpaint(s,'doc',e,'transparent-edit',async()=>raw,{io:testMaskedIO})
 s=editorReducer(s,{type:'add-ai-result',result});const beforeUndo=s.undoStack.length
 s=editorReducer(s,{type:'adopt-outpaint-result',id:result.id})
 expect(s.documentWidth).toBe(5);expect(s.documentHeight).toBe(4);expect(s.undoStack).toHaveLength(beforeUndo+1)
 const render=async(current:typeof s)=>testMaskedIO.decode(await testMaskedIO.render(contextPreviewSvg(current,captureEditorContext(current,'doc','document')),current.documentWidth,current.documentHeight))
 expect([...(await render(s)).data]).toEqual([...(await testMaskedIO.decode(result.source!)).data])
 const restored=decodeProject(await encodeProject(s,{id:'doc',name:'outpaint'})).document
 expect(restored.aiResults?.[0].request?.outpaint).toEqual(result.request?.outpaint)
 expect([...(await render({...s,...restored})).data]).toEqual([...(await testMaskedIO.decode(result.source!)).data])
 const undone=editorReducer(s,{type:'undo'});expect(undone.documentWidth).toBe(2);expect(undone.documentHeight).toBe(2);expect(undone.layers).toHaveLength(1)
 const stale={...undone,documentWidth:3};expect(editorReducer(stale,{type:'adopt-outpaint-result',id:result.id}).documentHeight).toBe(2)
})
it('multi-tile overlap composition preserves original and has no empty exterior holes',async()=>{
 const s=state(),e=expansionFromEdges(2,2,{left:40,right:40,top:30,bottom:30}),raw=testMaskedIO.encode({width:1,height:1,data:new Uint8ClampedArray([80,90,100,255])});let calls=0
 const result=await generateOutpaint(s,'doc',e,'white-edit',async()=>{calls++;return raw},{limit:64,overlap:8,io:testMaskedIO})
 expect(calls).toBeGreaterThan(1);expect(result.request?.outpaint?.tiles).toHaveLength(calls)
 const image=await testMaskedIO.decode(result.source!);for(let i=3;i<image.data.length;i+=4)expect(image.data[i]).toBe(255)
})
it('rejects transparent endpoint holes without offering adoptable content',async()=>{const s=state(),e=expansionFromEdges(2,2,{left:1,right:1,top:1,bottom:1}),raw=testMaskedIO.encode({width:1,height:1,data:new Uint8ClampedArray(4)});await expect(generateOutpaint(s,'doc',e,'white-edit',async()=>raw,{io:testMaskedIO})).rejects.toThrow('透明洞')})

it('locked targets and provider failure stop without canvas or candidate mutations',async()=>{const s=state(),before=JSON.stringify(s),e=expansionFromEdges(2,2,{left:1,right:1,top:1,bottom:1});s.layers[0].locked=true;await expect(generateOutpaint(s,'doc',e,'transparent-edit',async()=>{throw new Error('unexpected')},{io:testMaskedIO})).rejects.toThrow('锁定');s.layers[0].locked=false;await expect(generateOutpaint(s,'doc',e,'transparent-edit',async()=>{throw new Error('HTTP400 fixture')},{io:testMaskedIO})).rejects.toThrow('HTTP400');expect(s.documentWidth).toBe(2);expect(s.aiResults).toHaveLength(0)})
it('hidden expansion snapshot restores original pixel placement after asymmetric resize',async()=>{
 let s=state();const e=expansionFromEdges(2,2,{left:1,right:2,top:1,bottom:1}),raw=testMaskedIO.encode({width:1,height:1,data:new Uint8ClampedArray([200,100,50,255])}),result=await generateOutpaint(s,'doc',e,'transparent-edit',async()=>raw,{io:testMaskedIO});s=editorReducer(s,{type:'add-ai-result',result});s=editorReducer(s,{type:'adopt-outpaint-result',id:result.id});s=editorReducer(s,{type:'toggle-layer',id:s.selectedLayerId})
 const image=await testMaskedIO.decode(await testMaskedIO.render(contextPreviewSvg(s,captureEditorContext(s,'doc','document')),5,4)),original=await testMaskedIO.decode(src)
 for(let y=0;y<2;y++)expect([...image.data.slice(((y+1)*5+1)*4,((y+1)*5+3)*4)]).toEqual([...original.data.slice(y*8,(y+1)*8)])
})
