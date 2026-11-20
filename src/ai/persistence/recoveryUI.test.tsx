import {ResultStage} from '../../creation/ResultStage'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../../state/editor'
import { initialEditorState } from '../../state/editor'
import { createDocumentWorkspace } from '../../document/documentWorkspace'
import { encodeWorkspace, WORKSPACE_RECOVERY_KEY } from '../../document/workspaceRecovery'
import { ResultsPanel } from '../../layers/ResultsPanel'
import { EditRunSummary } from '../ui/EditRunSummary'
import { recordConversationRun } from '../conversation/session'
import { createEditPreview } from '../execution/preview'

function Probe(){ const {state,dispatch}=useEditor(); return <><ResultsPanel/><ResultStage/><EditRunSummary state={null} runs={state.conversationRuns}/><output data-testid="state">{JSON.stringify({generating:state.isGenerating,layers:state.layers.length,undo:state.undoStack.length})}</output><button onClick={()=>dispatch({type:'undo'})}>撤销采用</button></> }
afterEach(()=>{localStorage.removeItem(WORKSPACE_RECOVERY_KEY);vi.restoreAllMocks()})
it('restores interrupted generation in the real provider without requests, adopts downloaded results and undoes only adoption',async()=>{
 const state=structuredClone(initialEditorState)
 state.isGenerating=true
 state.aiResults=[{id:'offline',source:'data:image/png;base64,aGVsbG8=',thumbnail:'data:image/png;base64,aGVsbG8=',prompt:'cached',model:'model',provider:'provider',size:'1',createdAt:'2026-11-16',status:'success',favorite:false,adopted:false}]
 localStorage.setItem(WORKSPACE_RECOVERY_KEY,await encodeWorkspace(createDocumentWorkspace(state)))
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('offline'))
 render(<EditorProvider><Probe/></EditorProvider>)
 fireEvent.click(await screen.findByRole('button',{name:'恢复副本'}))
 expect(screen.getByText(/上次 Image Pro 任务已中断/)).toBeInTheDocument()
 expect(screen.getByTestId('state')).toHaveTextContent('"generating":false')
 expect(screen.getByTestId('state')).toHaveTextContent('"undo":0')
 fireEvent.click(screen.getByRole('button',{name:'预览结果 offline'}));fireEvent.click(screen.getByRole('button',{name:'更多结果操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'添加到当前作品'}))
 await waitFor(()=>expect(screen.getByTestId('state')).toHaveTextContent(`"layers":${initialEditorState.layers.length+1}`))
 fireEvent.click(screen.getByText('撤销采用'))
 expect(screen.getByTestId('state')).toHaveTextContent(`"layers":${initialEditorState.layers.length}`)
 expect(fetcher).not.toHaveBeenCalled()
})
it('shows the persisted tool version and resolved parameters after reopening',async()=>{
 const before=structuredClone(initialEditorState),steps=[{id:'move',tool:'move' as const,args:{layerId:'art',dx:10,dy:0},dependsOn:[]}]
 const preview=createEditPreview(before,'doc',steps,['art']),state=recordConversationRun(before,preview.document,'doc','run',steps)
 const workspace=createDocumentWorkspace(state);state.conversationRuns![0].documentId=workspace.activeId
 localStorage.setItem(WORKSPACE_RECOVERY_KEY,await encodeWorkspace(workspace))
 render(<EditorProvider><Probe/></EditorProvider>)
 fireEvent.click(await screen.findByRole('button',{name:'恢复副本'}))
 expect(screen.getByText(/工具版本 1/)).toBeInTheDocument()
 expect(screen.getByText(/"dx":10/)).toBeInTheDocument()
})
