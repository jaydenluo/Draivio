import { expect, test } from 'vitest'
import { initialEditorState, type EditorState } from '../../state/editor'
import { captureEditorContext } from './editorContext'
const state = () => structuredClone(initialEditorState)
test('rejects missing targets, empty selections and inherited group locks', () => {
 const s=state(); s.layers=[{...s.layers[0],id:'group',locked:true,children:['child']},{...s.layers[0],id:'child',groupId:'group'}]; s.selectedLayerId='child'
 expect(()=>captureEditorContext(s,'doc','layer')).toThrow(/锁定/)
 s.layers=[]; expect(()=>captureEditorContext(s,'doc','layer')).toThrow(/图层/)
 s.layers=state().layers; s.selectedLayerId=s.layers[0].id; s.selectionVisible=false; expect(()=>captureEditorContext(s,'doc','selection')).toThrow(/选区/)
})
test('freezes IDs, tree, source selection and coordinates independently of view state', () => {
 const s=state(); s.documentWidth=2000; s.documentHeight=1000
 const a=captureEditorContext(s,'doc','selection'); const target=s.selectedLayerId
 s.selectedLayerId='different'; s.selection.rect.x=90; s.layers[0].name='changed';
 expect(a.targetLayerId).toBe(target); expect(a.selection?.rect.x).not.toBe(90); expect(a.layers[0].name).not.toBe('changed')
 const viewed={...state(),documentWidth:2000,documentHeight:1000,zoom:400,canvasRotation:90,canvasOffset:{x:99,y:33}} as EditorState
 const b=captureEditorContext(viewed,'doc','selection')
 expect(a.pixelBounds).toEqual(b.pixelBounds); expect(a.preview).toEqual({width:1024,height:512,scale:.512})
 expect(Object.isFrozen(a.selection?.rect)).toBe(true)
})
test('whole-document generation allows no layers and revision ignores selection and view changes',()=>{
 const s=state(); const a=captureEditorContext(s,'doc','document'); s.zoom=25; s.canvasRotation=180; s.selectedLayerId='other'; s.selectionVisible=false
 expect(captureEditorContext(s,'doc','document').revision).toBe(a.revision)
 s.layers=[];expect(captureEditorContext(s,'doc','document').targetLayerId).toBeNull()
})
test('transformed layer bounds and mapping are captured and off-canvas targets are rejected', () => {
 const s=state(); s.documentWidth=1000; s.documentHeight=1000
 s.layers[0].transform={kind:'transform',rect:{x:20,y:30,width:40,height:20},rotation:90,flipX:false,flipY:false}
 const context=captureEditorContext(s,'doc','layer')
 expect(context.pixelBounds.x).toBeCloseTo(300)
 expect(context.pixelBounds.y).toBeCloseTo(200)
 expect(context.pixelBounds.width).toBeCloseTo(200)
 expect(context.pixelBounds.height).toBeCloseTo(400)
 s.layers[0].transform!.rect.x=200
 expect(context.targetToDocument).not.toEqual(captureEditorContext(state(),'doc','layer').targetToDocument)
 expect(()=>captureEditorContext(s,'doc','layer')).toThrow(/画布外/)
})

test('nested content dimensions and ancestor transforms match the rendered SVG chain', async () => {
 const { render } = await import('@testing-library/react')
 const { createElement } = await import('react')
 const { CanvasScene } = await import('../../canvas/CanvasScene')
 const s=state(); s.documentWidth=1000; s.documentHeight=800
 const base=s.layers[0]
 s.layers=[
  {...base,id:'outer',source:undefined,contentWidth:500,contentHeight:400,transform:{kind:'transform',rect:{x:25,y:25,width:50,height:50},rotation:90,flipX:false,flipY:false}},
  {...base,id:'inner',source:undefined,groupId:'outer',contentWidth:2000,contentHeight:1600,transform:{kind:'transform',rect:{x:10,y:10,width:30,height:30},rotation:-90,flipX:false,flipY:false}},
  {...base,id:'target',source:undefined,groupId:'inner',contentWidth:200,contentHeight:100,transform:{kind:'transform',rect:{x:10,y:10,width:20,height:20},rotation:15,flipX:false,flipY:false}},
 ]
 s.selectedLayerId='target'
 const {container}=render(createElement(CanvasScene,{state:s}))
 // Evaluate SVG's transform attributes independently in their actual physical coordinate units.
 const apply=(value:string|null,p:{x:number;y:number})=>{
  const ops=[...(value??'').matchAll(/(translate|rotate|scale)\(([^)]+)\)/g)]
  return ops.reverse().reduce((point,op)=>{
   const v=op[2].trim().split(/[ ,]+/).map(Number)
   if(op[1]==='translate')return {x:point.x+v[0],y:point.y+(v[1]??0)}
   if(op[1]==='scale')return {x:point.x*v[0],y:point.y*(v[1]??v[0])}
   const a=v[0]*Math.PI/180;return {x:point.x*Math.cos(a)-point.y*Math.sin(a),y:point.x*Math.sin(a)+point.y*Math.cos(a)}
  },p)
 }
 const actual=(p:{x:number;y:number})=>['target','inner','outer'].reduce((point,id)=>apply(container.querySelector(`[data-layer-transform="${id}"]`)!.getAttribute('transform'),point),p)
 const context=captureEditorContext(s,'doc','layer')
 const [a,b,c,d,e,f]=context.targetToDocument
 const corners=[{x:0,y:0},{x:200,y:0},{x:200,y:100},{x:0,y:100}].map(actual)
 for(const p of [{x:0,y:0},{x:73,y:29},{x:200,y:100}]){
  const expected=actual(p), x=p.x/200*100,y=p.y/100*100
  expect((a*x+c*y+e)/100*1000).toBeCloseTo(expected.x)
  expect((b*x+d*y+f)/100*800).toBeCloseTo(expected.y)
 }
 expect(context.pixelBounds.x).toBeCloseTo(Math.max(0,Math.min(...corners.map(p=>p.x))))
 expect(context.pixelBounds.y).toBeCloseTo(Math.max(0,Math.min(...corners.map(p=>p.y))))
 expect(context.pixelBounds.width).toBeCloseTo(Math.min(1000,Math.max(...corners.map(p=>p.x)))-context.pixelBounds.x)
 expect(context.pixelBounds.height).toBeCloseTo(Math.min(800,Math.max(...corners.map(p=>p.y)))-context.pixelBounds.y)
})

test('an ancestor without an explicit transform still scales its child by content dimensions', () => {
 const s=state(); s.documentWidth=1000; s.documentHeight=800
 const base=s.layers[0]
 s.layers=[{...base,id:'parent',contentWidth:2000,contentHeight:1600,transform:undefined},
  {...base,id:'child',groupId:'parent',contentWidth:200,contentHeight:100,transform:{kind:'transform',rect:{x:20,y:20,width:40,height:40},rotation:0,flipX:false,flipY:false}}]
 s.selectedLayerId='child'
 expect(captureEditorContext(s,'doc','layer').pixelBounds).toEqual({x:100,y:80,width:200,height:160})
})
