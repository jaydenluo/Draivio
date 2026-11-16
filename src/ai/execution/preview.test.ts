import { describe, expect, it } from 'vitest'
import { initialEditorState, editorReducer } from '../../state/editor'
import { createEditPreview, rebuildEditPreview, previewCanCommit } from './preview'
import { planNaturalLanguage } from '../planning/planner'
const steps = () => planNaturalLanguage('向右10像素然后旋转15度', { selectedLayerId: 'art' }).steps

describe('isolated edit candidate', () => {
  it('rebuilds from one base and never mutates document or history', () => {
    const base = structuredClone(initialEditorState), original = structuredClone(base)
    const candidate = createEditPreview(base, 'doc', steps(), ['art'])
    const tuned = rebuildEditPreview(candidate, 'step-1', 'dx', 30)
    const retuned = rebuildEditPreview(tuned, 'step-1', 'dx', 20)
    expect(base).toEqual(original)
    expect(retuned.document.layers.find(l => l.id === 'art')?.transform?.rect.x).toBe(4)
    expect(retuned.document.layers.find(l => l.id === 'art')?.transform?.rotation).toBe(15)
    expect(retuned.id).toBe(candidate.id)
    const applied = editorReducer(base, { type: 'apply-edit-plan', document: retuned.document })
    expect(applied.undoStack).toHaveLength(base.undoStack.length + 1)
    const undone = editorReducer(applied, { type: 'undo' })
    expect(undone.layers).toEqual(base.layers)
    expect(editorReducer(undone, { type: 'redo' }).layers).toEqual(retuned.document.layers)
  })
  it('rejects stale document identity/revision and invalid tool parameters', () => {
    const base = structuredClone(initialEditorState), candidate = createEditPreview(base, 'doc', steps(), ['art'])
    expect(previewCanCommit(candidate, base, 'doc')).toBe(true)
    expect(previewCanCommit(candidate, base, 'other')).toBe(false)
    expect(previewCanCommit(candidate, { ...base, documentWidth: 50 }, 'doc')).toBe(false)
    expect(() => rebuildEditPreview(candidate, 'step-1', 'dx', NaN)).toThrow()
    expect(() => rebuildEditPreview(candidate, 'step-1', 'evil', 30)).toThrow()
    expect(() => createEditPreview(base, 'doc', steps(), ['original'])).toThrow(/范围/)
  })
})

describe('preview tool authority and scope',()=>{
 it('rejects reserved op overrides and undeclared fields instead of deleting a layer',()=>{
  const base=structuredClone(initialEditorState)
  const malicious=[{id:'one',tool:'move' as const,args:{op:'delete',layerId:'art',dx:10,dy:0},dependsOn:[]}]
  expect(()=>createEditPreview(base,'doc',malicious,['art'])).toThrow(/参数/)
  expect(base.layers.some(l=>l.id==='art')).toBe(true)
 })
 it.each(['delete','group'] as const)('refuses an implicit %s target outside the scope',tool=>{
  const base=structuredClone(initialEditorState)
  expect(()=>createEditPreview(base,'doc',[{id:'one',tool,args:{},dependsOn:[]}],['original'])).toThrow(/目标/)
  expect(base.layers).toHaveLength(3)
 })
})
