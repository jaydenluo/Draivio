import { prepareSegmentedMerge, selectedMergeRoots, type MergeOptions } from './segmentedMerge'
import { renderToStaticMarkup } from 'react-dom/server'
import { CanvasScene } from '../canvas/CanvasScene'
import { layerMatrix, multiplyMatrices, type AffineMatrix } from '../canvas/layerCoordinates'
import { effectiveLayerState, layerParentId, layerSubtreeIds } from '../state/layerHierarchy'
import { serializeExport } from '../render/serializeExport'
import { exportSvgImage } from '../render/exportImage'
import { contentRevision } from '../ai/context/editorContext'
import type { EditorState, Layer } from '../state/editor'
const identity: AffineMatrix=[1,0,0,1,0,0]
const normal = () => ({kind:'transform' as const,rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false})
export function ungroupLayers(state:EditorState,id:string):EditorState {
 const group=state.layers.find(l=>l.id===id);if(!group?.children)throw new Error('请选择图层组')
 if(layerSubtreeIds(state.layers,id).some(x=>effectiveLayerState(state.layers,x).locked))throw new Error('图层或祖先已锁定')
 if(group.clipBaseId||state.layers.some(l=>l.clipBaseId===id))throw new Error('图层组参与剪贴链，请先合并完整剪贴链以保持外观')
 if(group.opacity!==100||group.blendMode!=='正常'||state.layerMasks[id])throw new Error('此组含透明度、混合或蒙版；请先合并栅格化以保持外观')
 const parent=layerParentId(state.layers,id),matrix=group.transform?layerMatrix(group.transform,state.documentWidth,state.documentHeight):identity
 const direct = new Set(state.layers.filter(l=>layerParentId(state.layers,l.id)===id).map(l=>l.id))
 // `children` is the render order authority. Older files may omit a direct
 // child from that array, so append those IDs in storage order after the
 // explicit order rather than letting storage order silently change pixels.
 const children = [...(group.children ?? []).filter(childId => direct.has(childId)), ...[...direct].filter(childId => !(group.children ?? []).includes(childId))]
 const promoted = new Map(children.map(childId => {
   const child = state.layers.find(l => l.id === childId)!
   const promotedTransform = !group.transform && !child.transform
     ? undefined
     : { ...(child.transform ?? normal()), affine: multiplyMatrices(matrix, child.transform?.affine ?? identity) }
   return [childId, { ...child, groupId: parent, visible: child.visible && group.visible, transform: promotedTransform }]
 }))
 const layers: Layer[] = []
 for (const layer of state.layers) {
   if (layer.id === id) {
     // Insert promoted children exactly where the group sat in its parent/root.
     layers.push(...children.map(childId => promoted.get(childId)!))
   } else if (direct.has(layer.id)) {
     // Direct children were inserted at the group slot above.
     continue
   } else if (layer.id === parent) {
     layers.push({ ...layer, children: layer.children?.flatMap(childId => childId === id ? children : [childId]) })
   } else {
     layers.push(layer)
   }
 }
 return { ...state, layers, selectedLayerId: children[0] ?? parent ?? '', selectedLayerIds: children }
}
export type MergeMode='selected'|'down'|'visible'|'flatten'
export type MergeResult={baseRevision:string;removedIds:string[];layer:Layer;flatten:boolean;segments?:Layer[];document?:Partial<EditorState>}
export function mergeScope(state:EditorState,mode:MergeMode):string[]{
 if(mode!=='flatten')return selectedMergeRoots(state,mode).flatMap(id=>layerSubtreeIds(state.layers,id))
 const ids=state.layers.filter(l=>!layerParentId(state.layers,l.id)&&effectiveLayerState(state.layers,l.id).visible).flatMap(l=>layerSubtreeIds(state.layers,l.id))
 if(!ids.length)throw new Error('没有可合并的图层')
 if(state.layers.some(l=>effectiveLayerState(state.layers,l.id).locked))throw new Error('图层或祖先已锁定，不能合并')
 return ids
}
export async function prepareLayerMerge(state:EditorState,mode:MergeMode,rasterize?:(svg:string,width:number,height:number)=>Promise<string>,options:MergeOptions={}):Promise<MergeResult>{
 if(mode!=='flatten')return prepareSegmentedMerge(state,mode,rasterize,options)
 if(options.signal?.aborted)throw new Error('已取消合并')
 const ids=mergeScope(state,mode),selected=new Set(ids)
 const scoped={...state,layers:state.layers.filter(l=>selected.has(l.id)),documentBackground:mode==='flatten'?state.documentBackground:'transparent',selectionVisible:false}
 const markup=renderToStaticMarkup(<CanvasScene state={scoped}/>),doc=new DOMParser().parseFromString(markup,'image/svg+xml'),svg=doc.documentElement as unknown as SVGSVGElement
 // Some DOM implementations expose no SVGAnimatedRect outside the live canvas.
 if(!svg.viewBox?.baseVal)Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:state.documentWidth,height:state.documentHeight}}})
 const source=serializeExport(svg,{range:'canvas'})
 const encode=rasterize??(async(s,w,h)=>{const blob=await exportSvgImage(s,{format:'png',width:w,height:h});return await new Promise<string>((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result as string);r.onerror=()=>reject(new Error('合并资源编码失败'));r.readAsDataURL(blob)})})
 const png=await encode(source,state.documentWidth,state.documentHeight)
 if(options.signal?.aborted)throw new Error('已取消合并')
 if(!png.startsWith('data:image/png;base64,'))throw new Error('合并未生成有效PNG资源')
 return {baseRevision:contentRevision(state),removedIds:mode==='flatten'?state.layers.map(l=>l.id):ids,flatten:mode==='flatten',layer:{id:`merge-${crypto.randomUUID()}`,name:mode==='flatten'?'拼合图像':'合并图层（已栅格化）',className:'layer-art',source:png,contentWidth:state.documentWidth,contentHeight:state.documentHeight,visible:true,opacity:100,blendMode:'正常'}}
}
export function applyLayerMerge(state:EditorState,result:MergeResult):EditorState{
 if(contentRevision(state)!==result.baseRevision)throw new Error('文档已更改，已放弃合并，请重试')
 if(result.document){
  const scope=[...result.removedIds,...(result.segments??[]).filter(l=>state.layers.some(old=>old.id===l.id)).map(l=>l.id)]
  if(scope.some(id=>effectiveLayerState(state.layers,id).locked))throw new Error('图层已锁定')
  return {...state,...result.document,notice:`已合并为 ${result.segments?.length??1} 段，保留原叠放与隐藏层`}
 }
 const ids=new Set(result.removedIds);if([...ids].some(id=>effectiveLayerState(state.layers,id).locked))throw new Error('图层已锁定')
 const preserved=new Set<string>()
 if(!result.flatten){
   for(const l of state.layers)if(ids.has(l.id)&&!l.visible)layerSubtreeIds(state.layers,l.id).forEach(id=>preserved.add(id))
 }
 const retained=state.layers.filter(l=>preserved.has(l.id)).map(l=>{
   const parent=layerParentId(state.layers,l.id)
   if(!parent||preserved.has(parent))return l
   let ancestor: string|undefined=parent,matrix:AffineMatrix=identity
   while(ancestor){const a=state.layers.find(x=>x.id===ancestor)!;matrix=multiplyMatrices(a.transform?layerMatrix(a.transform,state.documentWidth,state.documentHeight):identity,matrix);ancestor=layerParentId(state.layers,ancestor)}
   return {...l,groupId:undefined,transform:{...(l.transform??normal()),affine:multiplyMatrices(matrix,l.transform?.affine??identity)}}
 })
 preserved.forEach(id=>ids.delete(id))
 const index=state.layers.findIndex(l=>ids.has(l.id)),layers=state.layers.filter(l=>!ids.has(l.id)).map(l=>retained.find(x=>x.id===l.id)??l);layers.splice(Math.max(0,index),0,result.layer)
 return {...state,layers,selectedLayerId:result.layer.id,selectedLayerIds:[result.layer.id],canvasShapes:state.canvasShapes.filter(x=>!ids.has(x.layerId)),canvasTexts:state.canvasTexts.filter(x=>!ids.has(x.layerId)),brushStrokes:state.brushStrokes.filter(x=>!ids.has(x.layerId)),layerMasks:Object.fromEntries(Object.entries(state.layerMasks).filter(([id])=>!ids.has(id))),sceneOrder:state.sceneOrder.filter(id=>![...state.canvasShapes,...state.canvasTexts,...state.brushStrokes].some(object=>object.id===id&&ids.has(object.layerId))),documentBackground:result.flatten?'transparent':state.documentBackground}
}
