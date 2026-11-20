import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { editorReducer, useEditor, type EditorState } from '../state/editor'
import { cloneEffects, type EffectKind, type LayerEffects } from '../render/layerEffects'
import { layerStyleUnavailableReason } from './layerStyleCapability'
import { LayerStyleWindow } from './LayerStyleWindow'
import './layerEffectsPanel.css'
export type StyleSession = { layerId:string;anchor:HTMLElement;kind?:EffectKind;original:LayerEffects|undefined }
type Draft = { layerId:string;effects:LayerEffects }|null
const StyleContext=createContext<{draft:Draft;open:(layerId:string,anchor:HTMLElement,kind?:EffectKind)=>void}|null>(null)
export function useLayerStyleEditor(){const context=useContext(StyleContext);if(!context)throw new Error('Layer style editor requires EditorProvider');return context}
export function withLayerStylePreview(state:EditorState,draft:Draft):EditorState{return draft?{...state,layers:state.layers.map(layer=>layer.id===draft.layerId?{...layer,effects:draft.effects}:layer)}:state}
export function LayerStyleEditorProvider({children,active=true}:{children:ReactNode;active?:boolean}){
 const {state,dispatch}=useEditor()
 const [session,setSession]=useState<StyleSession|null>(null),[draft,setDraft]=useState<Draft>(null),[error,setError]=useState(''),[pending,setPending]=useState<LayerEffects|null>(null)
 const target=session?state.layers.find(l=>l.id===session.layerId):undefined
 const reason=session?layerStyleUnavailableReason(state,session.layerId):null
 const pan=useRef<{id:number;x:number;y:number;offset:{x:number;y:number}}|null>(null)
 const close=()=>{setDraft(null);setSession(null);setError('');setPending(null)}
 useEffect(()=>{
  if(!pending||!session)return
  if(JSON.stringify(target?.effects)===JSON.stringify(pending))close()
  else {setPending(null);setError(state.notice??'保存失败，请检查目标图层后重试。')}
 },[state,pending,session])
 const commit=(effects:LayerEffects)=>{
  if(!session)return
  const action={type:'set-layer-effects' as const,id:session.layerId,effects,expectedEffects:session.original??null}
  const next=editorReducer(state,action)
  if(next.layers===state.layers){setError(next.notice??'保存失败，本次修改仍保留在窗口中。');return}
  if(JSON.stringify(effects)===JSON.stringify(target?.effects??{version:1,items:[]})){close();return}
  setError('');setPending(effects);dispatch(action)
 }
 return <StyleContext.Provider value={{draft:active&&!reason?draft:null,open:(layerId,anchor,kind)=>{
  const reason=layerStyleUnavailableReason(state,layerId)
  if(reason){dispatch({type:'set-notice',message:reason});return}
  if(session)return
  dispatch({type:'select-layer',id:layerId});setDraft(null);setError('')
  const original=state.layers.find(l=>l.id===layerId)?.effects
  setSession({layerId,anchor,kind,original:original?cloneEffects(original):undefined})
 }}}>
  {children}
  {session?<>
   {active?createPortal(<div className="layer-style-backdrop" aria-label="图层样式画布导航" onContextMenu={e=>e.preventDefault()} onWheel={e=>{e.preventDefault();if(e.ctrlKey||e.metaKey)dispatch({type:'set-zoom',zoom:state.zoom*Math.exp(-e.deltaY*.004)});else dispatch({type:'set-canvas-offset',x:state.canvasOffset.x-e.deltaX,y:state.canvasOffset.y-e.deltaY})}} onPointerDown={event=>{
    if(event.button!==0&&event.button!==1)return
    const canvas=document.querySelector('[aria-label="主画布"]')?.getBoundingClientRect()
    if(!canvas||event.clientX<canvas.left||event.clientX>canvas.right||event.clientY<canvas.top||event.clientY>canvas.bottom)return
    pan.current={id:event.pointerId,x:event.clientX,y:event.clientY,offset:state.canvasOffset};event.currentTarget.setPointerCapture?.(event.pointerId);event.preventDefault()
   }} onPointerMove={event=>{const start=pan.current;if(start?.id===event.pointerId)dispatch({type:'set-canvas-offset',x:start.offset.x+event.clientX-start.x,y:start.offset.y+event.clientY-start.y})}} onPointerUp={()=>{pan.current=null}} onPointerCancel={()=>{pan.current=null}}/>,document.body):null}
   <LayerStyleWindow activeDocument={active} session={session} state={state} unavailable={reason} error={error} pending={!!pending} onPreview={effects=>setDraft(effects?{layerId:session.layerId,effects}:null)} onClose={close} onCommit={commit} onReload={()=>{
    setError('');setSession({...session,original:target?.effects?cloneEffects(target.effects):undefined})
   }}/>
  </>:null}
 </StyleContext.Provider>
}
