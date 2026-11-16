import { expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Resvg } from '@resvg/resvg-js'

it('captures blank reviews, rejects empty attestations and verifies 30-case aggregation and tamper detection', () => {
  // Synthetic contract data lives only in a temp directory; never an acceptance artifact.
  const dir = mkdtempSync(join(tmpdir(), 'draivio-review-contract-'))
  const command = (...args: string[]) => spawnSync(process.execPath, ['--experimental-strip-types', resolve('scripts/evaluation/review.mjs'), ...args], { encoding: 'utf8' })
  const hash = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')
  try {
    const artifacts = Array.from({ length: 30 }, (_, i) => {
      const data = new Resvg(`<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="rgb(${i * 8},10,20)"/></svg>`, { font: { loadSystemFonts: false } }).render().asPng()
      writeFileSync(join(dir, `${i}.png`), data)
      return { caseId: `synthetic-contract-${i}`, prompt: `synthetic fixture ${i}`, inputPath: `${i}.png`, outputPath: `${i}.png`, inputSha256: hash(data), outputSha256: hash(data), provenance: { mode: 'real-generation', provider: 'SYNTHETIC_TEST_ONLY', model: 'fixture', modelRevision: '1', requestConfig: {}, requestId: `contract-${i}`, createdAt: '2026-11-15T00:00:00Z', authorizationReference: 'contract-test-not-real-evidence', cost: { amount: 0, currency: 'USD' } } }
    })
    const manifest = join(dir, 'manifest.json'), reviews = join(dir, 'reviews')
    writeFileSync(manifest, JSON.stringify({ schemaVersion: 1, artifacts }))
    expect(command('init', manifest, reviews).status).toBe(0)
    const a = join(reviews, 'review-a.json'), b = join(reviews, 'review-b.json')
    expect(command('aggregate', manifest, a, b, join(dir, 'invalid.json')).status).toBe(1)
    for (const [file, reviewerId] of [[a, 'synthetic-a'], [b, 'synthetic-b']]) {
      const values = JSON.parse(readFileSync(file, 'utf8')).map((entry: Record<string, unknown>) => ({ ...entry, reviewerId, reviewedAt: '2026-11-15T00:00:00Z', independent: true, intent: 4, preservation: 4, artifacts: 4, decision: 'pass', notes: 'SYNTHETIC CONTRACT TEST, NOT HUMAN EVIDENCE' }))
      writeFileSync(file, JSON.stringify(values))
    }
    const report = join(dir, 'report.json')
    expect(command('aggregate', manifest, a, b, report).status).toBe(0)
    expect(JSON.parse(readFileSync(report, 'utf8'))).toMatchObject({ complete: 30, bothPass: 30, disagreements: [], meetsThirtyCaseRequirement: true })
    writeFileSync(join(dir, '0.png'), 'tampered')
    const rejected = command('aggregate', manifest, a, b, join(dir, 'tampered.json'))
    expect(rejected.status).toBe(1); expect(rejected.stderr).toContain('hash mismatch')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
