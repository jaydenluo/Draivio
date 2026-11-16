import { describe,it,expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from '../canvas/CanvasScene'
import { initialEditorState,editorReducer,type EditorState } from '../state/editor'
import { prepareLayerMerge } from './groupTransforms'
import { createSelection } from '../canvas/selectionGeometry'
import { captureEditorContext } from '../ai/context/editorContext'
import { serializeExport } from '../render/serializeExport'
import { encodeProject,decodeProject } from './projectFormat'
const transform=(rotation=0)=>({kind:'transform' as const,rect:{x:10,y:10,width:75,height:65},rotation,flipX:false,flipY:false})
function fixture():EditorState{const s=structuredClone(initialEditorState);s.documentWidth=100;s.documentHeight=80;s.layers=[{id:'g',name:'group',className:'layer-group',children:['h'],visible:true,opacity:100,blendMode:'正常',transform:transform(20)},{id:'h',name:'inner',className:'layer-group',children:['art'],groupId:'g',visible:true,opacity:100,blendMode:'正常',transform:transform(-15)},{id:'art',name:'art',className:'layer-art',groupId:'h',visible:true,opacity:100,blendMode:'正常'},{id:'hidden',name:'hidden',className:'layer-art',visible:false,opacity:100,blendMode:'正常'}];s.canvasShapes=[{id:'red',layerId:'art',kind:'rectangle',rect:{x:10,y:10,width:60,height:60},color:'#ff0000',strokeWidth:0}];s.canvasTexts=[];s.brushStrokes=[];s.selectionVisible=false;s.selectedLayerId='g';s.selectedLayerIds=['g'];return s}
function source(s:EditorState){const doc=new DOMParser().parseFromString(renderToStaticMarkup(<CanvasScene state={s}/>),'image/svg+xml');const svg=doc.documentElement as unknown as SVGSVGElement;Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:s.documentWidth,height:s.documentHeight}}});return serializeExport(svg,{range:'canvas'})}
const pixels=(s:EditorState)=>new Resvg(source(s)).render().pixels
const raster=async(s:string)=>'data:image/png;base64,'+Buffer.from(new Resvg(s).render().asPng()).toString('base64')
describe('real group and merge rendering',()=>{
 it('ungroups nested rotated nonuniform scales without moving pixels and keeps child local edit active',async()=>{const before=fixture(),base=pixels(before);const a=editorReducer(before,{type:'ungroup-layers',id:'h'});expect(pixels(a)).toEqual(base);const b=editorReducer(a,{type:'ungroup-layers',id:'g'});expect(pixels(b)).toEqual(base);expect(b.layers.find(l=>l.id==='art')?.transform?.affine).toHaveLength(6);const old=b.layers.find(l=>l.id==='art')!.transform!;const changed=editorReducer(b,{type:'commit-layer-transform',layerId:'art',transform:{...old,rect:{...old.rect,x:old.rect.x+10}}});expect(pixels(changed)).not.toEqual(base);expect(pixels(editorReducer(b,{type:'undo'}))).toEqual(base);const reopened=decodeProject(await encodeProject(b,{id:'group',name:'group'}));expect(pixels({...b,...reopened.document})).toEqual(base)})
 it.each(['selected','down','visible','flatten'] as const)('merges actual shape/text/stroke content for %s with one undo and saved resource',async mode=>{const s=fixture();s.layers.push({id:'second',name:'second',className:'layer-art',visible:true,opacity:100,blendMode:'正常'});s.brushStrokes=[{id:'stroke',layerId:'art',mode:'paint',points:[{x:5,y:50},{x:90,y:50}],size:4,hardness:100,opacity:100,flow:100,smoothing:0,color:'#00ff00'}];s.canvasTexts=[{id:'t',layerId:'art',x:20,y:20,text:'Hi',fontFamily:'sans-serif',fontSize:12,fontWeight:'400',color:'#000000',align:'left'}];const base=pixels(s);const result=await prepareLayerMerge(s,mode,raster);const next=editorReducer(s,{type:'merge-layer-result',result});expect(pixels(next)).toEqual(base);expect(next.undoStack).toHaveLength(s.undoStack.length+1);expect(pixels(editorReducer(next,{type:'undo'}))).toEqual(base);expect(next.layers.some(l=>l.id==='hidden')).toBe(mode!=='flatten');const reopened=decodeProject(await encodeProject(next,{id:'merge',name:'merge'}));expect(pixels({...next,...reopened.document})).toEqual(base)})
 it('preserves nested hidden content on visible merge and hidden group on ungroup',async()=>{
 const s=fixture();s.layers.find(l=>l.id==='h')!.children!.push('secret');s.layers.push({id:'secret',name:'secret',className:'layer-art',groupId:'h',visible:false,opacity:100,blendMode:'正常'});s.canvasShapes.push({id:'blue',layerId:'secret',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#0000ff',strokeWidth:0})
 const base=pixels(s),next=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'visible',raster)});expect(pixels(next)).toEqual(base);expect(next.layers.find(l=>l.id==='secret')).toEqual(s.layers.find(l=>l.id==='secret'));expect(next.canvasShapes.some(x=>x.id==='blue')).toBe(true)
 const hidden={...s,layers:s.layers.map(l=>l.id==='g'?{...l,visible:false}:l)};expect(pixels(editorReducer(hidden,{type:'ungroup-layers',id:'g'}))).toEqual(pixels(hidden))
 })
 it('rasterizes visible blends, filters and masks through the same scene',async()=>{
 const s=fixture();s.layers.push({id:'back',name:'back',className:'layer-art',visible:true,opacity:100,blendMode:'正常'});s.canvasShapes.push({id:'backshape',layerId:'back',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#8888ff',strokeWidth:0});s.layers.find(l=>l.id==='art')!.blendMode='正片叠底';s.layers.find(l=>l.id==='art')!.adjustments={brightness:10,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0,shadows:0,highlights:0};s.layerMasks.art={selection:createSelection('ellipse',{x:5,y:5,width:80,height:80}),strokes:[],inverted:false,applied:true}
 const base=pixels(s);const next=editorReducer(s,{type:'merge-layer-result',result:await prepareLayerMerge(s,'visible',raster)});expect(pixels(next)).toEqual(base)
 })
 it('keeps AI target matrices through ungroup affine promotion',()=>{
 const s=fixture();s.selectedLayerId='art';s.selectedLayerIds=['art'];const before=captureEditorContext(s,'doc','layer').targetToDocument
 const a=editorReducer(s,{type:'ungroup-layers',id:'h'});a.selectedLayerId='art';a.selectedLayerIds=['art'];const after=captureEditorContext(a,'doc','layer').targetToDocument
 before.forEach((n,i)=>expect(after[i]).toBeCloseTo(n,10))
 })
 it('rejects locked ancestors and stale async merge without document writes',async()=>{const s=fixture();const result=await prepareLayerMerge(s,'visible',raster);const locked=editorReducer(s,{type:'toggle-layer-lock',id:'g'});await expect(prepareLayerMerge(locked,'visible',raster)).rejects.toThrow('锁定');const next=editorReducer(locked,{type:'merge-layer-result',result});expect(next.layers).toEqual(locked.layers);expect(next.undoStack).toEqual(locked.undoStack)})
})
