import {aiManualToolCoverage} from '../tools/toolCoverage'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { editorReducer, initialEditorState } from '../../state/editor'
import { RelightWorkspace } from './RelightWorkspace'
import { createSelection } from '../../canvas/selectionGeometry'
const mock=vi.hoisted(()=>({state:null as any,dispatch:vi.fn(),documentId:'doc-a',guard:vi.fn()}))
vi.mock('../../state/editor',async imp=>({...await imp<any>(),useEditor:()=>({state:mock.state,dispatch:mock.dispatch,documentId:mock.documentId})}))
vi.mock('../tools/toolCapabilities',async imp=>{const actual=await imp<any>();return {...actual,assertManualTool:(name:string)=>{mock.guard(name);actual.assertManualTool(name)}}})
beforeEach(()=>{mock.guard.mockReset();mock.state=structuredClone(initialEditorState);mock.documentId='doc-a';mock.dispatch.mockReset()})
function preview(){fireEvent.click(screen.getByText('AI 布光'));fireEvent.click(screen.getByText('预览布光'))}
it.each(['lock','content','target','document'] as const)('invalidates the preview after %s changes',mode=>{
 const view=render(<RelightWorkspace/>);preview()
 if(mode==='lock')mock.state={...mock.state,layers:mock.state.layers.map((l:any)=>l.id===mock.state.selectedLayerId?{...l,locked:true}:l)}
 if(mode==='content')mock.state={...mock.state,layers:mock.state.layers.map((l:any)=>({...l,opacity:50}))}
 if(mode==='target')mock.state={...mock.state,selectedLayerId:mock.state.layers[1].id}
 if(mode==='document')mock.documentId='doc-b'
 view.rerender(<RelightWorkspace/>)
 const adopt=screen.queryByText('采用布光（可撤销）');if(adopt)fireEvent.click(adopt)
 expect(mock.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type:'apply-edit-plan'}))
 expect(adopt===null||(adopt as HTMLButtonElement).disabled).toBe(true)
})
it('invalidates old settings and clears a candidate before reporting failed preview',()=>{
 const view=render(<RelightWorkspace/>);preview();fireEvent.change(screen.getByLabelText('布光强度'),{target:{value:'90'}})
 expect(screen.queryByText('采用布光（可撤销）')).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('预览布光'));mock.state={...mock.state,layers:mock.state.layers.map((l:any)=>({...l,locked:true}))};view.rerender(<RelightWorkspace/>)
 fireEvent.click(screen.getByText('预览布光'))
 expect(screen.queryByText('采用布光（可撤销）')).not.toBeInTheDocument()
 expect(mock.dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'set-notice'}))
})
it('adopts only lighting changes once while preserving current prompt selection and presentation',()=>{
 const view=render(<RelightWorkspace/>);preview()
 mock.state={...mock.state,prompt:'newer manual prompt',selection:createSelection('rectangle',{x:10,y:20,width:30,height:40}),selectionVisible:true,composerMinimized:true}
 view.rerender(<RelightWorkspace/>);fireEvent.click(screen.getByText('采用布光（可撤销）'))
 const action=mock.dispatch.mock.calls.at(-1)![0],next=editorReducer(mock.state,action)
 expect(next.prompt).toBe(mock.state.prompt);expect(next.selection).toEqual(mock.state.selection);expect(next.composerMinimized).toBe(true)
 expect(next.undoStack).toHaveLength(mock.state.undoStack.length+1)
 expect(next.layers.find(l=>l.id===mock.state.selectedLayerId)?.adjustments?.exposureEV).toBeGreaterThan(0)
 expect(screen.queryByText('采用布光（可撤销）')).not.toBeInTheDocument()
})

it('refuses inherited-lock preview and never creates an adoptable candidate',()=>{
 mock.state={...mock.state,layers:mock.state.layers.map((l:any)=>l.id===mock.state.selectedLayerId?{...l,groupId:'locked-parent'}:l)}
 mock.state.layers.push({...mock.state.layers[0],id:'locked-parent',kind:'group',locked:true,children:[mock.state.selectedLayerId]})
 render(<RelightWorkspace/>);preview()
 expect(screen.queryByText('采用布光（可撤销）')).not.toBeInTheDocument()
 expect(mock.dispatch).toHaveBeenCalledWith(expect.objectContaining({type:'set-notice',message:expect.stringMatching(/锁定/)}))
})

it('invalidates history movement even if layer content returns to identical values',()=>{
 const view=render(<RelightWorkspace/>);preview()
 mock.state={...mock.state,undoStack:[...mock.state.undoStack,{}]};view.rerender(<RelightWorkspace/>)
 expect(screen.queryByText('采用布光（可撤销）')).not.toBeInTheDocument()
 expect(mock.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type:'apply-edit-plan'}))
})

it('consumes the relight registration guard before creating a preview and fails closed',()=>{
 const execute=vi.spyOn(aiManualToolCoverage.relight,'execute')
 render(<RelightWorkspace/>);preview()
 expect(execute).toHaveBeenCalledOnce()
 expect(mock.guard).toHaveBeenCalledWith('relight')
 expect(screen.getByText('采用布光（可撤销）')).toBeInTheDocument()
 mock.guard.mockImplementation(()=>{throw new Error('relight registration denied')})
 fireEvent.click(screen.getByText('预览布光'))
 expect(screen.queryByText('采用布光（可撤销）')).not.toBeInTheDocument()
 expect(mock.dispatch).toHaveBeenCalledWith({type:'set-notice',message:'relight registration denied'})
 expect(mock.dispatch).not.toHaveBeenCalledWith(expect.objectContaining({type:'apply-edit-plan'}))
})
