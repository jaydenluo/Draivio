import type { ReactNode } from 'react'
import { effectPadding, validateEffects, type EffectBounds, type LayerEffect, type LayerEffects } from './layerEffects'

/** One shared SVG graph for canvas, preview, raster export and flattened layers. */
export function LayerEffectsFilter({id,effects,width,height,bounds}:{id:string;effects:LayerEffects;width:number;height:number;bounds?:EffectBounds}){
 const items=validateEffects(effects).items.filter(e=>e.enabled),padding=effectPadding(effects)
 if(!items.length)return null
 let current='SourceGraphic',shadow:string|undefined
 const nodes:ReactNode[]=[],resources:ReactNode[]=[]
 const gradient=(e:LayerEffect,n:string)=>{
  const b=e.alignWithLayer&&bounds?bounds:{x:0,y:0,width,height}
  const scale=(e.scale??100)/100,cx=b.x+b.width*(.5+(e.offsetX??0)/100),cy=b.y+b.height*(.5+(e.offsetY??0)/100),a=e.angle*Math.PI/180
  const stops=e.reverse?[...e.stops].reverse().map(s=>({...s,offset:1-s.offset})):e.stops
  const children=stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity/100*e.opacity/100}/>)
  resources.push(e.gradientType==='radial'?<radialGradient key={n+'gradient'} id={n+'gradient'} gradientUnits="userSpaceOnUse" cx={cx} cy={cy} r={Math.max(1,Math.max(b.width,b.height)*scale/2)}>{children}</radialGradient>:<linearGradient key={n+'gradient'} id={n+'gradient'} gradientUnits="userSpaceOnUse" x1={cx-Math.cos(a)*b.width*scale/2} y1={cy-Math.sin(a)*b.height*scale/2} x2={cx+Math.cos(a)*b.width*scale/2} y2={cy+Math.sin(a)*b.height*scale/2}>{children}</linearGradient>)
  // Cover the complete filter region so an outside stroke can also use the gradient.
  resources.push(<rect key={n+'resource'} id={n+'resource'} x={-padding} y={-padding} width={width+padding*2} height={height+padding*2} fill={`url(#${n}gradient)`}/>)
  nodes.push(<feImage key={n+'image'} href={`#${n}resource`} x={-padding} y={-padding} width={width+padding*2} height={height+padding*2} result={n+'color'}/>)
 }
 const color=(e:LayerEffect,n:string)=>{
  if(e.kind==='gradientOverlay'||e.kind==='stroke'&&e.fillType==='gradient')gradient(e,n)
  else nodes.push(<feFlood key={n+'color'} floodColor={e.color} floodOpacity={e.opacity/100} result={n+'color'}/>)
 }
 const blend=(e:LayerEffect,n:string,source:string,preserveAlpha:boolean)=>{
  if(preserveAlpha){
   // Blend straight RGB onto an opaque working copy, then restore the source alpha once.
   // Masking the overlay first and compositing "over" would thicken transparent edges.
   nodes.push(<feComponentTransfer key={n+'opaque'} in={current} result={n+'opaque'}><feFuncA type="linear" slope={0} intercept={1}/></feComponentTransfer>,<feBlend key={n+'blend'} in={source} in2={n+'opaque'} mode={e.blendMode??'normal'} result={n+'blended'}/>,<feComposite key={n+'clip'} in={n+'blended'} in2="SourceAlpha" operator="in" result={n+'over'}/>)
  }else nodes.push(<feBlend key={n+'blend'} in={source} in2={current} mode={e.blendMode??'normal'} result={n+'over'}/>)
  current=n+'over'
 }
 for(const kind of ['shadow','colorOverlay','gradientOverlay','innerShadow','stroke'] as const){
  const e=items.find(item=>item.kind===kind);if(!e)continue
  const n=`${id}-${kind}`,angle=e.useGlobalLight?effects.globalLightAngle??45:e.angle,r=angle*Math.PI/180
  if(kind==='shadow'||kind==='innerShadow'){
   const spread=e.blur*(e.spread??0)/100
   nodes.push(<feMorphology key={n+'spread'} in="SourceAlpha" operator={kind==='shadow'?'dilate':'erode'} radius={spread} result={n+'spread'}/>,<feGaussianBlur key={n+'blur'} in={n+'spread'} stdDeviation={Math.max(0,e.blur-spread)} result={n+'blur'}/>,<feOffset key={n+'offset'} in={n+'blur'} dx={Math.cos(r)*e.distance} dy={Math.sin(r)*e.distance} result={n+'offset'}/>)
   color(e,n)
   if(kind==='shadow'){
    nodes.push(<feComposite key={n+'mask'} in={n+'color'} in2={n+'offset'} operator="in" result={n+'masked'}/>);shadow=n+'masked';continue
   }
   // Shadow occupies the complement of the shifted interior, clipped only after blending.
   nodes.push(<feComposite key={n+'mask'} in={n+'color'} in2={n+'offset'} operator="out" result={n+'masked'}/>)
   blend(e,n,n+'masked',true);continue
  }
  color(e,n)
  if(kind==='colorOverlay'||kind==='gradientOverlay'){blend(e,n,n+'color',true);continue}
  const radius=e.position==='center'?e.width/2:e.width
  if(e.position==='inside')nodes.push(<feMorphology key={n+'m'} in="SourceAlpha" operator="erode" radius={radius} result={n+'m'}/>,<feComposite key={n+'shape'} in="SourceAlpha" in2={n+'m'} operator="out" result={n+'shape'}/>)
  else{
   nodes.push(<feMorphology key={n+'m'} in="SourceAlpha" operator="dilate" radius={radius} result={n+'m'}/>)
   if(e.position==='center')nodes.push(<feMorphology key={n+'e'} in="SourceAlpha" operator="erode" radius={radius} result={n+'e'}/>)
   nodes.push(<feComposite key={n+'shape'} in={n+'m'} in2={e.position==='center'?n+'e':'SourceAlpha'} operator="out" result={n+'shape'}/>)
  }
  nodes.push(<feComposite key={n+'mask'} in={n+'color'} in2={n+'shape'} operator="in" result={n+'masked'}/>)
  blend(e,n,n+'masked',e.position==='inside')
 }
 return <><defs>{resources}</defs><filter id={id} data-layer-effects="true" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x={-padding} y={-padding} width={width+padding*2} height={height+padding*2}>{nodes}{shadow?<feComposite in={current} in2={shadow} operator="over"/>:null}</filter></>
}
