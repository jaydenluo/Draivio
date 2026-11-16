import type { ReactNode } from 'react'
import { effectPadding, validateEffects, type LayerEffects } from './layerEffects'
/** Each layer gets its own effect graph; group input already contains its children. */
export function LayerEffectsFilter({id,effects,width,height}:{id:string;effects:LayerEffects;width:number;height:number}){
 const items=validateEffects(effects).items.filter(e=>e.enabled),padding=effectPadding(effects)
 if(!items.length)return null
 let current='SourceGraphic';const nodes:ReactNode[]=[];const resources:ReactNode[]=[];let shadow:string|undefined
 for(const kind of ['shadow','colorOverlay','gradientOverlay','innerShadow','stroke'] as const){const e=items.find(item=>item.kind===kind);if(!e)continue;const n=`${id}-${kind}`,r=e.angle*Math.PI/180,dx=Math.cos(r)*e.distance,dy=Math.sin(r)*e.distance
 if(kind==='shadow'||kind==='innerShadow'){
 nodes.push(<feGaussianBlur key={n+'blur'} in="SourceAlpha" stdDeviation={e.blur} result={n+'blur'}/> ,<feOffset key={n+'offset'} in={n+'blur'} dx={dx} dy={dy} result={n+'offset'}/> )
 if(kind==='innerShadow')nodes.push(<feComposite key={n+'shape'} in="SourceAlpha" in2={n+'offset'} operator="out" result={n+'shape'}/>)
 nodes.push(<feFlood key={n+'color'} floodColor={e.color} floodOpacity={e.opacity/100} result={n+'color'}/>,<feComposite key={n+'mask'} in={n+'color'} in2={kind==='shadow'?n+'offset':n+'shape'} operator="in" result={n+'masked'}/>)
 if(kind==='shadow'){shadow=n+'masked';continue}
 }
 if(kind==='colorOverlay')nodes.push(<feFlood key={n+'flood'} floodColor={e.color} floodOpacity={e.opacity/100} result={n+'color'}/>,<feComposite key={n+'mask'} in={n+'color'} in2="SourceAlpha" operator="in" result={n+'masked'}/>)
 if(kind==='gradientOverlay'){
 const a=e.angle*Math.PI/180,x=Math.cos(a)*50,y=Math.sin(a)*50
 resources.push(<linearGradient key={n+'gradient'} id={n+'gradient'} x1={`${50-x}%`} y1={`${50-y}%`} x2={`${50+x}%`} y2={`${50+y}%`}>{e.stops.map((s,i)=><stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={s.opacity/100*e.opacity/100}/>)}</linearGradient>,<rect key={n+'resource'} id={n+'resource'} width={width} height={height} fill={`url(#${n}gradient)`}/>)
 nodes.push(<feImage key={n+'image'} href={`#${n}resource`} x={0} y={0} width={width} height={height} result={n+'image'}/>,<feComposite key={n+'mask'} in={n+'image'} in2="SourceAlpha" operator="in" result={n+'masked'}/>)
 }
 if(kind==='stroke'){
 const radius=e.position==='center'?e.width/2:e.width
 if(e.position==='inside')nodes.push(<feMorphology key={n+'m'} in="SourceAlpha" operator="erode" radius={radius} result={n+'m'}/>,<feComposite key={n+'shape'} in="SourceAlpha" in2={n+'m'} operator="out" result={n+'shape'}/>)
 else {nodes.push(<feMorphology key={n+'m'} in="SourceAlpha" operator="dilate" radius={radius} result={n+'m'}/>);if(e.position==='center')nodes.push(<feMorphology key={n+'e'} in="SourceAlpha" operator="erode" radius={radius} result={n+'e'}/>);nodes.push(<feComposite key={n+'shape'} in={n+'m'} in2={e.position==='center'?n+'e':'SourceAlpha'} operator="out" result={n+'shape'}/>)}
 nodes.push(<feFlood key={n+'color'} floodColor={e.color} floodOpacity={e.opacity/100} result={n+'color'}/>,<feComposite key={n+'mask'} in={n+'color'} in2={n+'shape'} operator="in" result={n+'masked'}/>)
 }
 nodes.push(<feComposite key={n+'over'} in={n+'masked'} in2={current} operator="over" result={n+'over'}/>);current=n+'over'
 }
 return <><defs>{resources}</defs><filter id={id} data-layer-effects="true" colorInterpolationFilters="sRGB" filterUnits="userSpaceOnUse" x={-padding} y={-padding} width={width+padding*2} height={height+padding*2}>{nodes}{shadow?<feComposite in={shadow} in2={current} operator="over"/>:null}</filter></>
}
