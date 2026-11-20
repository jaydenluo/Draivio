import {beforeEach,expect,it,vi} from 'vitest'
import {fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {useRef,useState} from 'react'
import {Resvg} from '@resvg/resvg-js'
import {createHash} from 'node:crypto'
import {mkdirSync,writeFileSync} from 'node:fs'
import {EditorProvider,useEditor,type EditorState} from '../../state/editor'
import {AIComposer} from '../../creation/AIComposer'
import {LayersPanel} from '../../layers/LayersPanel'
import {CanvasScene} from '../../canvas/CanvasScene'
import {serializeExport} from '../../render/serializeExport'
import {encodeProject} from '../../document/projectFormat'
import {useDocumentWorkspace} from '../../document/DocumentWorkspaceProvider'
import {ProjectFileControl} from '../../document/ProjectFileControl'
import {WORKSPACE_RECOVERY_KEY} from '../../document/workspaceRecovery'
let latest:EditorState
let savedProject=''
function Harness(){
 const {state,dispatch}=useEditor();latest=state
 const {newDocument,openSerialized}=useDocumentWorkspace(),svg=useRef<HTMLDivElement>(null),[saved,setSaved]=useState(''),[exported,setExported]=useState('')
 const getSvg=()=>{const node=svg.current!.querySelector('svg')!;Object.defineProperty(node,'viewBox',{configurable:true,value:{baseVal:{x:0,y:0,width:state.documentWidth,height:state.documentHeight}}});return node}
 return <><ProjectFileControl/><LayersPanel/><AIComposer/><div ref={svg} data-testid="live-scene"><CanvasScene state={state}/></div><button onClick={()=>setExported(serializeExport(getSvg(),{range:'canvas'}))}>导出工作流SVG</button><output data-testid="exported">{exported}</output><button onClick={()=>void encodeProject(state,{id:'e2e',name:'离线工作流'}).then(content=>{savedProject=content;setSaved(content)})}>保存离线项目</button><output data-testid="saved">{saved?'ready':''}</output><button onClick={()=>newDocument()}>新建空白文档</button><button onClick={()=>openSerialized(savedProject,{name:'offline.draivio'})}>离线重开项目</button><button onClick={()=>openSerialized('{broken json')}>尝试损坏项目</button><button onClick={()=>dispatch({type:'redo'})}>重做工作流</button></>
}
beforeEach(()=>{savedProject='';localStorage.clear();localStorage.removeItem(WORKSPACE_RECOVERY_KEY)})
const bytes=(source:string)=>new Resvg(source).render()
const hash=(value:Uint8Array)=>createHash('sha256').update(value).digest('hex')
async function plan(){const mode=screen.getByRole('button',{name:'编辑画布'});if(mode.getAttribute('aria-pressed')!=='true')fireEvent.click(mode);const box=screen.getByRole('textbox',{name:'AI 操作'});fireEvent.change(box,{target:{value:'向右10像素然后旋转15度'}});fireEvent.keyDown(box,{key:'Enter',ctrlKey:true});await screen.findByLabelText('编辑计划预览');fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}));return screen.findByRole('region',{name:'编辑效果预览'})}
it('completes actual UI selection→multi-step→retune→before/after→adopt→undo→pixel export→offline project reopen',async()=>{
 const network=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('offline: no provider request allowed'))
 try{
  render(<EditorProvider><Harness/></EditorProvider>)
  const selected=latest.layers.find(l=>l.id==='art')!
  await userEvent.click(screen.getByRole('button',{name:`${selected.name}图层`}));expect(latest.selectedLayerId).toBe('art')
  fireEvent.click(screen.getByText('导出工作流SVG'));const before=bytes(screen.getByTestId('exported').textContent!),original=latest
  const panel=await plan();const undoBeforeAdopt=latest.undoStack.length;expect(latest.layers).toBe(original.layers)
  fireEvent.change(within(panel).getByRole('spinbutton',{name:'步骤 1 水平移动（像素）'}),{target:{value:'20'}})
  const previewNode=panel.querySelector('svg')!;Object.defineProperty(previewNode,'viewBox',{configurable:true,value:{baseVal:{x:0,y:0,width:500,height:625}}})
  const after=bytes(serializeExport(previewNode,{range:'canvas'}));expect(hash(after.pixels)).not.toBe(hash(before.pixels))
  fireEvent.click(within(panel).getByRole('button',{name:'查看编辑前'}));expect(hash(bytes(serializeExport(previewNode,{range:'canvas'})).pixels)).toBe(hash(before.pixels))
  fireEvent.click(within(panel).getByRole('button',{name:'查看编辑后'}));fireEvent.click(within(panel).getByRole('button',{name:'采用预览'}))
  expect(latest.layers.find(l=>l.id==='art')?.transform?.rect.x).toBe(4);expect(latest.undoStack.length).toBe(undoBeforeAdopt+1)
  fireEvent.click(screen.getByText('导出工作流SVG'));expect(hash(bytes(screen.getByTestId('exported').textContent!).pixels)).toBe(hash(after.pixels))
  fireEvent.click(screen.getByRole('button',{name:'撤销本次编辑'}));expect(latest.layers).toEqual(original.layers);expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveFocus()
  fireEvent.click(screen.getByText('重做工作流'));fireEvent.click(screen.getByText('保存离线项目'));await waitFor(()=>expect(screen.getByTestId('saved')).toHaveTextContent('ready'))
  fireEvent.click(screen.getByText('新建空白文档'));fireEvent.click(screen.getByText('离线重开项目'));await waitFor(()=>expect(latest.layers.find(l=>l.id==='art')?.transform?.rect.x).toBe(4))
  fireEvent.click(screen.getByText('导出工作流SVG'));const reopened=bytes(screen.getByTestId('exported').textContent!);expect(hash(reopened.pixels)).toBe(hash(after.pixels))
  expect(network).not.toHaveBeenCalled()
  if(process.env.WORKFLOW_EVIDENCE_DIR){mkdirSync(process.env.WORKFLOW_EVIDENCE_DIR,{recursive:true});writeFileSync(`${process.env.WORKFLOW_EVIDENCE_DIR}/before.png`,before.asPng());writeFileSync(`${process.env.WORKFLOW_EVIDENCE_DIR}/after.png`,after.asPng());writeFileSync(`${process.env.WORKFLOW_EVIDENCE_DIR}/offline-reopened.png`,reopened.asPng());writeFileSync(`${process.env.WORKFLOW_EVIDENCE_DIR}/workflow.json`,JSON.stringify({runtime:'macOS host Vitest/jsdom with actual production React UI/planner/executor/reducer/project codec and Resvg output',beforeHash:hash(before.pixels),afterHash:hash(after.pixels),reopenedHash:hash(reopened.pixels),fetchRequests:0,steps:['select layer','CtrlEnter plan','two-step execution','dx retune20','before/after','adopt1undo','undo focus','redo','encode project','new doc','offline reopen','pixel export']},null,2)+'\n')}
 }finally{network.mockRestore()}
},60000)
it('preserves document on failed locked edits and corrupted offline open then permits recovery',async()=>{
 render(<EditorProvider><Harness/></EditorProvider>)
 const original=latest
 fireEvent.click(screen.getByRole('button',{name:`${latest.layers.find(l=>l.id==='art')!.name}图层`}))
 fireEvent.click(screen.getByRole('button',{name:`${latest.layers.find(l=>l.id==='art')!.name}锁定`}))
 const locked=latest
 fireEvent.click(screen.getByRole('button',{name:'编辑画布'}));const box=screen.getByRole('textbox',{name:'AI 操作'});fireEvent.change(box,{target:{value:'向右10像素然后旋转15度'}});fireEvent.keyDown(box,{key:'Enter',ctrlKey:true});await screen.findByLabelText('编辑计划预览');fireEvent.click(screen.getByRole('button',{name:'确认执行计划'}))
 await screen.findByText('执行失败');expect(latest.layers).toBe(locked.layers)
 fireEvent.click(screen.getByText('尝试损坏项目'));expect(latest.layers).toBe(locked.layers)
 expect(screen.queryByRole('region',{name:'编辑效果预览'})).not.toBeInTheDocument()
 expect(latest.layers.find(l=>l.id==='art')?.source).toBe(original.layers.find(l=>l.id==='art')?.source)
 fireEvent.click(screen.getByRole('button',{name:`${latest.layers.find(l=>l.id==='art')!.name}解锁`}))
 const recovered=await plan();expect(within(recovered).getByRole('button',{name:'采用预览'})).toBeEnabled()
},30000)
it('uses Enter to submit, preserves Shift+Enter for newlines, and allows compact composer docking',async()=>{
 render(<EditorProvider><Harness/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'编辑画布'}));const box=screen.getByRole('textbox',{name:'AI 操作'})
 await userEvent.click(box);await userEvent.clear(box);await userEvent.type(box,'向右10像素');await userEvent.keyboard('{Shift>}{Enter}{/Shift}');expect(screen.queryByLabelText('编辑计划预览')).not.toBeInTheDocument()
 fireEvent.keyDown(box,{key:'Enter',ctrlKey:true,isComposing:true});expect(screen.queryByLabelText('编辑计划预览')).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'移到右侧'}));expect(screen.getByRole('region',{name:'AI 操作'})).toHaveAttribute('data-placement','right')
 fireEvent.click(screen.getByRole('button',{name:'最小化 AI 对话框'}));expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('向右10像素\n')
 expect(screen.getByRole('searchbox',{name:'搜索图层'})).toBeInTheDocument();expect(screen.getByRole('combobox',{name:'筛选图层类型'})).toBeInTheDocument()
})
