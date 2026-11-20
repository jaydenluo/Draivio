import { Checkbox } from '../ui/Checkbox'
import { useEffect, useId, useState } from 'react'
import { validateCurves, type CurvesSettings, type CurveChannel, type CurvePoint } from '../adjustments/curves'
import { defaultLevels, validateLevels, type LevelsSettings } from '../adjustments/levels'
import { NumericScrubber } from '../components/NumericScrubber'
import { CurveGraph, constrainCurvePoint } from './CurveGraph'
import { LevelsGraph } from './LevelsGraph'
import './curveEditor.css'

type Props = { histogram?: Uint32Array | number[]; onPreview?: (enabled:boolean)=>void; onDraftCurves?: (curves:CurvesSettings|null)=>void; onDraftLevels?: (levels:LevelsSettings|null)=>void; curves: CurvesSettings; levels: LevelsSettings; disabled?: boolean; onCurves: (curves: CurvesSettings) => void; onLevels: (levels: LevelsSettings) => void }
const channels: CurveChannel[] = ['rgb', 'r', 'g', 'b']
export function CurveEditor({ curves, levels, disabled, onCurves, onLevels, onPreview, onDraftCurves, onDraftLevels, histogram }: Props) {
 const [active, setActive] = useState<CurveChannel>('rgb'), [tab, setTab] = useState<'curves'|'levels'>('curves')
 const [selected, setSelected] = useState(0), [preview, setPreview] = useState(true)
 const [draftCurves, setDraftCurves] = useState(curves), [draftLevels, setDraftLevels] = useState(levels)
 const [error,setError] = useState(''), id = useId()
 useEffect(() => { setDraftCurves(curves) }, [curves])
 useEffect(() => { setDraftLevels(levels) }, [levels])
 useEffect(() => () => { onPreview?.(true); onDraftCurves?.(null); onDraftLevels?.(null) }, [])
 const emitCurves = (value:CurvesSettings) => {
  try { const valid=validateCurves(value); setError(''); setDraftCurves(valid); onDraftCurves?.(null); if(preview)onCurves(valid) }
  catch(e) { setError((e as Error).message) }
 }
 const emitLevels = (value:LevelsSettings) => {
  try { const valid=validateLevels(value); setError(''); setDraftLevels(valid); onDraftLevels?.(null); if(preview)onLevels(valid) }
  catch(e) { setError((e as Error).message) }
 }
 const points = draftCurves[active], index = Math.min(selected, points.length - 1), point = points[index]
 const setPoints = (next:CurvePoint[]) => emitCurves({...draftCurves,[active]:next})
 const addPoint = () => {
  if(points.length>=64)return
  const gap=points.slice(1).map((p,i)=>({i,width:p.x-points[i].x})).sort((a,b)=>b.width-a.width)[0]
  const a=points[gap.i],b=points[gap.i+1], next=gap.i+1
  setPoints([...points.slice(0,next),{x:(a.x+b.x)/2,y:(a.y+b.y)/2},...points.slice(next)]);setSelected(next)
 }
 const reset = () => { if(tab==='curves'){setPoints([{x:0,y:0},{x:1,y:1}]);setSelected(0)}else emitLevels(defaultLevels()) }
 return <section aria-label="曲线与色阶" className="curve-editor">
  <header className="curve-editor-heading"><h3>曲线与色阶</h3><label className="curve-preview-toggle"><Checkbox aria-label="预览曲线" disabled={disabled} checked={preview} onChange={event=>{
   const next=event.target.checked;setPreview(next);onPreview?.(next);onDraftCurves?.(null);onDraftLevels?.(null)
   if(next){if(JSON.stringify(draftCurves)!==JSON.stringify(curves))onCurves(draftCurves);if(JSON.stringify(draftLevels)!==JSON.stringify(levels))onLevels(draftLevels)}
  }}/>预览</label></header>
  <div className="curve-tabs-row"><div role="tablist" aria-label="明暗调整方式">{(['curves','levels'] as const).map(key=><button key={key} id={`${id}-${key}-tab`} type="button" role="tab" aria-selected={tab===key} aria-controls={`${id}-${key}`} onClick={()=>setTab(key)}>{key==='curves'?'曲线':'色阶'}</button>)}</div><button type="button" className="curve-reset" aria-label={tab==='curves'?'重置曲线':'重置色阶'} title={tab==='curves'?'重置曲线':'重置色阶'} disabled={disabled} onClick={reset}>↺</button></div>
  <div role="tabpanel" id={`${id}-curves`} aria-labelledby={`${id}-curves-tab`} hidden={tab!=='curves'}>
   <div className="curve-toolbar"><label>通道<select aria-label="曲线通道" disabled={disabled} value={active} onChange={event=>{onDraftCurves?.(null);setActive(event.target.value as CurveChannel);setSelected(0)}}>{channels.map(c=><option key={c} value={c}>{c==='rgb'?'RGB':c==='r'?'红':c==='g'?'绿':'蓝'}</option>)}</select></label><button type="button" disabled={disabled} onClick={()=>{emitCurves({...draftCurves,[active]:[{x:0,y:0},{x:.5,y:.65},{x:1,y:1}]});setSelected(1)}}>提亮预设</button></div>
   <CurveGraph key={active} points={points} selected={index} onSelect={setSelected} channel={active} histogram={histogram} disabled={disabled} onPreview={next=>{const value={...draftCurves,[active]:next};setDraftCurves(value);onDraftCurves?.(preview?value:null)}} onCommit={setPoints} onCancel={original=>{setDraftCurves({...draftCurves,[active]:original});onDraftCurves?.(null)}} />
   <div className="curve-selected-point"><NumericScrubber label="输入" ariaLabel="曲线输入" value={point.x*255} min={0} max={255} disabled={disabled||index===0||index===points.length-1} onChange={value=>setPoints(constrainCurvePoint(points,index,{...point,x:value/255}))}/><NumericScrubber label="输出" ariaLabel="曲线输出" value={point.y*255} min={0} max={255} disabled={disabled} onChange={value=>setPoints(constrainCurvePoint(points,index,{...point,y:value/255}))}/></div>
   <div className="curve-point-actions"><span>点击加点 · 拖动调整</span><button type="button" aria-label="添加锚点" title="添加锚点" disabled={disabled||points.length>=64} onClick={addPoint}>＋</button><button type="button" aria-label="删除选中锚点" title="删除选中锚点 · Delete" disabled={disabled||index===0||index===points.length-1} onClick={()=>{setPoints(points.filter((_,i)=>i!==index));setSelected(index-1)}}>−</button></div>
  </div>
  <div role="tabpanel" id={`${id}-levels`} aria-labelledby={`${id}-levels-tab`} hidden={tab!=='levels'} className="levels-controls">
   <h4>输入色阶</h4><LevelsGraph levels={draftLevels} histogram={histogram} disabled={disabled||tab!=='levels'} onPreview={next=>{setDraftLevels(next);onDraftLevels?.(preview?next:null)}} onCommit={emitLevels} onCancel={original=>{setDraftLevels(original);onDraftLevels?.(null)}}/><div className="levels-inputs">
    <NumericScrubber label="黑场" ariaLabel="色阶黑场" value={draftLevels.inputBlack*255} min={0} max={Math.max(0,draftLevels.inputWhite*255-1)} disabled={disabled} onChange={value=>emitLevels({...draftLevels,inputBlack:value/255})}/>
    <NumericScrubber label="中间调" ariaLabel="色阶中间调" value={draftLevels.gamma} min={.01} max={100} step={.01} disabled={disabled} onChange={value=>emitLevels({...draftLevels,gamma:value})}/>
    <NumericScrubber label="白场" ariaLabel="色阶白场" value={draftLevels.inputWhite*255} min={Math.min(255,draftLevels.inputBlack*255+1)} max={255} disabled={disabled} onChange={value=>emitLevels({...draftLevels,inputWhite:value/255})}/>
   </div><h4>输出色阶</h4><LevelsGraph output levels={draftLevels} disabled={disabled||tab!=='levels'} onPreview={next=>{setDraftLevels(next);onDraftLevels?.(preview?next:null)}} onCommit={emitLevels} onCancel={original=>{setDraftLevels(original);onDraftLevels?.(null)}}/><div className="levels-outputs">
    <NumericScrubber label="黑场" ariaLabel="输出黑场" value={draftLevels.outputBlack*255} min={0} max={draftLevels.outputWhite*255} disabled={disabled} onChange={value=>emitLevels({...draftLevels,outputBlack:value/255})}/>
    <NumericScrubber label="白场" ariaLabel="输出白场" value={draftLevels.outputWhite*255} min={draftLevels.outputBlack*255} max={255} disabled={disabled} onChange={value=>emitLevels({...draftLevels,outputWhite:value/255})}/>
   </div>
  </div>
  {error?<span role="alert" className="curve-error">{error}</span>:null}
 </section>
}
