import { describe, expect, it } from 'vitest'
import { editorReducer, initialEditorState } from './editor'
import type { CanvasTextObject } from '../canvas/TextObject'

const text = (id: string): CanvasTextObject => ({
  id,
  layerId: id,
  x: 18,
  y: 22,
  text: '独立文字',
  layout: 'point',
  width: 160,
  height: 40,
  fontFamily: 'sans-serif',
  fontSize: 24,
  fontWeight: '400',
  color: '#ffffff',
  align: 'left',
  lineHeight: 1.4,
  letterSpacing: 0,
})

describe('text layer state', () => {
  it('creates a text object as an independent selected layer above the current layer', () => {
    const next = editorReducer(initialEditorState, { type: 'create-text-layer', object: text('text-1') })
    const layer = next.layers.find((item) => item.id === 'text-1')

    expect(layer).toMatchObject({ id: 'text-1', kind: 'text', textObjectId: 'text-1', className: 'layer-text' })
    expect(next.canvasTexts).toContainEqual(text('text-1'))
    expect(next.selectedLayerId).toBe('text-1')
    expect(next.selectedLayerIds).toEqual(['text-1'])
  })

  it('keeps text associations when a text layer is duplicated or deleted', () => {
    const created = editorReducer(initialEditorState, { type: 'create-text-layer', object: text('text-1') })
    const duplicated = editorReducer(created, { type: 'duplicate-layer', id: 'text-1' })
    const copy = duplicated.layers.find((item) => item.id === duplicated.selectedLayerId)

    expect(copy?.kind).toBe('text')
    expect(copy?.textObjectId).toBe(duplicated.canvasTexts.find((item) => item.layerId === copy?.id)?.id)
    expect(duplicated.canvasTexts).toHaveLength(2)

    const deleted = editorReducer(duplicated, { type: 'delete-layer', id: 'text-1' })
    expect(deleted.layers.some((item) => item.id === 'text-1')).toBe(false)
    expect(deleted.canvasTexts.some((item) => item.layerId === 'text-1')).toBe(false)
  })
})

it('font changes are undoable and preserve text runs',()=>{const before=initialEditorState; const text={id:'font',layerId:'art',x:10,y:10,text:'中英',fontFamily:'sans-serif',fontSize:20,fontWeight:'400',color:'#fff',align:'left' as const,runs:[{start:0,end:1,color:'#f00'}]};const changed=editorReducer(before,{type:'upsert-text',object:text});const edited=editorReducer(changed,{type:'upsert-text',object:{...text,fontFamily:'Inter'}});expect(edited.canvasTexts[0].fontFamily).toBe('Inter');expect(editorReducer(edited,{type:'undo'}).canvasTexts.find(t=>t.id==='font')?.fontFamily).toBe('sans-serif')})
