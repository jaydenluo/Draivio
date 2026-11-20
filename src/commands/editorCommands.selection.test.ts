import { expect,it,vi } from 'vitest'
import { executeEditorCommand } from './editorCommands'
import type { EditorState } from '../state/editor'
import { createSelection, selectionContains } from '../canvas/selectionGeometry'

it('selects the whole rectangular document even after an elliptical selection',()=>{
  const state={selection:createSelection('ellipse',{x:20,y:20,width:30,height:40})} as EditorState
  const dispatch=vi.fn()
  executeEditorCommand('all',state,dispatch)
  const action=dispatch.mock.calls[0][0]
  expect(action.type).toBe('commit-selection')
  expect(selectionContains(action.selection.path,{x:1,y:1})).toBe(true)
  expect(action.selection.rect).toEqual({x:0,y:0,width:100,height:100})
})
