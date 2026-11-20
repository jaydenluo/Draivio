import { layerStyleUnavailableReason } from './layerStyleCapability'
import { Checkbox } from '../ui/Checkbox'
import { effectLabels, type LayerEffects } from '../render/layerEffects'
import { useEditor } from '../state/editor'
import { useLayerStyleEditor } from './LayerStyleEditor'
import './layerEffectsPanel.css'

export function LayerEffectsPanel({layerId,effects={version:1,items:[]},disabled}:{layerId:string;effects?:LayerEffects;disabled:boolean}) {
 const {state,dispatch}=useEditor(),{open}=useLayerStyleEditor()
 const reason=layerStyleUnavailableReason(state,layerId);disabled=disabled||!!reason
 return <section className="layer-styles" aria-label="图层样式">
  <div className="layer-styles-heading"><h4>图层样式</h4><button type="button" className="layer-style-edit" aria-label="编辑图层样式" title={reason??'编辑图层样式'} disabled={disabled} onClick={event=>open(layerId,event.currentTarget)}>编辑…</button></div>
  {effects.items.length?<div className="layer-styles-list">{effects.items.map(effect=><div className="layer-style-row" key={effect.kind}>
   <Checkbox aria-label={`${effectLabels[effect.kind]}启用`} disabled={disabled} checked={effect.enabled} onChange={event=>dispatch({type:'set-layer-effects',id:layerId,effects:{...effects,items:effects.items.map(item=>item.kind===effect.kind?{...item,enabled:event.currentTarget.checked}:item)}})}/>
   <button type="button" className="layer-style-toggle" disabled={disabled} onClick={event=>open(layerId,event.currentTarget,effect.kind)}>{effectLabels[effect.kind]}</button>
  </div>)}</div>:<p className="layer-styles-empty">暂无样式</p>}
 {reason?<p className="layer-style-hint">{reason}</p>:null}</section>
}
