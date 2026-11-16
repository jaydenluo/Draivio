/** Serializable document data. History, persistence and UI belong to the caller. */
export type Guide = { id: string; axis: 'x' | 'y'; position: number; locked: boolean }
export type GridSettings = { enabled: boolean; spacingX: number; spacingY: number; originX: number; originY: number }
export type GuideSettings = { rulersVisible: boolean; guidesVisible: boolean; snapEnabled: boolean; guides: Guide[]; grid: GridSettings }
export type GuideAction =
 | { type: 'add'; guide: Guide } | { type: 'move'; id: string; position: number }
 | { type: 'delete'; id: string } | { type: 'lock'; id: string; locked: boolean }
 | { type: 'settings'; patch: Partial<Omit<GuideSettings, 'guides'>> }
export function defaultGuideSettings(): GuideSettings {
 return {rulersVisible:true,guidesVisible:true,snapEnabled:true,guides:[],grid:{enabled:false,spacingX:20,spacingY:20,originX:0,originY:0}}
}
function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
 if(!value || typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!keys.includes(key)))throw new Error('参考线设置结构无效')
 return value as Record<string,unknown>
}
function finite(value: unknown, positive=false): number {
 if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e9||(positive&&value<=0))throw new Error('参考线/网格坐标或间距无效')
 return value
}
function boolean(value: unknown): boolean {if(typeof value!=='boolean')throw new Error('参考线开关无效');return value}
export function validateGuideSettings(value: unknown): GuideSettings {
 const s=record(value,['rulersVisible','guidesVisible','snapEnabled','guides','grid'])
 if(!Array.isArray(s.guides)||s.guides.length>10000)throw new Error('参考线数量无效')
 const ids=new Set<string>()
 const guides=s.guides.map(value=>{const g=record(value,['id','axis','position','locked']);if(typeof g.id!=='string'||!g.id||g.id.length>200||ids.has(g.id)||!['x','y'].includes(g.axis as string))throw new Error('参考线ID或方向无效');ids.add(g.id);return {id:g.id,axis:g.axis as Guide['axis'],position:finite(g.position),locked:boolean(g.locked)}})
 const g=record(s.grid,['enabled','spacingX','spacingY','originX','originY'])
 return {rulersVisible:boolean(s.rulersVisible),guidesVisible:boolean(s.guidesVisible),snapEnabled:boolean(s.snapEnabled),guides,grid:{enabled:boolean(g.enabled),spacingX:finite(g.spacingX,true),spacingY:finite(g.spacingY,true),originX:finite(g.originX),originY:finite(g.originY)}}
}
export function updateGuideSettings(settings: GuideSettings, action: GuideAction): GuideSettings {
 const state=validateGuideSettings(settings)
 if(action.type==='settings')return validateGuideSettings({...state,...action.patch})
 if(action.type==='add')return validateGuideSettings({...state,guides:[...state.guides,{...action.guide}]})
 const target=state.guides.find(g=>g.id===action.id)
 if(!target)throw new Error('参考线不存在')
 if(target.locked&&action.type!=='lock')throw new Error('参考线已锁定，请先解锁')
 const guides=action.type==='delete'?state.guides.filter(g=>g.id!==action.id):state.guides.map(g=>g.id!==action.id?g:action.type==='move'?{...g,position:action.position}:{...g,locked:action.locked})
 return validateGuideSettings({...state,guides})
}
