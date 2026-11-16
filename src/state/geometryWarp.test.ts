import { describe, expect, it } from 'vitest'
import { decodeProject, encodeProject } from '../document/projectFormat'
import { editorReducer, initialEditorState } from './editor'

describe('geometry warp document integration', () => {
  it('stores a recipe as an undoable layer edit and restores it through project format', async () => {
    const recipe = { kind: 'radial' as const, distortion: 0.25, center: { x: 50, y: 50 } }
    const changed = editorReducer(initialEditorState, { type: 'set-layer-warp', id: 'art', recipe })
    expect(changed.layers.find(layer => layer.id === 'art')?.warpRecipe).toEqual(recipe)
    expect(editorReducer(changed, { type: 'undo' }).layers.find(layer => layer.id === 'art')?.warpRecipe).toBeUndefined()
    const reopened = decodeProject(await encodeProject(changed, { id: 'warp', name: 'warp' })).document
    expect(reopened.layers.find(layer => layer.id === 'art')?.warpRecipe).toEqual(recipe)
  })
  it('rejects malformed geometry recipes on reopen', async () => {
    const changed = editorReducer(initialEditorState, { type: 'set-layer-warp', id: 'art', recipe: { kind: 'radial', distortion: 0.25 } })
    const saved = JSON.parse(await encodeProject(changed, { id: 'warp', name: 'warp' }))
    saved.document.layers.find((layer: { id: string }) => layer.id === 'art').warpRecipe.distortion = 2
    expect(() => decodeProject(JSON.stringify(saved))).toThrow()
  })
})
