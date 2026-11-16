import { isPlannedTool } from '../tools/toolCapabilities'
import type { PlanStep } from '../planning/planner'
import { createRunState, runProgress, type RunState } from './runState'

export type ExecutableStep = Pick<PlanStep,'id'|'dependsOn'|'tool'|'args'>
export type StepHandler = (step: ExecutableStep, signal: AbortSignal) => Promise<unknown>
export type ExecuteOptions = { runId?: string; maxRetries?: number; signal?: AbortSignal; authorized?: boolean; initialState?: RunState; onState?: (state: RunState) => void }
export type ExecutionResult = { state: RunState; results: Record<string,unknown> }

function clone<T>(x:T):T { return structuredClone(x) }
const MAX_STEPS = 64
const MAX_VALUE_BYTES = 64_000
const RESERVED_ID = /^(?:__proto__|prototype|constructor)$/
function safeValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[TRUNCATED]'
  if (typeof value === 'string') return value.length > 4096 ? `${value.slice(0, 4096)}…` : value
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value
  if (Array.isArray(value)) return value.slice(0, 128).map(item => safeValue(item, depth + 1))
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).slice(0, 128).map(([k, v]) => [k, safeValue(v, depth + 1)]))
  return String(value)
}
function safeError(error: unknown): string { const text = error instanceof Error ? error.message : String(error); return text.length > 2000 ? `${text.slice(0, 2000)}…` : text }
function emit(state: RunState, onState?: (state:RunState)=>void) { state.progress=runProgress(state); onState?.(clone(state)) }
function validateArgument(value:unknown,depth=0):void {
 if(depth>12)throw new Error('步骤参数嵌套过深')
 if(typeof value==='number'&&(!Number.isFinite(value)||Math.abs(value)>1_000_000))throw new Error('步骤参数超出范围')
 if(Array.isArray(value)){if(value.length>4096)throw new Error('步骤参数过多');value.forEach(v=>validateArgument(v,depth+1))}
 else if(value&&typeof value==='object')for(const [key,v] of Object.entries(value)){if(RESERVED_ID.test(key))throw new Error('步骤参数字段无效');validateArgument(v,depth+1)}
}
function validate(steps: ExecutableStep[]) {
  if (!Array.isArray(steps) || steps.length > MAX_STEPS) throw new Error(`计划步骤不能超过 ${MAX_STEPS} 个`)
  const ids = new Set<string>(); for (const s of steps) { if (!s.id || ids.has(s.id)) throw new Error(`重复 stepId：${s.id}`); ids.add(s.id) }
  for (const s of steps) {
    if (RESERVED_ID.test(s.id) || !/^[-\w:.]{1,128}$/.test(s.id)) throw new Error(`非法 stepId：${s.id}`)
    if (!s.tool || !isPlannedTool(s.tool)) throw new Error(`不允许的工具：${s.tool}`)
    if (!s.args || typeof s.args !== 'object' || Array.isArray(s.args)) throw new Error(`步骤 ${s.id} 参数无效`)
    validateArgument(s.args)
    try { if (JSON.stringify(s.args).length > MAX_VALUE_BYTES) throw new Error(`步骤 ${s.id} 参数过大`) } catch { throw new Error(`步骤 ${s.id} 参数无效`) }
  }
  for (const s of steps) for (const dep of s.dependsOn ?? []) if (!ids.has(dep)) throw new Error(`步骤 ${s.id} 依赖不存在：${dep}`)
  const visiting=new Set<string>(), visited=new Set<string>(), byId=new Map(steps.map(s=>[s.id,s]))
  const visit=(id:string)=>{if(visiting.has(id)) throw new Error('计划依赖存在循环');if(visited.has(id))return;visiting.add(id);for(const d of byId.get(id)!.dependsOn??[])visit(d);visiting.delete(id);visited.add(id)}
  for(const s of steps)visit(s.id)
}
export class PlanExecutor {
  private active?: Promise<ExecutionResult>
  constructor(private readonly handler: StepHandler) {}
  run(steps: ExecutableStep[], options: ExecuteOptions = {}): Promise<ExecutionResult> {
    if (this.active) return this.active
    this.active=this.execute(steps,options).finally(()=>{this.active=undefined})
    return this.active
  }
  /** Validate and expose a plan without invoking any tool or mutating a document. */
  preview(steps: ExecutableStep[], runId = `run-${Date.now()}`): RunState {
    const state = createRunState(runId, steps)
    state.status = 'validating'
    try { validate(steps); state.status = 'preview' } catch (error) { state.status = 'failed'; state.error = safeError(error) }
    state.progress = runProgress(state)
    return state
  }
  private async execute(steps: ExecutableStep[], options: ExecuteOptions): Promise<ExecutionResult> {
    const state=options.initialState ? clone(options.initialState) : createRunState(options.runId ?? `run-${Date.now()}`,steps)
    if (options.initialState && ['failed','cancelled','blocked'].includes(state.status)) {
      for (const step of Object.values(state.steps)) if (step.status === 'failed' || step.status === 'blocked' || step.status === 'cancelled') { step.status = 'pending'; step.error = undefined }
    }
    const results:Record<string,unknown>={}
    state.status='validating'; emit(state,options.onState)
    try {
      validate(steps)
      if (!options.authorized) throw new Error('执行计划前需要明确授权')
    } catch(e) { state.status='failed';state.error=safeError(e);state.finishedAt=Date.now();emit(state,options.onState);return {state,results} }
    const signal=options.signal ?? new AbortController().signal; const max=Math.max(0,Math.min(3,options.maxRetries ?? 0)); state.status='running';state.startedAt=Date.now();emit(state,options.onState)
    const byId=new Map(steps.map(s=>[s.id,s]))
    while (Object.values(state.steps).some(s=>['pending','running'].includes(s.status))) {
      if (signal.aborted) { for(const s of Object.values(state.steps)) if(s.status==='pending'||s.status==='running'){s.status='cancelled';s.error='已取消'} state.status='cancelled';state.cancellationReason='用户取消；不会解释为远端退款';state.finishedAt=Date.now();emit(state,options.onState);return {state,results} }
      const ready=steps.filter(s=>state.steps[s.id].status==='pending' && (s.dependsOn??[]).every(d=>['succeeded'].includes(state.steps[d].status)))
      const blocked=steps.filter(s=>state.steps[s.id].status==='pending' && (s.dependsOn??[]).some(d=>['failed','cancelled','blocked'].includes(state.steps[d].status)))
      for(const s of blocked){state.steps[s.id].status='blocked';state.steps[s.id].error='依赖步骤未成功';}
      if (!ready.length) { if(blocked.length){state.status='blocked';state.error='存在未满足的步骤依赖'} else if(Object.values(state.steps).some(s=>s.status==='running')) await new Promise(r=>setTimeout(r,0)); else {state.status='failed';state.error='计划无法继续'}; if(state.status!=='running'){state.finishedAt=Date.now();emit(state,options.onState);return {state,results}} }
      for(const s of ready) {
        const ss=state.steps[s.id]; ss.status='running';ss.attempts++;emit(state,options.onState)
        try { const result=await this.handler(s,signal); if(signal.aborted) throw new Error('已取消'); const safe=safeValue(result); ss.status='succeeded';ss.result=safe;results[s.id]=safe;emit(state,options.onState) }
        catch(e) { ss.error=safeError(e); if(signal.aborted){ss.status='cancelled';state.status='cancelled';state.cancellationReason='步骤取消；不会解释为远端退款';state.finishedAt=Date.now();emit(state,options.onState);return {state,results}} if(ss.attempts<=max){ss.status='pending';emit(state,options.onState)}else{ss.status='failed';let changed=true;while(changed){changed=false;for(const dependent of steps) if(dependent.dependsOn?.some(d=>['failed','cancelled','blocked'].includes(state.steps[d].status)) && state.steps[dependent.id].status==='pending'){state.steps[dependent.id].status='blocked';state.steps[dependent.id].error='依赖步骤未成功';changed=true}} state.status='failed';state.error=`步骤 ${s.id} 失败`;state.finishedAt=Date.now();emit(state,options.onState);return {state,results}} }
      }
    }
    state.status='committed';state.finishedAt=Date.now();emit(state,options.onState);return {state,results}
  }
}
