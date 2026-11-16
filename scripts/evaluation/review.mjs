#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { aggregateReviews } from '../../src/ai/evaluation/evaluate.ts'
const [mode, manifestPath, ...paths] = process.argv.slice(2)
if (!['init', 'aggregate'].includes(mode) || !manifestPath) throw new Error('Usage: node --experimental-strip-types scripts/evaluation/review.mjs init MANIFEST OUT_DIR | aggregate MANIFEST REVIEW_A REVIEW_B REPORT')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.artifacts) || manifest.artifacts.length < 30) throw new Error('At least 30 genuine generation artifacts required')
const root = dirname(resolve(manifestPath))
const hash = path => createHash('sha256').update(readFileSync(resolve(root, path))).digest('hex')
const seen = new Set()
const outputs = new Set()
const requests = new Set()
for (const a of manifest.artifacts) {
  if (!a.caseId || seen.has(a.caseId) || !a.prompt?.trim() || !a.inputPath || !a.outputPath) throw new Error('Missing/duplicate artifact identity')
  seen.add(a.caseId)
  for (const key of ['provider', 'model', 'modelRevision', 'requestConfig', 'requestId', 'createdAt', 'cost', 'authorizationReference']) if (a.provenance?.[key] === undefined) throw new Error(`Missing generation provenance: ${key}`)
  if (a.provenance.mode !== 'real-generation' || !Number.isFinite(Date.parse(a.provenance.createdAt)) || !Number.isFinite(a.provenance.cost?.amount) || a.provenance.cost.amount < 0 || !a.provenance.cost.currency) throw new Error('Invalid real-generation provenance/cost')
  if (outputs.has(a.outputSha256) || requests.has(a.provenance.requestId)) throw new Error('Generation examples require distinct outputs and request IDs')
  outputs.add(a.outputSha256); requests.add(a.provenance.requestId)
  if (hash(a.inputPath) !== a.inputSha256 || hash(a.outputPath) !== a.outputSha256) throw new Error(`Artifact content hash mismatch: ${a.caseId}`)
}
if (mode === 'init') {
  if (paths.length !== 1) throw new Error('init requires OUT_DIR')
  mkdirSync(paths[0], { recursive: true })
  for (const slot of ['a', 'b']) writeFileSync(join(paths[0], `review-${slot}.json`), JSON.stringify(manifest.artifacts.map(a => ({ caseId: a.caseId, artifactSha256: a.outputSha256, reviewerId: '', reviewedAt: '', independent: false, intent: null, preservation: null, artifacts: null, decision: '', notes: '' })), null, 2) + '\n', { flag: 'wx' })
} else {
  if (paths.length !== 3) throw new Error('aggregate requires REVIEW_A REVIEW_B REPORT')
  const reviews = paths.slice(0, 2).flatMap(path => JSON.parse(readFileSync(path, 'utf8')))
  for (const r of reviews) if (manifest.artifacts.find(a => a.caseId === r.caseId)?.outputSha256 !== r.artifactSha256) throw new Error('Reviewed artifact is not in manifest')
  const result = aggregateReviews(manifest.artifacts.map(a => a.caseId), reviews)
  writeFileSync(paths[2], JSON.stringify({ schemaVersion: 1, createdAt: new Date().toISOString(), evidenceKind: 'human-attestation', ...result, reviews }, null, 2) + '\n', { flag: 'wx' })
  if (!result.meetsThirtyCaseRequirement) process.exitCode = 1
}
