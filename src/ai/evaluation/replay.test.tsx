import { expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Resvg } from '@resvg/resvg-js'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { CanvasScene } from '../../canvas/CanvasScene'
import { planNaturalLanguage } from '../planning/planner'
import { executeEditorCommand, type EditorCommand } from '../tools/editorTools'
import { executeTransaction } from '../execution/transaction'
import { PlanExecutor } from '../execution/executor'
import { PLANNER_TOOL_NAMES } from '../planning/prompts'
import { evaluationFixture, fixtureIds } from './fixture'
import { replayCase, checkPostconditions, oracleSteps } from './replay'
import { protectedPixelChanges, scorePlan, type EvaluationCase, type ObservedStep } from './evaluate'
import corpus from './cases.json'

const cases = corpus as EvaluationCase[]
const image = (state: ReturnType<typeof evaluationFixture>) => {
  const markup = renderToStaticMarkup(<CanvasScene state={state} />)
  return new Resvg(markup.slice(markup.indexOf('<svg'), markup.indexOf('</svg>') + 6), { fitTo: { mode: 'width', value: 100 }, font: { loadSystemFonts: false } }).render()
}

it('contains 150 unique Chinese cases, 60 composites and covers every released AI tool', () => {
  expect(cases.length).toBeGreaterThanOrEqual(150)
  expect(new Set(cases.map(c => c.id)).size).toBe(cases.length)
  expect(new Set(cases.map(c => c.instruction)).size).toBe(cases.length)
  expect(cases.filter(c => c.composite).length).toBeGreaterThanOrEqual(60)
  expect([...new Set(cases.flatMap(c => c.expected.map(s => s.tool)))].sort()).toEqual([...PLANNER_TOOL_NAMES].sort())
})
it('the execution oracle detects a no-op/wrong-target implementation', async () => {
  const c = cases[0], before = evaluationFixture()
  expect(checkPostconditions(c, before, before).length).toBeGreaterThan(0)
  const wrong = oracleSteps(c); wrong[0].args.layerId = 'title'
  expect((await replayCase(c, wrong)).passed).toBe(false)
})
it('preserves every rendered pixel for commands aimed at a locked layer', () => {
  const before = evaluationFixture()
  before.layers[0].locked = true
  const baseline = image(before).pixels
  const empty = image({ ...before, layers: [] }).pixels
  expect(baseline.some((channel, i) => channel !== empty[i])).toBe(true)
  for (const tool of PLANNER_TOOL_NAMES) {
    const sample = cases.find(c => c.expected[0].tool === tool)!
    const step = oracleSteps(sample)[0]
    const command = { ...step.args, op: tool, layerId: 'subject', ...(['group', 'align', 'distribute'].includes(tool) ? { layerIds: ['subject'] } : {}) } as EditorCommand
    let after = before
    if (tool === 'filter' || tool === 'adjustment') {
      // Pixel adapters explicitly refuse a locked target before producing
      // reducer state. Keep the source and pixel checks below for this path too.
      expect(() => executeEditorCommand(before, command)).toThrow(/锁定/)
    } else after = executeEditorCommand(before, command)
    // Production explicitly allows copying a locked source; the source stays intact.
    expect(after.layers.filter(l => before.layers.some(old => old.id === l.id)), tool).toEqual(before.layers)
    expect(after.layers.length, tool).toBe(before.layers.length + (tool === 'duplicate' ? 1 : 0))
    expect(protectedPixelChanges(baseline, image(after).pixels, new Uint8Array(10000).fill(1)), tool).toBe(0)
  }
})
it('preview, cancellation and a failing second step leave the actual document intact', async () => {
  const before = evaluationFixture(), original = structuredClone(before)
  const executor = new PlanExecutor(async () => { throw new Error('preview must not invoke tools') })
  expect(executor.preview([{ id: 'a', tool: 'move', args: { layerId: 'subject', dx: 8, dy: 0 }, dependsOn: [] }]).status).toBe('preview')
  const cancelled = new AbortController(); cancelled.abort()
  const plan = { steps: [{ id: 'move', apply: (state: typeof before) => executeEditorCommand(state, { op: 'move', layerId: 'subject', dx: 8, dy: 0 }) }, { id: 'invalid-scale', apply: (state: typeof before) => executeEditorCommand(state, { op: 'scale', layerId: 'subject', sx: 0 }) }] }
  expect((await executeTransaction(before, plan, { signal: cancelled.signal })).status).toBe('cancelled')
  const failed = await executeTransaction(before, plan)
  expect(failed.status).toBe('failed'); expect(failed.state).toBe(before)
  expect(before).toEqual(original)
})
it('replays the corpus through the real executor and atomic reducer; reports planning separately', async () => {
  const start = Date.now()
  const fixture = evaluationFixture()
  const baseline = image(fixture).pixels
  const mask = new Uint8Array(10000)
  // Bottom-left 4x4 lies outside every requested geometry and is protected.
  for (let y = 96; y < 100; y++) for (let x = 0; x < 4; x++) mask[y * 100 + x] = 1
  const records = []
  const imported = process.env.EVALUATION_PLANS ? JSON.parse(readFileSync(process.env.EVALUATION_PLANS, 'utf8')) as { metadata: Record<string, unknown>; predictions: Record<string, ObservedStep[]> } : undefined
  if (imported) {
    const m = imported.metadata
    for (const key of ['provider', 'model', 'modelRevision', 'requestConfig', 'promptSha256', 'runId', 'gitRevision', 'cost', 'authorizationReference']) expect(m[key], `missing real-model metadata ${key}`).toBeDefined()
    expect(m.mode).toBe('real-model-import')
    for (const key of ['provider', 'model', 'modelRevision', 'runId', 'gitRevision', 'authorizationReference']) expect(typeof m[key] === 'string' && (m[key] as string).trim().length > 0, `invalid metadata ${key}`).toBe(true)
    expect(m.promptSha256).toMatch(/^[a-f0-9]{64}$/i)
    expect(m.requestConfig && typeof m.requestConfig === 'object' && !Array.isArray(m.requestConfig)).toBe(true)
    expect(m.cost).toMatchObject({ currency: expect.any(String), amount: expect.any(Number), inputTokens: expect.any(Number), outputTokens: expect.any(Number) })
    for (const key of ['amount', 'inputTokens', 'outputTokens']) {
      const value = (m.cost as Record<string, number>)[key]
      expect(Number.isFinite(value) && value >= 0, `invalid cost ${key}`).toBe(true)
    }
    expect(Object.keys(imported.predictions).sort()).toEqual(cases.map(c => c.id).sort())
  }
  for (const c of cases) {
    const result = await replayCase(c, undefined, structuredClone(fixture))
    const planning = imported?.predictions[c.id] ?? planNaturalLanguage(c.instruction, { layers: fixture.layers.filter(l => fixtureIds.includes(l.id)), selectedLayerId: 'subject' }).steps
    const plan = scorePlan(c.expected, planning)
    const protectedChanges = protectedPixelChanges(baseline, image(result.after).pixels, mask)
    records.push({ caseId: c.id, instruction: c.instruction, planning: plan, execution: { passed: result.passed, status: result.executionStatus, failures: result.failures }, pixels: { passed: protectedChanges === 0, changedProtectedPixels: protectedChanges, protectedPixels: 16 } })
  }
  const report = {
    schemaVersion: 1, createdAt: new Date().toISOString(), environment: { node: process.version, renderer: JSON.parse(readFileSync('node_modules/@resvg/resvg-js/package.json', 'utf8')).version, sourceSha256: Object.fromEntries(['src/ai/planning/planner.ts', 'src/ai/planning/prompts.ts', 'src/ai/tools/editorTools.ts', 'src/ai/execution/executor.ts', 'src/ai/execution/transaction.ts', 'src/state/editor.tsx', 'src/canvas/CanvasScene.tsx'].map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')])) }, corpusVersion: 'zh-layer-1.1.0', corpusSha256: createHash('sha256').update(JSON.stringify(corpus)).digest('hex'),
    metadata: imported?.metadata ?? { mode: 'offline-deterministic-planner', model: null, modelRevision: null, requestConfig: null, cost: { amount: 0, currency: 'USD', inputTokens: 0, outputTokens: 0 }, gitRevision: process.env.EVALUATION_GIT_REVISION ?? null, note: 'Actual local parser predictions; no model calls. Execution uses oracle commands independently.' },
    metrics: { planning: { passed: records.filter(r => r.planning.passed).length, total: cases.length, rate: records.filter(r => r.planning.passed).length / cases.length, realModelEvidence: !!imported }, execution: { passed: records.filter(r => r.execution.passed).length, total: cases.length }, pixels: { passed: records.filter(r => r.pixels.passed).length, total: cases.length, scope: '16 protected canvas pixels plus protected layer state; not full image quality' }, visual: { status: 'not_run', reviewedCases: 0, requiredCases: 30 } }, durationMs: Date.now() - start,
    failures: records.filter(r => !r.planning.passed || !r.execution.passed || !r.pixels.passed), records,
  }
  if (process.env.EVALUATION_REPORT) writeFileSync(process.env.EVALUATION_REPORT, JSON.stringify(report, null, 2) + '\n')
  expect(records.filter(r => !r.execution.passed), 'execution failures').toEqual([])
  expect(records.filter(r => !r.pixels.passed), 'protected canvas pixel failures').toEqual([])
  if (imported || process.env.EVALUATION_PLANNING_GATE === '1') expect(report.metrics.planning.rate, 'planning release target (offline rate is not real-model evidence)').toBeGreaterThanOrEqual(.9)
  if (process.env.EVALUATION_BASELINE) {
    const baselineReport = JSON.parse(readFileSync(process.env.EVALUATION_BASELINE, 'utf8')) as typeof report
    expect(report.corpusSha256).toBe(baselineReport.corpusSha256)
    expect(report.metadata.mode).toBe(baselineReport.metadata.mode)
    const priorPass = new Set(baselineReport.records.filter(r => r.planning.passed).map(r => r.caseId))
    expect(records.filter(r => priorPass.has(r.caseId) && !r.planning.passed), 'previously passing planning cases regressed').toEqual([])
  }
}, 60000)
