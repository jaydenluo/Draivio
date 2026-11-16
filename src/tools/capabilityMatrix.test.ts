import { describe, expect, it } from 'vitest'
import { TOOL_GROUPS } from './toolRegistry'
import { getToolCapability, listToolCapabilities, type ToolCapabilityStatus } from './capabilityMatrix'

describe('tool capability matrix', () => {
  it('covers every exposed tool exactly once', () => {
    const capabilities = listToolCapabilities()
    const exposed = TOOL_GROUPS.flatMap((group) => group.tools.map((tool) => tool.id))
    expect(capabilities).toHaveLength(39)
    expect(new Set(capabilities.map((capability) => capability.toolId)).size).toBe(39)
    expect(capabilities.map((capability) => capability.toolId).sort()).toEqual([...exposed].sort())
  })

  it('returns evidence-backed status and does not treat an entry as executable evidence', () => {
    const statuses: ToolCapabilityStatus[] = ['real', 'simulated', 'missing']
    expect(statuses).toContain(getToolCapability('select')?.status)
    expect(getToolCapability('select')).toMatchObject({
      status: 'simulated',
      evidence: { level: 'source-and-offline-tests', liveAudit: 'blocked_native_input_not_acceptance' },
      mapping: { reducerActions: ['set-notice', 'commit-selection'], schemaFields: ['selection', 'layers[].transform', 'notice'] },
    })
    expect(getToolCapability('subject-select')).toMatchObject({ status: 'missing', gapReason: expect.stringContaining('没有主体分割') })
    expect(getToolCapability('gradient-brush')).toMatchObject({ status: 'simulated', sideEffects: ['brushStrokes'] })
    expect(getToolCapability('unknown-tool')).toBeUndefined()
  })

  it('exposes stable scope, dependencies, and acceptance targets for every capability', () => {
    for (const capability of listToolCapabilities()) {
      expect(capability.scope).toEqual(expect.objectContaining({ document: expect.any(String), selection: expect.any(String) }))
      expect(capability.mapping.reducerActions.length).toBeGreaterThan(0)
      expect(capability.mapping.renderPaths.length).toBeGreaterThan(0)
      expect(capability.mapping.schemaFields.length).toBeGreaterThan(0)
      expect(capability.dependencies.length).toBeGreaterThan(0)
      expect(capability.acceptanceTargets.firstRelease.length).toBeGreaterThan(0)
      expect(capability.acceptanceTargets.complete.length).toBeGreaterThan(0)
    }
  })
})
