import { useState } from 'react'
import { useEditor } from '../state/editor'
import { selectedObjects, objectLocked, shapeBounds, resizeShape, shapeNames } from '../canvas/objectProperties'
import type { CanvasShape } from '../canvas/documentTypes'
import type { CanvasTextObject } from '../canvas/TextObject'
import { arrangeObjects, type ObjectAlignment } from '../canvas/objectArrangement'
import { NumericScrubber } from './NumericScrubber'
import { ColorPicker } from './ColorPicker'
import { Checkbox } from '../ui/Checkbox'
import { fontChoices } from '../text/systemFonts'
import { insertAnchor, removeAnchor, toggleSmooth } from '../vector/pathGeometry'
import './objectProperties.css'

export function ObjectProperties({compact=false}:{compact?:boolean}){
 const {state,dispatch}=useEditor()
 const objects=selectedObjects(state),shapes=objects.flatMap(o=>o.kind==='shape'?[o.object]:[]),texts=objects.flatMap(o=>o.kind==='text'?[o.object]:[])
 const [lockRatio,setLockRatio]=useState(false),[linked,setLinked]=useState(true),[anchorIndex,setAnchorIndex]=useState(0)
 if(!objects.length)return null
 const disabled=objects.some(o=>objectLocked(state,o.object.layerId))
 const update=(shapePatch:(o:CanvasShape)=>CanvasShape,textPatch?:(o:CanvasTextObject)=>CanvasTextObject)=>{
  if(disabled)return
  dispatch({type:'update-canvas-objects',shapes:shapes.map(shapePatch),texts:textPatch?texts.map(textPatch):undefined})
 }
 const common=<T,>(values:T[])=>({value:values[0],mixed:values.some(v=>v!==values[0])})
 const num=(label:string,values:number[],change:(v:number)=>void,min=0,max=10000,unit?:string)=>{const c=common(values);return <NumericScrubber key={label} className={compact?'tool-option-field':'object-number'} label={label} ariaLabel={`${compact?'对象快捷':'对象'}${label}`} value={c.value??0} mixed={c.mixed} disabled={disabled} min={min} max={max} step={.1} unit={unit} onChange={change}/>}
 const select=(label:string,values:string[],choices:[string,string][],change:(v:string)=>void)=>{const c=common(values);return <label className="object-select" key={label}><span>{label}</span><select aria-label={`${compact?'对象快捷':'对象'}${label}`} disabled={disabled} value={c.mixed?'mixed':c.value} onChange={e=>change(e.target.value)}>{c.mixed?<option value="mixed">混合</option>:null}{choices.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>}
 const color=(label:string,values:string[],change:(v:string)=>void)=>{const c=common(values);return <div className="object-color" key={label}><ColorPicker label={compact?label.replace('颜色',''):label} ariaLabel={compact?`快捷${label}`:label} value={c.value??'#000000'} recentColors={state.recentColors} onChange={v=>{if(!disabled)change(v)}}/>{c.mixed?<small>混合</small>:null}</div>}
 const check=(label:string,values:boolean[],change:(v:boolean)=>void)=>{const c=common(values);return <label className="object-check"><Checkbox aria-label={`${compact?'对象快捷':'对象'}${label}`} disabled={disabled} checked={!!c.value&&!c.mixed} indeterminate={c.mixed} onChange={e=>change(e.target.checked)}/><span>{label}</span></label>}
 const isLine=shapes.length>0&&shapes.every(o=>o.kind==='line'||o.kind==='arrow')
 const appearance=<>
  {color(texts.length===objects.length?'文字颜色':isLine?'线条颜色':'填充颜色',objects.map(o=>o.kind==='shape'&&isLine?o.object.strokeColor??o.object.color:o.object.color),v=>update(o=>isLine?{...o,strokeColor:v,color:v}:{...o,color:v},o=>({...o,color:v})))}
  {shapes.length===objects.length?<>{!isLine?check('填充',shapes.map(o=>o.fillEnabled!==false),v=>update(o=>({...o,fillEnabled:v}))):null}{!isLine?color('描边颜色',shapes.map(o=>o.strokeColor??o.color),v=>update(o=>({...o,strokeColor:v}))):null}{num('描边宽度',shapes.map(o=>o.strokeWidth),v=>update(o=>({...o,strokeWidth:v})),0,500,'px')}</>:null}
  {num('不透明度',objects.map(o=>o.object.opacity??100),v=>update(o=>({...o,opacity:v}),o=>({...o,opacity:v})),0,100,'%')}
 </>
 if(compact)return <div className="object-properties-quick" role="group" aria-label="选中对象快捷属性"><span className="object-editing-badge">{objects.length>1?`已选 ${objects.length} 个对象`:objects[0].kind==='text'?'文字':shapeNames[shapes[0].kind]}</span>{texts.length===objects.length?<>{select('字体',texts.map(o=>o.fontFamily),fontChoices().map(f=>[f.value,f.label]),v=>update(o=>o,o=>({...o,fontFamily:v})))}{num('字号',texts.map(o=>o.fontSize),v=>update(o=>o,o=>({...o,fontSize:v})),1,500,'px')}</>:null}{appearance}{disabled?<span>对象已锁定</span>:null}</div>
 const single=objects.length===1?objects[0]:undefined,shape=single?.kind==='shape'?single.object:undefined,text=single?.kind==='text'?single.object:undefined
 const dimensions=(layerId:string)=>{const l=state.layers.find(l=>l.id===layerId);return {w:l?.contentWidth??state.documentWidth,h:l?.contentHeight??state.documentHeight}}
 const box=(o:typeof objects[number])=>{const d=dimensions(o.object.layerId);return o.kind==='shape'?shapeBounds(o.object):{x:o.object.x,y:o.object.y,width:(o.object.width??160)/d.w*100,height:(o.object.height??o.object.fontSize*1.4)/d.h*100}}
 const geometry=(key:'x'|'y'|'width'|'height',v:number)=>{
  update(o=>{const d=dimensions(o.layerId),r=shapeBounds(o),factor=(key==='x'||key==='width'?d.w:d.h)/100,value=v/factor;const to={...r,[key]:value};if(lockRatio&&(key==='width'||key==='height')){if(key==='width')to.height=r.width?value*r.height/r.width:r.height;else to.width=r.height?value*r.width/r.height:r.width}return resizeShape(o,to)},o=>{const d=dimensions(o.layerId);if(key==='x'||key==='y')return {...o,[key]:v/(key==='x'?d.w:d.h)*100};return {...o,layout:'paragraph',[key]:v,...(lockRatio?key==='width'?{height:v*(o.height??o.fontSize*1.4)/(o.width??160)}:{width:v*(o.width??160)/(o.height??o.fontSize*1.4)}:{})}})
 }
 const lineShapes=shapes.filter(o=>o.kind==='line'||o.kind==='arrow')
 const rectShapes=shapes.filter(o=>o.kind==='rectangle')
 const path=shape?.path,anchor=path?.anchors[Math.min(anchorIndex,path.anchors.length-1)]
 const changePath=(p:NonNullable<CanvasShape['path']>)=>{if(shape)update(o=>o.id===shape.id?{...o,path:p}:o)}
 const align=(mode:ObjectAlignment)=>{if(disabled)return;const next=arrangeObjects(state,mode);dispatch({type:'update-canvas-objects',shapes:next.canvasShapes.filter((o,i)=>o!==state.canvasShapes[i]),texts:next.canvasTexts.filter((o,i)=>o!==state.canvasTexts[i])})}
 return <div className="object-properties" aria-label="选中对象属性">
  <div className="object-properties-heading"><strong>{objects.length>1?`${objects.length} 个对象`:text?'文字属性':`${shapeNames[shape!.kind]}属性`}</strong><button type="button" onClick={()=>dispatch({type:'select-canvas-targets',targets:[]})}>图层属性</button><small>{objects.length>1?'修改共同属性，数值不同显示混合':'正在编辑选中对象'}</small></div>
  {disabled?<p className="object-property-notice">图层不可编辑，请先显示或解锁图层。</p>:null}
  <section><h4>位置与大小{objects.length>1?' · 逐个对象':''}</h4><div className="object-property-grid">{(['x','y','width','height'] as const).map((k,i)=>num(['X','Y','宽度','高度'][i],objects.map(o=>box(o)[k]*(k==='x'||k==='width'?dimensions(o.object.layerId).w:dimensions(o.object.layerId).h)/100),v=>geometry(k,v),i<2?-3276800:0,3276800,'px'))}
  {num('旋转',objects.map(o=>o.object.rotation??0),v=>update(o=>({...o,rotation:v}),o=>({...o,rotation:v})),-180,180,'°')}
  {check('锁定比例',[lockRatio],setLockRatio)}{check('水平翻转',objects.map(o=>!!o.object.flipX),v=>update(o=>({...o,flipX:v}),o=>({...o,flipX:v})))}{check('垂直翻转',objects.map(o=>!!o.object.flipY),v=>update(o=>({...o,flipY:v}),o=>({...o,flipY:v})))}</div></section>
  <section><h4>外观</h4><div className="object-property-grid">{appearance}{shapes.length===objects.length?<>
   {select('描边样式',shapes.map(o=>o.dashArray?'dash':'solid'),[['solid','实线'],['dash','虚线']],v=>update(o=>({...o,dashArray:v==='dash'?'6 4':undefined})))}
   {select('线端',shapes.map(o=>o.strokeLineCap??'round'),[['butt','平头'],['round','圆头'],['square','方头']],v=>update(o=>({...o,strokeLineCap:v as CanvasShape['strokeLineCap']})))}
   {select('连接',shapes.map(o=>o.strokeLineJoin??'round'),[['miter','尖角'],['round','圆角'],['bevel','斜角']],v=>update(o=>({...o,strokeLineJoin:v as CanvasShape['strokeLineJoin']})))}
   {check('描边随对象缩放',shapes.map(o=>o.scaleStroke!==false),v=>update(o=>({...o,scaleStroke:v})))}
  </>:null}</div></section>
  {rectShapes.length===objects.length?<section><h4>矩形圆角</h4>{check('四角联动',[linked],setLinked)}<div className="object-property-grid">{[0,1,2,3].map((i)=>num(['左上','右上','右下','左下'][i],rectShapes.map(o=>o.cornerRadii?.[i]??0),v=>update(o=>({...o,cornerRadii:(linked?[v,v,v,v]:[0,1,2,3].map(j=>j===i?v:o.cornerRadii?.[j]??0)) as [number,number,number,number]})),0,10000,'px'))}</div></section>:null}
  {shapes.length===objects.length&&shapes.every(o=>o.kind==='ellipse')?<section><h4>椭圆</h4><button type="button" disabled={disabled} onClick={()=>{update(o=>{const r=shapeBounds(o),d=dimensions(o.layerId);return resizeShape(o,{...r,height:r.width*d.w/d.h})});setLockRatio(true)}}>设为正圆并锁定比例</button></section>:null}
  {lineShapes.length===objects.length?<section><h4>线条与箭头</h4><div className="object-property-grid">
   {check('起点箭头',lineShapes.map(o=>!!o.arrowStart),v=>update(o=>({...o,arrowStart:v})))}{check('终点箭头',lineShapes.map(o=>o.arrowEnd??o.kind==='arrow'),v=>update(o=>({...o,arrowEnd:v})))}
   {num('箭头长度',lineShapes.map(o=>o.arrowLength??o.strokeWidth*3+8),v=>update(o=>({...o,arrowLength:v})),0,1000,'px')}{num('箭头宽度',lineShapes.map(o=>o.arrowWidth??(o.strokeWidth*3+8)*1.2),v=>update(o=>({...o,arrowWidth:v})),0,1000,'px')}
   {(['from','to'] as const).flatMap((end)=>(['x','y'] as const).map(axis=>num(`${end==='from'?'起点':'终点'} ${axis.toUpperCase()}`,lineShapes.map(o=>(o[end]??(end==='from'?o.rect:{x:o.rect.x+o.rect.width,y:o.rect.y+o.rect.height}))[axis]*dimensions(o.layerId)[axis==='x'?'w':'h']/100),v=>update(o=>{const from=o.from??{x:o.rect.x,y:o.rect.y},to=o.to??{x:o.rect.x+o.rect.width,y:o.rect.y+o.rect.height},p={...(end==='from'?from:to),[axis]:v/dimensions(o.layerId)[axis==='x'?'w':'h']*100};const a=end==='from'?p:from,b=end==='to'?p:to;return {...o,from:a,to:b,rect:{x:Math.min(a.x,b.x),y:Math.min(a.y,b.y),width:Math.abs(a.x-b.x),height:Math.abs(a.y-b.y)}}}),-3276800,3276800,'px')))}
   {shape?num('线段角度',[Math.atan2(((shape.to?.y??shape.rect.y+shape.rect.height)-(shape.from?.y??shape.rect.y))*dimensions(shape.layerId).h,((shape.to?.x??shape.rect.x+shape.rect.width)-(shape.from?.x??shape.rect.x))*dimensions(shape.layerId).w)*180/Math.PI],v=>update(o=>{const a=o.from??o.rect,b=o.to??{x:o.rect.x+o.rect.width,y:o.rect.y+o.rect.height},d=dimensions(o.layerId),len=Math.hypot((b.x-a.x)*d.w/100,(b.y-a.y)*d.h/100),to={x:a.x+Math.cos(v*Math.PI/180)*len/d.w*100,y:a.y+Math.sin(v*Math.PI/180)*len/d.h*100};return {...o,from:{x:a.x,y:a.y},to,rect:{x:Math.min(a.x,to.x),y:Math.min(a.y,to.y),width:Math.abs(a.x-to.x),height:Math.abs(a.y-to.y)}}}),-180,180,'°'):null}
   {shape?num('长度',[Math.hypot(((shape.to?.x??shape.rect.x+shape.rect.width)-(shape.from?.x??shape.rect.x))*dimensions(shape.layerId).w/100,((shape.to?.y??shape.rect.y+shape.rect.height)-(shape.from?.y??shape.rect.y))*dimensions(shape.layerId).h/100)],v=>update(o=>{const a=o.from??o.rect,b=o.to??{x:o.rect.x+o.rect.width,y:o.rect.y+o.rect.height},d=dimensions(o.layerId),angle=Math.atan2((b.y-a.y)*d.h,(b.x-a.x)*d.w);const to={x:a.x+Math.cos(angle)*v/d.w*100,y:a.y+Math.sin(angle)*v/d.h*100};return {...o,from:{x:a.x,y:a.y},to,rect:{x:Math.min(a.x,to.x),y:Math.min(a.y,to.y),width:Math.abs(a.x-to.x),height:Math.abs(a.y-to.y)}}}),0,100000,'px'):null}
  </div></section>:null}
  {text?<section><h4>文字</h4><label className="object-content">内容<textarea aria-label="选中文字内容" value={text.text} disabled={disabled} onChange={e=>update(o=>o,o=>({...o,text:e.target.value}))}/></label><div className="object-property-grid">
   {select('字体',[text.fontFamily],fontChoices().map(f=>[f.value,f.label]),v=>update(o=>o,o=>({...o,fontFamily:v})))}{select('字重',[text.fontWeight],[['300','细体'],['400','常规'],['500','中等'],['700','粗体'],['800','特粗']],v=>update(o=>o,o=>({...o,fontWeight:v})))}
   {num('字号',[text.fontSize],v=>update(o=>o,o=>({...o,fontSize:v})),1,500,'px')}{num('字距',[text.letterSpacing??0],v=>update(o=>o,o=>({...o,letterSpacing:v})),-20,100,'px')}{num('行高',[text.lineHeight??1.4],v=>update(o=>o,o=>({...o,lineHeight:v})),.5,4,'倍')}
   {select('对齐',[text.align],[['left','左对齐'],['center','居中'],['right','右对齐']],v=>update(o=>o,o=>({...o,align:v as CanvasTextObject['align']})))}{select('文字框',[text.layout??'point'],[['point','点文字'],['paragraph','段落文字']],v=>update(o=>o,o=>({...o,layout:v as CanvasTextObject['layout']})))}
  </div></section>:null}
  {path?<section><h4>路径锚点</h4>{check('闭合路径',[path.closed],v=>changePath({...path,closed:v}))}<label className="object-select">锚点<select aria-label="选中路径锚点" value={Math.min(anchorIndex,path.anchors.length-1)} onChange={e=>setAnchorIndex(Number(e.target.value))}>{path.anchors.map((_,i)=><option key={i} value={i}>{i+1}</option>)}</select></label>{anchor?<><div className="object-property-grid">{(['x','y'] as const).map(axis=>num(`锚点 ${axis.toUpperCase()}`,[anchor[axis]],v=>changePath({...path,anchors:path.anchors.map((a,i)=>i===Math.min(anchorIndex,path.anchors.length-1)?{...a,[axis]:v}:a)}),-1000,1000,'%'))}{(['in','out'] as const).flatMap(side=>(['x','y'] as const).map(axis=>num(`${side==='in'?'入':'出'}控制柄 ${axis.toUpperCase()}`,[(anchor[side]??anchor)[axis]],v=>changePath({...path,anchors:path.anchors.map((a,i)=>i===Math.min(anchorIndex,path.anchors.length-1)?{...a,[side]:{...(a[side]??a),[axis]:v}}:a)}),-1000,1000,'%')))}</div><div className="object-property-actions"><button disabled={disabled} onClick={()=>{changePath(insertAnchor(path,anchorIndex+1,{x:anchor.x+2,y:anchor.y+2}));setAnchorIndex(anchorIndex+1)}}>增加锚点</button><button disabled={disabled||path.anchors.length<=2} onClick={()=>{changePath(removeAnchor(path,anchorIndex));setAnchorIndex(0)}}>删除锚点</button><button disabled={disabled} onClick={()=>changePath(toggleSmooth(path,anchorIndex,true))}>平滑</button><button disabled={disabled} onClick={()=>changePath(toggleSmooth(path,anchorIndex,false))}>尖角</button></div></>:null}</section>:null}
  {objects.length>1?<section><h4>对齐与分布</h4><div className="object-property-actions">{(['left','center','right','top','middle','bottom','horizontal','vertical'] as const).map((m,i)=><button key={m} disabled={disabled||(i>5&&objects.length<3)} onClick={()=>align(m)}>{['左对齐','水平居中','右对齐','顶对齐','垂直居中','底对齐','水平分布','垂直分布'][i]}</button>)}</div></section>:null}
 </div>
}
