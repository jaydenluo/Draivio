import { expect, it } from 'vitest'
import { scorePlan, protectedPixelChanges, aggregateReviews } from './evaluate'

it('rejects a plausible plan with the wrong target, numeric range, dependency or extra destructive step', () => {
  const expected = [{ tool: 'move', args: { layerId: 'subject', dx: { min: 9.9, max: 10.1 }, dy: 0 } }]
  const step = { id: 'a', tool: 'move', args: { layerId: 'subject', dx: 10, dy: 0 }, dependsOn: [] }
  expect(scorePlan(expected, [step]).passed).toBe(true)
  expect(scorePlan(expected, [{ ...step, args: { ...step.args, layerId: 'background' } }]).passed).toBe(false)
  expect(scorePlan(expected, [{ ...step, args: { ...step.args, dx: 100 } }]).passed).toBe(false)
  expect(scorePlan(expected, [step, { ...step, id: 'b', tool: 'delete' }]).passed).toBe(false)
  expect(scorePlan([...expected, ...expected], [step, { ...step, id: 'b' }]).passed).toBe(false)
})
it('detects one changed protected pixel and excludes editable pixels', () => {
  const before = new Uint8Array(16), after = before.slice(); after[0] = 255; after[12] = 255
  expect(protectedPixelChanges(before, after, new Uint8Array([0, 1, 1, 1]))).toBe(1)
  expect(() => protectedPixelChanges(before, new Uint8Array(8), new Uint8Array(4))).toThrow()
})
it('does not turn missing, repeated-reviewer, duplicate or dissenting reviews into approval', () => {
  const entry = { caseId: 'g1', artifactSha256: 'a'.repeat(64), reviewerId: 'human-a', reviewedAt: '2026-11-15T00:00:00Z', independent: true, intent: 4, preservation: 4, artifacts: 4, decision: 'pass', notes: '符合要求' }
  expect(aggregateReviews(['g1'], []).complete).toBe(0)
  expect(() => aggregateReviews(['g1'], [entry, entry])).toThrow()
  const report = aggregateReviews(['g1'], [entry, { ...entry, reviewerId: 'human-b', decision: 'fail', artifacts: 1 }])
  expect(report.complete).toBe(1); expect(report.bothPassRate).toBe(0); expect(report.disagreements).toEqual(['g1'])
})
