import {describe,it,expect,vi} from 'vitest'
import {renderToStaticMarkup} from 'react-dom/server'
import {Resvg} from '@resvg/resvg-js'
import {CanvasScene} from '../canvas/CanvasScene'
import {serializeExport} from '../render/serializeExport'
import {initialEditorState,editorReducer,type EditorState,type Layer} from '../state/editor'
import {prepareLayerMerge} from './groupTransforms'
import {encodeProject,decodeProject} from './projectFormat'
import {validateDocument} from './projectValidation'
import {createSelection} from '../canvas/selectionGeometry'
vi.setConfig({testTimeout:15000})
const layer=(id:string,color?:string):Layer=>({id,name:id,className:'layer-art',visible:true,opacity:50,blendMode:'正常',...(color?{source:color}:{})})
function fixture():EditorState {return {...structuredClone(initialEditorState),documentWidth:40,documentHeight:32,documentBackground:'transparent',layers:[layer('a'),layer('b'),layer('c'),{...layer('hidden'),visible:false}],canvasShapes:['a','b','c','hidden'].map((id,index)=>({id:`shape-${id}`,layerId:id,kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:['#ff0000','#00ff00','#0000ff','#ffaa00'][index],strokeWidth:0})),canvasTexts:[],brushStrokes:[],layerMasks:{},selectedLayerId:'a',selectedLayerIds:['a','c'],selectionVisible:false,undoStack:[],redoStack:[]}}
function source(state:EditorState){const doc=new DOMParser().parseFromString(renderToStaticMarkup(<CanvasScene state={state}/>),'image/svg+xml');const svg=doc.documentElement as unknown as SVGSVGElement;Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:state.documentWidth,height:state.documentHeight}}});return serializeExport(svg,{range:'canvas'})}
const pixels=(s:EditorState)=>new Resvg(source(s)).render().pixels
const raster=async(s:string)=>'data:image/png;base64,'+Buffer.from(new Resvg(s).render().asPng()).toString('base64')
function difference(a:Uint8Array,b:Uint8Array){let max=0,total=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);max=Math.max(max,d);total+=d}return{max,mean:total/a.length}}
describe('distributed lossless merge',()=>{
 it('keeps interleaved alpha and outside/hidden nodes in their original slots',async()=>{
  const s=fixture(),base=pixels(s);expect(base.some(x=>x>0)).toBe(true)
  const result=await prepareLayerMerge(s,'selected',raster);const merged=editorReducer(s,{type:'merge-layer-result',result})
  expect(pixels(merged)).toEqual(base);expect(merged.layers.find(l=>l.id==='b')).toEqual(s.layers[1]);expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers[3])
  expect(merged.layers[1].id).toBe('b');expect(merged.selectedLayerIds).toHaveLength(2)
  const batch=merged.layers.filter(l=>merged.selectedLayerIds.includes(l.id)).map(l=>l.mergeBatchId);expect(batch[0]).toBeTruthy();expect(new Set(batch).size).toBe(1)
  expect(merged.undoStack).toHaveLength(1);expect(pixels(editorReducer(merged,{type:'undo'}))).toEqual(base);expect(pixels(editorReducer(editorReducer(merged,{type:'undo'}),{type:'redo'}))).toEqual(base)
  const reopened={...merged,...decodeProject(await encodeProject(merged,{id:'merge',name:'merge'})).document};expect(pixels(reopened)).toEqual(base);expect(reopened.layers.filter(l=>l.mergeBatchId).map(l=>l.mergeBatchId)).toEqual(batch)
 })
 it('keeps nested parent compositing, selected mixed leaf and hidden subtree intact',async()=>{
  const s=fixture();const group:Layer={...layer('group'),className:'layer-group',opacity:63,blendMode:'滤色',children:['a','b','c','hidden'],transform:{kind:'transform',rect:{x:8,y:5,width:80,height:90},rotation:12,flipX:false,flipY:false}}
  s.layers=[group,...s.layers.map(l=>({...l,groupId:'group'})),{...layer('back'),opacity:100}];s.canvasShapes.push({id:'backshape',layerId:'back',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#474080',strokeWidth:0});s.layers.find(l=>l.id==='a')!.blendMode='正片叠底'
  s.layerMasks.group={selection:createSelection('ellipse',{x:3,y:4,width:90,height:90}),strokes:[],inverted:false,applied:true}
  const base=pixels(s),result=await prepareLayerMerge(s,'selected',raster),merged=editorReducer(s,{type:'merge-layer-result',result})
  const diff=difference(pixels(merged),base);expect(diff.max).toBeLessThanOrEqual(1);expect(diff.mean).toBeLessThan(.01)
  expect(merged.layers.find(l=>l.id==='group')).toEqual({...group,children:merged.layers.find(l=>l.id==='group')!.children})
  expect(merged.layers.find(l=>l.id==='b')).toEqual(s.layers.find(l=>l.id==='b'));expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers.find(l=>l.id==='hidden'));expect(merged.layerMasks.group).toEqual(s.layerMasks.group)
  expect(merged.selectedLayerIds).toHaveLength(2)
 })
 it('deduplicates selected ancestors and preserves hidden wrappers on visible merge',async()=>{
  const s=fixture();const group:Layer={...layer('group'),opacity:70,children:['a','b','c','hidden'],className:'layer-group'};s.layers=[group,...s.layers.map(l=>({...l,groupId:'group'}))];s.selectedLayerIds=['group','a'];s.selectedLayerId='group'
  const result=await prepareLayerMerge(s,'visible',raster),merged=editorReducer(s,{type:'merge-layer-result',result})
  expect(pixels(merged)).toEqual(pixels(s));expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers.find(l=>l.id==='hidden'));expect(merged.layers.find(l=>l.id==='group')?.opacity).toBe(70)
  expect(merged.canvasShapes.find(o=>o.layerId==='hidden')).toEqual(s.canvasShapes.find(o=>o.layerId==='hidden'))
 })
})

it('merged nested content follows later parent and own transforms instead of staying pinned',async()=>{
 const s=fixture();s.layers=[{...layer('parent'),opacity:100,children:['a','b','c','hidden']},...s.layers.map(l=>({...l,groupId:'parent'}))];s.selectedLayerId='a';s.selectedLayerIds=['a'];s.canvasShapes.find(o=>o.layerId==='a')!.rect={x:10,y:10,width:35,height:35}
 const merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)}),segment=merged.layers.find(l=>merged.selectedLayerIds.includes(l.id))!
 const movedParent=editorReducer(merged,{type:'commit-layer-transform',layerId:'parent',transform:{kind:'transform',rect:{x:20,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}})
 expect(pixels(movedParent)).not.toEqual(pixels(merged))
 const movedSegment=editorReducer(merged,{type:'commit-layer-transform',layerId:segment.id,transform:{...segment.transform!,kind:'transform',rect:{x:20,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}})
 expect(pixels(movedSegment)).not.toEqual(pixels(merged))
 // Moving the segment right must vacate its old leftmost sample.
 const alpha=(state:EditorState,x:number,y:number)=>{const clone={...state,layers:state.layers.filter(l=>l.id==='parent'||l.id===segment.id)};return pixels(clone)[(y*40+x)*4+3]}
 expect(alpha(movedSegment,5,6)).toBe(0);expect(alpha(movedSegment,13,6)).toBeGreaterThan(0)
})

it('prepares every segment before writing and aborts or fails atomically',async()=>{
 const s=fixture(),original=structuredClone(s),controller=new AbortController();let calls=0
 await expect(prepareLayerMerge(s,'selected',async svg=>{calls++;const png=await raster(svg);if(calls===1)controller.abort();return png},{signal:controller.signal})).rejects.toThrow('取消')
 expect(calls).toBe(1);expect(s).toEqual(original)
 calls=0;await expect(prepareLayerMerge(s,'selected',async svg=>{if(++calls===2)throw new Error('编码失败');return raster(svg)})).rejects.toThrow('编码失败')
 expect(calls).toBe(2);expect(s).toEqual(original)
 const result=await prepareLayerMerge(s,'selected',raster),changed=editorReducer(s,{type:'set-layer-opacity',id:'b',opacity:20}),late=editorReducer(changed,{type:'merge-layer-result',result})
 expect(late.layers).toBe(changed.layers);expect(late.undoStack).toBe(changed.undoStack)
})
it('normalizes ancestor/descendant selection and supports down inside a nested parent',async()=>{
 const s=fixture();const parent={...layer('parent'),opacity:100,children:['a','b','c','hidden']};s.layers=[parent,...s.layers.map(l=>({...l,groupId:'parent'}))];s.selectedLayerId='a';s.selectedLayerIds=['a']
 const down=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'down',raster)})
 expect(pixels(down)).toEqual(pixels(s));expect(down.layers.find(l=>l.id==='c')).toEqual(s.layers.find(l=>l.id==='c'));expect(down.selectedLayerIds).toHaveLength(1)
 s.selectedLayerId='parent';s.selectedLayerIds=['parent','a'];const normalized=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)})
 expect(pixels(normalized)).toEqual(pixels(s));expect(normalized.selectedLayerIds).toHaveLength(1);expect(normalized.layers.find(l=>l.id==='hidden')).toEqual(s.layers.find(l=>l.id==='hidden'))
})

it('preserves frozen parent coordinates through later rotation and saved affine data',async()=>{
 const s=fixture();s.layers=[{...layer('parent'),opacity:100,children:['a','b','c','hidden'],transform:{kind:'transform',rect:{x:7,y:3,width:90,height:85},rotation:13,flipX:false,flipY:false}},...s.layers.map(l=>({...l,groupId:'parent'}))];s.selectedLayerIds=['a'];s.selectedLayerId='a';s.canvasShapes.find(o=>o.layerId==='a')!.rect={x:15,y:20,width:25,height:30}
 const merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)}),id=merged.selectedLayerId,segment=merged.layers.find(l=>l.id===id)!
 expect(segment.documentSpace).not.toBe(true);expect(segment.transform?.affine).toHaveLength(6)
 const isolate=(state:EditorState)=>({...state,layers:state.layers.filter(l=>l.id==='parent'||l.id===id)})
 expect(source(isolate(merged))).toContain('image-rendering="optimizeSpeed"')
 const base=pixels(isolate(merged));const parent=merged.layers.find(l=>l.id==='parent')!
 const rotatedParent=editorReducer(merged,{type:'commit-layer-transform',layerId:'parent',transform:{...parent.transform!,rotation:45}})
 expect(pixels(isolate(rotatedParent))).not.toEqual(base);expect(source(isolate(rotatedParent))).not.toContain('image-rendering="optimizeSpeed"')
 const rotatedSegment=editorReducer(merged,{type:'commit-layer-transform',layerId:id,transform:{...segment.transform!,rotation:45}})
 expect(pixels(isolate(rotatedSegment))).not.toEqual(base)
 const reopen={...rotatedParent,...decodeProject(await encodeProject(rotatedParent,{id:'rotated',name:'rotated'})).document};expect(pixels(isolate(reopen))).toEqual(pixels(isolate(rotatedParent)))
 expect(pixels(isolate(editorReducer(rotatedSegment,{type:'undo'})))) .toEqual(base)
})

it('includes unequal parent content dimensions in frozen world-to-parent coordinates',async()=>{
 const s=fixture();s.layers=[{...layer('outer'),opacity:100,contentWidth:32,contentHeight:24,children:['inner'],transform:{kind:'transform',rect:{x:3,y:4,width:65,height:60},rotation:8,flipX:false,flipY:false}},{...layer('inner'),opacity:100,groupId:'outer',contentWidth:30,contentHeight:28,children:['a','b','c','hidden'],transform:{kind:'transform',rect:{x:2,y:1,width:85,height:85},rotation:-5,flipX:false,flipY:false}},...s.layers.map(l=>({...l,groupId:'inner'}))];s.selectedLayerId='a';s.selectedLayerIds=['a'];s.canvasShapes.find(o=>o.layerId==='a')!.rect={x:12,y:15,width:25,height:30}
 const result=await prepareLayerMerge(s,'selected',raster),merged=editorReducer(s,{type:'merge-layer-result',result}),diff=difference(pixels(merged),pixels(s))
 expect(diff.max).toBeLessThanOrEqual(1);expect(diff.mean).toBeLessThan(.01)
 expect(merged.layers.find(l=>l.id==='outer')).toEqual(s.layers.find(l=>l.id==='outer'))
 const segment=merged.layers.find(l=>l.id===merged.selectedLayerId)!,moved=editorReducer(merged,{type:'commit-layer-transform',layerId:segment.id,transform:{...segment.transform!,rect:{...segment.transform!.rect,x:10}}})
 expect(pixels(moved)).not.toEqual(pixels(merged))
})

it('restores hidden interleaved children without changing their stacking or inherited effects',async()=>{
 const s=fixture();const parent={...layer('parent'),opacity:65,children:['a','hidden','c'],transform:{kind:'transform' as const,rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}};s.layers=[parent,...s.layers.filter(l=>l.id!=='b').map(l=>({...l,groupId:'parent'}))];s.selectedLayerId='parent';s.selectedLayerIds=['parent'];s.canvasShapes.find(o=>o.layerId==='hidden')!.rect={x:5,y:5,width:75,height:75}
 const merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)}),show=(state:EditorState)=>editorReducer(state,{type:'toggle-layer',id:'hidden'})
 expect(pixels(show(merged))).toEqual(pixels(show(s)));expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers.find(l=>l.id==='hidden'))
})
it('uses draft ancestor and own rotation for preview image sampling just like committed export',async()=>{
 const s=fixture();s.layers=[{...layer('parent'),opacity:100,children:['a','b','c','hidden']},...s.layers.map(l=>({...l,groupId:'parent'}))];s.selectedLayerId='a';s.selectedLayerIds=['a'];const merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)})
 for(const id of ['parent',merged.selectedLayerId]){
 const target=merged.layers.find(l=>l.id===id)!,draft={...(target.transform??{kind:'transform' as const,rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}),rotation:25}
 const preview=renderToStaticMarkup(<CanvasScene state={merged} transformPreview={{layerId:id,draft}}/>),committed=source(editorReducer(merged,{type:'commit-layer-transform',layerId:id,transform:draft}))
 expect(preview).not.toContain('image-rendering="optimizeSpeed"');expect(committed).not.toContain('image-rendering="optimizeSpeed"')
 }
})

it.each(['selected','flatten'] as const)('clears removed sceneOrder IDs and passes strict project validation for %s',async mode=>{
 let s=fixture();s.sceneOrder=[]
 s=editorReducer(s,{type:'add-shape',shape:{id:'live-added',layerId:'a',kind:'rectangle',rect:{x:10,y:10,width:20,height:20},color:'#112233',strokeWidth:0}})
 s.sceneOrder=['shape-c','shape-hidden','live-added','shape-b','shape-a']
 const before=structuredClone(s),merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,mode,raster)})
 const strict=(state:EditorState)=>({...state,colorManagement:{...state.colorManagement,profile:{...state.colorManagement.profile,bytes:Array.from(state.colorManagement.profile.bytes)}}})
 expect(()=>validateDocument(strict(merged))).not.toThrow()
 expect(merged.sceneOrder).toEqual(mode==='flatten'?[]:['shape-hidden','shape-b'])
 const encoded=await encodeProject(merged,{id:'strict',name:'strict'}),loaded=decodeProject(encoded)
 expect(()=>validateDocument(strict({...merged,...loaded.document}))).not.toThrow()
 expect(()=>validateDocument({...strict({...merged,...loaded.document}),sceneOrder:before.sceneOrder})).toThrow('sceneOrder')
 const undone=editorReducer(merged,{type:'undo'});expect(undone.sceneOrder).toEqual(before.sceneOrder)
 expect(()=>validateDocument(strict(editorReducer(undone,{type:'redo'})))).not.toThrow()
})

it.each([false,true])('preserves repair replacement coverage when merge includes repair=%s',async includeRepair=>{
 const s=fixture();s.layers=[{...layer('repair'),opacity:100,repairCoverage:'M8 8h16v12H8Z',repairSourceIds:['a'],source:await raster('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32"><rect x="8" y="8" width="16" height="12" fill="green" opacity=".5"/></svg>')},...s.layers];s.selectedLayerIds=includeRepair?['repair','a']:['a'];s.selectedLayerId='a'
 const before=pixels(s),result=await prepareLayerMerge(s,'selected',raster),merged=editorReducer(s,{type:'merge-layer-result',result})
 expect(pixels(merged)).toEqual(before)
 const r=merged.layers.find(l=>l.repairCoverage)!,newBase=merged.layers.find(l=>l.mergeBatchId&&!l.repairCoverage)!
 expect(r.repairSourceIds).toContain(newBase.id);expect(r.repairSourceIds).not.toContain('a')
 expect(merged.layers.find(l=>l.id==='b')).toEqual(s.layers.find(l=>l.id==='b'))
 const reopened={...merged,...decodeProject(await encodeProject(merged,{id:'repair-merge',name:'repair-merge'})).document};expect(pixels(reopened)).toEqual(before)
 expect(pixels(editorReducer(merged,{type:'undo'}))).toEqual(before)
})
it.each(['selected','visible'] as const)('bakes visible group own content with only a hidden child for %s',async mode=>{
 const s=fixture();s.layers=[{...layer('own-group'),opacity:70,className:'layer-group',children:['hidden']},{...layer('hidden'),groupId:'own-group',visible:false}];s.canvasShapes=[{id:'own-red',layerId:'own-group',kind:'rectangle',rect:{x:0,y:0,width:70,height:70},color:'#ff0000',strokeWidth:0}];s.selectedLayerId='own-group';s.selectedLayerIds=['own-group'];s.sceneOrder=['own-red']
 const before=pixels(s),merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,mode,raster)})
 expect(pixels(merged)).toEqual(before);expect(merged.canvasShapes).toHaveLength(0);expect(merged.layers.find(l=>l.groupId==='own-group'&&l.mergeBatchId)?.source).toMatch(/^data:image\/png/);expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers[1]);expect(merged.sceneOrder).toEqual([])
})
it.each([false,true])('keeps repair coverage away from an unsampled selected neighbor, grouped=%s',async grouped=>{
 const s=fixture();s.layers.unshift({...layer('repair'),opacity:100,repairCoverage:'M8 8h16v12H8Z',repairSourceIds:['a'],source:await raster('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32"><rect x="8" y="8" width="16" height="12" fill="green" opacity=".5"/></svg>')})
 if(grouped){s.layers=[s.layers[0],{...layer('parent'),opacity:100,children:['a','b','c','hidden']},...s.layers.slice(1).map(l=>({...l,groupId:'parent'}))];s.selectedLayerIds=['parent'];s.selectedLayerId='parent'}else{s.selectedLayerIds=['a','b'];s.selectedLayerId='a'}
 const base=pixels(s),merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)})
 expect(pixels(merged)).toEqual(base)
 const repair=merged.layers.find(l=>l.id==='repair')!;expect(repair.repairSourceIds).toHaveLength(1)
 const target=merged.layers.find(l=>l.id===repair.repairSourceIds![0])!;expect(target).toBeDefined()
 expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers.find(l=>l.id==='hidden'))
})
it('preserves replacement coverage before external blur on a referenced selected base',async()=>{
 const s=fixture();s.layers.find(l=>l.id==='a')!.adjustments={brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:80,shadows:0,highlights:0};s.layers.unshift({...layer('repair'),opacity:100,repairCoverage:'M8 8h16v12H8Z',repairSourceIds:['a'],source:await raster('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32"><rect x="8" y="8" width="16" height="12" fill="green" opacity=".5"/></svg>')});s.selectedLayerId='a';s.selectedLayerIds=['a']
 const before=pixels(s),merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)})
 expect(pixels(merged)).toEqual(before);expect(merged.layers.find(l=>l.mergeBatchId)?.adjustments).toEqual(s.layers.find(l=>l.id==='a')!.adjustments)
})
it('preserves transformed group own content with a hidden child without double sampling',async()=>{
 const s=fixture();s.layers=[{...layer('own-group'),opacity:70,className:'layer-group',children:['hidden'],transform:{kind:'transform',rect:{x:5,y:3,width:75,height:85},rotation:13,flipX:false,flipY:false}},{...layer('hidden'),groupId:'own-group',visible:false}];s.canvasShapes=[{id:'own-red',layerId:'own-group',kind:'rectangle',rect:{x:10,y:10,width:50,height:40},color:'#ff0000',strokeWidth:0}];s.selectedLayerId='own-group';s.selectedLayerIds=['own-group'];s.sceneOrder=['own-red']
 const before=pixels(s),merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)})
 expect(pixels(merged)).toEqual(before);expect(merged.canvasShapes).toHaveLength(0);expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers[1])
})
it('retargets external repair of group own content to its bottom content segment',async()=>{
 const s=fixture();s.layers=[{...layer('repair'),opacity:100,repairCoverage:'M8 8h16v12H8Z',repairSourceIds:['own-group'],source:await raster('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="32"><rect x="8" y="8" width="16" height="12" fill="green" opacity=".5"/></svg>')},{...layer('own-group'),opacity:70,className:'layer-group',children:['hidden']},{...layer('hidden'),groupId:'own-group',visible:false}];s.canvasShapes=[{id:'own-red',layerId:'own-group',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#ff0000',strokeWidth:0}];s.selectedLayerId='own-group';s.selectedLayerIds=['own-group'];s.sceneOrder=['own-red']
 const before=pixels(s),merged=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'selected',raster)})
 expect(pixels(merged)).toEqual(before);const own=merged.layers.find(l=>l.groupId==='own-group'&&l.mergeBatchId)!
 expect(merged.layers.find(l=>l.id==='repair')!.repairSourceIds).toEqual([own.id]);expect(merged.layers.find(l=>l.id==='own-group')).toBeDefined();expect(merged.layers.find(l=>l.id==='hidden')).toEqual(s.layers[2])
})
