import type { EditorState } from '../../state/editor'
import { neutralAdjustments } from '../../state/editor'
import { effectiveLayerState } from '../../state/layerHierarchy'
import { BLEND_MODES } from '../../render/blendModes'
import { NUMERIC_ADJUSTMENTS, validateAdjustmentSettings } from '../../adjustments/validateAdjustments'
import { defaultEffect, validateEffects, type EffectKind } from '../../render/layerEffects'
import { createSmartFilter, validateSmartFilters, type SmartFilterKind } from '../../render/filterPipeline'
import type { RecipeValue } from './schema'

/** Pure command-contract validation: never calls an execute handler or reducer. */
export function validateEditorRecipeArgs(op: string, state: EditorState, args: Record<string, RecipeValue>) {
  const fields:Record<string,string[]> = {move:['dx','dy'],scale:['sx','sy'],rotate:['degrees'],flip:['axis'],opacity:['value'],visibility:['visible'],lock:['locked'],blend:['blendMode'],rename:['name'],duplicate:[],delete:[],reorder:['direction'],group:[],align:['mode','target'],distribute:['axis'],adjustment:['key','value','scope'],filter:['kind','radius','amount','angle','size','seed','threshold','scope']}
  const targets = ['group','align','distribute'].includes(op) ? ['layerIds'] : ['move','scale','rotate','flip'].includes(op) ? ['layerId','layerIds'] : ['layerId']
  if(args.layerId!==undefined&&args.layerIds!==undefined)throw new Error('配方目标不能同时指定单层和多层')
  if(!fields[op]||Object.keys(args).some(key=>![...targets,...fields[op]].includes(key)))throw new Error(`配方工具 ${op} 包含未知参数`)
  const numeric = (key:string,min=-Infinity,max=Infinity,optional=false) => {const value=args[key];if(optional&&value===undefined)return;if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`配方工具 ${op}.${key} 数值无效或超出范围`)}
  const choice = (key:string,values:readonly string[],optional=false) => {if(optional&&args[key]===undefined)return;if(typeof args[key]!=='string'||!values.includes(args[key] as string))throw new Error(`配方工具 ${op}.${key} 无效`)}
  const boolean = (key:string) => {if(args[key]!==undefined&&typeof args[key]!=='boolean')throw new Error(`配方工具 ${op}.${key} 必须为布尔值`)}
  const ids = args.layerIds !== undefined ? args.layerIds as string[] : args.layerId !== undefined ? [args.layerId as string] : state.selectedLayerIds.length ? state.selectedLayerIds : [state.selectedLayerId]
  if(!Array.isArray(ids)||!ids.length||!ids.every(id=>typeof id==='string'&&state.layers.some(layer=>layer.id===id)))throw new Error('配方目标图层不存在')
  for(const id of ids){if(op!=='lock'&&effectiveLayerState(state.layers,id).locked)throw new Error('配方目标图层已锁定')}
  switch(op){
    case 'move':numeric('dx');numeric('dy');break
    case 'scale':numeric('sx',Number.MIN_VALUE);numeric('sy',Number.MIN_VALUE,Infinity,true);break
    case 'rotate':numeric('degrees');break
    case 'flip':choice('axis',['horizontal','vertical']);break
    case 'opacity':numeric('value',0,100);break
    case 'visibility':boolean('visible');break
    case 'lock':boolean('locked');break
    case 'blend':choice('blendMode',BLEND_MODES.flatMap(mode=>[mode.id,mode.label]));break
    case 'rename':if(typeof args.name!=='string'||!args.name.trim())throw new Error('配方图层名称无效');break
    case 'reorder':choice('direction',['up','down']);break
    case 'align':choice('mode',['left','center-horizontal','right','top','center-vertical','bottom','top-left','top-right','bottom-left','bottom-right']);choice('target',['canvas','selection','key-object'],true);break
    case 'distribute':choice('axis',['horizontal','vertical']);break
    case 'group':if(ids.length<2)throw new Error('配方分组至少需要两个图层');break
    case 'duplicate':case 'delete':break
    case 'filter':case 'adjustment':{
      const layer=state.layers.find(layer=>layer.id===ids[0])!
      if(typeof args.layerId!=='string')throw new Error('配方图像工具需要明确目标图层')
      if(state.pixelFormat!=='rgba8'||layer.highPrecision)throw new Error('配方图像工具仅支持 8 位 RGBA')
      if(layer.children||layer.kind==='adjustment'&&op==='filter'||layer.kind==='group'||layer.kind==='mask')throw new Error('配方图像工具需要独立内容图层')
      choice('scope',['layer','selection'],true)
      if(args.scope==='selection'&&!state.selectionVisible)throw new Error('配方局部工具需要有效选区')
      if(op==='filter'){
        choice('kind',['gaussian','motion','radial','pixelate','grain','vignette','sharpen','denoise'])
        if(args.scope==='selection'&&!['sharpen','denoise'].includes(args.kind as string))throw new Error('此滤镜不支持单步选区')
        validateSmartFilters({items:[{...createSmartFilter(args.kind as SmartFilterKind,'preflight'),...Object.fromEntries(['radius','amount','angle','size','seed','threshold'].filter(key=>args[key]!==undefined).map(key=>[key,args[key]]))}]})
      }else{
        if(!effectiveLayerState(state.layers,layer.id).visible)throw new Error('配方颜色调整目标不可见')
        if(typeof args.key!=='string')throw new Error('配方调整参数无效')
        const key=args.key.startsWith('reset.')?args.key.slice(6):args.key,reset=args.key.startsWith('reset.')
        if(key.startsWith('effect.')){
          if(reset)throw new Error('未声明的效果重置参数')
          if(args.scope==='selection')throw new Error('图层效果不支持选区范围')
          const kind=key.slice(7) as EffectKind
          if(!['shadow','stroke','innerShadow','colorOverlay','gradientOverlay'].includes(kind))throw new Error('配方效果无效')
          if(args.value!==null){if(!args.value||typeof args.value!=='object'||Array.isArray(args.value)||Object.keys(args.value).some(k=>!['enabled','color','opacity','distance','angle','blur','width','position','stops'].includes(k)))throw new Error('效果参数无效');validateEffects({version:1,items:[{...defaultEffect(kind),...args.value}]})}
        }else if(NUMERIC_ADJUSTMENTS.includes(key as never)){if(!reset)numeric('value',key==='exposureEV'?-8:-100,key==='exposureEV'?8:100)}
        else if(['curves','levels','whiteBalance'].includes(key)){if(!reset)validateAdjustmentSettings({...neutralAdjustments,[key]:args.value})}
        else if(/^hsl\.(global|red|orange|yellow|green|cyan|blue)\.(hue|saturation|lightness|range)$/.test(key)){if(!reset){const bound=key.endsWith('.hue')?180:key.endsWith('.range')?120:100;numeric('value',key.endsWith('.range')?Number.MIN_VALUE:-bound,bound)}}
        else if(!(reset&&key==='all'))throw new Error('未声明的配方颜色参数')
      }
      break
    }
    default:throw new Error(`未知配方工具：${op}`)
  }
}
