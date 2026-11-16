import { layerWorldPixelMatrix } from '../canvas/layerWorldMatrix'
import { invertMatrix } from '../canvas/layerCoordinates'
import { useEffect, useRef, useState } from 'react'
import { CanvasScene } from '../canvas/CanvasScene'
import { useEditor, type EditorState, type Layer } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
import { activeSmartFilters, createSmartFilter, FILTER_RADIUS_REASON, MAX_FILTER_RADIUS, MAX_SMART_FILTERS, smartFilterNames, validateSmartFilters, type SmartFilterChain, type SmartFilterKind } from '../render/filterPipeline'
import { FloatingSurface } from '../ui/FloatingSurface'
import './smart-filters.css'
type Draft = { chain: SmartFilterChain; base: EditorState; layer: Layer; documentId: string; editId: string; sourceRevision?: number }
export function SmartFilters({ layerId }: { layerId: string }) {
 const {state,dispatch,documentId}=useEditor()
 const layer=state.layers.find(item=>item.id===layerId)
 const [draft,setDraft]=useState<Draft|null>(null),[error,setError]=useState(''),[dragged,setDragged]=useState<string|null>(null)
 const consumed=useRef(false)
 const source=layer?.smartObject ? state.smartObjectSources[layer.smartObject.sourceId] : undefined
 const unsupported=state.pixelFormat!=='rgba8'||!!layer?.highPrecision
 const locked=unsupported||!layer||effectiveLayerState(state.layers,layerId).locked
 useEffect(()=>{setDraft(null);setError('')},[documentId,layerId])
 if(!layer||layer.kind==='adjustment'||layer.children)return null
 const chain=layer.smartFilters??{items:[]}
 const commit=(next:SmartFilterChain)=>dispatch({type:'set-smart-filters',id:layerId,chain:next,expectedLayer:layer,expectedSourceRevision:source?.revision})
 const open=(editId:string,kind?:SmartFilterKind)=>{
  if(locked)return
  consumed.current=false
  const next=structuredClone(chain)
  if(kind)next.items.push(createSmartFilter(kind,editId))
  setDraft({chain:next,base:state,layer,documentId,editId,sourceRevision:source?.revision});setError('')
 }
 const patch=(value:Partial<SmartFilterChain>)=>{if(draft){setDraft({...draft,chain:{...draft.chain,...value}});setError('')}}
 const move=(id:string,target:string)=>{if(id===target)return;const items=[...chain.items],from=items.findIndex(f=>f.id===id),to=items.findIndex(f=>f.id===target);if(from<0||to<0)return;items.splice(to,0,items.splice(from,1)[0]);commit({...chain,items})}
 const stale=!!draft&&(draft.documentId!==documentId||draft.layer!==layer||draft.base.undoStack!==state.undoStack||draft.sourceRevision!==source?.revision)
 const selected=draft?.chain.items.find(f=>f.id===draft.editId)
 const invalid=(()=>{if(!draft)return false;try{validateSmartFilters(draft.chain);return false}catch{return true}})()
 const close=()=>{setDraft(null);setError('')}
 const confirm=()=>{
  if(!draft||consumed.current||stale||locked)return
  try{const next=validateSmartFilters(draft.chain);consumed.current=true;dispatch({type:'set-smart-filters',id:layerId,chain:next,expectedLayer:draft.layer,expectedSourceRevision:draft.sourceRevision});close()}catch(e){setError(e instanceof Error?e.message:'参数无效')}
 }
 return <details className="smart-filters" onDragStart={e=>e.stopPropagation()} onDragOver={e=>e.stopPropagation()} onDrop={e=>e.stopPropagation()}><summary>智能滤镜 · {chain.items.length}</summary>
  {unsupported?<small role="status">常用滤镜仅支持 8 位 RGBA；请明确转换为 8 位后使用。</small>:null}<div className="smart-filter-add">{(['gaussian','sharpen','highpass','denoise','motion','radial','pixelate','grain','vignette'] as const).map(kind=><button key={kind} type="button" disabled={locked||chain.items.length>=MAX_SMART_FILTERS} onClick={()=>open(`filter-${crypto.randomUUID()}`,kind)}>添加{smartFilterNames[kind]}</button>)}</div>
  {!chain.items.length?<small>未添加滤镜。默认参数保留原图，双击滤镜可重新编辑。</small>:null}
  <ol>{chain.items.map((filter,index)=><li key={filter.id} draggable={!locked} onDragStart={e=>{e.stopPropagation();setDragged(filter.id)}} onDragEnd={()=>setDragged(null)} onDragOver={e=>{e.preventDefault();e.stopPropagation()}} onDrop={e=>{e.preventDefault();e.stopPropagation();if(dragged&&!locked)move(dragged,filter.id);setDragged(null)}}>
   <input type="checkbox" aria-label={`${smartFilterNames[filter.kind]}启用 ${filter.id}`} checked={filter.enabled} disabled={locked} onChange={()=>commit({...chain,items:chain.items.map(item=>item.id===filter.id?{...item,enabled:!item.enabled}:item)})}/><button type="button" disabled={locked} onDoubleClick={()=>open(filter.id)} onClick={()=>open(filter.id)} aria-label={`编辑${smartFilterNames[filter.kind]} ${filter.id}`}>{smartFilterNames[filter.kind]} · {filter.radius}px</button><button type="button" aria-label={`上移滤镜 ${filter.id}`} disabled={locked||index===0} onClick={()=>move(filter.id,chain.items[index-1].id)}>↑</button><button type="button" aria-label={`下移滤镜 ${filter.id}`} disabled={locked||index===chain.items.length-1} onClick={()=>move(filter.id,chain.items[index+1].id)}>↓</button><button type="button" aria-label={`删除滤镜 ${filter.id}`} disabled={locked} onClick={()=>commit({...chain,items:chain.items.filter(item=>item.id!==filter.id)})}>×</button>
  </li>)}</ol>
  {chain.items.length?<small>独立滤镜蒙版：{chain.mask?.enabled?(chain.mask.inverted?'反向矩形':'矩形'):'全图'}；双击滤镜调整。</small>:null}
  {draft&&selected?<div className="document-close-backdrop"><FloatingSurface className="smart-filter-dialog" role="dialog" aria-modal="true" aria-label="智能滤镜参数" title={smartFilterNames[selected.kind]} onClose={close} onKeyDown={e=>{e.stopPropagation();if(e.key==='Escape')close()}}>
   <p>临时预览 · 确认后一次写入历史，源图保持不变。</p><small>清晰度为局部对比；USM 锐化增强现有边缘，阈值限制平坦噪声；保边降噪可能损失细纹。它们不生成或恢复未知细节。</small>
   <div className="smart-filter-preview" aria-label="智能滤镜临时预览">{invalid?<p>参数无效，请调整后预览。</p>:<CanvasScene thumbnail state={{...draft.base,layers:draft.base.layers.map(item=>item.id===layerId?{...item,smartFilters:draft.chain}:item)}}/>}</div>
   {!['pixelate','grain','vignette'].includes(selected.kind)?<label>半径（图层像素）<input type="number" aria-label="滤镜半径" min={0} max={selected.kind==='denoise'?8:MAX_FILTER_RADIUS} step={.1} value={selected.radius} onChange={e=>patch({items:draft.chain.items.map(item=>item.id===selected.id?{...item,radius:e.target.value===''?NaN:Number(e.target.value)}:item)})}/></label>:null}
   {['sharpen','denoise','highpass','grain','vignette'].includes(selected.kind)?<label>强度<input type="number" aria-label="滤镜强度" min={0} max={['denoise','grain','vignette'].includes(selected.kind)?1:5} step={.1} value={selected.amount} onChange={e=>patch({items:draft.chain.items.map(item=>item.id===selected.id?{...item,amount:e.target.value===''?NaN:Number(e.target.value)}:item)})}/></label>:null}
   {['sharpen','denoise'].includes(selected.kind)?<label>{selected.kind==='sharpen'?'USM 阈值（残差色阶）':'降噪阈值（颜色范围 sigma）'}<input type="number" aria-label="细节滤镜阈值" min={0} max={selected.kind==='denoise'?100:255} value={selected.threshold??0} onChange={e=>patch({items:draft.chain.items.map(item=>item.id===selected.id?{...item,threshold:e.target.value===''?NaN:Number(e.target.value)}:item)})}/></label>:null}
   {selected.kind==='motion'?<label>方向（度）<input type="number" aria-label="滤镜方向" min={-360} max={360} value={selected.angle??0} onChange={e=>patch({items:draft.chain.items.map(item=>item.id===selected.id?{...item,angle:Number(e.target.value)}:item)})}/></label>:null}
   {selected.kind==='pixelate'?<label>像素块尺寸<input type="number" aria-label="像素块尺寸" min={1} max={64} value={selected.size??1} onChange={e=>patch({items:draft.chain.items.map(item=>item.id===selected.id?{...item,size:Number(e.target.value)}:item)})}/></label>:null}
   {selected.kind==='grain'?<label>随机种子<input type="number" aria-label="颗粒随机种子" min={0} max={2147483647} value={selected.seed??0} onChange={e=>patch({items:draft.chain.items.map(item=>item.id===selected.id?{...item,seed:Number(e.target.value)}:item)})}/></label>:null}
   <small>{FILTER_RADIUS_REASON}</small>
   <button type="button" disabled={!state.selectionVisible} onClick={()=>{const inverse=invertMatrix(layerWorldPixelMatrix(state.layers,layerId,state.documentWidth,state.documentHeight)),w=layer.contentWidth??state.documentWidth,h=layer.contentHeight??state.documentHeight;const matrix:[number,number,number,number,number,number]=[inverse[0]*state.documentWidth/w,inverse[1]*state.documentWidth/h,inverse[2]*state.documentHeight/w,inverse[3]*state.documentHeight/h,inverse[4]*100/w,inverse[5]*100/h];patch({selection:{...structuredClone(state.selection),path:{type:'affine',source:structuredClone(state.selection.path),matrix}}})}}>使用当前选区限制滤镜</button>{draft.chain.selection?<button type="button" onClick={()=>{const next={...draft.chain};delete next.selection;setDraft({...draft,chain:next})}}>清除滤镜选区</button>:null}
   <fieldset><legend>独立滤镜蒙版（图层本地百分比）</legend><label><input type="checkbox" aria-label="启用滤镜独立蒙版" checked={draft.chain.mask?.enabled??false} onChange={e=>patch({mask:{...(draft.chain.mask??{inverted:false,rect:{x:0,y:0,width:100,height:100}}),enabled:e.target.checked}})}/>仅矩形内生效</label>{draft.chain.mask?.enabled?<><label><input type="checkbox" aria-label="反向滤镜蒙版" checked={draft.chain.mask.inverted} onChange={e=>patch({mask:{...draft.chain.mask!,inverted:e.target.checked}})}/>反向</label>{(['x','y','width','height'] as const).map(key=><label key={key}>{({x:'X',y:'Y',width:'宽',height:'高'})[key]} %<input type="number" aria-label={`滤镜蒙版 ${key}`} min={0} max={100} value={draft.chain.mask!.rect[key]} onChange={e=>patch({mask:{...draft.chain.mask!,rect:{...draft.chain.mask!.rect,[key]:e.target.value===''?NaN:Number(e.target.value)}}})}/></label>)}</>:null}</fieldset>
   {stale?<p role="alert">文档或源内容已更改，请取消并重新打开滤镜。</p>:null}{error?<p role="alert">{error}</p>:null}{invalid?<p role="alert">参数超出允许范围。{FILTER_RADIUS_REASON}</p>:null}
   <footer><button type="button" onClick={close}>取消滤镜预览</button><button type="button" disabled={stale||locked||invalid} onClick={confirm}>确认滤镜</button></footer>
   <small>{activeSmartFilters(invalid?{items:[]}:draft.chain).length ? '正在预览当前处理链' : '当前参数不改变原图'}</small>
  </FloatingSurface></div>:null}
 </details>
}
