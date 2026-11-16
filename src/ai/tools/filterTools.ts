import { localSelection } from './adjustmentTools'
import { validateSmartFilters, createSmartFilter, type SmartFilter, type SmartFilterKind } from '../../render/filterPipeline'
import { editorReducer, type EditorState } from '../../state/editor'
import { effectiveLayerState } from '../../state/layerHierarchy'
export const FILTER_TOOL_REGISTRY={filter:{description:'为明确图层追加可撤销的 8 位智能滤镜；参数默认中性，支持高斯、方向运动、径向、像素化、固定种子颗粒和晕影、USM锐化及保边降噪。USM threshold限制平坦噪声增幅；denoise阈值为范围sigma，非生成细节恢复。scope=selection捕获当前选区，不回退整层。',kinds:['gaussian','motion','radial','pixelate','grain','vignette','sharpen','denoise'] as const,pixelFormats:['rgba8'] as const}}
export type FilterCommand={op:'filter';layerId:string;kind:SmartFilterKind;radius?:number;amount?:number;angle?:number;size?:number;seed?:number;threshold?:number;scope?:'layer'|'selection'}
/** Real reducer path, source retained. No fallback target or precision downgrade. */
export function executeFilterCommand(state:EditorState,command:FilterCommand):EditorState{
 const layer=state.layers.find(l=>l.id===command.layerId)
 if(!layer)throw new Error('找不到滤镜目标图层')
 if(state.pixelFormat!=='rgba8'||layer.highPrecision)throw new Error('常用滤镜仅支持 8 位 RGBA，请先明确转换为 8 位')
 if(effectiveLayerState(state.layers,layer.id).locked)throw new Error('滤镜目标图层或祖先已锁定')
 if(layer.children||layer.kind==='adjustment')throw new Error('请先将分组或调整图层转换为独立像素内容')
 if(command.scope!==undefined&&!['layer','selection'].includes(command.scope))throw new Error('滤镜范围无效')
 if(command.scope==='selection'&&!['sharpen','denoise'].includes(command.kind))throw new Error('此滤镜不支持单步选区，请使用滤镜链蒙版')
 if(command.scope==='selection'&&!state.selectionVisible)throw new Error('局部滤镜需要有效选区')
 const item:SmartFilter={...createSmartFilter(command.kind,`filter-${crypto.randomUUID()}`),...Object.fromEntries(['radius','amount','angle','size','seed','threshold'].filter(key=>command[key as keyof FilterCommand]!==undefined).map(key=>[key,command[key as keyof FilterCommand]]))}
 if(command.scope==='selection')item.selection=localSelection(state,layer.id)
 const chain=validateSmartFilters({...layer.smartFilters,items:[...(layer.smartFilters?.items??[]),item]})
 return editorReducer(state,{type:'set-smart-filters',id:layer.id,chain,expectedLayer:layer})
}
