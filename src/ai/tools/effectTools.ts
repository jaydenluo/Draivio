import { defaultEffect,validateEffects,type EffectKind } from '../../render/layerEffects'
import { editorReducer,type EditorState } from '../../state/editor'
export function executeEffectAdjustment(state:EditorState,layerId:string,key:string,value:unknown):EditorState{
 const layer=state.layers.find(l=>l.id===layerId)!
 const kind=key.slice('effect.'.length) as EffectKind
 if(!['shadow','stroke','innerShadow','colorOverlay','gradientOverlay'].includes(kind))throw new Error('不支持的图层效果')
 const existing=layer.effects?.items??[]
 if(value===null)return editorReducer(state,{type:'set-layer-effects',id:layerId,effects:{version:1,items:existing.filter(e=>e.kind!==kind)}})
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['enabled','color','opacity','distance','angle','blur','width','position','stops'].includes(k)))throw new Error('效果参数无效')
 const item={...(existing.find(e=>e.kind===kind)??defaultEffect(kind)),...value}
 const effects=validateEffects({version:1,items:existing.some(e=>e.kind===kind)?existing.map(e=>e.kind===kind?item:e):[...existing,item]})
 return editorReducer(state,{type:'set-layer-effects',id:layerId,effects})
}
