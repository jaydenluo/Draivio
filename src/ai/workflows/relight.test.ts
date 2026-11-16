import { describe, expect, it } from 'vitest'
import { applyRelight, buildRelightPlan, defaultRelightSettings, validateRelightSettings } from './relight'
import { initialEditorState } from '../../state/editor'

describe('relight workflow', () => {
  it('supports left, right and top with bounded non-destructive plans', () => {
    for (const direction of ['left', 'right', 'top'] as const) {
      const plan = buildRelightPlan({ ...defaultRelightSettings(), direction, intensity: 60 })
      expect(plan.effects.items.some(item => item.kind === 'shadow')).toBe(true)
      expect(plan.adjustments.exposureEV).toBeGreaterThan(0)
    }
  })
  it('preserves existing effects and produces a before/after state without geometry changes', () => {
    const state = structuredClone(initialEditorState)
    state.layers[0].effects = buildRelightPlan(defaultRelightSettings()).effects
    const before = structuredClone(state.layers[0])
    const next = applyRelight(state, 'art', { ...defaultRelightSettings(), direction: 'right' })
    expect(next.layers[0].transform).toEqual(before.transform)
    expect(next.layers[0].effects?.items.some(item => item.kind === 'shadow')).toBe(true)
    expect(next.undoStack).toHaveLength(2)
  })
  it('rejects text/locked targets and can disable only the shadow adjustment', () => {
    const state = structuredClone(initialEditorState)
    state.layers[0].kind = 'text'
    expect(() => applyRelight(state, 'art', defaultRelightSettings())).toThrow('文字')
    state.layers[0].kind = 'image'; state.layers[0].locked = true
    expect(() => applyRelight(state, 'art', defaultRelightSettings())).toThrow('锁定')
    const image = structuredClone(initialEditorState)
    const lit = applyRelight(image, 'art', defaultRelightSettings())
    const off = applyRelight(lit, 'art', { ...defaultRelightSettings(), enabled: false })
    expect(off.layers[0].effects?.items.some(item => item.kind === 'shadow')).toBe(false)
  })
  it('validates settings and does not claim generated model output', () => {
    expect(() => validateRelightSettings({ ...defaultRelightSettings(), intensity: 101 })).toThrow()
    expect(buildRelightPlan(defaultRelightSettings()).unsupportedGeneration).toContain('生成式')
  })
})
