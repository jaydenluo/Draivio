import { layerStyleUnavailableReason } from './layerStyleCapability'
import { useLayerStyleEditor } from './LayerStyleEditor'
import { Checkbox } from '../ui/Checkbox'
import { effectLabels } from '../render/layerEffects'
import { useId, useLayoutEffect, useRef, useState, type DragEvent, type MouseEvent } from 'react'
import { CanvasScene } from '../canvas/CanvasScene'
import { MaskDefinitions } from '../canvas/MaskOverlay'
import { LayerDeleteIcon,LayerLockIcon,LayerVisibilityIcon } from '../components/LayerIcons'
import { effectiveLayerState,layerParentId,layerSubtreeIds } from '../state/layerHierarchy'
import { useEditor, type Layer } from '../state/editor'
import { SmartFilters } from './SmartFilters'
import { useSmartFilterEditor } from './SmartFilterEditor'
import { filterAddUnavailableReason } from './smartFilterControls'
import type { LayerPlacement } from './layerPanelModel'

type Props={layer:Layer;depth:number;renaming:boolean;onRename:(id:string|null)=>void;onSelect:(id:string,event:MouseEvent)=>void;onMenu:(event:MouseEvent,id:string,mask?:boolean)=>void;onDragStart:(event:DragEvent,id:string)=>void;onDragOver:(event:DragEvent,id:string)=>void;onDrop:(event:DragEvent,id:string)=>void;onDragEnd:()=>void;drop:LayerPlacement|null;dragging:boolean;onAddFilter:(id:string,trigger:HTMLButtonElement)=>void;filterMenuOpen:boolean;onEditMask:(id:string)=>void;onEditContent:(id:string,event:MouseEvent)=>void}
export function LayerRow({layer,depth,renaming,onRename,onSelect,onMenu,onDragStart,onDragOver,onDrop,onDragEnd,drop,dragging,onAddFilter,filterMenuOpen,onEditMask,onEditContent}:Props){
 const {state,dispatch}=useEditor(),input=useRef<HTMLInputElement>(null),cancelled=useRef(false)
 const {open:openStyleEditor}=useLayerStyleEditor()
 const [stylesExpanded,setStylesExpanded]=useState(false)
 const [filtersExpanded, setFiltersExpanded] = useState(false)
 const { reveal } = useSmartFilterEditor()
 const filterButton = useRef<HTMLButtonElement>(null)
 const filterCount = layer.smartFilters?.items.length ?? 0
 const filterPanelId = useId()
 useLayoutEffect(() => {
  if (reveal?.layerId !== layer.id) return
  setFiltersExpanded(true)
  if (!reveal.focus) return
  const frame = requestAnimationFrame(() => {
   filterButton.current?.scrollIntoView?.({ block: 'nearest' })
   filterButton.current?.focus({ preventScroll: true })
  })
  return () => cancelAnimationFrame(frame)
 }, [reveal, layer.id])
 useLayoutEffect(() => { if (!filterCount) setFiltersExpanded(false) }, [filterCount])
 const id=`mask-thumb-${useId().replaceAll(':','')}`,mask=state.layerMasks[layer.id]
 const selected=state.selectedLayerIds.includes(layer.id),maskSelected=selected&&state.selectedLayerId===layer.id&&state.activeToolGroup==='mask'
 const effective=effectiveLayerState(state.layers,layer.id),parent=layerParentId(state.layers,layer.id),inheritedLock=!!parent&&effectiveLayerState(state.layers,parent).locked
 const locked=layerSubtreeIds(state.layers,layer.id).some(key=>effectiveLayerState(state.layers,key).locked)
 const thumbnailIds=new Set(layerSubtreeIds(state.layers,layer.id))
 if(layer.clipBaseId)for(const key of layerSubtreeIds(state.layers,layer.clipBaseId))thumbnailIds.add(key)
 let ancestor=parent;while(ancestor&&!thumbnailIds.has(ancestor)){thumbnailIds.add(ancestor);ancestor=layerParentId(state.layers,ancestor)}
 useLayoutEffect(()=>{if(renaming){cancelled.current=false;input.current?.focus();input.current?.select()}},[renaming])
 const finish=()=>{if(!cancelled.current){cancelled.current=true;const name=input.current?.value.trim();if(name&&name!==layer.name)dispatch({type:'rename-layer',id:layer.id,name});onRename(null)}}
 const status=[inheritedLock?'继承锁定':layer.locked?'已锁定':'',!effective.visible?(layer.visible?'继承隐藏':'已隐藏'):'',layer.clipBaseId?`剪贴至 ${state.layers.find(l=>l.id===layer.clipBaseId)?.name??''}`:''].filter(Boolean).join('；')
 return <div className={`layer-entry${selected?' selected':''}${layer.children?' is-group':''}`} style={{'--layer-depth':depth} as React.CSSProperties} role="listitem">
 <div data-layer-row={layer.id} className={`layer-row${selected?' active':''}${dragging?' dragging':''}${drop?` drop-${drop}`:''}`} draggable={!renaming&&!locked} onDragStart={e=>onDragStart(e,layer.id)} onDragOver={e=>onDragOver(e,layer.id)} onDrop={e=>onDrop(e,layer.id)} onDragEnd={onDragEnd} onContextMenu={e=>onMenu(e,layer.id)} onDoubleClick={event=>{if(!(event.target as Element).closest('button,input,select,textarea,a,[contenteditable="true"]'))openStyleEditor(layer.id,event.currentTarget)}}>
  <button type="button" className={`layer-eye ${effective.visible?'visible':''}`} disabled={locked} aria-label={`${layer.name}${layer.visible?'隐藏':'显示'}`} title={status||'切换可见性'} onClick={()=>dispatch({type:'toggle-layer',id:layer.id})}><LayerVisibilityIcon visible={effective.visible}/></button>
  {layer.children?<button type="button" className="group-toggle" aria-label={`${layer.name}${layer.collapsed?'展开':'折叠'}`} onClick={()=>dispatch({type:'toggle-group',id:layer.id})}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={layer.collapsed?'m6 4 4 4-4 4':'m4 6 4 4 4-4'}/></svg></button>:null}
  <button type="button" className={`layer-content-thumb layer-thumb${selected&&!maskSelected?' target-active':''}`} aria-label={`编辑${layer.name}内容`} title={layer.smartObject?'智能对象 · 双击缩略图打开内部文档':'编辑图层内容'} aria-pressed={selected&&!maskSelected} onClick={e=>onEditContent(layer.id,e)} onDoubleClick={()=>{if(layer.smartObject)window.dispatchEvent(new CustomEvent('draivio-open-smart-object',{detail:layer.id}))}}>
   {layer.children?<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h7l2 2h9v12H3Z"/></svg>:layer.kind==='text'?<span className="layer-type-text">T</span>:<CanvasScene thumbnail state={{...state,layers:state.layers.filter(l=>thumbnailIds.has(l.id)).map(l=>({...l,visible:true})),documentBackground:'transparent'}}/>}
   {layer.smartObject?<span className="layer-smart-badge" aria-hidden="true">◇</span>:null}
  </button>
  {mask?<button type="button" className={`layer-mask-thumb layer-thumb${maskSelected?' target-active':''}${mask.disabled?' is-disabled':''}`} aria-label={`编辑${layer.name}蒙版`} aria-pressed={maskSelected} title={mask.disabled?'蒙版已停用 · 右键启用':'编辑图层蒙版 · 右键管理'} onClick={()=>onEditMask(layer.id)} onContextMenu={e=>{e.stopPropagation();onMenu(e,layer.id,true)}}>
   <svg viewBox="0 0 100 100" aria-hidden="true"><defs>{MaskDefinitions(mask,id,100,100)}</defs><rect width="100" height="100" fill="black"/><rect width="100" height="100" fill="white" mask={`url(#${id})`}/>{mask.disabled?<path d="m5 5 90 90m0-90L5 95" stroke="#ff765f" strokeWidth="5"/>:null}</svg>
  </button>:null}
  {renaming?<input ref={input} className="layer-inline-name" aria-label="图层名称" defaultValue={layer.name} maxLength={120} onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();finish()}if(e.key==='Escape'){e.preventDefault();cancelled.current=true;onRename(null)}}} onBlur={finish}/>:<button type="button" className="layer-select" aria-label={`${layer.name}图层`} aria-pressed={selected} title={[layer.name,status].filter(Boolean).join(' · ')} onClick={e=>onSelect(layer.id,e)} onDoubleClick={event=>{if((event.target as Element).closest('.layer-name')){if(!locked)onRename(layer.id)}else openStyleEditor(layer.id,event.currentTarget)}}><span className="layer-name">{layer.name}</span>{status?<span className="sr-only">{status}</span>:null}{layer.clipBaseId?<span aria-hidden="true" className="layer-clipping-mark">↳</span>:null}</button>}
  {(filterCount > 0 || selected && !filterAddUnavailableReason(state, layer)) ? <button ref={filterButton}
    type="button" className={`layer-filter-trigger${filterCount ? ' has-filters' : ''}`}
    aria-label={filterCount ? `智能滤镜 · ${filterCount}` : '添加智能滤镜'}
    title={filterCount ? `${layer.name} · ${filterCount} 个智能滤镜` : '添加智能滤镜'}
    aria-haspopup={filterCount ? undefined : 'menu'} aria-expanded={filterCount ? filtersExpanded : filterMenuOpen}
    aria-controls={filterCount && filtersExpanded ? filterPanelId : undefined}
    onClick={event => filterCount ? setFiltersExpanded(value => !value) : onAddFilter(layer.id, event.currentTarget)}>
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" aria-hidden="true">
      <path d="M3 5h4m3 0h7M3 10h8m3 0h3M3 15h2m3 0h9" />
      <path d="M7 3.5v3M11 8.5v3M5 13.5v3" />
    </svg>
  </button> : null}
  {layer.effects?.items.length ? <button type="button" className="layer-fx" aria-label={`${layer.name}图层样式`} aria-expanded={stylesExpanded} title="单击展开样式 · 双击编辑图层样式" onDoubleClick={event=>openStyleEditor(layer.id,event.currentTarget)} onClick={()=>setStylesExpanded(open=>!open)}>fx</button> : null}
  <button type="button" className={`layer-lock${effective.locked?' is-locked':''}`} disabled={inheritedLock} title={inheritedLock?'请先解锁祖先图层组':'切换锁定'} aria-label={`${layer.name}${inheritedLock?'继承锁定':layer.locked?'解锁':'锁定'}`} onClick={()=>dispatch({type:'toggle-layer-lock',id:layer.id})}><LayerLockIcon locked={effective.locked}/></button>
  <button type="button" className="layer-delete" disabled={locked} aria-label={`${layer.name}删除`} title="删除图层" onClick={()=>dispatch({type:'delete-layer',id:layer.id})}><LayerDeleteIcon/></button>
 </div>
 {stylesExpanded&&layer.effects?.items.length ? <ul className="layer-fx-list" aria-label={`${layer.name}图层样式列表`}>{layer.effects.items.map(effect=><li key={effect.kind}><Checkbox aria-label={`${layer.name}${effectLabels[effect.kind]}启用`} checked={effect.enabled} disabled={!!layerStyleUnavailableReason(state,layer.id)} onChange={event=>dispatch({type:'set-layer-effects',id:layer.id,effects:{...layer.effects!,items:layer.effects!.items.map(item=>item.kind===effect.kind?{...item,enabled:event.currentTarget.checked}:item)}})}/><button type="button" className="layer-fx-name" disabled={locked} onClick={event=>openStyleEditor(layer.id,event.currentTarget,effect.kind)}>{effectLabels[effect.kind]}</button></li>)}</ul> : null}
 {filtersExpanded && filterCount > 0 ? <SmartFilters layer={layer} id={filterPanelId} /> : null}
 </div>
}
