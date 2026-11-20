import { useEffect, useRef } from 'react'
import type { LevelsSettings } from '../adjustments/levels'

type Handle = keyof LevelsSettings
type Props = { levels:LevelsSettings; output?:boolean; histogram?:Uint32Array|number[]; disabled?:boolean; onPreview:(next:LevelsSettings)=>void; onCommit:(next:LevelsSettings)=>void; onCancel:(original:LevelsSettings)=>void }
const clamp=(value:number,min=0,max=1)=>Math.max(min,Math.min(max,value))
const byte=(value:number)=>Math.round(value*255)/255
export function levelsHandlePosition(levels:LevelsSettings,key:Handle) {
 return key==='gamma'?levels.inputBlack+(levels.inputWhite-levels.inputBlack)*Math.pow(.5,levels.gamma):levels[key]
}
export function moveLevelsHandle(levels:LevelsSettings,key:Handle,position:number):LevelsSettings {
 const next={...levels},value=clamp(position)
 if(key==='gamma'){
  const relative=clamp((value-levels.inputBlack)/(levels.inputWhite-levels.inputBlack),Math.pow(.5,100),Math.pow(.5,.01))
  next.gamma=Math.round(clamp(Math.log(relative)/Math.log(.5),.01,100)*100)/100
 }else if(key==='inputBlack')next.inputBlack=clamp(byte(value),0,Math.max(0,levels.inputWhite-1/255))
 else if(key==='inputWhite')next.inputWhite=clamp(byte(value),Math.min(1,levels.inputBlack+1/255),1)
 else if(key==='outputBlack')next.outputBlack=Math.min(byte(value),levels.outputWhite)
 else next.outputWhite=Math.max(byte(value),levels.outputBlack)
 return next
}
export function LevelsGraph(props:Props) {
 const {levels,output=false,histogram,disabled,onCommit,onPreview}=props
 const root=useRef<HTMLDivElement>(null),rail=useRef<HTMLDivElement>(null),latest=useRef(props);latest.current=props
 const drag=useRef<{id:number;key:Handle;original:LevelsSettings;current:LevelsSettings;offset:number}|null>(null)
 const cancel=()=>{const current=drag.current;drag.current=null;if(current)latest.current.onCancel(current.original)}
 useEffect(()=>{const blur=()=>cancel();window.addEventListener('blur',blur);return()=>window.removeEventListener('blur',blur)},[])
 useEffect(()=>{if(disabled)cancel()},[disabled])
 const fraction=(clientX:number)=>{const r=rail.current!.getBoundingClientRect();return (clientX-r.left)/Math.max(1,r.width)}
 const keys:Handle[]=output?['outputBlack','outputWhite']:['inputBlack','gamma','inputWhite']
 const names:Record<Handle,string>={inputBlack:'输入黑场滑块',gamma:'输入中间调滑块',inputWhite:'输入白场滑块',outputBlack:'输出黑场滑块',outputWhite:'输出白场滑块'}
 const bins=histogram?Array.from(histogram):[],peak=bins.reduce((a,b)=>Math.max(a,b),1)
 return <div ref={root} className={`levels-graph${output?' is-output':''}`} role="group" aria-label={output?'输出色阶调整':'输入色阶调整'} aria-disabled={!!disabled} onPointerDown={event=>{
  if(disabled||event.button!==0||drag.current)return
  event.preventDefault();event.stopPropagation()
  const x=fraction(event.clientX),target=event.target instanceof Element?event.target.closest('[data-level-handle]'):null
  const key=target?target.getAttribute('data-level-handle') as Handle:keys.reduce((best,k)=>Math.abs(levelsHandlePosition(levels,k)-x)<Math.abs(levelsHandlePosition(levels,best)-x)?k:best,keys[0])
  root.current?.querySelector<HTMLButtonElement>(`[data-level-handle="${key}"]`)?.focus({preventScroll:true})
  event.currentTarget.setPointerCapture?.(event.pointerId)
  const current=target?levels:moveLevelsHandle(levels,key,x)
  drag.current={id:event.pointerId,key,original:{...levels},current,offset:target?x-levelsHandlePosition(levels,key):0}
  if(current!==levels)onPreview(current)
 }} onPointerMove={event=>{
  const current=drag.current;if(!current||current.id!==event.pointerId||disabled)return
  event.preventDefault();const next=moveLevelsHandle(current.current,current.key,fraction(event.clientX)-current.offset)
  if(JSON.stringify(next)===JSON.stringify(current.current))return
  current.current=next;onPreview(next)
 }} onPointerUp={event=>{
  const current=drag.current;if(!current||current.id!==event.pointerId)return
  drag.current=null
  if(JSON.stringify(current.original)!==JSON.stringify(current.current))onCommit(current.current)
  else latest.current.onCancel(current.original)
  if(event.currentTarget.hasPointerCapture?.(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId)
 }} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event=>{
  if(event.key==='Escape'&&drag.current){event.preventDefault();event.stopPropagation();cancel();return}
  if(disabled||drag.current||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return
  const target=event.target instanceof Element?event.target.closest('[data-level-handle]'):null
  if(!target)return
  event.preventDefault();event.stopPropagation()
  const key=target.getAttribute('data-level-handle') as Handle,direction=event.key==='ArrowLeft'||event.key==='ArrowDown'?-1:1
  if(key==='gamma')onCommit({...levels,gamma:event.key==='Home'?100:event.key==='End' ? .01:Math.round(clamp(levels.gamma-direction*(event.shiftKey ? .1 : .01),.01,100)*100)/100})
  else onCommit(moveLevelsHandle(levels,key,event.key==='Home'?0:event.key==='End'?1:levels[key]+direction*(event.shiftKey?10:1)/255))
 }}>
  {!output?<svg className="levels-histogram" viewBox="0 0 256 96" preserveAspectRatio="none" role="img" aria-label="输入色阶直方图"><rect width="256" height="96" className="levels-histogram-background"/>{[.25,.5,.75].map(x=><path key={x} className="levels-histogram-grid" d={`M${x*256} 0V96`}/>)}{bins.map((value,index)=><rect key={index} className="levels-histogram-bin" x={index/bins.length*256} y={96-value/peak*90} width={256/bins.length+.1} height={value/peak*90}/>)}</svg>:null}
  <div className="levels-slider-body"><div className="levels-gradient" aria-hidden="true"/><div className="levels-handle-rail" ref={rail} data-testid={output?'output-levels-rail':'input-levels-rail'}>{keys.map(key=><button key={key} type="button" role="slider" aria-label={names[key]} aria-orientation="horizontal" aria-valuemin={key==='gamma' ? .01:0} aria-valuemax={key==='gamma'?100:255} aria-valuenow={key==='gamma'?levels.gamma:Math.round(levels[key]*255)} disabled={disabled} data-level-handle={key} title={`${names[key]} · ${key==='gamma'?levels.gamma:Math.round(levels[key]*255)}`} className={`levels-handle ${key==='gamma'?'is-gray':key.endsWith('Black')?'is-black':'is-white'}`} style={{left:`${levelsHandlePosition(levels,key)*100}%`}}><svg viewBox="0 0 14 12" aria-hidden="true"><path d="M7 1 13 10.5H1Z"/></svg></button>)}</div></div>
 </div>
}
