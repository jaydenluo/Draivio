import {AppShell} from '../app/AppShell'
import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {expect,it,vi,beforeEach} from 'vitest'
import {EditorProvider,useEditor,type AIResult,type EditorState,type EditorAction} from '../state/editor'
import {useDocumentWorkspace} from '../document/DocumentWorkspaceProvider'
import {useComposerDraft} from './ComposerDraft'
import {ResultStage} from './ResultStage'
import {useResultDelivery} from './ResultDelivery'
import {AIComposer} from './AIComposer'
import {captureEditorContext} from '../ai/context/editorContext'
import {resultArchive} from './resultArchive'
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
vi.mock('./resultArchive',()=>({resultArchive:{save:vi.fn().mockResolvedValue(undefined),list:vi.fn().mockResolvedValue([]),load:vi.fn(),reveal:vi.fn(),remove:vi.fn(),export:vi.fn()}}))
let state:EditorState,edit:(a:EditorAction)=>void,docId:string,workspace:ReturnType<typeof useDocumentWorkspace>,draft:ReturnType<typeof useComposerDraft>
function Harness(){
 const editor=useEditor();state=editor.state;edit=editor.dispatch;docId=editor.documentId;workspace=useDocumentWorkspace();draft=useComposerDraft()
 const delivery=useResultDelivery()
 return <><button onClick={()=>delivery.open('one')}>查看候选</button><ResultStage/><AIComposer/></>
}
function result(id='one',mode:'generate'|'edit'='generate'):AIResult{return {id,source:png,thumbnail:png,prompt:'春日海报',model:'image',provider:'test',size:'1 × 1',createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false,request:{mode,prompt:'春日海报',sourceLayerId:'art',parameters:state.composerParameters,selection:null,context:captureEditorContext(state,docId,'document'),generationJob:{batchId:'batch',jobId:id,attemptId:id}}}}
beforeEach(()=>vi.clearAllMocks())
function mount(){render(<EditorProvider><Harness/></EditorProvider>)}
function receive(...results:AIResult[]){act(()=>{for(const result of results)edit({type:'add-ai-result',result})})}
it('previews same-batch candidates without changing the work and switches with keyboard',()=>{
 mount();const before=state;receive(result(),result('two'));fireEvent.click(screen.getByText('查看候选'))
 const stage=screen.getByRole('region',{name:'生成结果预览'})
 expect(within(stage).getByText('1 / 2')).toBeInTheDocument()
 fireEvent.keyDown(stage,{key:'ArrowRight'})
 expect(within(stage).getByText('2 / 2')).toBeInTheDocument()
 expect(state.layers).toBe(before.layers);expect(state.undoStack).toBe(before.undoStack);expect(state.documentWidth).toBe(before.documentWidth)
 fireEvent.keyDown(stage,{key:'Escape'});expect(screen.queryByRole('region',{name:'生成结果预览'})).not.toBeInTheDocument()
})
it('opens generation at actual image size in a new document and preserves the original',()=>{
 mount();const original=state,originalId=docId;receive(result());fireEvent.click(screen.getByText('查看候选'))
 fireEvent.click(screen.getByRole('button',{name:'更多结果操作'}))
 fireEvent.click(screen.getByRole('menuitem',{name:'打开为新文档'}))
 expect(docId).not.toBe(originalId);expect(state.documentWidth).toBe(1);expect(state.documentHeight).toBe(1)
 expect(state.layers).toHaveLength(1);expect(state.layers[0].source).toBe(png)
 expect(workspace.workspace.documents.find(d=>d.id===originalId)?.state.layers).toBe(original.layers)
})
it('continues editing the actual candidate without adding a layer and focuses an empty prompt',async()=>{
 mount();const before=state;receive(result());fireEvent.click(screen.getByText('查看候选'))
 fireEvent.click(screen.getByRole('button',{name:'继续修改'}))
 expect(draft.reference?.source).toBe(png);expect(draft.editTarget).toBe('upload');expect(draft.manualMode).toBe('edit')
 expect(state.layers).toBe(before.layers);expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveValue('')
 await waitFor(()=>expect(screen.getByRole('textbox',{name:'AI 操作'})).toHaveFocus())
})
it('applies an edit to its original target even after selection changes and can undo',()=>{
 mount();const before=state;receive(result('one','edit'));act(()=>edit({type:'select-layer',id:'original'}))
 fireEvent.click(screen.getByText('查看候选'));fireEvent.click(screen.getByRole('button',{name:/^应用到/}))
 expect(state.layers.find(l=>l.id==='art')?.source).toBe(png);expect(state.layers.find(l=>l.id==='original')?.source).toBe(before.layers.find(l=>l.id==='original')?.source)
 act(()=>edit({type:'undo'}));expect(state.layers).toEqual(before.layers)
})
it('automatically presents a completed waiting batch but does not interrupt further editing',()=>{
 mount();act(()=>edit({type:'set-generating',value:true}));receive(result());act(()=>edit({type:'set-generating',value:false}))
 expect(screen.getByRole('region',{name:'生成结果预览'})).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'返回作品'}))
 act(()=>edit({type:'set-generating',value:true}));act(()=>edit({type:'set-prompt',prompt:'下一步'}));receive({...result('three'),request:{...result('three').request!,generationJob:{batchId:'next',jobId:'three',attemptId:'three'}}});act(()=>edit({type:'set-generating',value:false}))
 expect(screen.queryByRole('region',{name:'生成结果预览'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:/张图片已就绪/})).toBeInTheDocument()
})
it('reports a local save failure without losing the result and supports retry',async()=>{
 vi.mocked(resultArchive.save).mockRejectedValueOnce(new Error('磁盘空间不足'))
 mount();receive(result());fireEvent.click(screen.getByText('查看候选'))
 await screen.findByText('本地保存失败，图片仍可使用')
 fireEvent.click(screen.getByRole('button',{name:'重试保存'}))
 await waitFor(()=>expect(resultArchive.save).toHaveBeenCalledTimes(2))
 await screen.findByText('已保存在本地')
})
it('retries a failed favorite change with the original favorite intent',async()=>{
 mount();receive(result());fireEvent.click(screen.getByText('查看候选'))
 await screen.findByText('已保存在本地')
 vi.mocked(resultArchive.save).mockRejectedValueOnce(new Error('磁盘空间不足'))
 act(()=>edit({type:'toggle-ai-result-favorite',id:'one'}))
 await screen.findByText('本地保存失败，图片仍可使用')
 expect(vi.mocked(resultArchive.save).mock.calls.at(-1)?.[2]).toBe(true)
 fireEvent.click(screen.getByRole('button',{name:'重试保存'}))
 await screen.findByText('已保存在本地')
 expect(vi.mocked(resultArchive.save).mock.calls.at(-1)?.[2]).toBe(true)
})
it('keeps a downloaded edit after artwork changes but prevents stale adoption and does not steal focus',()=>{
 mount();const candidate=result('one','edit');act(()=>edit({type:'set-generating',value:true}))
 act(()=>edit({type:'set-layer-opacity',id:'art',opacity:40}));const layers=state.layers
 receive(candidate);act(()=>edit({type:'set-generating',value:false}))
 expect(state.aiResults.some(r=>r.id==='one')).toBe(true);expect(state.layers).toBe(layers)
 expect(screen.queryByRole('region',{name:'生成结果预览'})).not.toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:/张图片已就绪/}))
 expect(screen.getByRole('button',{name:/^应用到/})).toBeDisabled()
 expect(screen.getByRole('button',{name:'继续修改'})).toBeEnabled()
})

it('switches documents without opening a background result in the active document',()=>{
 mount();const originalId=docId,candidate=result();act(()=>edit({type:'set-generating',value:true}));receive(candidate)
 act(()=>workspace.newDocument());expect(docId).not.toBe(originalId)
 act(()=>workspace.dispatchWorkspace({type:'edit',id:originalId,action:{type:'set-generating',value:false}}))
 expect(screen.queryByRole('region',{name:'生成结果预览'})).not.toBeInTheDocument()
 act(()=>workspace.dispatchWorkspace({type:'activate',id:originalId}))
 expect(screen.queryByRole('region',{name:'生成结果预览'})).not.toBeInTheDocument()
 expect(screen.getByRole('button',{name:/张图片已就绪/})).toBeInTheDocument()
})
it('zooms and pans only the result without changing the document viewport',()=>{
 mount();receive(result());fireEvent.click(screen.getByText('查看候选'));const zoom=state.zoom,offset=state.canvasOffset
 const image=screen.getByAltText('生成结果大图'),view=image.parentElement!
 fireEvent.wheel(view,{ctrlKey:true,deltaY:-80});expect(image.style.transform).not.toContain('scale(1)')
 fireEvent.touchStart(view,{touches:[{clientX:0,clientY:0},{clientX:100,clientY:0}]})
 fireEvent.touchMove(view,{touches:[{clientX:0,clientY:0},{clientX:200,clientY:0}]})
 fireEvent.touchEnd(view,{touches:[]});fireEvent.wheel(view,{deltaY:40,deltaX:20})
 expect(image.style.transform).toMatch(/translate\(-20px,\s*-40px\)/);expect(state.zoom).toBe(zoom);expect(state.canvasOffset).toBe(offset)
})
it('saves the active original through the shared export action',async()=>{
 mount();receive(result());fireEvent.click(screen.getByText('查看候选'))
 fireEvent.click(screen.getByRole('button',{name:'另存图片'}))
 await waitFor(()=>expect(resultArchive.export).toHaveBeenCalledWith(expect.objectContaining({id:'one',source:png})))
})

it('does not nudge the underlying selection or commit canvas changes from result preview keys',()=>{
 function Probe(){const e=useEditor();state=e.state;edit=e.dispatch;docId=e.documentId;const delivery=useResultDelivery();return <button onClick={()=>delivery.open('one')}>查看候选</button>}
 render(<EditorProvider><AppShell/><Probe/></EditorProvider>)
 act(()=>{edit({type:'select-tool',tool:'rectangle-select'});edit({type:'set-selection-rect',rect:{x:10,y:10,width:20,height:20}})})
 receive(result());fireEvent.click(screen.getByText('查看候选'))
 const selection=state.selection,undo=state.undoStack,stage=screen.getByRole('region',{name:'生成结果预览'})
 fireEvent.keyDown(stage,{key:'ArrowDown'});fireEvent.keyDown(stage,{key:'ArrowUp'});fireEvent.keyDown(stage,{key:'Enter'})
 expect(state.selection).toBe(selection);expect(state.undoStack).toBe(undo)
})
it('opens only one batch from the ready entry and leaves other tasks available',()=>{
 mount()
 for(let i=0;i<2;i++){
  act(()=>edit({type:'set-generating',value:true}));act(()=>edit({type:'set-prompt',prompt:`下一步${i}`}))
  receive({...result(`batch-${i}`),request:{...result(`batch-${i}`).request!,generationJob:{batchId:`batch-${i}`,jobId:String(i),attemptId:String(i)}}})
  act(()=>edit({type:'set-generating',value:false}))
 }
 fireEvent.click(screen.getByRole('button',{name:/张图片已就绪/}))
 expect(screen.getByText('1 / 1')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'返回作品'}))
 expect(screen.getByRole('button',{name:/1 张图片已就绪/})).toBeInTheDocument()
})

it('adds ordinary generations as a new layer in the current work and can undo', () => {
 mount()
 const original = state.layers
 const id = docId
 receive(result())
 fireEvent.click(screen.getByText('查看候选'))
 fireEvent.click(screen.getByRole('button', { name: '作为新图层加入' }))
 expect(docId).toBe(id)
 expect(state.layers[0]).toMatchObject({ id: 'one', source: png })
 act(() => edit({ type: 'undo' }))
 expect(state.layers).toEqual(original)
})
