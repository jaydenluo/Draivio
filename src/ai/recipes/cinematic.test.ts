import { describe, expect, it } from 'vitest'
import { analyzeCinematicReference, applyCinematicRecipe, cinematicRecipe, cinematicRecipeDefinition, cinematicStyles, styleFromReference } from './cinematic'
import { initialEditorState } from '../../state/editor'

describe('cinematic recipes', () => {
  it('provides four editable styles and neutral strength is identity', () => {
    expect(cinematicStyles()).toEqual(['warm', 'cool', 'monochrome', 'vintage'])
    for (const style of cinematicStyles()) {
      const recipe = cinematicRecipe(style, 0)
      expect(recipe.adjustments.saturation).toBe(0)
      expect(recipe.adjustments.temperature).toBe(0)
      expect(recipe.adjustments.curves).toEqual({ rgb: [{ x: 0, y: 0 }, { x: 1, y: 1 }], r: [{ x: 0, y: 0 }, { x: 1, y: 1 }], g: [{ x: 0, y: 0 }, { x: 1, y: 1 }], b: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })
      expect(recipe.smartFilters.items.every(item => item.amount === 0)).toBe(true)
    }
  })
  it('exposes all four styles as editable recipe-engine definitions', () => {
    for (const style of cinematicStyles()) { const recipe = cinematicRecipeDefinition(style); expect(recipe.name).toContain('电影'); expect(recipe.steps).toHaveLength(5); expect(recipe.parameters).toHaveProperty('contrast') }
  })
  it('changes only adjustment/filter state and preserves text and geometry', () => {
    const layer = { ...initialEditorState.layers[0], kind: 'text' as const, textObjectId: 'text-1', transform: { kind: 'transform' as const, rect: { x: 3, y: 4, width: 20, height: 10 }, rotation: 12, flipX: false, flipY: false } }
    const styled = applyCinematicRecipe(layer, cinematicRecipe('warm', .8))
    expect(styled.textObjectId).toBe('text-1'); expect(styled.transform).toEqual(layer.transform); expect(styled.adjustments?.temperature).toBeGreaterThan(0)
  })
  it('extracts bounded reference statistics without copying pixels', () => {
    const stats = analyzeCinematicReference(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]), 2, 1)
    expect(stats.averageWarmth).toBeCloseTo(0); expect(stats.averageLuma).toBeGreaterThan(0); expect(stats.contrast).toBeGreaterThan(0)
    expect(styleFromReference({ averageLuma: .5, averageWarmth: .2, contrast: .3 })).toEqual({ style: 'warm', intensity: .4 })
  })
})
