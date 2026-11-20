import { NumericScrubber } from '../components/NumericScrubber'
export function StyleNumber({label,name,value,min=0,max=100,step=1,unit='%',onChange}:{label:string;name:string;value:number;min?:number;max?:number;step?:number;unit?:string;onChange:(value:number)=>void}){
 return <div className="style-number"><NumericScrubber label={label} ariaLabel={name} value={value} min={min} max={max} step={step} unit={unit} onChange={onChange}/><input type="range" aria-label={`${name}滑杆`} value={value} min={min} max={max} step={step} onChange={e=>onChange(Number(e.currentTarget.value))}/></div>
}
export function StyleAngle({name,value,onChange}:{name:string;value:number;onChange:(v:number)=>void}){
 const point=(event:React.PointerEvent<HTMLButtonElement>)=>{
  const r=event.currentTarget.getBoundingClientRect()
  onChange(Math.round(Math.atan2(event.clientY-r.top-r.height/2,event.clientX-r.left-r.width/2)*180/Math.PI))
 }
 return <div className="style-angle"><button type="button" className="style-angle-dial" role="slider" aria-label={`${name}盘`} aria-valuemin={-180} aria-valuemax={180} aria-valuenow={((value+180)%360+360)%360-180} aria-valuetext={`${value}°`} onKeyDown={e=>{
  if(['ArrowRight','ArrowUp','ArrowLeft','ArrowDown','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?180:value+(['ArrowRight','ArrowUp'].includes(e.key)?1:-1)*(e.shiftKey?10:1);onChange(((next+180)%360+360)%360-180)}
 }} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture?.(e.pointerId);point(e)}} onPointerMove={e=>{if(e.currentTarget.hasPointerCapture?.(e.pointerId))point(e)}} onPointerUp={e=>e.currentTarget.releasePointerCapture?.(e.pointerId)}><span style={{transform:`rotate(${value}deg)`}}/></button><StyleNumber label="角度" name={name} value={value} min={-180} max={180} unit="°" onChange={onChange}/></div>
}
