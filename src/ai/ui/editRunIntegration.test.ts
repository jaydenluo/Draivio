import { describe, expect, it } from 'vitest'
import { planNaturalLanguage } from '../planning/planner'
import { PlanExecutor } from '../execution/executor'
import { executeEditorCommand } from '../tools/editorTools'
import { initialEditorState } from '../../state/editor'

describe('one sentence edit pipeline', () => {
  it('plans and applies two real reducer-backed operations with progress', async () => {
    const plan = planNaturalLanguage('向右10像素然后旋转15度', { selectedLayerId: 'art', layers: [{ id: 'art', name: '海报' }] })
    let draft = structuredClone(initialEditorState); const updates: number[] = []
    const result = await new PlanExecutor(async step => { draft = executeEditorCommand(draft, { op: step.tool, ...step.args } as any); return step.tool }).run(plan.steps as any, { authorized: true, onState: state => updates.push(state.progress) })
    expect(result.state.status).toBe('committed'); expect(draft.layers.find(layer => layer.id === 'art')?.transform?.rotation).toBe(15); expect(updates.length).toBeGreaterThan(2)
  })
})
