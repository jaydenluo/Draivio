import {it,expect,test} from 'vitest';import {manualToolNames,toolCapabilities,assertManualTool} from './toolCapabilities';import {aiManualToolCoverage,getAiManualTool} from './toolCoverage';import {initialEditorState} from '../../state/editor'
it('publishes reducer-backed manual tools and explicit unsupported reasons',()=>{for(const name of ['brush','fill','gradientFill','pathBoolean','text','shape','retouch'] as const){const tool=getAiManualTool(name);expect('execute' in tool && typeof tool.execute).toBe('function')};expect(aiManualToolCoverage.semanticPathSelection.kind).toBe('unsupported');expect(aiManualToolCoverage.semanticPathSelection.reason).toMatch(/模型/)})
it('does not expose unsupported entries as executors',()=>{expect('execute' in aiManualToolCoverage.semanticPathSelection).toBe(false);expect(initialEditorState.layers.length).toBeGreaterThan(0)})
import { plannedToolNames } from './toolCapabilities'
import { PLANNER_TOOL_NAMES } from '../planning/prompts'
import { PlanExecutor } from '../execution/executor'
it('planner and executor share one catalog and manual-only adapters are explicitly rejected before any handler call',async()=>{
 expect(PLANNER_TOOL_NAMES).toBe(plannedToolNames);let calls=0;const executor=new PlanExecutor(async()=>{calls++;return null})
 for(const name of manualToolNames){expect(toolCapabilities[name].execution).toBe('manual-only');expect('execute' in aiManualToolCoverage[name]).toBe(true);const result=await executor.run([{id:'a',tool:name as any,args:{},dependsOn:[]}],{authorized:true});expect(result.state.status).toBe('failed')}
 expect(calls).toBe(0)
 for(const name of plannedToolNames)expect(executor.preview([{id:'a',tool:name,args:{},dependsOn:[]}]).status).toBe('preview')
})
import { plannerPrompt } from '../planning/prompts'
it('never advertises manual-only or unknown caller capabilities to the model',()=>{
 const prompt=plannerPrompt(['brush','shape','unknown','move'])
 expect(prompt).not.toContain('当前可用能力：brush');expect(prompt.split('当前可用能力：')[1]).toBe('move。能力缺失时给出 warnings 和可行替代方案。')
})

test('registers typed generation operations and exposes one guard for manual production entrances',()=>{
 for(const name of ['generate','reference','outpaint'] as const){expect(manualToolNames).toContain(name);expect(toolCapabilities[name].execution).toBe('manual-only');const tool=getAiManualTool(name);expect('execute' in tool).toBe(true)}
 expect(()=>assertManualTool('generate')).not.toThrow();expect(()=>assertManualTool('reference')).not.toThrow();expect(()=>assertManualTool('outpaint')).not.toThrow()
})
