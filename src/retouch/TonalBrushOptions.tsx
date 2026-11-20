import { Checkbox } from '../ui/Checkbox'
import { useEditor } from '../state/editor'
import { NumericScrubber } from '../components/NumericScrubber'
export function TonalBrushOptions(){
 const {state,dispatch}=useEditor(),options=state.toolOptions
 const set=(key:string,value:unknown)=>dispatch({type:'set-tool-options',options:{[key]:value}})
 return <><label className="tool-option-field"><span>作用范围</span><select aria-label="色调作用范围" value={String(options.tonalRange??'midtones')} onChange={e=>set('tonalRange',e.target.value)}><option value="shadows">阴影</option><option value="midtones">中间调</option><option value="highlights">高光</option></select></label>{[{key:'exposure',label:'画笔曝光量',value:20,min:0,max:100,unit:'%'},{key:'size',label:'大小',value:20,min:1,max:500,unit:'px'},{key:'hardness',label:'硬度',value:80,min:0,max:100,unit:'%'},{key:'flow',label:'流量',value:30,min:0,max:100,unit:'%'}].map(f=><NumericScrubber key={f.key} className="tool-option-field" label={f.label} value={typeof options[f.key]==='number'?options[f.key] as number:f.value} min={f.min} max={f.max} unit={f.unit} onChange={v=>set(f.key,v)}/>)}<label className="tool-option-check"><Checkbox aria-label="保护色调" checked={options.protectTones!==false} onChange={e=>set('protectTones',e.target.checked)}/>保护色调</label><span className="tool-options-status">线性曝光逐笔累积 · 每笔独立层，可调不透明度/蒙版 · Esc 取消</span></>
}
