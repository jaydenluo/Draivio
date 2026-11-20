import { useEffect,useRef,useState } from 'react'
import { type EditorState } from '../state/editor'
import { AnchoredWindow } from '../ui/AnchoredWindow'
import { Checkbox } from '../ui/Checkbox'
import { cloneEffects,defaultEffect,effectLabels,EFFECT_ORDER,type EffectKind,type LayerEffect,type LayerEffects } from '../render/layerEffects'
import { LayerEffectControls } from './LayerEffectControls'
import { LayerStylePreview } from './LayerStylePreview'
import type { StyleSession } from './LayerStyleEditor'
const empty=():LayerEffects=>({version:1,items:[]})
export function LayerStyleWindow({activeDocument,session,state,unavailable,error,pending,onPreview,onCommit,onClose,onReload}:{activeDocument:boolean;session:StyleSession;state:EditorState;unavailable:string|null;error:string;pending:boolean;onPreview:(effects:LayerEffects|null)=>void;onCommit:(effects:LayerEffects)=>void;onClose:()=>void;onReload:()=>void}){
 const anchor=useRef<HTMLElement|null>(session.anchor)
 const [draft,setDraft]=useState<LayerEffects>(()=>cloneEffects(session.original??empty())),[active,setActive]=useState<EffectKind>(session.kind??session.original?.items[0]?.kind??'shadow'),[preview,setPreview]=useState(true),[confirmClose,setConfirmClose]=useState(false)
 const previewCallback=useRef(onPreview);previewCallback.current=onPreview
 useEffect(()=>{setDraft(cloneEffects(session.original??empty()))},[session.original])
 useEffect(()=>{previewCallback.current(preview&&!unavailable?draft:null)},[draft,preview,unavailable])
 const dirty=JSON.stringify(draft)!==JSON.stringify(session.original??empty())
 const requestClose=()=>{if(pending)return;if(dirty)setConfirmClose(true);else onClose()}
 const closeRef=useRef(requestClose);closeRef.current=requestClose
 useEffect(()=>{
  if(!activeDocument)return
  const key=(e:KeyboardEvent)=>{
   const target=e.target as HTMLElement
   if(target.closest?.('[role="dialog"]'))return
   if(e.key==='Escape'){e.preventDefault();e.stopPropagation();closeRef.current()}
   if(e.key==='Tab'){e.preventDefault();document.querySelector<HTMLElement>('.layer-style-window button')?.focus()}
  }
  document.addEventListener('keydown',key,true)
  return()=>document.removeEventListener('keydown',key,true)
 },[activeDocument])
 const effect=draft.items.find(e=>e.kind===active)??{...defaultEffect(active),enabled:false}
 const update=(patch:Partial<LayerEffect>)=>setDraft(current=>{
  const global=patch.angle!==undefined&&effect.useGlobalLight
  return {...current,...(global?{globalLightAngle:patch.angle}:{}),items:current.items.some(e=>e.kind===active)?current.items.map(e=>e.kind===active?{...e,...patch}:e):[...current.items,{...defaultEffect(active),...patch}]}
 })
 const toggle=(kind:EffectKind,enabled:boolean)=>{
  setActive(kind);setDraft(current=>({...current,items:current.items.some(e=>e.kind===kind)?current.items.map(e=>e.kind===kind?{...e,enabled}:e):[...current.items,{...defaultEffect(kind),enabled}]}))
 }
 const target=state.layers.find(l=>l.id===session.layerId),disabled=!!unavailable||pending
 return <AnchoredWindow anchor={anchor} title="图层样式" onClose={requestClose} width={880} placement="above" visible={activeDocument} modal rememberKey="draivio-layer-style-window-v1" resizable className="layer-style-window">
  <div className="layer-style-target"><span>{target ? `作用范围：整个图层 · ${target.name}` : '目标图层已移除'}</span><span>{dirty?'有未应用的修改':'已与图层同步'}</span></div>
  <div className="layer-style-workspace">
   <nav aria-label="图层效果" className="layer-style-options">{EFFECT_ORDER.map(kind=><div key={kind} className={active===kind?'active':''}><Checkbox aria-label={`${effectLabels[kind]}启用`} disabled={disabled} checked={draft.items.some(e=>e.kind===kind&&e.enabled)} onChange={e=>toggle(kind,e.currentTarget.checked)}/><button type="button" aria-pressed={active===kind} onClick={()=>setActive(kind)}>{effectLabels[kind]}</button></div>)}</nav>
   <section className="layer-style-settings" aria-label={`${effectLabels[active]}设置`}>
    <div className="layer-style-settings-heading"><h3>{effectLabels[active]}</h3><button type="button" disabled={disabled||!effect.enabled} onClick={()=>setDraft(current=>({...current,items:current.items.map(item=>item.kind===active?{...defaultEffect(active),useGlobalLight:item.useGlobalLight}:item)}))}>重置{effectLabels[active]}</button></div>
    <fieldset className="layer-style-parameters" disabled={disabled||!effect.enabled} aria-label={`${effectLabels[active]}参数`}><LayerEffectControls key={active} effect={effect} disabled={disabled} globalAngle={draft.globalLightAngle??45} onGlobalAngle={globalLightAngle=>setDraft(current=>({...current,globalLightAngle}))} onChange={update}/></fieldset>
    {!effect.enabled?<p className="layer-style-hint">勾选左侧效果以启用并调整参数</p>:null}
   </section>
   {target?<LayerStylePreview state={state} layerId={session.layerId} effects={draft} enabled={preview&&!unavailable} active={effect} onShadowMove={disabled?()=>{}:update}/>:null}
  </div>
  <div className="style-window-utilities"><button type="button" disabled={pending} onClick={()=>{setDraft(cloneEffects(session.original??empty()));setConfirmClose(false)}}>恢复打开时状态</button><button type="button" disabled={disabled||!draft.items.length} onClick={()=>setDraft(empty())}>清除全部样式</button><span>画布拖动平移 · 滚轮平移 · ⌘ / Ctrl＋滚轮缩放</span></div>
  {unavailable||error?<div role="alert" className="style-window-error">{unavailable??error}{!unavailable?<button type="button" onClick={onReload}>载入当前图层样式</button>:null}</div>:null}
  {confirmClose?<div className="style-close-confirm" role="alert"><span>是否保留本次图层样式修改？</span><div><button type="button" onClick={()=>setConfirmClose(false)}>继续编辑</button><button type="button" onClick={onClose}>放弃修改</button><button type="button" disabled={disabled} onClick={()=>{setConfirmClose(false);onCommit(draft)}}>保存并关闭</button></div></div>:null}
  <footer className="layer-style-actions"><label><Checkbox aria-label="预览图层样式" checked={preview} disabled={disabled} onChange={e=>setPreview(e.currentTarget.checked)}/>预览</label><div><button type="button" disabled={pending} onClick={onClose}>取消</button><button type="button" className="primary" disabled={disabled} onClick={()=>onCommit(draft)}>{pending?'应用中…':'确定'}</button></div></footer>
 </AnchoredWindow>
}
