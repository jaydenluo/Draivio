import {it,expect} from 'vitest';import {initialEditorState} from '../../state/editor';import {contentRevision} from '../context/editorContext';import {runRetouchPixels,validateRetouch,clipRetouchResult,retouchResultAction} from './retouchTools';import {createSelection,invertSelection,type Selection} from '../../canvas/selectionGeometry'
const s=()=>({...structuredClone(initialEditorState),layers:[{...initialEditorState.layers[0],id:'base',visible:true,locked:false},{...initialEditorState.layers[1],id:'donor',visible:true,locked:false}],selectedLayerId:'base',selectedLayerIds:['base'],selectionVisible:false})
it('requires a valid sample scope and produces pixel repair',()=>{const image={width:5,height:5,data:new Uint8ClampedArray(5*5*4).fill(100)};const r={tool:'heal' as const,layerId:'base',sampleScope:'visible' as const,points:[{x:50,y:50}],options:{size:2},baseContentRevision:contentRevision(s()),baseUndoLength:0};expect(validateRetouch(s(),r)).toEqual(['base','donor']);const out=runRetouchPixels(image,r);expect(out.width).toBe(5);expect(out.data).not.toBe(image.data)})
it('rejects locked target and missing clone source',()=>{const st={...s(),layers:s().layers.map(l=>l.id==='base'?{...l,locked:true}:l)};const r={tool:'clone' as const,layerId:'base',sampleScope:'visible' as const,options:{size:2},baseContentRevision:contentRevision(s()),baseUndoLength:0};expect(()=>validateRetouch(st,r)).toThrow(/锁定/);expect(()=>validateRetouch(s(),r)).toThrow(/采样源/)})
it('rejects late results and requires the same document revision',()=>{const st=s();const r={tool:'heal' as const,layerId:'base',sampleScope:'visible' as const,points:[{x:50,y:50}],options:{size:2},baseContentRevision:'stale',baseUndoLength:st.undoStack.length};expect(()=>validateRetouch(st,r)).toThrow(/过期/)})
it('clips retouch deltas for every selection path expression',()=>{const before={width:4,height:4,data:new Uint8ClampedArray(64).fill(10)},after={width:4,height:4,data:new Uint8ClampedArray(64).fill(200)},rect=createSelection('rectangle',{x:0,y:0,width:50,height:100});const paths:Selection[]=[rect,invertSelection(rect),{...rect,path:{type:'boolean',mode:'add',left:rect.path,right:createSelection('rectangle',{x:50,y:0,width:50,height:100}).path}},{...rect,path:{type:'transform',source:rect.path,from:rect.rect,to:{x:50,y:0,width:50,height:100}}},{...rect,path:{type:'affine',source:rect.path,matrix:[1,0,0,1,50,0]}},{...rect,path:{type:'path',d:'M0 0h50v100H0Z',points:[{x:0,y:0},{x:50,y:0},{x:50,y:100},{x:0,y:100}]}},{...rect,path:{type:'raster',rows:['1100','1100','1100','1100'],d:'',alpha:[255,128,0,0,255,128,0,0,255,128,0,0,255,128,0,0],alphaWidth:4,alphaHeight:4}}];let totalChanged=0;for(const selection of paths){const clipped=clipRetouchResult(before,after,selection);for(let i=0;i<16;i++){if(clipped.data[i*4]>10) totalChanged++;expect(clipped.data[i*4]).toBeGreaterThanOrEqual(10);expect(clipped.data[i*4]).toBeLessThanOrEqual(200)}}expect(totalChanged).toBeGreaterThan(0)})

for(const mutation of ['enlarge','same-bounds-other-path','feather','remove-selection'] as const)it(`rejects caller selection ${mutation} at validation and publication`,()=>{
 const st=s();st.selectionVisible=true;st.selection=createSelection('ellipse',{x:25,y:25,width:50,height:50})
 const selected=structuredClone(st.selection)
 const r={tool:'heal' as const,layerId:'base',sampleScope:'current' as const,points:[{x:50,y:50}],options:{size:2},baseContentRevision:contentRevision(st),baseUndoLength:st.undoStack.length,selection:mutation==='enlarge'?createSelection('rectangle',{x:0,y:0,width:100,height:100}):mutation==='same-bounds-other-path'?createSelection('rectangle',selected.rect):mutation==='feather'?{...selected,feather:30}:undefined}
 const before={width:4,height:4,data:new Uint8ClampedArray(64).fill(10)},after={width:4,height:4,data:new Uint8ClampedArray(64).fill(200)}
 expect(()=>validateRetouch(st,r)).toThrow(/选区/)
 expect(()=>retouchResultAction(st,r,before,after)).toThrow(/选区/)
})
it('rejects a selection change even when document content revision and undo length are unchanged',()=>{
 const st=s();st.selectionVisible=true;st.selection=createSelection('rectangle',{x:0,y:0,width:50,height:100})
 const r={tool:'heal' as const,layerId:'base',sampleScope:'current' as const,points:[{x:50,y:50}],options:{size:2},baseContentRevision:contentRevision(st),baseUndoLength:st.undoStack.length,selection:structuredClone(st.selection)}
 const changed={...st,selection:createSelection('rectangle',{x:50,y:0,width:50,height:100})};expect(contentRevision(changed)).toBe(r.baseContentRevision)
 expect(()=>validateRetouch(changed,r)).toThrow(/选区/)
 expect(validateRetouch(st,r)).toEqual(['base'])
})

import * as rasterTools from '../../canvas/rasterTools'
import {vi,afterEach} from 'vitest'
afterEach(()=>vi.restoreAllMocks())
it('publishes a real document-selection-clipped delta, keeping all outside pixels transparent',()=>{
 const st=s();st.selectionVisible=true;st.selection=createSelection('rectangle',{x:0,y:0,width:50,height:100})
 const r={tool:'heal' as const,layerId:'base',sampleScope:'current' as const,points:[{x:50,y:50}],options:{size:2},baseContentRevision:contentRevision(st),baseUndoLength:st.undoStack.length,selection:structuredClone(st.selection)}
 const before={width:4,height:4,data:new Uint8ClampedArray(64).fill(10)},after={width:4,height:4,data:new Uint8ClampedArray(64).fill(200)}
 const encoder=vi.spyOn(rasterTools,'imageToPng').mockReturnValue('data:image/png;base64,Zml4dHVyZQ==')
 const action=retouchResultAction(st,r,before,after)
 expect(action.type).toBe('add-repair-layer');expect(encoder).toHaveBeenCalledOnce()
 const delta=encoder.mock.calls[0][0]
 for(let y=0;y<4;y++)for(let x=0;x<4;x++)expect([...delta.data.slice((y*4+x)*4,(y*4+x)*4+4)]).toEqual(x<2?[200,200,200,200]:[0,0,0,0])
 // Cleared selection is a different authorization scope, even though content revision is unchanged.
 expect(()=>retouchResultAction({...st,selectionVisible:false},r,before,after)).toThrow(/选区/)
 expect(encoder).toHaveBeenCalledOnce()
})

function validRequest(st= s()){return {tool:'heal' as const,layerId:'base',sampleScope:'current' as const,points:[{x:50,y:50}],options:{size:2},baseContentRevision:contentRevision(st),baseUndoLength:st.undoStack.length}}
for(const [label,patch] of [
 ['nan point',{points:[{x:NaN,y:50}]}],['infinite point',{points:[{x:50,y:Infinity}]}],['outside point',{points:[{x:101,y:0}]}],['too many points',{points:Array.from({length:4097},()=>({x:50,y:50}))}],
 ['NaN size',{options:{size:NaN}}],['negative size',{options:{size:-1}}],['oversized size',{options:{size:2049}}],['invalid hardness',{options:{size:2,hardness:Infinity}}],['invalid opacity',{options:{size:2,opacity:-1}}],['invalid alignment',{options:{size:2,aligned:'yes'}}],['missing options',{options:undefined}],['unknown tool',{tool:'unknown'}],['unknown scope',{sampleScope:'unknown'}],
 ['negative clone source',{tool:'clone',source:{x:-1,y:0,width:10,height:10},destination:{x:0,y:0,width:10,height:10}}],['infinite clone destination',{tool:'clone',source:{x:0,y:0,width:10,height:10},destination:{x:0,y:0,width:Infinity,height:10}}],['clone exceeds bounds',{tool:'clone',source:{x:90,y:0,width:20,height:10},destination:{x:0,y:0,width:10,height:10}}],['zero clone width',{tool:'clone',source:{x:0,y:0,width:0,height:10},destination:{x:0,y:0,width:10,height:10}}],
] as const)it(`rejects malformed retouch ${label} before result publication`,()=>{
 const st=s(),request={...validRequest(st),...patch} as any
 expect(()=>validateRetouch(st,request)).toThrow()
 expect(()=>runRetouchPixels({width:1,height:1,data:new Uint8ClampedArray(4)},request)).toThrow()
 const encoder=vi.spyOn(rasterTools,'imageToPng').mockReturnValue('never')
 expect(()=>retouchResultAction(st,request,{width:1,height:1,data:new Uint8ClampedArray(4)},{width:1,height:1,data:new Uint8ClampedArray(4)})).toThrow()
 expect(encoder).not.toHaveBeenCalled()
})
it('rejects a child of a locked ancestor even if the target itself is unlocked',()=>{
 const st=s();st.layers=[{...st.layers[0],id:'group',kind:'group',locked:true}, {...st.layers[0],groupId:'group'}]
 expect(()=>validateRetouch(st,validRequest(st))).toThrow(/锁定/)
})
it('accepts finite boundary coordinates and all documented option types and scopes',()=>{
 const st=s();for(const sampleScope of ['current','below','visible'] as const){const request={...validRequest(st),sampleScope,points:[{x:0,y:0},{x:100,y:100}],options:{size:2048,hardness:0,opacity:100,aligned:false}};expect(validateRetouch(st,request).length).toBeGreaterThan(0)}
 expect(validateRetouch(st,{...validRequest(st),tool:'clone',source:{x:0,y:0,width:100,height:100},destination:{x:90,y:90,width:10,height:10}})).toEqual(['base'])
})
