import { expect,it } from 'vitest'
import { editorReducer,initialEditorState } from '../../state/editor'
import { createSelection } from '../../canvas/selectionGeometry'
import { encodeProject,decodeProject } from '../../document/projectFormat'
import { createProductCandidate,defaultProductSettings,productCanCommit,adoptProductCandidate } from './product'
export function fixture(){const b=structuredClone(initialEditorState);b.layers=b.layers.slice(0,1);b.layers[0].source='data:image/png;base64,aGVsbG8=';b.canvasTexts=[];b.canvasShapes=[];b.brushStrokes=[];b.sceneOrder=[];b.aiResults=[];b.layerMasks={art:{selection:createSelection('rectangle',{x:20,y:10,width:60,height:75}),strokes:[],inverted:false,applied:true}};b.artboards[0].layerIds=['art'];return b}
it('keeps raw source and geometry, creates independent adjustable shadow and background with durable parameters',async()=>{
 const b=fixture(),before=structuredClone(b),c=createProductCandidate(b,'doc',defaultProductSettings())
 expect(b).toEqual(before);expect(c.state.layers[0].source).toBe(b.layers[0].source);expect(c.state.layers[0].transform).toEqual(b.layers[0].transform)
 expect(c.state.layerMasks[c.state.layers[0].id]).toEqual(b.layerMasks.art)
 expect(c.state.layers[1].name).toContain('接触投影');expect(c.state.layers[2].name).toContain('背景')
 const applied=adoptProductCandidate(c,b,'doc');expect(applied.undoStack).toHaveLength(b.undoStack.length+1)
 expect(editorReducer(applied,{type:'undo'}).layers).toEqual(b.layers)
 const loaded=decodeProject(await encodeProject(applied,{id:'p',name:'product'})).document
 expect(loaded.layers[0].productRecipe).toEqual(applied.layers[0].productRecipe)
 expect(loaded.layerMasks![loaded.layers[0].id]).toEqual(b.layerMasks.art)
})
it('isolates cancel, stale state, document switch, locked targets and missing/disabled masks',()=>{
 const b=fixture(),c=createProductCandidate(b,'doc',defaultProductSettings())
 expect(c.state.undoStack).toEqual(b.undoStack);expect(productCanCommit(c,b,'other')).toBe(false)
 const changed=editorReducer(b,{type:'rename-layer',id:'art',name:'manual'});expect(productCanCommit(c,changed,'doc')).toBe(false)
 expect(()=>adoptProductCandidate(c,changed,'doc')).toThrow(/过期/)
 for(const mask of [undefined,{...b.layerMasks.art,applied:false}]){const state:typeof b={...b,layerMasks:mask?{art:mask}:{}};expect(()=>createProductCandidate(state,'doc',defaultProductSettings())).toThrow(/蒙版/)}
 expect(()=>createProductCandidate({...b,layers:b.layers.map(l=>({...l,locked:true}))},'doc',defaultProductSettings())).toThrow(/锁定/)
})
it('moves only explicit product position and contact shadow parameters, accepts existing background without edits',()=>{
 const b=fixture();b.layers.push({...b.layers[0],id:'bg',name:'existing',source:'data:image/png;base64,Ymc='});b.artboards[0].layerIds.push('bg')
 const c=createProductCandidate(b,'doc',{...defaultProductSettings(),background:'existing',backgroundLayerId:'bg',dx:10,dy:-5,shadowX:7,shadowY:3,shadowBlur:4,shadowOpacity:40})
 expect(c.state.layers[2].source).toBe(b.layers[1].source);expect(c.state.layers[0].transform!.rect.x).toBe(10/b.documentWidth*100)
 expect(c.state.layers[1].opacity).toBe(40);expect(c.state.layers.at(-1)).toEqual(b.layers[1])
 expect(()=>createProductCandidate(b,'doc',{...defaultProductSettings(),shadowOpacity:200})).toThrow(/参数/)
})
it('rejects malformed persisted records, locked parents and special layers without touching source or history',async()=>{
 const b=fixture(),c=createProductCandidate(b,'doc',defaultProductSettings()),text=JSON.parse(await encodeProject(c.state,{id:'p',name:'p'}))
 text.document.layers[0].productRecipe.settings.shadowBlur=-1
 expect(()=>decodeProject(JSON.stringify(text))).toThrow(/参数/)
 const group={...b.layers[0],id:'parent',name:'group',kind:'group' as const,source:undefined,children:['art'],locked:true}
 const nested={...b,layers:[group,{...b.layers[0],groupId:'parent'}]}
 expect(()=>createProductCandidate(nested,'doc',defaultProductSettings())).toThrow(/锁定/)
 expect(()=>createProductCandidate({...b,layers:[{...b.layers[0],smartObject:{sourceId:'none',linked:true,instanceWidth:48,instanceHeight:48}}]},'doc',defaultProductSettings())).toThrow(/普通/)
 expect(b.undoStack).toHaveLength(0)
})

import { layerWorldPixelMatrix } from '../../canvas/layerWorldMatrix'
it('uses physical document translation after an existing affine transform and leaves original affine geometry intact',()=>{
 const b=fixture();b.layers[0].transform={kind:'transform',rect:{x:10,y:20,width:60,height:80},rotation:30,flipX:false,flipY:false,affine:[.8,.2,-.1,1.2,4,6]}
 const original=layerWorldPixelMatrix(b.layers,'art',b.documentWidth,b.documentHeight),c=createProductCandidate(b,'doc',{...defaultProductSettings(),dx:10,dy:-6}),moved=layerWorldPixelMatrix(c.state.layers,c.state.layers[0].id,b.documentWidth,b.documentHeight)
 expect(moved.slice(0,4)).toEqual(original.slice(0,4));expect(moved[4]-original[4]).toBeCloseTo(10);expect(moved[5]-original[5]).toBeCloseTo(-6)
})
