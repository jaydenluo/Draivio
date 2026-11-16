import { describe, expect, it } from 'vitest'
import { PlanExecutor } from './executor'

describe('PlanExecutor security boundaries', () => {
  it('rejects oversized plans before invoking a handler', async () => {
    let calls = 0
    const executor = new PlanExecutor(async () => { calls++; return null })
    const steps = Array.from({ length: 65 }, (_, index) => ({ id: `s-${index}`, tool: 'move' as const, args: {}, dependsOn: [] }))
    const result = await executor.run(steps, { authorized: true })
    expect(result.state.status).toBe('failed')
    expect(calls).toBe(0)
  })

  it('sanitizes handler output and errors stored in run state', async () => {
    const executor = new PlanExecutor(async step => {
      if (step.id === 'fail') throw new Error('x'.repeat(5000))
      return { payload: 'y'.repeat(5000) }
    })
    const ok = await executor.run([{ id: 'safe', tool: 'move', args: {}, dependsOn: [] }], { authorized: true })
    expect(String((ok.results.safe as { payload?: unknown }).payload)).toHaveLength(4097)
    const failed = await executor.run([{ id: 'fail', tool: 'move', args: {}, dependsOn: [] }], { authorized: true })
    expect(failed.state.steps.fail.error?.length).toBe(2001)
  })
})
it('rejects deeply nested nonfinite arguments before a handler can act',async()=>{
 let calls=0;const executor=new PlanExecutor(async()=>{calls++});const result=await executor.run([{id:'bad',tool:'adjustment',args:{value:{curves:[{x:NaN,y:1}]}},dependsOn:[]}],{authorized:true})
 expect(result.state.status).toBe('failed');expect(calls).toBe(0)
})
