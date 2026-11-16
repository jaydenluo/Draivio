#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve, dirname } from 'node:path'
import { mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const at = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const report = resolve(at('--report') ?? 'docs/evaluation/local-replay.json')
if (existsSync(report) && !args.includes('--overwrite')) throw new Error('Report exists; choose a new path or pass --overwrite')
mkdirSync(dirname(report), { recursive: true })
const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
const plans = at('--plans')
const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', 'src/ai/evaluation/replay.test.tsx'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, EVALUATION_REPORT: report, EVALUATION_GIT_REVISION: git.status === 0 ? git.stdout.trim() : '', ...(plans ? { EVALUATION_PLANS: resolve(plans) } : {}), ...(at('--baseline') ? { EVALUATION_BASELINE: resolve(at('--baseline')) } : {}), EVALUATION_PLANNING_GATE: args.includes('--planning-gate') ? '1' : '0' },
})
process.exit(result.status ?? 1)
