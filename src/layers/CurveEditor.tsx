import { useEffect, useMemo, useState } from 'react'
import { validateCurves, type CurvesSettings, type CurveChannel } from '../adjustments/curves'
import { validateLevels, type LevelsSettings } from '../adjustments/levels'

type Props = { histogram?: Uint32Array | number[]; onPreview?: (enabled:boolean)=>void; curves: CurvesSettings; levels: LevelsSettings; disabled?: boolean; onCurves: (curves: CurvesSettings) => void; onLevels: (levels: LevelsSettings) => void }
const channels: CurveChannel[] = ['rgb', 'r', 'g', 'b']
const defaultIdentity = () => [{ x: 0, y: 0 }, { x: 1, y: 1 }]
export function CurveEditor({ curves, levels, disabled, onCurves, onLevels, onPreview, histogram }: Props) {
 const [active, setActive] = useState<CurveChannel>('rgb'); const [preview, setPreview] = useState(true)
 const [draftCurves, setDraftCurves] = useState(curves); const [draftLevels, setDraftLevels] = useState(levels)
 useEffect(() => { setDraftCurves(curves); setDraftLevels(levels) }, [curves, levels])
 useEffect(()=>()=>onPreview?.(true),[])
 const [error,setError]=useState('')
 const emitCurves=(value:CurvesSettings)=>{try{const valid=validateCurves(value);setError('');setDraftCurves(valid);if(preview)onCurves(valid)}catch(e){setError((e as Error).message)}}
 const emitLevels=(value:LevelsSettings)=>{try{const valid=validateLevels(value);setError('');setDraftLevels(valid);if(preview)onLevels(valid)}catch(e){setError((e as Error).message)}}
 const points = draftCurves[active]
 const channel = useMemo(() => points, [points])
 const updatePoint = (index: number, key: 'x'|'y', nextValue: number) => {
  const next = channel.map((p, i) => i === index ? { ...p, [key]: Math.max(0, Math.min(1, nextValue)) } : { ...p })

  const updatedCurves = { ...draftCurves, [active]: next }; emitCurves(updatedCurves)
 }
 return <section aria-label="曲线与色阶" className="curve-editor">
  <h4>曲线与色阶</h4><svg role="img" aria-label="曲线直方图背景" viewBox="0 0 256 100">{histogram&&Array.from(histogram).map((v,i)=><rect key={i} x={i} y={100-v/Math.max(1,...histogram)*100} width="1" height={v/Math.max(1,...histogram)*100} fill="#657080"/>)}<polyline points={points.map(p=>`${p.x*255},${100-p.y*100}`).join(" ")} fill="none" stroke="#6bb7ff"/></svg>{error?<span role="alert">{error}</span>:null}<button type="button" disabled={disabled} onClick={()=>emitCurves({...draftCurves,[active]:[{x:0,y:0},{x:.5,y:.65},{x:1,y:1}]})}>提亮预设</button>
  <label>通道<select aria-label="曲线通道" disabled={disabled} value={active} onChange={e=>setActive(e.target.value as CurveChannel)}>{channels.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}</select></label>
  <label><input type="checkbox" aria-label="预览曲线" checked={preview} onChange={e=>{const next=e.target.checked;setPreview(next);onPreview?.(next);if(next){if(JSON.stringify(draftCurves)!==JSON.stringify(curves))onCurves(draftCurves);if(JSON.stringify(draftLevels)!==JSON.stringify(levels))onLevels(draftLevels)}}}/>预览</label>
  <button type="button" disabled={disabled} onClick={()=>{const value={...draftCurves,[active]:defaultIdentity()};emitCurves(value)}}>重置曲线</button>
  {points.map((p, i) => <div key={`${i}-${p.x}`} className="curve-point"><label>X<input type="number" min={0} max={1} step={.001} value={p.x} disabled={disabled || i===0 || i===points.length-1} onChange={e=>updatePoint(i,'x',Number(e.target.value))}/></label><label>Y<input type="number" min={0} max={1} step={.001} value={p.y} disabled={disabled} onChange={e=>updatePoint(i,'y',Number(e.target.value))}/></label>{i>0&&i<points.length-1?<button type="button" aria-label={`删除锚点 ${i}`} onClick={()=>{const value={...draftCurves,[active]:points.filter((_,j)=>j!==i)};emitCurves(value)}}>删除</button>:null}</div>)}
  <button type="button" disabled={disabled} onClick={()=>{const gap=points.slice(1).map((p,i)=>({i,width:p.x-points[i].x})).sort((a,b)=>b.width-a.width)[0];const a=points[gap.i],b=points[gap.i+1];const mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};emitCurves({...draftCurves,[active]:[...points.slice(0,gap.i+1),mid,...points.slice(gap.i+1)]})}}>添加锚点</button>
  <div className="levels-controls"><label>黑场<input aria-label="色阶黑场" type="number" min={0} max={1} step={.01} value={draftLevels.inputBlack} disabled={disabled} onChange={e=>{const value={...draftLevels,inputBlack:Number(e.target.value)};emitLevels(value)}}/></label><label>白场<input aria-label="色阶白场" type="number" min={0} max={1} step={.01} value={draftLevels.inputWhite} disabled={disabled} onChange={e=>{const value={...draftLevels,inputWhite:Number(e.target.value)};emitLevels(value)}}/></label><label>中间调<input aria-label="色阶中间调" type="number" min={.01} max={100} step={.01} value={draftLevels.gamma} disabled={disabled} onChange={e=>{const value={...draftLevels,gamma:Number(e.target.value)};emitLevels(value)}}/></label><label>输出黑场<input aria-label="输出黑场" type="number" min={0} max={1} step={.01} value={draftLevels.outputBlack} disabled={disabled} onChange={e=>{const value={...draftLevels,outputBlack:Number(e.target.value)};emitLevels(value)}}/></label><label>输出白场<input aria-label="输出白场" type="number" min={0} max={1} step={.01} value={draftLevels.outputWhite} disabled={disabled} onChange={e=>{const value={...draftLevels,outputWhite:Number(e.target.value)};emitLevels(value)}}/></label></div>
 </section>
}
