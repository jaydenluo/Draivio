/** Single capability catalog: only planned tools may cross the model plan/executor boundary.
 * Manual adapters remain available to explicit typed callers, not arbitrary model JSON.
 */
export const plannedToolNames = ['move','scale','rotate','flip','opacity','visibility','blend','rename','duplicate','delete','lock','reorder','group','align','distribute','filter','adjustment'] as const
export const manualToolNames = ['brush','fill','gradientFill','pathBoolean','text','shape','retouch','relight','restoration','generate','reference','outpaint'] as const
export const toolCapabilities:Readonly<Record<string,{execution:'planned'|'manual-only'|'unsupported';reason?:string}>> = Object.freeze({
 ...Object.fromEntries(plannedToolNames.map(name=>[name,{execution:'planned' as const}])),
 ...Object.fromEntries(manualToolNames.map(name=>[name,{execution:'manual-only' as const,reason:'仅供显式类型化手工适配调用；未接入模型计划参数协议，不允许模型计划执行。'}])),
 semanticPathSelection:{execution:'unsupported' as const,reason:'需要真实视觉模型候选及用户确认。'},
})
export function assertManualTool(name:string):void{if(!Object.hasOwn(toolCapabilities,name)||toolCapabilities[name].execution!=='manual-only')throw new Error(`工具未注册或不可用于手动入口：${name}`)}
export function isPlannedTool(name:string):boolean{return Object.hasOwn(toolCapabilities,name)&&toolCapabilities[name].execution==='planned'}
