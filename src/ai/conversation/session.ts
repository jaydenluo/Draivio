import { EDIT_TOOL_VERSION } from '../persistence/editRecord'
import { recordStructure,structuralBlockedLayers,undoStructure,type StructuralInverse } from './structure'
import type { EditorState,Layer } from '../../state/editor'
import { planNaturalLanguage,type PlannerPlan,type PlanStep } from '../planning/planner'
import { plannerPrompt } from '../planning/prompts'
import { effectiveLayerState,layerParentId } from '../../state/layerHierarchy'
type Value=string|number|boolean|null|Value[]|{[key:string]:Value}
export type ConversationPatch={layerId:string;path:string[];before?:Value;after?:Value;beforeExists:boolean;afterExists:boolean}
export type ConversationRun={toolVersion?:number;steps?:PlanStep[];documentId:string;runId:string;targetIds:string[];status:'applied'|'undone';patches:ConversationPatch[];absentRoots:{layerId:string;key:string}[];results:{tool:string;targetIds:string[];changed:boolean}[];unsupportedUndo:boolean;structure?:StructuralInverse;invalidatedLocks?:string[]}
const allowedRoots=['name','opacity','visible','locked','blendMode','transform','adjustments','smartFilters','effects','groupId','children','clipBaseId']
const neutralTransform={kind:'transform',rect:{x:0,y:0,width:100,height:100},rotation:0,flipX:false,flipY:false}
const neutralAdjustments={brightness:0,contrast:0,saturation:0,temperature:0,sharpness:0,blur:0,shadows:0,highlights:0}
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b)
const copy=<T,>(v:T):T=>v===undefined?v:structuredClone(v)
const targets=(s:PlanStep)=>[...new Set([...(typeof s.args.layerId==='string'?[s.args.layerId]:[]),...(Array.isArray(s.args.layerIds)?s.args.layerIds as string[]:[])])]
export function recordConversationRun(before:EditorState,after:EditorState,documentId:string,runId:string,steps:PlanStep[]):EditorState{
 const patches:ConversationPatch[]=[],absentRoots:ConversationRun['absentRoots']=[]
 const diff=(layerId:string,path:string[],a:unknown,b:unknown)=>{
  if(equal(a,b))return
  if(a===undefined&&(path[0]==='smartFilters'||path[0]==='effects')){patches.push({layerId,path,beforeExists:false,afterExists:true,after:copy(b as Value)});return}
  if((a===undefined||a&&typeof a==='object'&&!Array.isArray(a))&&b&&typeof b==='object'&&!Array.isArray(b)){
   for(const key of new Set([...Object.keys(a??{}),...Object.keys(b)]))diff(layerId,[...path,key],(a as Record<string,unknown>|undefined)?.[key],(b as Record<string,unknown>)[key]);return
  }
  patches.push({layerId,path,before:copy(a as Value),after:copy(b as Value),beforeExists:a!==undefined,afterExists:b!==undefined})
 }
 for(const layer of after.layers){const original=before.layers.find(l=>l.id===layer.id);if(!original)continue
  for(const key of allowedRoots){let a=(original as unknown as Record<string,unknown>)[key],b=(layer as unknown as Record<string,unknown>)[key];if(a===undefined&&b!==undefined&&(key==='transform'||key==='adjustments')){absentRoots.push({layerId:layer.id,key});a=key==='transform'?neutralTransform:neutralAdjustments}diff(layer.id,[key],a,b)}
 }
 const ids=[...new Set(steps.flatMap(targets))]
 const run:ConversationRun={toolVersion:EDIT_TOOL_VERSION,steps:copy(steps),documentId,runId,targetIds:ids,status:'applied',patches,absentRoots,results:steps.map(s=>({tool:s.tool,targetIds:targets(s),changed:targets(s).some(id=>!equal(before.layers.find(l=>l.id===id),after.layers.find(l=>l.id===id)))})),unsupportedUndo:false,structure:recordStructure(before,after)}
 const runs=[...(after.conversationRuns??before.conversationRuns??[]),run].slice(-30)
 validateConversationRuns(runs)
 return {...after,conversationRuns:runs}
}
function read(layer:unknown,path:string[]):unknown{return path.reduce<unknown>((o,k)=>o&&typeof o==='object'?(o as Record<string,unknown>)[k]:undefined,layer)}
function write(layer:Layer,path:string[],value:unknown,exists:boolean){let o=layer as unknown as Record<string,unknown>;for(const key of path.slice(0,-1)){if(!o[key]||typeof o[key]!=='object')o[key]={};o=o[key] as Record<string,unknown>}if(exists)o[path.at(-1)!]=copy(value);else delete o[path.at(-1)!]}
export function undoConversationRun(state:EditorState,documentId:string):{state:EditorState;warnings:string[]}{
 const run=[...(state.conversationRuns??[])].reverse().find(r=>r.documentId===documentId&&r.status==='applied')
 if(!run)throw new Error('当前文档没有可撤销的 AI 操作')
 if(run.unsupportedUndo)throw new Error('本次改变了图层结构；为保护后续手动编辑，请在历史记录中检查并撤销')
 const warnings:string[]=[],layers=state.layers.map(l=>copy(l)),pending:ConversationPatch[]=[]
 // A later lock action invalidates this exception persistently, even after save/open.
 const ownLocks=run.patches.filter(p=>p.path.length===1&&p.path[0]==='locked'&&p.after===true&&!p.before&&!(run.invalidatedLocks??[]).includes(p.layerId))
 let unlocked=true
 while(unlocked){unlocked=false;for(const patch of ownLocks){const layer=layers.find(l=>l.id===patch.layerId);if(!layer?.locked)continue
  const parent=layerParentId(layers,layer.id)
  if(!parent||!effectiveLayerState(layers,parent).locked){write(layer,patch.path,patch.before,patch.beforeExists);unlocked=true}
 }}
 const working={...state,layers},blocked=structuralBlockedLayers(working,run.structure)
 for(const patch of [...run.patches].reverse()){
  const layer=layers.find(l=>l.id===patch.layerId)
  if(layer&&equal(read(layer,patch.path),patch.before)&&((read(layer,patch.path)!==undefined)===patch.beforeExists))continue
  const groupConflict=patch.path[0]==='groupId'&&[patch.before,patch.after].some(id=>typeof id==='string'&&blocked.has(id))
  if(!layer||effectiveLayerState(layers,patch.layerId).locked||blocked.has(patch.layerId)||groupConflict){warnings.push(`目标 ${patch.layerId} 已删除、锁定或存在结构冲突，保留待重试`);pending.unshift(patch);continue}
  const current=read(layer,patch.path)
  if(!equal(current,patch.after)||((current!==undefined)!==patch.afterExists)){warnings.push(`保留手动或历史分叉修改：${layer.id}.${patch.path.join('.')}`);pending.unshift(patch);continue}
  write(layer,patch.path,patch.before,patch.beforeExists)
 }
 for(const item of run.absentRoots){const layer=layers.find(l=>l.id===item.layerId);if(layer&&!effectiveLayerState(layers,layer.id).locked&&equal(read(layer,[item.key]),item.key==='transform'?neutralTransform:neutralAdjustments))write(layer,[item.key],undefined,false)}
 const structural=run.structure?undoStructure(working,run.structure,blocked,warnings):{state:working,pending:undefined}
 const remaining=pending.length||!!structural.pending
 const updated:ConversationRun={...run,patches:pending,structure:structural.pending,status:remaining?'applied':'undone'}
 return {state:{...structural.state,conversationRuns:(state.conversationRuns??[]).map(r=>r===run?updated:r)},warnings}

}
export function planConversation(state:EditorState,documentId:string,input:string,scopeIds?:readonly string[]):PlannerPlan{
 const empty=(message:string):PlannerPlan=>({steps:[],explanation:'',clarifications:[message],warnings:[],systemPrompt:plannerPrompt()})
 const safety=planNaturalLanguage(input,{layers:state.layers,selectedLayerId:state.selectedLayerId})
 if(safety.warnings.some(w=>w.includes('已拒绝')))return safety
 const actionText=input.replace(/[“「『][^”」』]*[”」』]/g,'')
 const previous=[...(state.conversationRuns??[])].reverse().find(r=>r.documentId===documentId&&r.status==='applied')
 const followup=/再|刚才|只改背景/.test(input)
 let id=state.selectedLayerId
 if(followup&&previous){if(previous.targetIds.some(target=>!state.layers.some(l=>l.id===target)))return empty('刚才引用的对象已删除，请重新选择目标');if(previous.targetIds.length!==1)return empty('刚才修改了多个对象，请明确选择本次目标');id=previous.targetIds[0]}
 if(/只改背景/.test(input)){
  const backgrounds=state.layers.filter(l=>/^(背景|background)$/i.test(l.name))
  if(backgrounds.length!==1)return empty(backgrounds.length?'存在多个背景图层，请选择唯一 ID':'没有唯一背景图层；请先选择或创建背景蒙版，不能猜测图像背景')
  id=backgrounds[0].id
 }
 if(scopeIds&&!scopeIds.includes(id)&&!/只改背景/.test(input))return empty('跟进对象不在当前编辑范围内，请重新选择范围')
 const layer=state.layers.find(l=>l.id===id)
 if(/暖|冷/.test(actionText)&&!/选区|局部/.test(actionText)){
  if(/不要|别|禁止|勿|不允许/.test(actionText))return empty('已遵守否定要求，不调整色温')
  if(!/^(?:只改背景[，,、 ]*)?(?:再|刚才)?(?:稍微)?(?:暖|冷)(?:一点|一些)?[。！! ]*$/.test(actionText.trim()))return empty('请将色温微调与其他修改分开确认，例如“再暖一点”')
  if(!layer)return empty('目标对象已删除，请重新选择')
  if(!effectiveLayerState(state.layers,id).visible||effectiveLayerState(state.layers,id).locked)return empty('目标不可见或已锁定')
  const value=Math.max(-100,Math.min(100,(layer.adjustments?.temperature??0)+(/冷/.test(input)?-10:10)))
  return {steps:[{id:'step-1',tool:'adjustment',args:{layerId:id,key:'temperature',value},dependsOn:[],impact:'safe'}],explanation:`基于当前文档将 ${layer.name}（${id}）色温设为 ${value}，更新现有效果`,clarifications:[],warnings:[],systemPrompt:plannerPrompt()}
 }
 return planNaturalLanguage(input,{layers:state.layers.filter(l=>!scopeIds||scopeIds.includes(l.id)),selectedLayerId:id})
}
/** Project metadata validator: bounded whitelisted patches only, no prompts or provider secrets. */
export function validateConversationRuns(value:unknown):asserts value is ConversationRun[]{
 if(!Array.isArray(value)||value.length>30)throw new Error('对话记录结构无效')
 const keys=(v:object,allowed:string[])=>Object.keys(v).every(k=>allowed.includes(k))
 const ids=(v:unknown)=>Array.isArray(v)&&v.length<=1024&&v.every(id=>typeof id==='string'&&id.length>0&&id.length<=256)
 const safe=(v:unknown,depth=0):boolean=>depth<=12&&(v===undefined||v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'&&v.length<=10000||Array.isArray(v)&&v.length<=1024&&v.every(x=>safe(x,depth+1))||typeof v==='object'&&v!==null&&Object.entries(v).every(([k,x])=>!/__proto__|prototype|constructor|api.?key|password|token|secret|authorization|prompt/i.test(k)&&safe(x,depth+1)))
 if(JSON.stringify(value).length>32*1024*1024)throw new Error('对话记录总量超出32MiB预算')
 for(const r of value){if(!r||typeof r.documentId!=='string'||!r.documentId||typeof r.runId!=='string'||!r.runId||!['applied','undone'].includes(r.status)||!Array.isArray(r.targetIds)||r.targetIds.some((id:unknown)=>typeof id!=='string')||!Array.isArray(r.patches)||r.patches.length>1024||!Array.isArray(r.absentRoots)||!Array.isArray(r.results)||typeof r.unsupportedUndo!=='boolean')throw new Error('对话记录字段无效')
  if(!keys(r,['toolVersion','steps','documentId','runId','targetIds','status','patches','absentRoots','results','unsupportedUndo','structure','invalidatedLocks'])||!ids(r.targetIds)||r.results.length>100||r.absentRoots.length>1024)throw new Error('对话记录字段无效')
  if(r.toolVersion!==undefined&&(!Number.isSafeInteger(r.toolVersion)||r.toolVersion<1))throw new Error('对话工具版本无效')
  if(r.steps!==undefined&&(!Array.isArray(r.steps)||r.steps.length>100||!safe(r.steps)||r.steps.some((s:PlanStep)=>!s||!keys(s,['id','tool','args','dependsOn','impact'])||typeof s.id!=='string'||typeof s.tool!=='string'||!s.args||typeof s.args!=='object'||Array.isArray(s.args)||!ids(s.dependsOn))))throw new Error('对话步骤无效')
  if(r.invalidatedLocks!==undefined&&!ids(r.invalidatedLocks))throw new Error('对话锁定来源无效')
  if(r.structure!==undefined)validateStructure(r.structure)
  for(const item of r.absentRoots)if(!item||!keys(item,['layerId','key'])||typeof item.layerId!=='string'||!['transform','adjustments'].includes(item.key))throw new Error('对话默认值记录无效')
  for(const result of r.results)if(!result||!keys(result,['tool','targetIds','changed'])||typeof result.tool!=='string'||result.tool.length>100||!ids(result.targetIds)||typeof result.changed!=='boolean')throw new Error('对话工具结果无效')
  for(const p of r.patches){if(typeof p.layerId!=='string'||!Array.isArray(p.path)||p.path.length<1||p.path.length>8||!allowedRoots.includes(p.path[0])||p.path.some((k:unknown)=>typeof k!=='string'||['__proto__','prototype','constructor'].includes(k))||typeof p.beforeExists!=='boolean'||typeof p.afterExists!=='boolean')throw new Error('对话补丁无效')}
  for(const p of r.patches)if(!keys(p,['layerId','path','before','after','beforeExists','afterExists'])||!safe(p.before)||!safe(p.after))throw new Error('对话补丁值无效')
  if(JSON.stringify(r).length>(r.structure?8*1024*1024:128000)||/(?:sk-[A-Za-z0-9_-]{12,}|Bearer\s+[\w.-]{12,})/.test(JSON.stringify(r)))throw new Error('对话记录过大或包含凭据')
 }
}

function validateStructure(value:unknown):asserts value is StructuralInverse{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('对话结构逆操作无效')
 const s=value as StructuralInverse,keys=['entities','beforeOrder','afterOrder','beforeScene','afterScene']
 if(Object.keys(s).some(k=>!keys.includes(k))||!Array.isArray(s.entities)||s.entities.length>1024)throw new Error('对话结构记录无效')
 for(const key of ['beforeOrder','afterOrder','beforeScene','afterScene'] as const)if(!Array.isArray(s[key])||s[key].length>1024||s[key].some(id=>typeof id!=='string'||!id||id.length>256))throw new Error('对话结构顺序无效')
 const safe=(v:unknown,depth=0):boolean=>depth<=24&&(v===undefined||v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)||typeof v==='string'||Array.isArray(v)&&v.length<=100000&&v.every(x=>safe(x,depth+1))||typeof v==='object'&&v!==null&&Object.entries(v).every(([k,x])=>!/__proto__|prototype|constructor|api.?key|password|token|secret|authorization/i.test(k)&&safe(x,depth+1)))
 for(const e of s.entities){if(!e||Object.keys(e).some(k=>!['collection','id','before','after'].includes(k))||!['layers','canvasShapes','canvasTexts','brushStrokes','layerMasks','smartObjectSources'].includes(e.collection)||typeof e.id!=='string'||!e.id||e.id.length>256||(!e.before&&!e.after))throw new Error('对话结构对象无效')
  for(const object of [e.before,e.after])if(object!==undefined&&(!object||typeof object!=='object'||Array.isArray(object)||!safe(object)||e.collection!=='layerMasks'&&object.id!==e.id))throw new Error('对话结构快照无效')
 }
}
