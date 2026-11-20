import type { EditorState } from '../state/editor'
import { layerMatrix } from '../canvas/layerCoordinates'
import { layerParentId } from '../state/layerHierarchy'
import { paragraphMeasurer } from '../text/paragraphLayout'
import type { EffectBounds } from './layerEffects'
const union=(rects:EffectBounds[]):EffectBounds=>{
 const x=Math.min(...rects.map(r=>r.x)),y=Math.min(...rects.map(r=>r.y))
 return {x,y,width:Math.max(1,Math.max(...rects.map(r=>r.x+r.width))-x),height:Math.max(1,Math.max(...rects.map(r=>r.y+r.height))-y)}
}
/** Geometric content bounds in the layer filter's parent coordinate space, independent of selection/locks. */
export function layerEffectBounds(state:EditorState,id:string,visited=new Set<string>()):EffectBounds{
 const layer=state.layers.find(l=>l.id===id),w=state.documentWidth,h=state.documentHeight
 if(!layer||visited.has(id))return {x:0,y:0,width:w,height:h}
 const cw=layer.contentWidth??w,ch=layer.contentHeight??h,rects:EffectBounds[]=[]
 const local=(r:EffectBounds)=>({x:r.x*cw/100,y:r.y*ch/100,width:r.width*cw/100,height:r.height*ch/100})
 if(layer.source||layer.smartObject)rects.push(local({x:layer.sourceOffset?.x??0,y:layer.sourceOffset?.y??0,width:100,height:100}))
 for(const s of state.canvasShapes.filter(s=>s.layerId===id&&!s.hidden))rects.push(local(s.rect))
 for(const t of state.canvasTexts.filter(t=>t.layerId===id)){
  const measured=Math.max(1,...t.text.split('\n').map(paragraphMeasurer(t.fontSize,t.letterSpacing??0,t)))
  const width=t.layout==='paragraph'?t.width??160:measured,height=t.layout==='paragraph'?t.height??t.fontSize*1.4:t.text.split('\n').length*t.fontSize*(t.lineHeight??1.4)
  const x=t.x*cw/100-(t.layout!=='paragraph'?(t.align==='center'?width/2:t.align==='right'?width:0):0),y=t.y*ch/100,a=(t.rotation??0)*Math.PI/180
  const points=[[0,0],[width,0],[0,height],[width,height]].map(([dx,dy])=>({x:x+dx*Math.cos(a)-dy*Math.sin(a),y:y+dx*Math.sin(a)+dy*Math.cos(a),width:0,height:0}))
  rects.push(union(points))
 }
 for(const stroke of state.brushStrokes.filter(s=>s.layerId===id&&s.points.length)){
  const pad=stroke.size/2,points=stroke.points.map(p=>({x:p.x*cw/100-pad,y:p.y*ch/100-pad,width:pad*2,height:pad*2}));rects.push(union(points))
 }
 for(const child of state.layers.filter(l=>layerParentId(state.layers,l.id)===id&&l.visible))rects.push(layerEffectBounds(state,child.id,new Set([...visited,id])))
 const b=rects.length?union(rects):{x:0,y:0,width:cw,height:ch}
 const m=layer.transform?layerMatrix(layer.transform,w,h):[1,0,0,1,0,0]
 return union([[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:(m[0]*x/cw+m[2]*y/ch)*w+m[4]*w/100,y:(m[1]*x/cw+m[3]*y/ch)*h+m[5]*h/100,width:0,height:0})))
}
