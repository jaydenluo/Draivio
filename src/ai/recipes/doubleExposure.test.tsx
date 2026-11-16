import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { CanvasScene } from '../../canvas/CanvasScene'
import { editorReducer, initialEditorState } from '../../state/editor'
import { createSelection } from '../../canvas/selectionGeometry'
import { decodeProject, encodeProject } from '../../document/projectFormat'
import { buildDoubleExposure, defaultDoubleExposureSettings } from './doubleExposure'
const png=(color:string)=>`data:image/png;base64,${Buffer.from(new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"><rect width="16" height="16" fill="${color}"/></svg>`).render().asPng()).toString('base64')}`
export function doubleFixture(){const s=structuredClone(initialEditorState);s.documentWidth=16;s.documentHeight=16;s.documentBackground='transparent';s.layers=[{id:'subject',name:'主体',kind:'image',className:'layer-art',visible:true,opacity:100,blendMode:'正常',source:png('#800000')},{id:'second',name:'第二图',kind:'image',className:'layer-art',visible:false,opacity:100,blendMode:'正常',source:png('#000080')}];s.selectedLayerId='subject';s.selectedLayerIds=['subject'];s.selectionVisible=true;s.selection=createSelection('rectangle',{x:0,y:0,width:50,height:100});s.selectionRect=s.selection.rect;s.artboards=[{id:'a',name:'A',width:16,height:16,x:0,y:0,background:'transparent',layerIds:['subject','second']}];s.activeArtboardId='a';return s}
const pixels=(s:ReturnType<typeof doubleFixture>)=>new Resvg(renderToStaticMarkup(<CanvasScene state={s} thumbnail/>)).render().pixels
it('keeps both source images and editable mask, curves, clipping and second transform through undo and project reopen',async()=>{
 const s=doubleFixture(),original=structuredClone(s),settings={...defaultDoubleExposureSettings(),subjectId:'subject',second:{layerId:'second'},maskMode:'selection' as const,dx:2,scale:.75,curveAmount:.3}
 const c=buildDoubleExposure(s,settings);expect(s).toEqual(original)
 expect(c.document.layers.find(l=>l.id===c.subjectId)!.source).toBe(s.layers[0].source);expect(c.document.layers.find(l=>l.id===c.secondId)!.source).toBe(s.layers[1].source)
 expect(c.document.layerMasks[c.subjectId].applied).toBe(true);expect(c.document.layers.find(l=>l.id===c.secondId)!.clipBaseId).toBe(c.subjectId)
 expect(c.document.layers.find(l=>l.id===c.secondId)!.transform?.rect.x).toBe(25)
 expect(c.document.layers.find(l=>l.id===c.subjectId)!.adjustments?.curves).toBeDefined()
 const adopted=editorReducer(s,{type:'apply-edit-plan',document:c.document});expect(adopted.undoStack).toHaveLength(1);expect(editorReducer(adopted,{type:'undo'}).layers).toEqual(s.layers)
 const restored=editorReducer(initialEditorState,{type:'restore-project',document:decodeProject(await encodeProject(adopted,{id:'double',name:'双重曝光'})).document});expect(pixels(restored)).toEqual(pixels(adopted));expect(restored.layerMasks).toEqual(adopted.layerMasks)
 const moved=editorReducer(restored,{type:'set-layer-opacity',id:c.secondId,opacity:0});expect(pixels(moved)).not.toEqual(pixels(restored))
})
it('renders real masked screen pixels and changes blend ratio and independent placement',()=>{
 const s=doubleFixture(),c=buildDoubleExposure(s,{...defaultDoubleExposureSettings(),subjectId:'subject',second:{layerId:'second'},maskMode:'selection',opacity:100,curveAmount:0})
 const p=pixels(c.document);expect([...p.slice((8*16+3)*4,(8*16+3)*4+4)]).toEqual([128,0,128,255]);expect(p[(8*16+13)*4+3]).toBe(0)
 if(process.env.DOUBLE_EXPOSURE_EVIDENCE==='1'){
  const directory='docs/evidence/double-exposure';mkdirSync(directory,{recursive:true})
  for(const [name,document] of [['before',s],['after',c.document]] as const){const svg=renderToStaticMarkup(<CanvasScene state={document} thumbnail/>);writeFileSync(`${directory}/${name}.svg`,svg);writeFileSync(`${directory}/${name}.png`,new Resvg(svg,{fitTo:{mode:'width',value:512}}).render().asPng())}
 }
 const off=buildDoubleExposure(s,{...defaultDoubleExposureSettings(),subjectId:'subject',second:{layerId:'second'},maskMode:'selection',opacity:0});expect(pixels(off.document)).not.toEqual(p)
 const moved=buildDoubleExposure(s,{...defaultDoubleExposureSettings(),subjectId:'subject',second:{layerId:'second'},maskMode:'selection',dx:20});expect(pixels(moved.document)).not.toEqual(p)
})
it('preserves existing contour and effects; rejects absent, locked, nested or nonimage inputs without writes',()=>{
 const s=doubleFixture();s.layerMasks.subject={selection:s.selection,strokes:[],applied:true,inverted:false}
 const settings={...defaultDoubleExposureSettings(),subjectId:'subject',second:{layerId:'second'},maskMode:'existing' as const}
 const c=buildDoubleExposure(s,settings);expect(c.document.layerMasks[c.subjectId].selection).toEqual(s.selection)
 expect(()=>buildDoubleExposure(s,{...settings,second:{}})).toThrow(/第二图/)
 s.layers[0].locked=true;expect(()=>buildDoubleExposure(s,settings)).toThrow(/锁定/);s.layers[0].locked=false;s.layers[0].kind='text';expect(()=>buildDoubleExposure(s,settings)).toThrow(/图片/)
})
it('supports black/white replacement and different contours with explicit local or downloaded inputs',()=>{
 const s=doubleFixture();s.layers[0].source=png('#ffffff');s.selection=createSelection('ellipse',{x:0,y:0,width:100,height:100});s.selectionRect=s.selection.rect
 const black=buildDoubleExposure(s,{...defaultDoubleExposureSettings(),subjectId:'subject',second:{source:png('#000000'),name:'本地黑图'},maskMode:'selection',opacity:100,blendMode:'multiply'})
 const p=pixels(black.document);expect([...p.slice((8*16+8)*4,(8*16+8)*4+4)]).toEqual([0,0,0,255]);expect(p[3]).toBe(0)
 s.aiResults=[{id:'downloaded',source:png('#ffffff'),prompt:'generated elsewhere',provider:'fixture',model:'fixture',size:'16x16',createdAt:'2026-11-16',status:'success',favorite:false,adopted:false}]
 const white=buildDoubleExposure(s,{...defaultDoubleExposureSettings(),subjectId:'subject',second:{resultId:'downloaded'},maskMode:'selection',opacity:100,blendMode:'multiply'})
 expect(pixels(white.document)).not.toEqual(p);expect(white.document.layers.find(l=>l.id===white.secondId)?.source).toBe(s.aiResults[0].source)
 s.layers[0].groupId='parent';s.layers.push({id:'parent',name:'组',kind:'group',children:['subject'],className:'group',visible:true,opacity:100,blendMode:'正常'});expect(()=>buildDoubleExposure(s,{...defaultDoubleExposureSettings(),subjectId:'subject',second:{source:png('#000000')}})).toThrow(/独立/)
})
