import {aiManualToolCoverage} from './toolCoverage'
import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { expect,it,vi } from 'vitest'
import { RestorationPanel } from './RestorationPanel'
import { EditorProvider,useEditor,initialEditorState } from '../../state/editor'
const workflow=vi.hoisted(()=>({generate:vi.fn()}))
vi.mock('./restorationTools',async importOriginal=>({...await importOriginal<any>(),generateRestoration:workflow.generate}))
function Harness(){const {state,dispatch}=useEditor();return <><button onClick={()=>dispatch({type:'rename-layer',id:'art',name:'changed'})}>修改文档</button><output data-testid="state">{JSON.stringify({results:state.aiResults,layers:state.layers,tab:state.inspectorTab})}</output><RestorationPanel/></>}
it('only appends a completed candidate, preserving source layers',async()=>{
 const execute=vi.spyOn(aiManualToolCoverage.restoration,'execute')
 workflow.generate.mockResolvedValue({id:'candidate',source:'data:image/png;base64,x',thumbnail:'data:image/png;base64,x',prompt:'size',model:'espcn',provider:'local',size:'4x4',createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false})
 render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('开始超分 2x'))
 await waitFor(()=>expect(JSON.parse(screen.getByTestId('state').textContent!).results).toHaveLength(1))
 expect(execute).toHaveBeenCalled()
 const current=JSON.parse(screen.getByTestId('state').textContent!);expect(current.layers).toEqual(initialEditorState.layers);expect(current.tab).toBe('results')
})
it('cancel and intervening document edits discard late completion',async()=>{
 let finish:(value:any)=>void=()=>{};workflow.generate.mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
 render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('开始超分 2x'));fireEvent.click(screen.getByText('取消增强'));finish({id:'late'})
 await waitFor(()=>expect(screen.queryByText('取消增强')).not.toBeInTheDocument());expect(JSON.parse(screen.getByTestId('state').textContent!).results).toHaveLength(0)
 fireEvent.click(screen.getByText('开始超分 2x'));fireEvent.click(screen.getByText('修改文档'));finish({id:'stale'})
 await waitFor(()=>expect(screen.queryByText('取消增强')).not.toBeInTheDocument());expect(JSON.parse(screen.getByTestId('state').textContent!).results).toHaveLength(0)
})

it('consumes the registered restoration executor and handles rejection without starting a workflow',async()=>{
 const calls=workflow.generate.mock.calls.length,execute=vi.spyOn(aiManualToolCoverage.restoration,'execute').mockRejectedValueOnce(new Error('registered restoration denied'))
 render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('开始超分 2x'))
 await waitFor(()=>expect(screen.getByText('开始超分 2x')).toBeEnabled())
 expect(execute).toHaveBeenCalled();expect(workflow.generate.mock.calls).toHaveLength(calls)
 expect(JSON.parse(screen.getByTestId('state').textContent!).results).toHaveLength(0)
 execute.mockRestore()
})
