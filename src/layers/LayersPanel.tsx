import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { CanvasScene } from '../canvas/CanvasScene'
import { useEditor, useDocumentTransaction } from '../state/editor'
import { useEffect, useMemo, useState } from 'react'
import { NumericScrubber } from '../components/NumericScrubber'
import { LayerLockIcon, LayerVisibilityIcon } from '../components/LayerIcons'

export function LayersPanel() {
  const { state, dispatch } = useEditor()
  const transaction = useDocumentTransaction('修改图层不透明度')
  const [renaming, setRenaming] = useState(false)
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const selectedLayer = state.layers.find((layer) => layer.id === state.selectedLayerId) ?? state.layers[0]
  const visibleLayers = useMemo(() => state.layers.filter((layer) => {
    const matchesQuery = layer.name.toLowerCase().includes(query.toLowerCase())
    const matchesType = type === 'all' || (type === 'group' ? layer.className === 'layer-group' : type === 'image' ? layer.className === 'layer-art' : layer.className === 'layer-mask')
    const visited = new Set<string>()
    let parentId = layerParentId(state.layers, layer.id)
    while (parentId && !visited.has(parentId)) {
      visited.add(parentId)
      if (state.layers.find((item) => item.id === parentId)?.collapsed) return false
      parentId = layerParentId(state.layers, parentId)
    }
    return matchesQuery && matchesType
  }), [state.layers, query, type])
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
    <div className="panel-heading"><h2>图层</h2><button className="icon-button" aria-label="新建图层" onClick={() => dispatch({ type: 'add-layer' })}>＋</button></div>
    <div className="layers-toolbar"><input type="search" aria-label="搜索图层" placeholder="搜索图层" value={query} onChange={(event) => setQuery(event.target.value)} /><select aria-label="筛选图层类型" value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部</option><option value="image">图片</option><option value="mask">蒙版</option><option value="group">分组</option></select></div>
    {state.selectedLayerIds.length > 1 ? <div className="batch-actions"><span>已选 {state.selectedLayerIds.length}</span><button onClick={() => dispatch({ type: 'batch-toggle-layer', ids: state.selectedLayerIds, property: 'visible' })}>批量隐藏</button><button onClick={() => dispatch({ type: 'batch-toggle-layer', ids: state.selectedLayerIds, property: 'locked' })}>批量锁定</button><button onClick={() => dispatch({ type: 'group-layers', ids: state.selectedLayerIds })}>分组</button><button onClick={() => dispatch({ type: 'batch-delete-layers', ids: state.selectedLayerIds })}>删除</button></div> : null}
    <div className="layers-list">{visibleLayers.map((layer) => {
      const effective = effectiveLayerState(state.layers, layer.id)
      const parentId = layerParentId(state.layers, layer.id)
      const inheritedLock = !!parentId && effectiveLayerState(state.layers, parentId).locked
      const thumbnailIds = new Set(layerSubtreeIds(state.layers, layer.id))
      let ancestor = parentId
      while (ancestor && !thumbnailIds.has(ancestor)) { thumbnailIds.add(ancestor); ancestor = layerParentId(state.layers, ancestor) }
      return <div className={`layer-row ${layer.id === state.selectedLayerId ? 'active' : ''} ${layer.groupId ? 'nested' : ''} ${draggedId === layer.id ? 'dragging' : ''}`} key={layer.id} draggable onDragStart={() => setDraggedId(layer.id)} onDragEnd={() => setDraggedId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => { if (draggedId) dispatch({ type: 'move-layer', id: draggedId, targetId: layer.id }); setDraggedId(null) }}>
      {layer.children ? <button className="group-toggle" aria-label={`${layer.name}${layer.collapsed ? '展开' : '折叠'}`} onClick={() => dispatch({ type: 'toggle-group', id: layer.id })}>{layer.collapsed ? '▸' : '▾'}</button> : null}
      <button className="layer-select" aria-label={`${layer.name}图层`} aria-pressed={state.selectedLayerIds.includes(layer.id)} onClick={(event) => dispatch({ type: 'select-layer', id: layer.id, additive: event.metaKey || event.ctrlKey || event.shiftKey })} onDoubleClick={() => { dispatch({ type: 'select-layer', id: layer.id }); setRenaming(true) }}><span className="layer-thumb" aria-hidden="true" style={{ display: 'block', overflow: 'hidden', flexShrink: 0 }}><CanvasScene thumbnail state={{ ...state, layers: state.layers.filter((item) => thumbnailIds.has(item.id)), documentBackground: 'transparent' }} /></span><span>{layer.name}</span>{effective.locked || inheritedLock ? <small>{inheritedLock ? '继承锁定' : '已锁定'}</small> : null}{!effective.visible ? <small>{layer.visible ? '继承隐藏' : '已隐藏'}</small> : null}</button>
      <button className={`layer-eye ${effective.visible ? 'visible' : ''}`} disabled={effective.locked} aria-label={`${layer.name}${layer.visible ? '隐藏' : '显示'}`} onClick={() => dispatch({ type: 'toggle-layer', id: layer.id })}><LayerVisibilityIcon visible={effective.visible} /></button><button className="layer-lock" disabled={inheritedLock} title={inheritedLock ? '请先解锁祖先图层组' : undefined} aria-label={`${layer.name}${inheritedLock ? '继承锁定' : layer.locked ? '解锁' : '锁定'}`} onClick={() => dispatch({ type: 'toggle-layer-lock', id: layer.id })}><LayerLockIcon locked={effective.locked} /></button>
    </div>})}</div>
    {selectedLayer ? <><div className="layer-actions"><button onClick={() => setRenaming(!renaming)}>重命名</button><button onClick={() => dispatch({ type: 'duplicate-layer', id: selectedLayer.id })}>复制</button><button onClick={() => dispatch({ type: 'delete-layer', id: selectedLayer.id })}>删除</button><button onClick={() => dispatch({ type: 'reorder-layer', id: selectedLayer.id, direction: 'up' })}>上移</button><button onClick={() => dispatch({ type: 'reorder-layer', id: selectedLayer.id, direction: 'down' })}>下移</button>{selectedLayer.className === 'layer-group' ? <><button onClick={() => dispatch({ type: 'ungroup-layer', id: selectedLayer.id })}>取消编组</button><button onClick={() => dispatch({ type: 'merge-layers', ids: selectedLayer.children ?? [], mode: 'selected' })}>合并组</button></> : null}{state.selectedLayerIds.length > 1 ? <button onClick={() => dispatch({ type: 'merge-layers', ids: state.selectedLayerIds, mode: 'selected' })}>合并所选</button> : null}</div>{renaming ? <form className="layer-rename" onSubmit={(event) => { event.preventDefault(); const input = event.currentTarget.elements.namedItem('name') as HTMLInputElement; dispatch({ type: 'rename-layer', id: selectedLayer.id, name: input.value }); setRenaming(false) }}><input name="name" defaultValue={selectedLayer.name} aria-label="图层名称" /><button>确定</button></form> : null}<div className="field-grid layer-properties"><NumericScrubber {...transaction} key={`${state.documentId}-${selectedLayer.id}`} disabled={effectiveLayerState(state.layers, selectedLayer.id).locked} className="layer-number-field" label="不透明度" ariaLabel="图层不透明度" value={selectedLayer.opacity} min={0} max={100} unit="%" onChange={(opacity) => dispatch({ type: 'set-layer-opacity', id: selectedLayer.id, opacity })} /><Field label="混合模式"><select aria-label="图层混合模式" value={selectedLayer.blendMode} onChange={(event) => dispatch({ type: 'set-layer-blend', id: selectedLayer.id, blendMode: event.target.value })}><option>正常</option><option>正片叠底</option><option>滤色</option></select></Field></div></> : null}
  </div>
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div><label>{label}</label>{children}</div> }
