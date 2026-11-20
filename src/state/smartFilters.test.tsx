import { expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Resvg } from '@resvg/resvg-js'
import { initialEditorState, editorReducer } from './editor'
import { createSmartFilter } from '../render/filterPipeline'
import { createInteractiveFilter, type AddableFilter } from '../layers/smartFilterControls'
import { encodeProject, decodeProject } from '../document/projectFormat'
import { CanvasScene } from '../canvas/CanvasScene'
import { serializeExport } from '../render/serializeExport'
const chain={items:[{...createSmartFilter('gaussian','b'),radius:1}]}
const setup=()=>{const s=structuredClone(initialEditorState);s.documentWidth=16;s.documentHeight=16;s.documentBackground='transparent';s.layers=[{id:'art',name:'source',className:'layer-art',visible:true,opacity:100,blendMode:'正常'}];s.canvasShapes=[{id:'shape',layerId:'art',kind:'rectangle',rect:{x:25,y:25,width:50,height:50},color:'#f00',strokeWidth:1}];s.sceneOrder=['shape'];s.brushStrokes=[];s.canvasTexts=[];s.layerMasks={};s.selectedLayerIds=['art'];s.selectedLayerId='art';return s}
it('commits filter metadata once, preserves source and supports exact undo redo',()=>{const s=setup(),filtered=editorReducer(s,{type:'set-smart-filters',id:'art',chain});expect(filtered.undoStack).toHaveLength(s.undoStack.length+1);expect(filtered.canvasShapes).toBe(s.canvasShapes);expect(filtered.layers[0].source).toBe(s.layers[0].source);expect(editorReducer(filtered,{type:'set-smart-filters',id:'art',chain})).toBe(filtered);const undo=editorReducer(filtered,{type:'undo'});expect(undo.layers).toEqual(s.layers);expect(editorReducer(undo,{type:'redo'}).layers).toEqual(filtered.layers)})
it('blocks locked and replaced targets, invalid radius and stale smart sources without history writes',()=>{const s=setup(),locked={...s,layers:s.layers.map(l=>({...l,locked:true}))};expect(editorReducer(locked,{type:'set-smart-filters',id:'art',chain}).undoStack).toBe(locked.undoStack);expect(editorReducer(s,{type:'set-smart-filters',id:'art',chain,expectedLayer:{...s.layers[0]}}).undoStack).toBe(s.undoStack);expect(editorReducer(s,{type:'set-smart-filters',id:'art',chain:{items:[{...chain.items[0],radius:1000}]}}).undoStack).toBe(s.undoStack);expect(editorReducer(s,{type:'set-smart-filters',id:'art',chain,expectedSourceRevision:9}).undoStack).toBe(s.undoStack)})
it('saves chain mask and order, rejects malformed reopen, and exported pixels match after undo redo and reopen',async()=>{const s=setup(),filtered=editorReducer(s,{type:'set-smart-filters',id:'art',chain:{...chain,mask:{enabled:true,inverted:false,rect:{x:0,y:0,width:50,height:100}}}});const saved=await encodeProject(filtered,{id:'f18',name:'filter'}),doc=decodeProject(saved).document;expect(doc.layers[0].smartFilters).toEqual(filtered.layers[0].smartFilters);expect(saved).not.toContain('smart-filter-content');const raster=(state:typeof s)=>{const view=render(<CanvasScene state={state}/>),svg=view.container.querySelector('svg')!;Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:16,height:16}}});const serialized=serializeExport(svg,{range:'canvas'});view.unmount();return new Resvg(serialized).render().pixels};const original=raster(s),output=raster(filtered);expect(output).not.toEqual(original);expect(raster({...s,...doc})).toEqual(output);const undo=editorReducer(filtered,{type:'undo'});expect(raster(undo)).toEqual(original);expect(raster(editorReducer(undo,{type:'redo'}))).toEqual(output);const invalid=JSON.parse(saved);invalid.document.layers[0].smartFilters.items[0].radius=1000;expect(()=>decodeProject(JSON.stringify(invalid))).toThrow(/64/);expect(doc.layers[0].source).toBeUndefined()},20000)
it('converting a filtered object to smart source applies outer chain only once',()=>{const s=editorReducer(setup(),{type:'set-smart-filters',id:'art',chain}),next=editorReducer(s,{type:'convert-to-smart-object',id:'art'});const source=next.smartObjectSources[next.layers[0].smartObject!.sourceId];expect(next.layers[0].smartFilters).toEqual(chain);expect(source.document!.layers[0].smartFilters).toBeUndefined();expect(source.document!.canvasShapes).toEqual(s.canvasShapes)})

it('round-trips the five new filter kinds and custom duotone colors without rasterizing shape data', async () => {
 const kinds = ['boxBlur', 'median', 'edges', 'bloom', 'duotone'] satisfies AddableFilter[]
 const items = kinds.map(kind => createInteractiveFilter(kind, kind))
 items[4] = { ...items[4], shadowColor: '#17384a', highlightColor: '#feebd2' }
 const original = setup()
 const filtered = editorReducer(original, { type: 'set-smart-filters', id: 'art', chain: { items } })
 const saved = await encodeProject(filtered, { id: 'common-filters', name: '常用滤镜' })
 const document = decodeProject(saved).document
 expect(document.layers[0].smartFilters?.items).toEqual(items)
 expect(document.canvasShapes).toEqual(original.canvasShapes)
 expect(editorReducer(filtered, { type: 'undo' }).layers).toEqual(original.layers)
})
