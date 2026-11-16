export type EffectKind = 'shadow'|'stroke'|'innerShadow'|'colorOverlay'|'gradientOverlay'
export type EffectStop = { offset:number;color:string;opacity:number }
export type LayerEffect = { kind:EffectKind;enabled:boolean;color:string;opacity:number;distance:number;angle:number;blur:number;width:number;position:'inside'|'center'|'outside';stops:EffectStop[] }
export type LayerEffects = { version:1;items:LayerEffect[] }
export const effectLabels:Record<EffectKind,string>={shadow:'投影',stroke:'描边',innerShadow:'内阴影',colorOverlay:'颜色叠加',gradientOverlay:'渐变叠加'}
export const EFFECT_ORDER:EffectKind[]=['shadow','colorOverlay','gradientOverlay','innerShadow','stroke']
export function defaultEffect(kind:EffectKind):LayerEffect{return {kind,enabled:true,color:kind==='colorOverlay'?'#ff765f':'#000000',opacity:kind==='shadow'||kind==='innerShadow'?50:100,distance:4,angle:45,blur:4,width:2,position:'outside',stops:[{offset:0,color:'#ff765f',opacity:100},{offset:1,color:'#5965ff',opacity:100}]}}
const color=(v:unknown)=>typeof v==='string'&&/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v)
const number=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max
export function validateEffects(value:unknown):LayerEffects {
 if(!value||typeof value!=='object')throw new Error('图层效果无效')
 const v=value as LayerEffects
 if(v.version!==1||!Array.isArray(v.items)||v.items.length>5||new Set(v.items.map(e=>e.kind)).size!==v.items.length)throw new Error('效果版本或数量无效')
 for(const e of v.items){if(!EFFECT_ORDER.includes(e.kind)||typeof e.enabled!=='boolean'||!color(e.color)||!number(e.opacity,0,100)||!number(e.distance,0,512)||!number(e.angle,-360,360)||!number(e.blur,0,128)||!number(e.width,0,128)||!['inside','center','outside'].includes(e.position))throw new Error('效果参数超出范围');if(!Array.isArray(e.stops)||e.stops.length<2||e.stops.length>16||e.stops.some((s,i)=>!number(s.offset,0,1)||!color(s.color)||!number(s.opacity,0,100)||i>0&&s.offset<e.stops[i-1].offset))throw new Error('渐变色标无效')}
 return structuredClone(v)
}
export function effectPadding(effects?:LayerEffects):number {return effects?Math.ceil(Math.max(0,...validateEffects(effects).items.filter(e=>e.enabled).map(e=>e.kind==='shadow'?e.distance+e.blur*3:e.kind==='stroke'?(e.position==='inside'?0:e.position==='center'?e.width/2:e.width):0))):0}
export function cloneEffects(effects:LayerEffects):LayerEffects{return validateEffects(effects)}
