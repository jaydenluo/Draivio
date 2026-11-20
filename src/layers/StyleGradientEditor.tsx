import { useState } from 'react'
import { ColorPicker } from '../components/ColorPicker'
import type { EffectStop } from '../render/layerEffects'
import { StyleNumber } from './StyleParameter'
export function StyleGradientEditor({stops,onChange,disabled=false}:{stops:EffectStop[];onChange:(stops:EffectStop[])=>void;disabled?:boolean}){
 const [selected,setSelected]=useState(0),index=Math.min(selected,stops.length-1),stop=stops[index]
 const update=(patch:Partial<EffectStop>)=>onChange(stops.map((s,i)=>i===index?{...s,...patch}:s))
 const move=(i:number,offset:number)=>{if(disabled)return;onChange(stops.map((s,n)=>n===i?{...s,offset:Math.max(stops[i-1]?.offset??0,Math.min(stops[i+1]?.offset??1,Math.round(offset*100)/100))}:s))}
 const add=(at?:number)=>{
  if(disabled||stops.length>=16)return
  const gap=stops.slice(1).map((s,i)=>({left:stops[i],right:s})).sort((a,b)=>(b.right.offset-b.left.offset)-(a.right.offset-a.left.offset))[0]
  const offset=at??(gap.left.offset+gap.right.offset)/2,right=stops.find(s=>s.offset>=offset)??stops.at(-1)!,left=[...stops].reverse().find(s=>s.offset<=offset)??stops[0],t=(offset-left.offset)/(right.offset-left.offset||1)
  const channel=(hex:string,k:number)=>parseInt(hex.slice(k,k+2),16)
  const color='#'+[1,3,5].map(k=>Math.round(channel(left.color,k)+(channel(right.color,k)-channel(left.color,k))*t).toString(16).padStart(2,'0')).join('')
  const alpha=(s:EffectStop)=>s.opacity*(s.color.length===9?parseInt(s.color.slice(7),16)/255:1)
  const next=[...stops,{offset,color,opacity:Math.round(alpha(left)+(alpha(right)-alpha(left))*t)}].sort((a,b)=>a.offset-b.offset)
  setSelected(next.findIndex(s=>s.offset===offset));onChange(next)
 }
 const background=`linear-gradient(90deg,${stops.map(s=>`${s.color.slice(0,7)}${Math.round(s.opacity/100*(s.color.length===9?parseInt(s.color.slice(7),16)/255:1)*255).toString(16).padStart(2,'0')} ${s.offset*100}%`).join(',')})`
 return <div className="style-gradient-editor">
  <div className="style-gradient-track checkerboard" aria-label="渐变色标编辑条" onPointerDown={e=>{if(e.target!==e.currentTarget||e.button!==0)return;const r=e.currentTarget.getBoundingClientRect();add(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)))}} style={{backgroundImage:`${background},conic-gradient(#252b32 25%,transparent 0 50%,#252b32 0 75%,transparent 0)`,backgroundSize:'100% 100%,16px 16px'}}>
   {stops.map((s,i)=><button key={i} type="button" role="slider" aria-label={`色标 ${i+1}`} aria-valuemin={(stops[i-1]?.offset??0)*100} aria-valuemax={(stops[i+1]?.offset??1)*100} aria-valuenow={s.offset*100} aria-valuetext={`${Math.round(s.offset*100)}%`} disabled={disabled} className={`style-gradient-stop${index===i?' selected':''}`} style={{left:`${s.offset*100}%`,background:s.color.slice(0,7)}} onClick={()=>setSelected(i)} onKeyDown={e=>{
    if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(stops.length>2){onChange(stops.filter((_,n)=>n!==i));setSelected(Math.max(0,i-1))}return}
    if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();setSelected(i);move(i,e.key==='Home'?0:e.key==='End'?1:s.offset+(e.key==='ArrowRight'?1:-1)*(e.shiftKey?.1:.01))}
   }} onPointerDown={e=>{if(e.button!==0)return;e.stopPropagation();setSelected(i);e.currentTarget.setPointerCapture?.(e.pointerId)}} onPointerMove={e=>{if(!e.currentTarget.hasPointerCapture?.(e.pointerId))return;const r=e.currentTarget.parentElement!.getBoundingClientRect();move(i,(e.clientX-r.left)/r.width)}} onPointerUp={e=>e.currentTarget.releasePointerCapture?.(e.pointerId)}/>)}
  </div>
  <div className="style-gradient-buttons"><small>点击添加 · 拖动色标 · Delete 删除</small><button type="button" disabled={disabled||stops.length>=16} onClick={()=>add()}>添加色标</button><button type="button" disabled={disabled||stops.length<=2} onClick={()=>{onChange(stops.filter((_,i)=>i!==index));setSelected(Math.max(0,index-1))}}>删除色标</button></div>
  <ColorPicker label="色标颜色" ariaLabel={`渐变色标${index+1}颜色`} value={stop.color.slice(0,7)} onChange={color=>update({color:color+(stop.color.length===9?stop.color.slice(7):'')})}/>
  <StyleNumber label="位置" name={`渐变色标${index+1}位置`} value={stop.offset*100} min={(stops[index-1]?.offset??0)*100} max={(stops[index+1]?.offset??1)*100} onChange={v=>move(index,v/100)}/>
  <StyleNumber label="色标透明度" name={`渐变色标${index+1}透明度`} value={stop.opacity} onChange={opacity=>update({opacity})}/>
 </div>
}
