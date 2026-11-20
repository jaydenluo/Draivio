import { useEditor } from '../state/editor'
import { ColorPicker } from './ColorPicker'
import { Checkbox } from '../ui/Checkbox'
import { NumericScrubber } from './NumericScrubber'
export function ShapeDefaults(){
 const {state,dispatch}=useEditor(),options=state.toolOptions
 const set=(key:string,value:unknown)=>dispatch({type:'set-tool-options',options:{[key]:value}})
 return <><span className="object-editing-badge">新建图形</span><ColorPicker label="填充颜色" value={state.brushColor} recentColors={state.recentColors} onChange={color=>dispatch({type:'set-brush-color',color})}/><label className="object-check"><Checkbox aria-label="新建图形填充" checked={options.shapeFillEnabled!==false} onChange={e=>set('shapeFillEnabled',e.target.checked)}/>填充</label><ColorPicker label="描边颜色" value={String(options.shapeStrokeColor??state.brushColor)} recentColors={state.recentColors} onChange={color=>set('shapeStrokeColor',color)}/><NumericScrubber className="tool-option-field" label="线宽" ariaLabel="新建图形线宽" value={Number(options.shapeStrokeWidth??3)} min={0} max={500} unit="px" onChange={v=>set('shapeStrokeWidth',v)}/><NumericScrubber className="tool-option-field" label="不透明度" value={Number(options.opacity??100)} min={0} max={100} unit="%" onChange={v=>set('opacity',v)}/>{state.activeTool==='shape'?<NumericScrubber className="tool-option-field" label="圆角" ariaLabel="新建矩形圆角" value={Number(options.shapeCornerRadius??0)} min={0} max={10000} unit="px" onChange={v=>set('shapeCornerRadius',v)}/>:null}<span className="tool-options-status">拖动绘制 · Shift 等比</span></>
}
