/** Evaluation is deliberately separate from planning and reducer implementations. */
export type ExpectedStep = { tool: string; args: Record<string, unknown> }
export type ObservedStep = { id: string; tool: string; args: Record<string, unknown>; dependsOn?: string[] }
export type EvaluationCase = { id: string; instruction: string; fixture: string; expected: ExpectedStep[]; postconditions: Array<{ layerId?: string; path: string; equals: unknown }>; composite: boolean }

function equal(expected: unknown, actual: unknown): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    const range = expected as Record<string, unknown>
    if (typeof range.min === 'number' && typeof range.max === 'number') return typeof actual === 'number' && Number.isFinite(actual) && actual >= range.min && actual <= range.max
  }
  return JSON.stringify(expected) === JSON.stringify(actual)
}
/** Exact step count/order, target and argument checks; sequential dependencies are mandatory. */
export function scorePlan(expected: ExpectedStep[], actual: ObservedStep[]) {
  const failures: string[] = []
  if (actual.length !== expected.length) failures.push(`step count: expected ${expected.length}, got ${actual.length}`)
  const ids = new Set<string>()
  expected.forEach((step, i) => {
    const observed = actual[i]
    if (!observed) { failures.push(`step ${i + 1}: missing`); return }
    if (!observed.id || ids.has(observed.id)) failures.push(`step ${i + 1}: invalid/duplicate id`)
    ids.add(observed.id)
    if (observed.tool !== step.tool) failures.push(`step ${i + 1}: expected ${step.tool}, got ${observed.tool}`)
    for (const [key, value] of Object.entries(step.args)) if (!equal(value, observed.args?.[key])) failures.push(`step ${i + 1}.${key}: expected ${JSON.stringify(value)}, got ${JSON.stringify(observed.args?.[key])}`)
    for (const key of Object.keys(observed.args ?? {})) if (!(key in step.args)) failures.push(`step ${i + 1}: unexpected argument ${key}`)
    const deps = observed.dependsOn ?? []
    if (i === 0 ? deps.length !== 0 : deps.length !== 1 || deps[0] !== actual[i - 1]?.id) failures.push(`step ${i + 1}: dependency mismatch`)
  })
  return { passed: failures.length === 0, failures }
}
/** Mask value 1 means protected; count pixels, not changed channels. */
export function protectedPixelChanges(before: Uint8Array, after: Uint8Array, protectedMask: Uint8Array): number {
  if (before.length !== after.length || before.length !== protectedMask.length * 4) throw new Error('RGBA/mask dimensions differ')
  let changed = 0
  for (let pixel = 0; pixel < protectedMask.length; pixel++) if (protectedMask[pixel] && [0, 1, 2, 3].some(c => before[pixel * 4 + c] !== after[pixel * 4 + c])) changed++
  return changed
}
export type HumanReview = { caseId: string; artifactSha256: string; reviewerId: string; reviewedAt: string; independent: boolean; intent: number; preservation: number; artifacts: number; decision: string; notes: string }
/** This validates submitted attestations; identity and independence still need human verification. */
export function aggregateReviews(caseIds: string[], reviews: HumanReview[]) {
  if (new Set(caseIds).size !== caseIds.length) throw new Error('Duplicate review case')
  const byCase = new Map(caseIds.map(id => [id, [] as HumanReview[]]))
  for (const review of reviews) {
    const entries = byCase.get(review.caseId)
    if (!entries || !review.reviewerId?.trim() || !/^[a-f0-9]{64}$/i.test(review.artifactSha256) || !Number.isFinite(Date.parse(review.reviewedAt)) || review.independent !== true || !['pass', 'fail'].includes(review.decision) || !review.notes?.trim() || ![review.intent, review.preservation, review.artifacts].every(n => Number.isInteger(n) && n >= 1 && n <= 5)) throw new Error(`Invalid review: ${review.caseId}`)
    if (entries.some(r => r.reviewerId.trim().toLowerCase() === review.reviewerId.trim().toLowerCase()) || entries.length >= 2) throw new Error(`Exactly two distinct reviewers required: ${review.caseId}`)
    if (entries.length && entries[0].artifactSha256 !== review.artifactSha256) throw new Error(`Review artifact mismatch: ${review.caseId}`)
    if (review.decision === 'pass' && [review.intent, review.preservation, review.artifacts].some(n => n < 3)) throw new Error(`Passing review below rubric threshold: ${review.caseId}`)
    entries.push(review)
  }
  const complete = [...byCase].filter(([, r]) => r.length === 2)
  const bothPass = complete.filter(([, r]) => r.every(x => x.decision === 'pass')).length
  const disagreements = complete.filter(([, r]) => r[0].decision !== r[1].decision).map(([id]) => id)
  return { required: caseIds.length, complete: complete.length, missing: [...byCase].filter(([, r]) => r.length < 2).map(([id]) => id), bothPass, bothPassRate: complete.length ? bothPass / complete.length : null, disagreements, disagreementRate: complete.length ? disagreements.length / complete.length : null, meetsThirtyCaseRequirement: caseIds.length >= 30 && complete.length === caseIds.length }
}
