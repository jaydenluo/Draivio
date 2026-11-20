import { useEffect, useRef } from 'react'
import type { CanvasShape } from './documentTypes'
import { shapeBounds, shapePoint, resizeShape } from './objectProperties'
import type { SelectionPoint } from './selectionGeometry'
import { resizeTransformRect } from './transformGeometry'
import { TOOL_CANCEL_EVENT } from '../tools/useToolShortcuts'
import './objectTransformOverlay.css'

type Props={shape:CanvasShape;width:number;height:number;zoom:number;toPoint:(x:number,y:number)=>SelectionPoint;onPreview:(shape:CanvasShape|null)=>void;onCommit:(shape:CanvasShape)=>void;editPath?:boolean}
export function ObjectTransformOverlay({shape,width,height,zoom,toPoint,onPreview,onCommit,editPath=false}:Props){
 const gesture=useRef<{handle:string;start:SelectionPoint;basis:CanvasShape;latest:CanvasShape}|null>(null)
 const current=useRef({onPreview,onCommit});current.current={onPreview,onCommit}
 useEffect(()=>{const cancel=(e:Event)=>{if(!gesture.current)return;e.preventDefault();e.stopImmediatePropagation();gesture.current=null;current.current.onPreview(null)};window.addEventListener(TOOL_CANCEL_EVENT,cancel);return()=>{window.removeEventListener(TOOL_CANCEL_EVENT,cancel);if(gesture.current)current.current.onPreview(null)}},[])
 const down=(handle:string)=>(event:React.PointerEvent<HTMLButtonElement>)=>{event.preventDefault();event.stopPropagation();event.currentTarget.setPointerCapture?.(event.pointerId);gesture.current={handle,start:toPoint(event.clientX,event.clientY),basis:shape,latest:shape}}
 const move=(event:React.PointerEvent)=>{
  const g=gesture.current;if(!g)return
  event.preventDefault();event.stopPropagation()
  const p=toPoint(event.clientX,event.clientY),r=shapeBounds(g.basis),delta={x:p.x-g.start.x,y:p.y-g.start.y}
  let next=g.basis
  if(g.handle==='rotate'){
   const center={x:r.x+r.width/2,y:r.y+r.height/2},angle=(v:SelectionPoint)=>Math.atan2((v.y-center.y)*height,(v.x-center.x)*width)*180/Math.PI
   let rotation=(g.basis.rotation??0)+angle(p)-angle(g.start)
   if(event.shiftKey)rotation=Math.round(rotation/15)*15
   next={...g.basis,rotation}
  }else if(g.handle==='from'||g.handle==='to'){
   const local=shapePoint(g.basis,p,width,height,true),a=g.basis.from??{x:r.x,y:r.y},b=g.basis.to??{x:r.x+r.width,y:r.y+r.height}
   const from=g.handle==='from'?local:a,to=g.handle==='to'?local:b
   next={...g.basis,from,to,rect:{x:Math.min(from.x,to.x),y:Math.min(from.y,to.y),width:Math.abs(from.x-to.x),height:Math.abs(from.y-to.y)}}
  }else if(g.handle.includes(':')&&g.basis.path){
   const [side,index]=g.handle.split(':'),i=Number(index),local=shapePoint(g.basis,p,width,height,true)
   next={...g.basis,path:{...g.basis.path,anchors:g.basis.path.anchors.map((a,j)=>{if(i!==j)return a;if(side!=='anchor')return {...a,[side]:local};const dx=local.x-a.x,dy=local.y-a.y;return {...a,...local,in:a.in?{x:a.in.x+dx,y:a.in.y+dy}:undefined,out:a.out?{x:a.out.x+dx,y:a.out.y+dy}:undefined}})}}
  }else{
   let handle=g.handle
   if(g.basis.flipX)handle=handle.replace(/[we]/g,c=>c==='w'?'e':'w')
   if(g.basis.flipY)handle=handle.replace(/[ns]/g,c=>c==='n'?'s':'n')
   const to=resizeTransformRect(r,handle,delta,g.basis.rotation??0,event.shiftKey,width/height)
   next=resizeShape(g.basis,to)
   if(g.basis.scaleStroke!==false){const factor=Math.sqrt((r.width?to.width/r.width:1)*(r.height?to.height/r.height:1));next.strokeWidth=g.basis.strokeWidth*factor}
  }
  g.latest=next;onPreview(next)
 }
 const up=(event:React.PointerEvent)=>{event.stopPropagation();const g=gesture.current;gesture.current=null;if(!g)return;if(JSON.stringify(g.latest)!==JSON.stringify(g.basis))onCommit(g.latest);onPreview(null)}
 const cancel=(event:React.PointerEvent)=>{event.stopPropagation();gesture.current=null;onPreview(null)}
 const r=shapeBounds(shape),size=Math.max(5,7/Math.max(.1,zoom/100)),rotation=shape.rotation??0
 const button=(handle:string,p:SelectionPoint,label:string)=> <button key={handle} type="button" className={`object-handle object-handle-${handle}`} aria-label={label} style={{left:`${p.x}%`,top:`${p.y}%`,width:size,height:size}} onPointerDown={down(handle)} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel}/>
 const line=shape.kind==='line'||shape.kind==='arrow'
 return <div className="object-transform-overlay" data-editor-overlay="true" aria-label="图形控制柄">
  <div className="object-transform-box" style={{left:`${r.x}%`,top:`${r.y}%`,width:`${r.width}%`,height:`${r.height}%`,transform:`rotate(${rotation}deg) scale(${shape.flipX?-1:1},${shape.flipY?-1:1})`}}>
   {!line?(['nw','n','ne','e','se','s','sw','w'] as const).map((h,i)=>button(h,[{x:0,y:0},{x:50,y:0},{x:100,y:0},{x:100,y:50},{x:100,y:100},{x:50,y:100},{x:0,y:100},{x:0,y:50}][i],`图形缩放控制点${h}`)):null}
  </div>
  {button('rotate',shapePoint(shape,{x:r.x+r.width/2,y:r.y-24/height*100/(zoom/100)},width,height),'旋转图形')}
  {line?(['from','to'] as const).map(end=>button(end,shapePoint(shape,shape[end]??(end==='from'?r:{x:r.x+r.width,y:r.y+r.height}),width,height),end==='from'?'线条起点':'线条终点')):null}
  {editPath&&shape.path?shape.path.anchors.flatMap((a,i)=>[button(`anchor:${i}`,shapePoint(shape,a,width,height),`路径锚点${i+1}`),...(['in','out'] as const).flatMap(side=>a[side]?[button(`${side}:${i}`,shapePoint(shape,a[side]!,width,height),`路径${i+1}${side==='in'?'入':'出'}控制柄`)]:[])]):null}
 </div>
}
