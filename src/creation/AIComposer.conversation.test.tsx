import { fireEvent,render,screen,waitFor } from '@testing-library/react'
import { expect,it } from 'vitest'
import { EditorProvider,useEditor,type EditorState } from '../state/editor'
import { useDocumentWorkspace } from '../document/DocumentWorkspaceProvider'
import { AIComposer } from './AIComposer'
let latest:EditorState
let firstId=''
function Harness(){const {state,dispatch,documentId}=useEditor(),{newDocument,dispatchWorkspace}=useDocumentWorkspace();latest=state;if(!firstId)firstId=documentId;return <><button onClick={()=>dispatch({type:'rename-layer',id:'art',name:'手工名称'})}>手动改名</button><button onClick={()=>dispatch({type:'delete-layer',id:'art'})}>删除目标</button><button onClick={()=>newDocument()}>另建文档</button><button onClick={()=>dispatchWorkspace({type:'activate',id:firstId})}>回到原文档</button></>}
function mount(){firstId='';render(<EditorProvider><AIComposer/><Harness/></EditorProvider>);fireEvent.click(screen.getByRole('button',{name:'编辑画布'}))}
function input(value:string){fireEvent.change(screen.getByRole('textbox',{name:'AI 操作'}),{target:{value}})}
async function apply(value:string){input(value);fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}));fireEvent.click(await screen.findByRole('button',{name:'采用预览'}));await waitFor(()=>expect(screen.getByRole('list',{name:'当前文档 AI 操作记录'})).toBeInTheDocument())}
it('clears a smart prompt on submit and still allows preview adoption and prompt reuse',async()=>{
 mount();input('再暖一点')
 fireEvent.keyDown(screen.getByRole('textbox',{name:'AI 操作'}),{key:'Enter'})
 expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('')
 expect(screen.getByRole('region',{name:'AI 任务记录'})).toHaveTextContent('再暖一点')
 fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}))
 fireEvent.click(await screen.findByRole('button',{name:'采用预览'}))
 expect(latest.layers.find(l=>l.id==='art')!.adjustments!.temperature).toBe(10)
 expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('')
 input('新草稿')
 fireEvent.click(screen.getByRole('button',{name:'复用提示词'}))
 expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('再暖一点')
})
it('actually applies repeated warm updates and selectively undoes around manual edits',async()=>{mount();await apply('再暖一点');expect(latest.layers.find(l=>l.id==='art')!.adjustments!.temperature).toBe(10);await apply('再暖一点');expect(latest.layers.find(l=>l.id==='art')!.adjustments!.temperature).toBe(20);expect(latest.layers).toHaveLength(2);fireEvent.click(screen.getByText('手动改名'));input('撤销刚才');fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));expect(latest.layers.find(l=>l.id==='art')!.adjustments!.temperature).toBe(10);expect(latest.layers.find(l=>l.id==='art')!.name).toBe('手工名称');expect(latest.conversationRuns!.at(-1)!.status).toBe('undone')})
it('clears visible conversation on document switch and rejects deleted references on return',async()=>{mount();await apply('向右10像素');fireEvent.click(screen.getByText('另建文档'));expect(screen.queryByRole('list',{name:'当前文档 AI 操作记录'})).not.toBeInTheDocument();expect(latest.conversationRuns??[]).toEqual([]);fireEvent.click(screen.getByText('回到原文档'));fireEvent.click(screen.getByRole('button',{name:'编辑画布'}));expect(screen.getByRole('list',{name:'当前文档 AI 操作记录'})).toBeInTheDocument();fireEvent.click(screen.getByText('删除目标'));input('再暖一点');fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}));expect(screen.getByText(/刚才引用的对象已删除/)).toBeInTheDocument()})


it('retains smart errors after editing the draft and isolates records when switching documents',async()=>{
 mount();input('为当前画面建立一套复杂的光影层次方案')
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await screen.findByText('请在服务设置中配置文本推理模型与密钥')
 const history=screen.getByRole('region',{name:'AI 任务记录'})
 input('向右10像素')
 expect(screen.getByText('请在服务设置中配置文本推理模型与密钥')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(history.querySelectorAll('article')).toHaveLength(2)
 expect(screen.getByRole('button',{name:'确认执行计划'})).toBeInTheDocument()
 fireEvent.click(screen.getByText('另建文档'))
 expect(screen.queryByRole('region',{name:'AI 任务记录'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByText('回到原文档'))
 expect(screen.getByRole('region',{name:'AI 任务记录'})).toBeInTheDocument()
 expect(screen.getByText('请在服务设置中配置文本推理模型与密钥')).toBeInTheDocument()
 expect(screen.queryByRole('button',{name:'确认执行计划'})).not.toBeInTheDocument()
})
