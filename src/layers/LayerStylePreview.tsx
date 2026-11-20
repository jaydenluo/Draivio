import { useMemo,useRef,useState } from 'react'
import { CanvasScene } from '../canvas/CanvasScene'
import type { EditorState } from '../state/editor'
import { layerParentId,layerSubtreeIds } from '../state/layerHierarchy'
import { effectPadding,type LayerEffect,type LayerEffects } from '../render/layerEffects'
import { layerEffectBounds } from '../render/layerEffectBounds'
export function LayerStylePreview({state,layerId,effects,enabled,active,onShadowMove}:{state:EditorState;layerId:string;effects:LayerEffects;enabled:boolean;active:LayerEffect;onShadowMove:(patch:Partial<LayerEffect>)=>void}){
 const [compare,setCompare]=useState(false)
 const drag=useRef<{id:number;x:number;y:number;dx:number;dy:number;scale:number}|null>(null)
 const prepared=useMemo(()=>{
  const ids=new Set(layerSubtreeIds(state.layers,layerId)),ancestors=new Set<string>()
  let parent=layerParentId(state.layers,layerId)
  while(parent&&!ancestors.has(parent)){ancestors.add(parent);parent=layerParentId(state.layers,parent)}
  const layers=state.layers.filter(l=>ids.has(l.id)||ancestors.has(l.id)).map(l=>({...l,visible:true,...(ancestors.has(l.id)?{effects:undefined,source:undefined}:{}),...(l.id===layerId?{effects:compare||!enabled?undefined:effects}:{})}))
  const isolated={...state,layers,canvasShapes:state.canvasShapes.filter(s=>ids.has(s.layerId)),canvasTexts:state.canvasTexts.filter(t=>ids.has(t.layerId)),brushStrokes:state.brushStrokes.filter(s=>ids.has(s.layerId)),documentBackground:'transparent',proofSettings:{...state.proofSettings,enabled:false}}
  const root=layers.find(l=>!layerParentId(layers,l.id))?.id??layerId,b=layerEffectBounds(isolated,root),padding=Math.max(12,effectPadding(effects)+8)
  return {state:isolated,bounds:{x:b.x-padding,y:b.y-padding,width:b.width+padding*2,height:b.height+padding*2}}
 },[state,layerId,effects,enabled,compare])
 const movable=active.kind==='shadow'&&active.enabled
 return <aside className="style-preview-pane" aria-label="图层样式局部预览"><h4>效果预览</h4><div className={`style-preview-image checkerboard${movable?' movable':''}`} onPointerDown={e=>{
  if(!movable||e.button!==0)return
  const angle=(active.useGlobalLight?effects.globalLightAngle??45:active.angle)*Math.PI/180,r=e.currentTarget.getBoundingClientRect()
  drag.current={id:e.pointerId,x:e.clientX,y:e.clientY,dx:Math.cos(angle)*active.distance,dy:Math.sin(angle)*active.distance,scale:Math.max(prepared.bounds.width/r.width,prepared.bounds.height/r.height)};e.currentTarget.setPointerCapture?.(e.pointerId)
 }} onPointerMove={e=>{
  const start=drag.current;if(!start||start.id!==e.pointerId)return
  const dx=start.dx+(e.clientX-start.x)*start.scale,dy=start.dy+(e.clientY-start.y)*start.scale
  onShadowMove({distance:Math.min(512,Math.round(Math.hypot(dx,dy))),angle:Math.round(Math.atan2(dy,dx)*180/Math.PI)})
 }} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}><CanvasScene thumbnail state={prepared.state} previewBounds={prepared.bounds}/></div>
 <button type="button" className="style-compare" aria-pressed={compare} onPointerDown={e=>{e.currentTarget.setPointerCapture?.(e.pointerId);setCompare(true)}} onPointerUp={()=>setCompare(false)} onPointerCancel={()=>setCompare(false)} onBlur={()=>setCompare(false)} onKeyDown={e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();setCompare(true)}}} onKeyUp={()=>setCompare(false)}>按住对比原始</button><small>{movable?'拖动预览中的投影以调整位置':'棋盘表示透明区域'}</small>
 </aside>
}
