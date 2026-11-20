import type { Dispatch } from 'react'
import type { EditorAction, EditorState } from '../state/editor'
import type { ToolId } from '../tools/toolTypes'
import { createSelection } from '../canvas/selectionGeometry'
export const INSPECTOR_ACTIVATE_EVENT = 'draivio:activate-inspector-panel'
export function executeEditorCommand(id:string,state:EditorState,dispatch:Dispatch<EditorAction>):boolean {
 if(id.startsWith('tool:')){dispatch({type:'select-tool',tool:id.slice(5) as ToolId});return true}
 switch(id){
 case 'swapColors':dispatch({type:'swap-colors'});break
 case 'resetColors':dispatch({type:'reset-colors'});break
 case 'fillForeground':case 'fillBackground':window.dispatchEvent(new CustomEvent('draivio:solid-fill',{detail:id}));break
 case 'undo': case 'redo':dispatch({type:id});break
 case 'zoomIn':case 'zoomOut':dispatch({type:'set-zoom',zoom:state.zoom+(id==='zoomIn'?10:-10)});break
 case 'actual':dispatch({type:'set-zoom',zoom:100});break
 case 'fit':window.dispatchEvent(new Event('draivio:fit-canvas'));break
 case 'all':dispatch({type:'commit-selection',selection:createSelection('rectangle',{x:0,y:0,width:100,height:100})});break
 case 'deselect':
  // Cancel the selection draft before clearing, so pointer-up cannot recreate it.
  if(state.activeToolGroup==='selection')window.dispatchEvent(new CustomEvent('draivio:cancel',{cancelable:true}))
  dispatch({type:'clear-selection'});break
 case 'invert':dispatch({type:'invert-selection'});break
 case 'transform':dispatch({type:'select-tool',tool:'transform'});break
 case 'addLayer':dispatch({type:'add-layer'});break
 case 'duplicate':if(state.selectedLayerId)dispatch({type:'duplicate-layer',id:state.selectedLayerId});break
 case 'group':dispatch({type:'group-layers',ids:state.selectedLayerIds});break
 case 'ungroup':if(state.layers.find(l=>l.id===state.selectedLayerId)?.children)dispatch({type:'ungroup-layers',id:state.selectedLayerId});break
 case 'deleteLayer':dispatch({type:'batch-delete-layers',ids:state.selectedLayerIds});break
 case 'layers':case 'properties':case 'results':dispatch({type:'select-tab',tab:id==='properties'?'edit':id});window.dispatchEvent(new Event(INSPECTOR_ACTIVATE_EVENT));break
 default:return false
 }
 return true
}
