import {expect,it} from 'vitest'
import {createCanvas} from 'batch-test-canvas'
import {mkdirSync,writeFileSync} from 'node:fs'
import {RasterPreviewQueue} from './rasterPreview'
import {solidImage} from '../../engine/raster/composite'
import {editorReducer,initialEditorState,type AIResult} from '../../state/editor'
it('releases owned pixel results across twenty real PNG result adoption and undo cycles',async()=>{
 let state=structuredClone(initialEditorState),peakPixelBytes=0,peakRss=0
 const baseLayers=structuredClone(state.layers),queue=new RasterPreviewQueue(),input=solidImage(256,256,[80,130,180,255])
 const rows=[]
 for(let i=0;i<20;i++){
  input.data[0]=80+i
  const result=await queue.run({width:256,height:256,layers:[{image:input}]},{revisionKey:`doc:adopt:${i}`,debounceMs:0})
  peakPixelBytes=Math.max(peakPixelBytes,result.peakBytes)
  const canvas=createCanvas(256,256),ctx=canvas.getContext('2d'),image=ctx.createImageData(256,256)
  image.data.set(result.image.data);ctx.putImageData(image,0,0)
  const source=canvas.toDataURL('image/png'),record:AIResult={id:`real-${i}`,source,thumbnail:source,prompt:'local compositor',model:'local',provider:'local',size:'256x256',createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false}
  state=editorReducer(state,{type:'add-ai-result',result:record})
  state=editorReducer(state,{type:'adopt-ai-result-as-layer',id:record.id})
  expect(state.layers[0].source).toBe(source)
  state=editorReducer(state,{type:'undo'});expect(state.layers).toEqual(baseLayers)
  queue.dispose();expect(queue.retainedBytes).toBe(0);expect(result.image.data.every(x=>x===0)).toBe(true)
  const memory=process.memoryUsage();peakRss=Math.max(peakRss,memory.rss)
  rows.push({cycle:i+1,retainedPixelBytes:queue.retainedBytes,arrayBuffers:memory.arrayBuffers,rss:memory.rss,undo:state.undoStack.length,redo:state.redoStack.length})
  canvas.width=1;canvas.height=1
 }
 expect(state.aiResults).toHaveLength(20);expect(state.undoStack.length).toBeLessThanOrEqual(30)
 expect(input.data[1]).toBe(130)
 if(process.env.PERFORMANCE_EVIDENCE_DIR){mkdirSync(process.env.PERFORMANCE_EVIDENCE_DIR,{recursive:true});writeFileSync(`${process.env.PERFORMANCE_EVIDENCE_DIR}/adoption-lifecycle.json`,JSON.stringify({cycles:20,peakPixelBytes,peakSampledProcessRss:peakRss,retainedOwnedPixelBytes:queue.retainedBytes,sourceDataUrlsRetainedForUndo:state.aiResults.length,undoStack:state.undoStack.length,redoStack:state.redoStack.length,rows,caveat:'Undo/results intentionally retain encoded PNG sources. Zero owned pixel buffers proves deterministic cleanup and reference eviction, not immediate JS/GPU garbage collection. Process RSS/arrayBuffers are actual samples, not scheduler-only ownership.'},null,2)+'\n')}
})
