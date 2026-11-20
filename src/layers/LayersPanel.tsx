import { layerStyleUnavailableReason } from './layerStyleCapability'
import { copyLayerStyle, useLayerStyleClipboard } from './layerStyleClipboard'
import { useLayerStyleEditor } from './LayerStyleEditor'
import { cloneEffects } from '../render/layerEffects'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { PanelHeader } from '../ui/dock/PanelHeader'
import { useSmartFilterEditor } from './SmartFilterEditor'
import { filterAddItems, filterAddUnavailableReason, type AddableFilter } from './smartFilterControls'
import { SmartObjectControls } from '../document/SmartObjectControls'
import { BLEND_MODES } from '../render/blendModes'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { mergeScope, prepareLayerMerge, type MergeMode } from '../document/groupTransforms'
import { message } from '../ui/message'
import { useEditor } from '../state/editor'
import { NumericScrubber } from '../components/NumericScrubber'
import { LayerDeleteIcon } from '../components/LayerIcons'
import { LayerRow } from './LayerRow'
import { LayerMenu, type LayerMenuItem } from './LayerMenu'
import { orderedLayerTree, type LayerPlacement } from './layerPanelModel'
import './layers-panel.css'

type OpenMenu={x:number;y:number;kind:'layer'|'mask'|'filter-add';id?:string;trigger?:HTMLElement}
function PanelIcon({name}:{name:'search'|'more'|'mask'|'adjust'|'group'|'new'}){
 return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{name==='search'?<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>:name==='more'?<><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="19" cy="12" r="1" fill="currentColor"/></>:name==='mask'?<><rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="12" cy="12" r="4"/></>:name==='adjust'?<><circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor"/></>:name==='group'?<path d="M3 6h7l2 2h9v12H3Z"/>:<><rect x="5" y="3" width="14" height="18" rx="1"/><path d="M8 12h8m-4-4v8"/></>}</svg>
}
export function LayersPanel(){
 const {state,dispatch,documentId}=useEditor()
 const {open:openStyleEditor}=useLayerStyleEditor()
 const {open:openSmartFilter,reveal:filterReveal}=useSmartFilterEditor()
 const copiedStyle=useLayerStyleClipboard()
 const current=useRef({state,documentId});current.current={state,documentId}
 const [menu,setMenu]=useState<OpenMenu|null>(null),[search,setSearch]=useState(false),[query,setQuery]=useState(''),[type,setType]=useState('all')
 const [renaming,setRenaming]=useState<string|null>(null),[smartProperties,setSmartProperties]=useState(false)
 const [draggedId,setDraggedId]=useState<string|null>(null),[drop,setDrop]=useState<{id:string;placement:LayerPlacement}|null>(null)
 const [merging,setMerging]=useState(false),mergeController=useRef<AbortController|null>(null),anchorId=useRef<string|null>(null),searchInput=useRef<HTMLInputElement>(null)
 const list=useRef<HTMLDivElement>(null)
 useEffect(()=>()=>mergeController.current?.abort(),[])
 useEffect(()=>{mergeController.current?.abort();setMenu(null);setRenaming(null);setSmartProperties(false);setDraggedId(null);setDrop(null);anchorId.current=null;setQuery('');setType('all');setSearch(false)},[documentId])
 useEffect(()=>{if(search)searchInput.current?.focus()},[search])
 useEffect(()=>{if(filterReveal?.focus){setQuery('');setType('all')}},[filterReveal])
 const closeMenu=useCallback(()=>setMenu(null),[])
 const selected=state.layers.filter(l=>state.selectedLayerIds.includes(l.id)),selectedLayer=selected.find(l=>l.id===state.selectedLayerId)??selected[0]
 const locked=(id:string)=>layerSubtreeIds(state.layers,id).some(key=>effectiveLayerState(state.layers,key).locked)
 const propertiesDisabled=!selected.length||selected.some(l=>locked(l.id))
 const opacityMixed=selected.some(l=>l.opacity!==selected[0]?.opacity),blendMixed=selected.some(l=>l.blendMode!==selected[0]?.blendMode)
 const board=state.artboards.find(b=>b.id===state.activeArtboardId)
 const visible=useMemo(()=>{
  const boardIds=board&&state.artboards.length>1?new Set(board.layerIds.flatMap(id=>layerSubtreeIds(state.layers,id))):null
  return orderedLayerTree(state.layers).filter(({layer})=>{
   if(boardIds&&!boardIds.has(layer.id))return false
   if(!layer.name.toLowerCase().includes(query.toLowerCase()))return false
   return type==='all'||(type==='group'?!!layer.children:type==='image'?!!layer.source||layer.kind==='image':type==='text'?layer.kind==='text'||state.canvasTexts.some(t=>t.layerId===layer.id):type==='adjustment'?layer.kind==='adjustment':!!state.layerMasks[layer.id])
  })
 },[state.layers,state.canvasTexts,state.layerMasks,state.artboards,board,query,type])
 const select=(id:string,event?:Pick<MouseEvent,'shiftKey'|'ctrlKey'|'metaKey'>)=>{
  const ids=visible.map(({layer})=>layer.id)
  if(event?.shiftKey){const from=ids.indexOf(anchorId.current??state.selectedLayerId),to=ids.indexOf(id);if(from>=0&&to>=0){dispatch({type:'select-layers',ids:ids.slice(Math.min(from,to),Math.max(from,to)+1),keyId:id});return}}
  anchorId.current=id
  if(event?.ctrlKey||event?.metaKey){const next=state.selectedLayerIds.includes(id)?state.selectedLayerIds.filter(key=>key!==id):[...state.selectedLayerIds,id];dispatch({type:'select-layers',ids:next,keyId:id});return}
  dispatch({type:'select-layer',id})
 }
 const openMenu=(event:MouseEvent,id:string,mask=false)=>{
  if((event.target as Element).closest('input'))return
  event.preventDefault();event.stopPropagation()
  if(!state.selectedLayerIds.includes(id)||mask)select(id)
  setMenu({x:event.clientX,y:event.clientY,kind:mask?'mask':'layer',id,trigger:event.currentTarget as HTMLElement})
 }
 const openFilterMenu = (id: string, trigger: HTMLButtonElement) => {
  const rect = trigger.getBoundingClientRect()
  setMenu(current => current?.kind === 'filter-add' && current.trigger === trigger ? null
   : { kind: 'filter-add', x: rect.right - 218, y: rect.bottom + 4, id, trigger })
 }
 const editMask=(id:string)=>{select(id);dispatch({type:'select-tool',tool:'mask'})}
 const editContent=(id:string,event:MouseEvent)=>{select(id,event);if(state.activeToolGroup==='mask')dispatch({type:'select-tool',tool:'brush'})}
 const merge=async(mode:MergeMode)=>{
  if(mergeController.current)return
  const controller=new AbortController();mergeController.current=controller;setMerging(true)
  try{const result=await prepareLayerMerge(state,mode,undefined,{signal:controller.signal});if(!controller.signal.aborted&&current.current.documentId===documentId)dispatch({type:'merge-layer-result',result})}
  catch(e){if(!controller.signal.aborted)message.error(e instanceof Error?e.message:'合并失败')}
  finally{if(mergeController.current===controller){mergeController.current=null;setMerging(false)}}
 }
 const menuLayer=state.layers.find(l=>l.id===(menu?.id??selectedLayer?.id)),menuLocked=!!menuLayer&&locked(menuLayer.id)
 const canMerge=(mode:MergeMode)=>{if(merging)return false;try{mergeScope(state,mode);return true}catch{return false}}
 const filterAddReason=filterAddUnavailableReason(state,menuLayer)
 const menuItems:LayerMenuItem[]=menu?.kind==='filter-add'?filterAddItems().map(item=>({...item,disabled:!!filterAddReason})):menu?.kind==='mask'&&menuLayer?[
  {id:'mask-toggle',label:state.layerMasks[menuLayer.id]?.disabled?'启用蒙版':'停用蒙版',disabled:menuLocked},
  {id:'mask-invert',label:'反相蒙版',disabled:menuLocked},
  {id:'mask-apply',label:'应用蒙版',disabled:menuLocked||!!state.layerMasks[menuLayer.id]?.applied&&!state.layerMasks[menuLayer.id]?.disabled},
  {id:'mask-delete',label:'删除蒙版',disabled:menuLocked,danger:true},
 ]:[
  {id:'duplicate',label:'复制',disabled:!menuLayer||selected.length!==1,section:'manage'},
  {id:'rename',label:'重命名',disabled:!menuLayer||menuLocked||selected.length!==1,section:'manage'},
  {id:'group',label:'编组',disabled:selected.length<1||propertiesDisabled,section:'manage'},
  {id:'ungroup',label:'取消编组',disabled:!menuLayer?.children||menuLocked,section:'manage'},
  {id:'delete',label:'删除',disabled:!selected.length||propertiesDisabled,danger:true,section:'manage'},
  {id:'merge-selected',label:'合并所选',disabled:!selected.length||!canMerge('selected'),section:'merge'},
  {id:'merge-down',label:'向下合并',disabled:!menuLayer||selected.length!==1||!canMerge('down'),section:'merge'},
  {id:'merge-visible',label:'合并可见',disabled:!canMerge('visible'),section:'merge'},
  {id:'merge-flatten',label:'拼合图像',disabled:!canMerge('flatten'),section:'merge'},
  {id:'clipping',label:menuLayer?.clipBaseId?'释放剪贴蒙版':'创建剪贴蒙版',disabled:!menuLayer||menuLocked||selected.length!==1,section:'advanced'},
  {id:'smart',label:menuLayer?.smartObject?'智能对象属性':'转换为智能对象',disabled:!menuLayer||menuLocked||selected.length!==1||!!menuLayer.children,section:'advanced'},
  {id:'filters',label:'添加智能滤镜',disabled:!!filterAddReason||selected.length!==1,title:filterAddReason,section:'advanced'},
  {id:'style-edit',label:'混合选项…',disabled:!menuLayer||!!layerStyleUnavailableReason(state,menuLayer.id),section:'styles'},
  {id:'style-copy',label:'复制样式',disabled:!menuLayer?.effects?.items.length||selected.length!==1,section:'styles'},
  {id:'style-paste',label:'粘贴样式',disabled:!copiedStyle||!menuLayer||!!layerStyleUnavailableReason(state,menuLayer.id)||selected.length!==1,section:'styles'},
  {id:'style-clear',label:'清除样式',disabled:!menuLayer?.effects?.items.length||!!layerStyleUnavailableReason(state,menuLayer?.id??'')||selected.length!==1,section:'styles'},
  {id:'up',label:'上移',disabled:!menuLayer||menuLocked||selected.length!==1,section:'arrange'},
  {id:'down',label:'下移',disabled:!menuLayer||menuLocked||selected.length!==1,section:'arrange'},
  {id:'top',label:'置顶',disabled:!menuLayer||menuLocked||selected.length!==1,section:'arrange'},
  {id:'bottom',label:'置底',disabled:!menuLayer||menuLocked||selected.length!==1,section:'arrange'},
 ]
 const action=(id:string)=>{
  const target=menuLayer??selectedLayer
  if(id.startsWith('merge-')){void merge(({selected:'selected',down:'down',visible:'visible',flatten:'flatten'} as const)[id.slice(6) as 'selected'|'down'|'visible'|'flatten']);return}
  if(id.startsWith('mask-')&&target){dispatch({type:'update-layer-mask',id:target.id,operation:({toggle:'toggle',invert:'invert',apply:'apply',delete:'delete'} as const)[id.slice(5) as 'toggle'|'invert'|'apply'|'delete']});return}
  if(id==='group'){dispatch({type:'group-layers',ids:state.selectedLayerIds});return}
  if(id==='delete'){dispatch({type:'batch-delete-layers',ids:state.selectedLayerIds});return}
  if(!target)return
  if(id==='style-edit'){const anchor=menu?.trigger??list.current;if(anchor)openStyleEditor(target.id,anchor);return}
  if(id==='style-copy'&&target.effects?.items.length){copyLayerStyle(target.effects);return}
  if(id==='style-paste'&&copiedStyle&&!locked(target.id)){dispatch({type:'set-layer-effects',id:target.id,effects:cloneEffects(copiedStyle)});return}
  if(id==='style-clear'&&!locked(target.id)){dispatch({type:'set-layer-effects',id:target.id,effects:{version:1,items:[]}});return}
  if(id==='rename')setRenaming(target.id)
  if(id==='duplicate')dispatch({type:'duplicate-layer',id:target.id})
  if(id==='ungroup')dispatch({type:'ungroup-layers',id:target.id})
  if(id==='clipping')dispatch({type:target.clipBaseId?'release-clipping':'create-clipping',id:target.id})
  if(id==='smart'){if(target.smartObject)setSmartProperties(true);else dispatch({type:'convert-to-smart-object',id:target.id})}
  if(id==='filters' && menu && !filterAddReason){
   setMenu({...menu,kind:'filter-add',id:target.id})
   return
  }
  if(id.startsWith('filter-add:') && menu && !filterAddReason){
   const trigger=menu.trigger??list.current
   if(trigger)openSmartFilter(target.id,trigger,{kind:id.slice('filter-add:'.length) as AddableFilter})
   return
  }
  if(id==='up'||id==='down')dispatch({type:'reorder-layer',id:target.id,direction:id})
  if(id==='top'||id==='bottom'){
   const parent=layerParentId(state.layers,target.id),siblings=orderedLayerTree(state.layers).filter(({layer})=>layerParentId(state.layers,layer.id)===parent)
   const sibling=(id==='top'?siblings[0]:siblings.at(-1))?.layer
   if(sibling)dispatch({type:'place-layer',id:target.id,targetId:sibling.id,placement:id==='top'?'before':'after'})
  }
 }
 const dragStart=(event:DragEvent,id:string)=>{if(locked(id)){event.preventDefault();return}setDraggedId(id);event.dataTransfer?.setData('application/x-draivio-layer',id);if(event.dataTransfer)event.dataTransfer.effectAllowed='move'}
 const dragOver=(event:DragEvent,id:string)=>{
  if(!draggedId||draggedId===id||layerSubtreeIds(state.layers,draggedId).includes(id)||locked(id))return
  event.preventDefault();event.stopPropagation()
  const rect=event.currentTarget.getBoundingClientRect(),position=(event.clientY-rect.top)/(rect.height||44),target=state.layers.find(l=>l.id===id)
  setDrop({id,placement:target?.children&&position>.25&&position<.75?'inside':position<.5?'before':'after'})
 }
 const dropLayer=(event:DragEvent,id:string)=>{event.preventDefault();event.stopPropagation();if(draggedId&&drop?.id===id)dispatch({type:'place-layer',id:draggedId,targetId:id,placement:drop.placement});setDraggedId(null);setDrop(null)}
 const addMask=()=>{if(!selectedLayer)return;if(state.layerMasks[selectedLayer.id])editMask(selectedLayer.id);else{dispatch({type:'add-layer-mask',id:selectedLayer.id});dispatch({type:'select-tool',tool:'mask'})}}
 return <div className="inspector-panel layers-panel" tabIndex={-1} onKeyDown={event=>{
  if((event.target as Element).closest('input,textarea,select,[role="menu"],[contenteditable="true"]')||event.altKey||event.metaKey||event.ctrlKey)return
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return
  event.preventDefault();event.stopPropagation()
  const index=visible.findIndex(({layer})=>layer.id===state.selectedLayerId),next=visible[Math.max(0,Math.min(visible.length-1,index+(event.key==='ArrowUp'?-1:1)))]
  if(next){select(next.layer.id,event);list.current?.querySelector<HTMLButtonElement>(`[data-layer-row="${CSS.escape(next.layer.id)}"] .layer-select`)?.focus()}
 }}>
  <PanelHeader title="图层" className="layers-panel-header"><span className="layers-board-name" title={board?.name}>{board?.name??''}</span><button type="button" className="layers-icon-button" aria-label="搜索与筛选图层" aria-expanded={search} title="搜索与筛选图层" onClick={()=>{setSearch(!search);if(search){setQuery('');setType('all')}}}><PanelIcon name="search"/></button><button type="button" className="layers-icon-button" aria-label="图层更多操作" aria-haspopup="menu" aria-expanded={!!menu&&menu.kind==='layer'} title="更多图层操作" onClick={event=>{if(menu){setMenu(null);return}const rect=event.currentTarget.getBoundingClientRect();setMenu({x:rect.right-220,y:rect.bottom+4,kind:'layer',trigger:event.currentTarget})}}><PanelIcon name="more"/></button></PanelHeader>
  <div className="layers-top-properties" role="group" aria-label="所选图层属性">
   <select aria-label="图层混合模式" disabled={propertiesDisabled} value={blendMixed?'':(BLEND_MODES.find(mode=>mode.id===selectedLayer?.blendMode||mode.label===selectedLayer?.blendMode)?.label??'正常')} onChange={event=>dispatch({type:'set-selected-layer-properties',ids:state.selectedLayerIds,blendMode:event.target.value})}>{blendMixed?<option value="" disabled>混合</option>:null}{[...new Set(BLEND_MODES.map(m=>m.category))].map(category=><optgroup key={category} label={category}>{BLEND_MODES.filter(m=>m.category===category).map(m=><option key={m.id} value={m.label}>{m.label}</option>)}</optgroup>)}</select>
   <NumericScrubber label="不透明度" ariaLabel="图层不透明度" className="layers-opacity" value={selectedLayer?.opacity??100} mixed={opacityMixed} min={0} max={100} unit="%" disabled={propertiesDisabled} onChange={opacity=>dispatch({type:'set-selected-layer-properties',ids:state.selectedLayerIds,opacity})}/>
  </div>
  {search?<div className="layers-search-row"><input ref={searchInput} type="search" aria-label="搜索图层" placeholder="搜索图层" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){e.stopPropagation();setSearch(false);setQuery('');setType('all')}}}/><select aria-label="筛选图层类型" value={type} onChange={e=>setType(e.target.value)}><option value="all">全部</option><option value="image">图片</option><option value="text">文字</option><option value="adjustment">调整</option><option value="mask">含蒙版</option><option value="group">分组</option></select></div>:null}
  {selected.length>1?<div className="layers-selection-info">已选 {selected.length} 个图层</div>:null}
  {merging?<div className="layers-merge-progress" role="status">正在合并图层…<button type="button" onClick={()=>mergeController.current?.abort()}>取消合并</button></div>:null}
  <div ref={list} className="layers-list" role="list" aria-label="图层列表" onClick={event=>{if(event.target===event.currentTarget)dispatch({type:'select-layers',ids:[]})}}>
   {visible.map(({layer,depth})=><div className="layer-stack" key={layer.id}>
    <LayerRow layer={layer} depth={depth} renaming={renaming===layer.id} onRename={setRenaming} onSelect={select} onMenu={openMenu} onAddFilter={openFilterMenu} filterMenuOpen={menu?.kind==='filter-add' && menu.id===layer.id} onEditMask={editMask} onEditContent={editContent} onDragStart={dragStart} onDragOver={dragOver} onDrop={dropLayer} onDragEnd={()=>{setDraggedId(null);setDrop(null)}} dragging={draggedId===layer.id} drop={drop?.id===layer.id?drop.placement:null}/>
    {layer.id===selectedLayer?.id&&layer.smartObject?<div className="layers-smart-details" hidden={!smartProperties}><SmartObjectControls key={layer.id} layerId={layer.id}/></div>:null}
   </div>)}
   {!visible.length?<p className="layers-empty">{query||type!=='all'?'没有匹配的图层':'暂无图层'}</p>:null}
  </div>
  {selectedLayer&&state.artboards.length>1?<label className="layers-board-destination">移动到画板<select aria-label="图层目标画板" value={state.artboards.find(b=>b.layerIds.some(id=>layerSubtreeIds(state.layers,id).includes(selectedLayer.id)))?.id??''} disabled={propertiesDisabled} onChange={e=>{const from=state.artboards.find(b=>b.layerIds.some(id=>layerSubtreeIds(state.layers,id).includes(selectedLayer.id)));if(from)dispatch({type:'move-layer-to-artboard',layerId:selectedLayer.id,from:from.id,to:e.target.value})}}>{state.artboards.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label>:null}
  <div className="layers-bottom-toolbar" role="toolbar" aria-label="图层常用操作">
   <button type="button" aria-label="添加图层蒙版" title="添加或编辑图层蒙版" disabled={propertiesDisabled||selected.length!==1} onClick={addMask}><PanelIcon name="mask"/><span>蒙版</span></button>
   <button type="button" aria-label="新建调整图层" title="新建调整图层" onClick={()=>dispatch({type:'add-adjustment-layer'})}><PanelIcon name="adjust"/><span>调整</span></button>
   <button type="button" aria-label="图层编组" title={selected.length?'编组所选图层':'新建空图层组'} disabled={selected.length>0&&propertiesDisabled} onClick={()=>dispatch(selected.length>0?{type:'group-layers',ids:state.selectedLayerIds}:{type:'add-layer-group'})}><PanelIcon name="group"/><span>分组</span></button>
   <button type="button" aria-label="新建图层" title="新建图层" onClick={()=>dispatch({type:'add-layer'})}><PanelIcon name="new"/><span>新建</span></button>
   <button type="button" aria-label="删除所选图层" title="删除所选图层" className="danger" disabled={propertiesDisabled} onClick={()=>dispatch({type:'batch-delete-layers',ids:state.selectedLayerIds})}><LayerDeleteIcon/><span>删除</span></button>
  </div>
  {menu?<LayerMenu key={menu.kind} {...menu} label={menu.kind==='filter-add'?'添加智能滤镜':undefined} showSectionLabels={menu.kind==='filter-add'} items={menuItems} onAction={action} onClose={closeMenu}/>:null}
 </div>
}
