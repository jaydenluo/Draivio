import { ColorPicker } from '../components/ColorPicker'
import { Checkbox } from '../ui/Checkbox'
import { effectLabels, STYLE_BLEND_MODES, type LayerEffect } from '../render/layerEffects'
import { StyleAngle,StyleNumber } from './StyleParameter'
import { StyleGradientEditor } from './StyleGradientEditor'
const blendLabels={normal:'正常',multiply:'正片叠底',screen:'滤色',overlay:'叠加',darken:'变暗',lighten:'变亮'}
export function LayerEffectControls({effect:e,onChange,globalAngle=45,onGlobalAngle,disabled=false}:{effect:LayerEffect;onChange:(patch:Partial<LayerEffect>)=>void;globalAngle?:number;onGlobalAngle?:(value:number)=>void;disabled?:boolean}) {
 const label=effectLabels[e.kind],shadow=e.kind==='shadow'||e.kind==='innerShadow',gradient=e.kind==='gradientOverlay'||e.kind==='stroke'&&e.fillType==='gradient'
 return <>
  {e.kind!=='shadow'?<label className="style-select">混合模式<select aria-label={`${label}混合模式`} value={e.blendMode??'normal'} onChange={v=>onChange({blendMode:v.currentTarget.value as LayerEffect['blendMode']})}>{STYLE_BLEND_MODES.map(mode=><option key={mode} value={mode}>{blendLabels[mode]}</option>)}</select></label>:null}
  {e.kind==='stroke'?<label className="style-select">填充类型<select aria-label="描边填充类型" value={e.fillType??'color'} onChange={v=>onChange({fillType:v.currentTarget.value as LayerEffect['fillType']})}><option value="color">颜色</option><option value="gradient">渐变</option></select></label>:null}
  {!gradient?<><ColorPicker label={`${label}颜色`} ariaLabel={`${label}颜色`} value={e.color.slice(0,7)} onChange={color=>onChange({color:color+(e.color.length===9?e.color.slice(7):'')})}/><StyleNumber label="颜色透明度" name={`${label}颜色透明度`} value={e.color.length===9?Math.round(parseInt(e.color.slice(7),16)/255*100):100} onChange={v=>onChange({color:e.color.slice(0,7)+Math.round(v/100*255).toString(16).padStart(2,'0')})}/></>:null}
  <StyleNumber label="不透明度" name={`${label}不透明度`} value={e.opacity} onChange={opacity=>onChange({opacity})}/>
  {shadow?<>
   <StyleAngle name={`${label}角度`} value={e.useGlobalLight?globalAngle:e.angle} onChange={angle=>e.useGlobalLight&&onGlobalAngle?onGlobalAngle(angle):onChange({angle})}/>
   {onGlobalAngle?<label className="style-check"><Checkbox aria-label={`${label}使用全局光`} checked={!!e.useGlobalLight} onChange={v=>onChange({useGlobalLight:v.currentTarget.checked})}/>使用全局光</label>:null}
   <StyleNumber label="距离" name={`${label}距离`} value={e.distance} max={512} unit="px" onChange={distance=>onChange({distance})}/>
   <StyleNumber label="大小" name={`${label}模糊`} value={e.blur} max={128} unit="px" onChange={blur=>onChange({blur})}/>
   <StyleNumber label={e.kind==='shadow'?'扩展':'阻塞'} name={`${label}扩展`} value={e.spread??0} onChange={spread=>onChange({spread})}/>
  </>:null}
  {e.kind==='stroke'?<><StyleNumber label="描边宽度" name="描边宽度" value={e.width} max={128} unit="px" onChange={width=>onChange({width})}/><label className="style-select">位置<select aria-label="描边位置" value={e.position} onChange={v=>onChange({position:v.currentTarget.value as LayerEffect['position']})}><option value="inside">内部</option><option value="center">居中</option><option value="outside">外部</option></select></label></>:null}
  {gradient?<>
   <StyleGradientEditor stops={e.stops} disabled={disabled||!e.enabled} onChange={stops=>onChange({stops})}/>
   <label className="style-select">渐变类型<select aria-label="渐变类型" value={e.gradientType??'linear'} onChange={v=>onChange({gradientType:v.currentTarget.value as LayerEffect['gradientType']})}><option value="linear">线性</option><option value="radial">径向</option></select></label>
   {e.gradientType!=='radial'?<StyleAngle name="渐变角度" value={e.angle} onChange={angle=>onChange({angle})}/>:null}
   <StyleNumber label="缩放" name="渐变缩放" value={e.scale??100} min={1} max={400} onChange={scale=>onChange({scale})}/>
   <StyleNumber label="水平偏移" name="渐变水平偏移" value={e.offsetX??0} min={-100} max={100} onChange={offsetX=>onChange({offsetX})}/>
   <StyleNumber label="垂直偏移" name="渐变垂直偏移" value={e.offsetY??0} min={-100} max={100} onChange={offsetY=>onChange({offsetY})}/>
   <div className="style-checks"><label className="style-check"><Checkbox aria-label="反向渐变" checked={!!e.reverse} onChange={v=>onChange({reverse:v.currentTarget.checked})}/>反向</label><label className="style-check"><Checkbox aria-label="渐变与图层对齐" checked={!!e.alignWithLayer} onChange={v=>onChange({alignWithLayer:v.currentTarget.checked})}/>与图层对齐</label></div>
  </>:null}
 </>
}
