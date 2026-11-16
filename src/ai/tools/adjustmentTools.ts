import { editorReducer,neutralAdjustments,type EditorAction,type EditorState,type LayerAdjustments } from '../../state/editor'
import { effectiveLayerState } from '../../state/layerHierarchy'
import { NUMERIC_ADJUSTMENTS,validateAdjustmentSettings,type NumericAdjustment } from '../../adjustments/validateAdjustments'
import { documentPointToLayerLocal,layerWorldPixelMatrix } from '../../canvas/layerWorldMatrix'
import { type Selection } from '../../canvas/selectionGeometry'
import { validateFilterSelection } from '../../filters/selection'
import { validateSmartFilters,createSmartFilter } from '../../render/filterPipeline'
import { executeEffectAdjustment } from './effectTools'
export type AdjustmentCommand={op:'adjustment';layerId:string;key:string;value?:unknown;scope?:'layer'|'selection'}
export const ADJUSTMENT_TOOL_REGISTRY={adjustment:{description:'非破坏颜色/效果参数。scope=layer 或 selection；selection 捕获当前选区，不能自动回退整层。数字范围 -100..100，曝光EV -8..8。key支持温度temperature、高光highlights、exposureEV、whiteBalance RGB增益、curves归一化锚点、levels归一化黑白场、hsl.red.saturation等、reset.temperature等、effect.shadow等。效果只支持整层，value=null移除指定效果。',pixelFormats:['rgba8'] as const}}
function action(id:string,key:string,value:unknown):EditorAction{
 if(NUMERIC_ADJUSTMENTS.includes(key as NumericAdjustment)){const bound=key==='exposureEV'?8:100;if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>bound)throw new Error('调整数值超出范围');return {type:'set-layer-adjustment',id,key:key as keyof LayerAdjustments,value}}
 if(key==='curves')return {type:'set-layer-curves',id,curves:value as LayerAdjustments['curves'] & {}}
 if(key==='levels')return {type:'set-layer-levels',id,levels:value as LayerAdjustments['levels'] & {}}
 if(key==='whiteBalance')return {type:'set-layer-white-balance',id,value:value as {r:number;g:number;b:number}}
 const hsl=key.match(/^hsl\.(global|red|orange|yellow|green|cyan|blue)\.(hue|saturation|lightness|range)$/)
 if(hsl){const bound=hsl[2]==='hue'?180:hsl[2]==='range'?120:100;if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>bound||(hsl[2]==='range'&&value<=0))throw new Error('HSL 参数超出范围');return {type:'set-layer-hsl',id,channel:hsl[1] as 'red',key:hsl[2] as 'hue',value}}
 throw new Error('未声明的颜色调整参数')
}
export function executeAdjustmentCommand(state:EditorState,command:AdjustmentCommand):EditorState{
 const layer=state.layers.find(l=>l.id===command.layerId)
 if(!layer)throw new Error('找不到颜色调整目标')
 if(state.pixelFormat!=='rgba8'||layer.highPrecision)throw new Error('颜色工具仅支持 8 位 RGBA，请显式转换为 8 位')
 const effective=effectiveLayerState(state.layers,layer.id)
 if(effective.locked||!effective.visible)throw new Error('颜色调整目标不可见或已锁定')
 if(layer.children||layer.kind==='group'||layer.kind==='mask')throw new Error('请先选择独立内容图层')
 if(command.scope!==undefined&&!['layer','selection'].includes(command.scope))throw new Error('颜色调整范围无效')
 if(command.key.startsWith('effect.')){if(command.scope==='selection')throw new Error('图层效果不支持选区范围，请明确使用整层');return executeEffectAdjustment(state,layer.id,command.key,command.value)}
 const local=command.scope==='selection'
 if(local&&(!state.selectionVisible||!state.selection))throw new Error('局部调整需要有效选区')
 const selection=local?localSelection(state,layer.id):undefined
 const items=layer.smartFilters?.items??[]
 // Reuse only the last stage so subsequent filters keep their declared order.
 const last=items.at(-1),reuse=local&&last?.kind==='color'&&JSON.stringify(last.selection)===JSON.stringify(selection)
 const current=local?(reuse?last!.adjustments!:neutralAdjustments):(layer.adjustments??neutralAdjustments)
 let key=command.key,value=command.value
 if(key.startsWith('reset.')){key=key.slice(6);if(key==='all'){key='__all'}else if(NUMERIC_ADJUSTMENTS.includes(key as NumericAdjustment))value=(neutralAdjustments as unknown as Record<string,unknown>)[key]??0;else if(key==='whiteBalance')value={r:1,g:1,b:1};else if(key==='curves'||key==='levels')value=neutralAdjustments[key];else if(key.startsWith('hsl.'))value=key.endsWith('.range')?30:0;else throw new Error('未声明的重置参数')}
 let adjustments:LayerAdjustments
 if(key==='__all')adjustments=structuredClone(neutralAdjustments)
 else {
  const change=action(layer.id,key,value)
  const candidate=key==='curves'||key==='levels'||key==='whiteBalance'?{...neutralAdjustments,...current,[key]:value}:undefined
  if(candidate)validateAdjustmentSettings(candidate)
  const temporary=editorReducer({...state,layers:state.layers.map(l=>l.id===layer.id?{...l,adjustments:structuredClone(current)}:l)},change)
  adjustments=temporary.layers.find(l=>l.id===layer.id)!.adjustments!
 }
 validateAdjustmentSettings({...neutralAdjustments,...adjustments})
 if(!local)return editorReducer(state,{type:'set-layer-adjustments',id:layer.id,adjustments})
 const item={...(reuse?last!:createSmartFilter('color',`color-${crypto.randomUUID()}`)),adjustments,selection}
 const chain=validateSmartFilters({...layer.smartFilters,items:reuse?[...items.slice(0,-1),item]:[...items,item]})
 return editorReducer(state,{type:'set-smart-filters',id:layer.id,chain,expectedLayer:layer})
}

export function localSelection(state:EditorState,id:string):Selection{
 const point=(x:number,y:number)=>documentPointToLayerLocal(state.layers,id,{x,y},state.documentWidth,state.documentHeight)
 const a=point(0,0),b=point(100,0),c=point(0,100),r=state.selection.rect
 const matrix:[number,number,number,number,number,number]=[(b.x-a.x)/100,(b.y-a.y)/100,(c.x-a.x)/100,(c.y-a.y)/100,a.x,a.y]
 const corners=[point(r.x,r.y),point(r.x+r.width,r.y),point(r.x,r.y+r.height),point(r.x+r.width,r.y+r.height)]
 const xs=corners.map(p=>p.x),ys=corners.map(p=>p.y),world=layerWorldPixelMatrix(state.layers,id,state.documentWidth,state.documentHeight)
 const scale=Math.sqrt(Math.abs(world[0]*world[3]-world[1]*world[2]))
 return validateFilterSelection({...state.selection,rect:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)},path:{type:'affine',source:state.selection.path,matrix},feather:state.selection.feather/Math.max(.00001,scale)})
}
