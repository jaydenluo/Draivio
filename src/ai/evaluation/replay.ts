import { executeEditorCommand, type EditorCommand } from '../tools/editorTools'
import { PlanExecutor } from '../execution/executor'
import { executeTransaction } from '../execution/transaction'
import { type EditorState, editorReducer } from '../../state/editor'
import type { PlannerToolName } from '../planning/prompts'
import type { EvaluationCase, ObservedStep } from './evaluate'
import { evaluationFixture } from './fixture'

/** These are oracle commands, used to test execution, never presented as model predictions. */
export function oracleSteps(c: EvaluationCase): ObservedStep[] {
  return c.expected.map((step, index) => ({ id: `s${index}`, tool: step.tool, args: Object.fromEntries(Object.entries(step.args).map(([k, v]) => [k, v && typeof v === 'object' && 'min' in v && 'max' in v ? (Number(v.min) + Number(v.max)) / 2 : v])), dependsOn: index ? [`s${index - 1}`] : [] }))
}
function get(object: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, object)
}
export function checkPostconditions(c: EvaluationCase, before: EditorState, after: EditorState): string[] {
  const failures: string[] = []
  for (const condition of c.postconditions) {
    const layer = after.layers.find(l => l.id === condition.layerId)
    let actual: unknown
    if (condition.path === '$absent') actual = !layer
    else if (condition.path === '$index') actual = after.layers.findIndex(l => l.id === condition.layerId)
    else if (condition.path === '$sourceCount') actual = after.layers.filter(l => l.source === before.layers.find(x => x.id === condition.layerId)?.source).length
    else if (condition.path === '$groupContains') actual = after.layers.some(l => !!l.children && l.children.length === (condition.equals as string[]).length && (condition.equals as string[]).every(id => l.children?.includes(id) && after.layers.find(child => child.id === id)?.groupId === l.id)) ? condition.equals : null
    else actual = get(condition.layerId ? layer : after, condition.path)
    const ok = typeof condition.equals === 'number' && typeof actual === 'number' ? Math.abs(actual - condition.equals) < 0.00001 : JSON.stringify(actual) === JSON.stringify(condition.equals)
    if (!ok) failures.push(`${condition.layerId ?? 'document'}.${condition.path}: expected ${JSON.stringify(condition.equals)}, got ${JSON.stringify(actual)}`)
  }
  return failures
}
/** Runs the actual DAG executor inside the production atomic transaction and reducer. */
export async function replayCase(c: EvaluationCase, steps = oracleSteps(c), before = evaluationFixture()) {
  const original = structuredClone(before)
  let executionStatus = ''
  const outcome = await executeTransaction(before, { id: c.id, steps: [{ id: 'dag', apply: async state => {
    let draft = state
    const executor = new PlanExecutor(async step => { draft = executeEditorCommand(draft, { ...step.args, op: step.tool } as EditorCommand); return { layerCount: draft.layers.length } })
    const result = await executor.run(steps.map(step => ({ ...step, tool: step.tool as PlannerToolName, dependsOn: step.dependsOn ?? [] })), { authorized: true })
    executionStatus = result.state.status
    if (executionStatus !== 'committed') throw new Error(result.state.error ?? executionStatus)
    return draft
  } }] })
  const failures = outcome.status === 'committed' ? checkPostconditions(c, original, outcome.state) : [`transaction ${outcome.status}`]
  if (JSON.stringify(before) !== JSON.stringify(original)) failures.push('input state mutated')
  const protectedBefore = before.layers.find(l => l.id === 'protected'), protectedAfter = outcome.state.layers.find(l => l.id === 'protected')
  if (JSON.stringify(protectedBefore) !== JSON.stringify(protectedAfter)) failures.push('protected layer mutated')
  if (outcome.status === 'committed') {
    const undone = editorReducer(outcome.state, { type: 'undo' })
    if (JSON.stringify(undone.layers) !== JSON.stringify(before.layers)) failures.push('undo did not restore layers')
    const redone = editorReducer(undone, { type: 'redo' })
    if (JSON.stringify(redone.layers) !== JSON.stringify(outcome.state.layers)) failures.push('redo did not restore layers')
  }
  return { caseId: c.id, passed: failures.length === 0, executionStatus, transactionStatus: outcome.status, failures, before, after: outcome.state }
}
