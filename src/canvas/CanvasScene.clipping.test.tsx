import { render, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Resvg } from '@resvg/resvg-js'
import { CanvasScene } from './CanvasScene'
import { initialEditorState, editorReducer, type EditorState, type Layer } from '../state/editor'
import { serializeExport } from '../render/serializeExport'
import { BLEND_MODES, blendPixel } from '../render/blendModes'
import { encodeProject, decodeProject } from '../document/projectFormat'
const layer=(id:string,opacity=100):Layer=>({id,name:id,className:'layer-art',visible:true,opacity,blendMode:'正常'})
const base=():EditorState=>({...structuredClone(initialEditorState),documentWidth:16,documentHeight:16,documentBackground:'transparent',layers:[layer('top',70),layer('base',50)],selectedLayerId:'top',selectedLayerIds:['top'],brushStrokes:[],canvasTexts:[],canvasShapes:[{id:'s1',layerId:'base',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#3d9dd0',strokeWidth:0},{id:'s2',layerId:'top',kind:'rectangle',rect:{x:0,y:0,width:100,height:100},color:'#c95327',strokeWidth:0}],sceneOrder:['s1','s2']})
function pixels(s:EditorState,range:'canvas'|'layer'='canvas') {
 const view=render(<CanvasScene state={s}/>),svg=view.container.querySelector('svg')!
 const source=serializeExport(svg,{range,selectedLayerId:s.selectedLayerId})
 const image=new Resvg(source).render(),data=new Uint8ClampedArray(image.pixels);view.unmount()
 for(let i=0;i<data.length;i+=4)if(data[i+3])for(let c=0;c<3;c++)data[i+c]=Math.round(data[i+c]*255/data[i+3])
 return {data,source,width:image.width}
}
const pixel=(p:ReturnType<typeof pixels>,x=8,y=8)=>[...p.data.slice((y*p.width+x)*4,(y*p.width+x)*4+4)]
afterEach(cleanup)
it.each(BLEND_MODES)('actual CanvasScene/serializeExport pixels implement $id on partial alpha and transparent backdrop',mode=>{
 const s=base();s.layers[0].blendMode=mode.id
 const actual=pixel(pixels(s)),expected=blendPixel([61,157,208,128],[201,83,39,179],mode.id)
 actual.forEach((v,i)=>expect(Math.abs(v-expected[i]),`${mode.id} channel ${i}: ${actual}/${expected}`).toBeLessThanOrEqual(2))
 s.layers[1].visible=false
 const solo=pixel(pixels(s));solo.forEach((v,i)=>expect(Math.abs(v-[201,83,39,179][i])).toBeLessThanOrEqual(2))
})
it('clips multiple layers to base alpha once, including base movement, release and deletion',()=>{
 let s=base();s.layers[0].opacity=100;s.layers[1].opacity=50;s.canvasShapes[0].rect={x:25,y:25,width:50,height:50}
 s=editorReducer(s,{type:'create-clipping',id:'top'})
 const p=pixels(s);expect(pixel(p,2,2)[3]).toBe(0);expect(pixel(p)[3]).toBe(128);expect(pixel(p)[0]).toBeGreaterThan(195)
 s=editorReducer(s,{type:'duplicate-layer',id:'top'});s.layers[0].opacity=50
 expect(pixel(pixels(s))[3]).toBe(128)
 const moved=editorReducer(s,{type:'commit-layer-transform',layerId:'base',transform:{kind:'transform',rect:{x:25,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}})
 expect(pixel(pixels(moved),5,8)[3]).toBe(0);expect(pixel(pixels(moved),12,8)[3]).toBe(128)
 const released=editorReducer(s,{type:'release-clipping',id:'top'});expect(pixel(pixels(released),2,2)[3]).toBeGreaterThan(0)
 const deleted=editorReducer(s,{type:'delete-layer',id:'base'});expect(deleted.layers.every(l=>!l.clipBaseId)).toBe(true);expect(pixel(pixels(deleted),2,2)[3]).toBeGreaterThan(0)
})
it('nested clipping, export layer, undo and project reopening preserve pixel semantics',async()=>{
 let s=base();s.layers.unshift({...layer('group'),children:['top','base'],transform:{kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}});s.layers.slice(1).forEach(l=>l.groupId='group')
 s=editorReducer(s,{type:'create-clipping',id:'top'});s.layers[1].blendMode='柔光'
 const before=pixels(s)
 const project=await encodeProject(s,{id:'fixture',name:'clip'})
 const reopened={...s,...decodeProject(project).document} as EditorState
 expect([...pixels(reopened).data]).toEqual([...before.data])
 const released=editorReducer(s,{type:'release-clipping',id:'top'}),undone=editorReducer(released,{type:'undo'})
 expect([...pixels(undone).data]).toEqual([...before.data])
 expect(pixel(pixels(s,'layer'))[3]).toBeCloseTo(89,0)
})
it('transformed semi-transparent text, adjustment filter and scaled parent retain exactly the base alpha at AA edges',()=>{
 let s=base();s.documentWidth=64;s.documentHeight=64;s.layers[0].opacity=100;s.layers[1].opacity=65
 s.layers.unshift({...layer('group'),contentWidth:32,contentHeight:32,children:['top','base'],transform:{kind:'transform',rect:{x:10,y:5,width:90,height:90},rotation:13,flipX:false,flipY:false}})
 s.layers.slice(1).forEach(l=>l.groupId='group')
 s.layers[2].transform={kind:'transform',rect:{x:5,y:3,width:75,height:80},rotation:-9,flipX:false,flipY:false}
 s.layers[2].adjustments={brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:1,shadows:0,highlights:0}
 s.canvasShapes=s.canvasShapes.filter(shape=>shape.layerId==='top')
 s.canvasTexts=[{id:'text',layerId:'base',x:5,y:5,text:'Aa',fontSize:20,fontFamily:'sans-serif',fontWeight:'700',color:'#28a75c',align:'left'}];s.sceneOrder=['text','s2']
 const baseOnly={...s,layers:s.layers.map(l=>l.id==='top'?{...l,visible:false}:l)}
 const expected=pixels(baseOnly);s=editorReducer(s,{type:'create-clipping',id:'top'});const actual=pixels(s)
 let partial=0
 for(let i=3;i<actual.data.length;i+=4){expect(Math.abs(actual.data[i]-expected.data[i])).toBeLessThanOrEqual(1);if(expected.data[i]>0&&expected.data[i]<120)partial++}
 expect(partial).toBeGreaterThan(5)
})
it('single clipped-layer export keeps its alpha dependency without painting base RGB',()=>{
 let s=base();s.layers[0].opacity=100;s.layers[1].opacity=50;s.canvasShapes[0].rect={x:25,y:25,width:50,height:50}
 s=editorReducer(s,{type:'create-clipping',id:'top'});const p=pixels(s,'layer')
 expect(pixel(p,2,2)[3]).toBe(0);expect(pixel(p)).toEqual([201,84,40,128])
})
it('rejects invalid imported blend and clipping dependencies with explicit errors',async()=>{
 const raw=JSON.parse(await encodeProject(base(),{id:'invalid',name:'invalid'}))
 raw.document.layers[0].blendMode='dissolve';expect(()=>decodeProject(JSON.stringify(raw))).toThrow(/不支持的混合模式/)
 raw.document.layers[0].blendMode='正常';raw.document.layers[0].clipBaseId='missing';expect(()=>decodeProject(JSON.stringify(raw))).toThrow(/剪贴链/)
})
it.each(BLEND_MODES)('$id matches independent per-pixel composition at translucent antialiased shape edges',mode=>{
 const s=base();s.layers[0].blendMode=mode.id;s.canvasShapes[0].kind='ellipse';s.canvasShapes[0].rect={x:4,y:7,width:90,height:85};s.canvasShapes[1].kind='ellipse';s.canvasShapes[1].rect={x:12,y:4,width:78,height:90}
 const actual=pixels(s),bottom=pixels({...s,layers:s.layers.map(l=>l.id==='top'?{...l,visible:false}:l)}),top=pixels({...s,layers:s.layers.map(l=>l.id==='base'?{...l,visible:false,}: {...l,blendMode:'正常'})})
 let edges=0
 for(let i=0;i<actual.data.length;i+=4){
  const expected=blendPixel([...bottom.data.slice(i,i+4)],[...top.data.slice(i,i+4)],mode.id)
  for(let c=0;c<3;c++)expect(Math.abs(actual.data[i+c]*actual.data[i+3]/255-expected[c]*expected[3]/255)).toBeLessThanOrEqual(2)
  expect(Math.abs(actual.data[i+3]-expected[3])).toBeLessThanOrEqual(1)
  if(top.data[i+3]>0&&top.data[i+3]<170)edges++
 }
 expect(edges).toBeGreaterThan(10)
})
it.each(['multiply','screen','hue'])('a group used as clipping base preserves descendant %s colors and alpha',mode=>{
 const s=base();s.layers[0].opacity=0;s.layers[1].children=['front','back'];s.layers[1].kind='group'
 s.layers.push({...layer('front',70),groupId:'base',blendMode:mode},{...layer('back',80),groupId:'base'})
 s.canvasShapes=s.canvasShapes.map(shape=>({...shape,layerId:shape.layerId==='top'?'front':'back'}))
 const reference=pixels(s)
 const clipped=editorReducer(s,{type:'create-clipping',id:'top'}),actual=pixels(clipped)
 for(let i=0;i<actual.data.length;i++)expect(Math.abs(actual.data[i]-reference.data[i])).toBeLessThanOrEqual(2)
})
