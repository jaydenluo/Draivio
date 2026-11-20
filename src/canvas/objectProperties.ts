import type { EditorState } from '../state/editor'
import type { CanvasShape } from './documentTypes'
import type { CanvasTextObject } from './TextObject'
import type { SelectionPoint, SelectionRect } from './selectionGeometry'
import type { EditablePath } from '../vector/pathGeometry'
import { effectiveLayerState } from '../state/layerHierarchy'
export type EditableObject={kind:'shape';object:CanvasShape}|{kind:'text';object:CanvasTextObject}
export function selectedObjects(state:EditorState):EditableObject[]{
 return (state.selectedCanvasTargets??[]).flatMap<EditableObject>(t=>{
  if(!state.selectedLayerIds.includes(t.layerId))return []
  if(t.kind==='shape'){const o=state.canvasShapes.find(s=>s.id===t.id&&!s.hidden);return o?[{kind:'shape' as const,object:o}]:[]}
  if(t.kind==='text'){const o=state.canvasTexts.find(s=>s.id===t.id);return o?[{kind:'text' as const,object:o}]:[]}
  return []
 }) as EditableObject[]
}
export function objectLocked(state:EditorState,layerId:string){const l=state.layers.find(l=>l.id===layerId);const e=effectiveLayerState(state.layers,layerId);return !l||e.locked||!e.visible||!!l.smartObject||!!l.highPrecision||state.colorModel==='cmyk'}
export function boundsOf(points:SelectionPoint[]):SelectionRect{
 const xs=points.map(p=>p.x),ys=points.map(p=>p.y)
 return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}
}
export function shapeBounds(s:CanvasShape):SelectionRect{
 if((s.kind==='line'||s.kind==='arrow')&&s.from&&s.to)return boundsOf([s.from,s.to])
 if(s.path?.anchors.length)return boundsOf(s.path.anchors.flatMap(a=>[a,...(a.in?[a.in]:[]),...(a.out?[a.out]:[])]))
 return s.rect
}
export function resizeShape(s:CanvasShape,to:SelectionRect):CanvasShape{
 const from=shapeBounds(s)
 const map=<T extends SelectionPoint>(p:T):T=>({...p,x:to.x+(from.width?(p.x-from.x)/from.width:0)*to.width,y:to.y+(from.height?(p.y-from.y)/from.height:0)*to.height})
 const path=(p:EditablePath):EditablePath=>({...p,anchors:p.anchors.map(a=>({...map(a),in:a.in?map(a.in):undefined,out:a.out?map(a.out):undefined}))})
 return {...s,rect:{...to},from:s.from?map(s.from):undefined,to:s.to?{...map(s.to),...(!from.width?{x:to.x+to.width}:{}),...(!from.height?{y:to.y+to.height}:{})}:undefined,path:s.path?path(s.path):undefined,boolean:s.boolean?{...s.boolean,left:path(s.boolean.left),right:path(s.boolean.right)}:undefined,selection:s.selection?{...s.selection,rect:to,path:{type:'transform',source:s.selection.path,from,to}}:undefined}
}
export function shapePoint(s:CanvasShape,p:SelectionPoint,width:number,height:number,inverse=false):SelectionPoint{
 const r=shapeBounds(s),cx=r.x+r.width/2,cy=r.y+r.height/2
 let x=(p.x-cx)*width/100,y=(p.y-cy)*height/100
 const a=(s.rotation??0)*Math.PI/180*(inverse?-1:1),c=Math.cos(a),n=Math.sin(a)
 if(!inverse){x*=s.flipX?-1:1;y*=s.flipY?-1:1}
 let rx=x*c-y*n,ry=x*n+y*c
 if(inverse){rx*=s.flipX?-1:1;ry*=s.flipY?-1:1}
 return {x:cx+rx/width*100,y:cy+ry/height*100}
}
export function shapeTransform(s:CanvasShape,w:number,h:number){const r=shapeBounds(s),x=(r.x+r.width/2)*w/100,y=(r.y+r.height/2)*h/100;return `translate(${x} ${y}) rotate(${s.rotation??0}) scale(${s.flipX?-1:1} ${s.flipY?-1:1}) translate(${-x} ${-y})`}
export const shapeNames:Record<CanvasShape['kind'],string>={rectangle:'矩形',ellipse:'椭圆',line:'线条',arrow:'箭头',path:'路径',boolean:'组合形状',fill:'填充区域',gradient:'渐变'}
