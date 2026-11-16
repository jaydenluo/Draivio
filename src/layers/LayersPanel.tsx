import { Fragment } from 'react'
import { SmartFilters } from './SmartFilters'
import { SmartObjectControls } from '../document/SmartObjectControls'
import { BLEND_MODES } from '../render/blendModes'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { prepareLayerMerge, type MergeMode } from '../document/groupTransforms'
import { message } from '../ui/message'
import { useRef } from 'react'
import { CanvasScene } from '../canvas/CanvasScene'
import { useEditor } from '../state/editor'
import { useEffect, useMemo, useState } from 'react'
import { NumericScrubber } from '../components/NumericScrubber'
import { LayerDeleteIcon, LayerLockIcon, LayerVisibilityIcon } from '../components/LayerIcons'

export function LayersPanel() {
  const { state, dispatch, documentId } = useEditor()
  const current=useRef({state,documentId});current.current={state,documentId}
  const mergeController=useRef<AbortController|null>(null)
  useEffect(()=>()=>mergeController.current?.abort(),[])
  const [merging,setMerging]=useState(false)
  const merge=async(mode:MergeMode)=>{
    if(mergeController.current)return
    const controller=new AbortController();mergeController.current=controller;setMerging(true)
    try{
      const result=await prepareLayerMerge(state,mode,undefined,{signal:controller.signal})
      if(controller.signal.aborted||current.current.documentId!==documentId)return
      dispatch({type:'merge-layer-result',result})
    }catch(e){if(!controller.signal.aborted)message.error(e instanceof Error?e.message:'合并失败')}
    finally{mergeController.current=null;setMerging(false)}
  }

  const [renaming, setRenaming] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const selectedSegments=state.layers.filter(layer=>state.selectedLayerIds.includes(layer.id)&&layer.mergeBatchId)
  const mergeBatchSelected=selectedSegments.length>0&&selectedSegments.length===state.selectedLayerIds.length&&new Set(selectedSegments.map(layer=>layer.mergeBatchId)).size===1
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId) ?? state.layers[0]
  const visibleLayers = useMemo(() => state.layers.filter((layer) => {
    const board = state.artboards.find(board => board.id === state.activeArtboardId)
    if (board && (state.artboards.length > 1 || board.layerIds.every(id => state.layers.some(item => item.id === id))) && !board.layerIds.some(id => layerSubtreeIds(state.layers,id).includes(layer.id))) return false
    const matchesQuery = layer.name.toLowerCase().includes(query.toLowerCase())
    const matchesType = type === 'all' || (type === 'group' ? layer.className === 'layer-group' : type === 'image' ? layer.className === 'layer-art' : type === 'adjustment' ? layer.kind === 'adjustment' : layer.className === 'layer-mask')
    const visited = new Set<string>()
    let parentId = layerParentId(state.layers, layer.id)
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      if (state.layers.find((item) => item.id === parentId)?.collapsed) return false
      parentId = layerParentId(state.layers, parentId)
    }
    return matchesQuery && matchesType
  }), [state.layers, state.artboards, state.activeArtboardId, query, type])
  const handleKeyDown = (event: React.KeyboardEvent) => {
    const target = event.target as HTMLElement
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return
    const command = event.metaKey || event.ctrlKey
    const handled = event.key === 'Delete' || event.key === 'ArrowUp' || event.key === 'ArrowDown' || (command && event.key.toLowerCase() === 'd') || (command && event.shiftKey && event.key.toLowerCase() === 'g')
    if (!handled) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Delete' && state.selectedLayerIds.length) dispatch({ type: 'batch-delete-layers', ids: state.selectedLayerIds })
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedLayer) dispatch({ type: 'duplicate-layer', id: selectedLayer.id })
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'g') dispatch({ type: 'group-layers', ids: state.selectedLayerIds })
    if (event.key === 'ArrowUp' && selectedLayer) dispatch({ type: 'reorder-layer', id: selectedLayer.id, direction: 'up' })
    if (event.key === 'ArrowDown' && selectedLayer) dispatch({ type: 'reorder-layer', id: selectedLayer.id, direction: 'down' })
  }
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.target as HTMLElement)?.tagName === 'INPUT' || (event.target as HTMLElement)?.tagName === 'TEXTAREA') return; if (event.key === 'Delete' && state.selectedLayerIds.length) dispatch({ type: 'batch-delete-layers', ids: state.selectedLayerIds }); if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'd' && selectedLayer) dispatch({ type: 'duplicate-layer', id: selectedLayer.id }); if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'g') dispatch({ type: 'group-layers', ids: state.selectedLayerIds }) }; window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey) }, [dispatch, selectedLayer, state.selectedLayerIds])
  return <div className="inspector-panel" onKeyDown={handleKeyDown} tabIndex={-1}>
    <div className="panel-heading"><h2>图层</h2><span aria-label="当前画板">{state.artboards.find(board => board.id === state.activeArtboardId)?.name ?? '画板'}<button className="icon-button" aria-label="新建图层" onClick={() => dispatch({ type: 'add-layer' })}>＋</button><button className="icon-button" aria-label="新建调整图层" title="新建调整图层" onClick={() => dispatch({ type: 'add-adjustment-layer' })}>◐</button></span></div>
    {state.artboards.length > 1 && selectedLayer ? <label>移动到画板<select aria-label="图层目标画板" value={state.artboards.find(board => board.layerIds.some(id => layerSubtreeIds(state.layers,id).includes(selectedLayer.id)))?.id ?? ''} onChange={event => { const from = state.artboards.find(board => board.layerIds.some(id => layerSubtreeIds(state.layers,id).includes(selectedLayer.id))); if (from) dispatch({ type: 'move-layer-to-artboard', layerId: selectedLayer.id, from: from.id, to: event.target.value }) }}>{state.artboards.map(board => <option key={board.id} value={board.id}>{board.name}</option>)}</select></label> : null}
    <div className="layers-toolbar"><input type="search" aria-label="搜索图层" placeholder="搜索图层" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="筛选图层类型" value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部</option><option value="image">图片</option><option value="adjustment">调整</option><option value="mask">蒙版</option><option value="group">分组</option></select></div>
    {state.selectedLayerIds.length > 1 ? <div className="batch-actions"><span>已选 {state.selectedLayerIds.length}</span><button onClick={() => dispatch({ type: 'batch-toggle-layer', ids: state.selectedLayerIds, property: 'visible' })}>批量隐藏</button><button onClick={() => dispatch({ type: 'batch-toggle-layer', ids: state.selectedLayerIds, property: 'locked' })}>批量锁定</button><button onClick={() => dispatch({ type: 'group-layers', ids: state.selectedLayerIds })}>分组</button><button onClick={() => dispatch({ type: 'batch-delete-layers', ids: state.selectedLayerIds })}>删除</button></div> : null}
    <div className="layer-actions layer-merge-actions" role="group" aria-label="图层合并操作"><button disabled={merging} onClick={()=>void merge('selected')}>合并所选</button><button disabled={merging} onClick={()=>void merge('down')}>向下合并</button><button disabled={merging} onClick={()=>void merge('visible')}>合并可见</button><button disabled={merging} onClick={()=>void merge('flatten')}>拼合图像</button>{selectedLayer?.children?<button onClick={()=>dispatch({type:'ungroup-layers',id:selectedLayer.id})}>解组</button>:null}{merging?<button onClick={()=>mergeController.current?.abort()}>取消合并</button>:null}<small className="layer-merge-note">栅格化当前效果；跨图层或分组生成多段并保留原叠放，隐藏层不变。</small></div>
    {mergeBatchSelected?<small role="status">已选 {selectedSegments.length} 段，保留原叠放、祖先效果及隐藏层。</small>:null}
    <div className="layers-list">{visibleLayers.map((layer, index) => {
      const effective = effectiveLayerState(state.layers, layer.id)
      const parentId = layerParentId(state.layers, layer.id)
      const inheritedLock = !!parentId && effectiveLayerState(state.layers, parentId).locked
      const thumbnailIds = new Set(layerSubtreeIds(state.layers, layer.id))
      if(layer.clipBaseId)for(const id of layerSubtreeIds(state.layers,layer.clipBaseId))thumbnailIds.add(id)
      let ancestor = parentId
      while (ancestor && !thumbnailIds.has(ancestor)) { thumbnailIds.add(ancestor); ancestor = layerParentId(state.layers, ancestor) }
      return <Fragment key={layer.id}><div className={`layer-row ${layer.id === state.selectedLayerId ? 'active' : ''} ${layer.groupId || layer.clipBaseId ? 'nested' : ''} ${draggedId === layer.id ? 'dragging' : ''}`} key={layer.id} draggable onDragStart={() => setDraggedId(layer.id)} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId) dispatch({ type: 'move-layer', id: draggedId, toIndex: index }); setDraggedId(null) }}>
      {layer.children ? <button className="group-toggle" aria-label={`${layer.name}${layer.collapsed ? '展开' : '折叠'}`} onClick={() => dispatch({ type: 'toggle-group', id: layer.id })}>{layer.collapsed ? '▸' : '▾'}</button> : null}
      <button className="layer-select" aria-label={`${layer.name}图层`} aria-pressed={state.selectedLayerIds.includes(layer.id)} onClick={(event) => dispatch({ type: 'select-layer', id: layer.id, additive: event.metaKey || event.ctrlKey || event.shiftKey })} onDoubleClick={() => { dispatch({ type: 'select-layer', id: layer.id }); if (layer.smartObject) window.dispatchEvent(new CustomEvent('draivio-open-smart-object', { detail: layer.id })); else setRenaming(true) }}><span className="layer-thumb" aria-hidden="true" style={{ display: 'block', overflow: 'hidden', flexShrink: 0 }}><CanvasScene thumbnail state={{ ...state, layers: state.layers.filter((item) => thumbnailIds.has(item.id)), documentBackground: 'transparent' }} /></span><span>{layer.name}</span>{layer.clipBaseId?<small title="仅显示在基底不透明区域">↳ 剪贴至 {state.layers.find(base=>base.id===layer.clipBaseId)?.name}</small>:null}{layer.mergeBatchId?<small title="同次合并的原位片段">合并片段</small>:null}{effective.locked || inheritedLock ? <small>{inheritedLock ? '继承锁定' : '已锁定'}</small> : null}{!effective.visible ? <small>{layer.visible ? '继承隐藏' : '已隐藏'}</small> : null}</button>
      <button className={`layer-eye ${effective.visible ? 'visible' : ''}`} disabled={effective.locked} aria-label={`${layer.name}${layer.visible ? '隐藏' : '显示'}`} onClick={() => dispatch({ type: 'toggle-layer', id: layer.id })}><LayerVisibilityIcon visible={effective.visible} /></button><button className="layer-lock" disabled={inheritedLock} title={inheritedLock ? '请先解锁祖先图层组' : undefined} aria-label={`${layer.name}${inheritedLock ? '继承锁定' : layer.locked ? '解锁' : '锁定'}`} onClick={() => dispatch({ type: 'toggle-layer-lock', id: layer.id })}><LayerLockIcon locked={effective.locked} /></button><button className="layer-delete" disabled={effective.locked} aria-label={`${layer.name}删除`} title="删除图层" onClick={() => dispatch({ type: 'delete-layer', id: layer.id })}><LayerDeleteIcon /></button>
    </div><SmartFilters layerId={layer.id}/></Fragment>})}</div>
    {selectedLayer ? <><SmartObjectControls key={selectedLayer.id} layerId={selectedLayer.id} /><div className="layer-actions"><button disabled={effectiveLayerState(state.layers,selectedLayer.id).locked} onClick={() => dispatch({type:selectedLayer.clipBaseId?'release-clipping':'create-clipping',id:selectedLayer.id})}>{selectedLayer.clipBaseId?'释放剪贴蒙版':'创建剪贴蒙版'}</button>{selectedLayer.smartObject ? null : <button disabled={effectiveLayerState(state.layers,selectedLayer.id).locked} onClick={() => dispatch({ type: 'convert-to-smart-object', id: selectedLayer.id })}>转换为智能对象</button>}<button onClick={() => setRenaming(!renaming)}>重命名</button><button onClick={() => dispatch({ type: 'duplicate-layer', id: selectedLayer.id })}>复制</button><button onClick={() => dispatch({ type: 'delete-layer', id: selectedLayer.id })}>删除</button><button onClick={() => dispatch({ type: 'reorder-layer', id: selectedLayer.id, direction: 'up' })}>上移</button><button onClick={() => dispatch({ type: 'reorder-layer', id: selectedLayer.id, direction: 'down' })}>下移</button></div>{renaming ? <form className="layer-rename" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement; dispatch({ type: 'rename-layer', id: selectedLayer.id, name: input.value }); setRenaming(false) }}><input name="name" defaultValue={selectedLayer.name} aria-label="图层名称" /><button>确定</button></form> : null}<div className="field-grid layer-properties"><NumericScrubber className="layer-number-field" label="不透明度" ariaLabel="图层不透明度" value={selectedLayer.opacity} min={0} max={100} unit="%" onChange={(opacity) => dispatch({ type: 'set-layer-opacity', id: selectedLayer.id, opacity })} /><Field label="混合模式"><select disabled={effectiveLayerState(state.layers,selectedLayer.id).locked} aria-label="图层混合模式" value={BLEND_MODES.find(mode=>mode.id===selectedLayer.blendMode||mode.label===selectedLayer.blendMode)?.label??selectedLayer.blendMode} onChange={(event) => dispatch({ type: 'set-layer-blend', id: selectedLayer.id, blendMode: event.target.value })}>{[...new Set(BLEND_MODES.map(mode=>mode.category))].map(category=><optgroup key={category} label={category}>{BLEND_MODES.filter(mode=>mode.category===category).map(mode=><option key={mode.id} value={mode.label}>{mode.label}</option>)}</optgroup>)}</select></Field></div></> : null}
  </div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label>{label}</label>{children}</div> }
