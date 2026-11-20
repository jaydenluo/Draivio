import {act,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {Resvg} from '@resvg/resvg-js'
import {EditorProvider,useEditor,type EditorState} from '../state/editor'
import {useDocumentWorkspace} from '../document/DocumentWorkspaceProvider'
import {createDocumentSession,type DocumentWorkspace} from '../document/documentWorkspace'
import * as mergeTools from '../document/groupTransforms'
import {LayersPanel} from './LayersPanel'
const originalPrepare=mergeTools.prepareLayerMerge
let latest:EditorState,workspace:DocumentWorkspace
function Observe(){const {state}=useEditor();latest=state;const context=useDocumentWorkspace();workspace=context.workspace;return <button onClick={()=>{const doc=createDocumentSession('同内容副本');doc.state=structuredClone(state);context.dispatchWorkspace({type:'open',document:doc})}}>同内容切换测试</button>}
let release:()=>void
const raster=async(svg:string)=>'data:image/png;base64,'+Buffer.from(new Resvg(svg).render().asPng()).toString('base64')
function defer(){const gate=new Promise<void>(resolve=>release=resolve);vi.spyOn(mergeTools,'prepareLayerMerge').mockImplementation((state,mode,_raster,options)=>originalPrepare(state,mode,async svg=>{await gate;return raster(svg)},options))}
function mount(){render(<EditorProvider><LayersPanel/><Observe/></EditorProvider>)}
beforeEach(()=>localStorage.clear());afterEach(()=>vi.restoreAllMocks())
describe('merge async document binding',()=>{
 it('cancels a running merge with no document or undo writes',async()=>{defer();mount();const before=latest;fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'合并所选'}));fireEvent.click(screen.getByText('取消合并'));await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,10))});await waitFor(()=>expect(screen.queryByText('取消合并')).not.toBeInTheDocument());expect(latest.layers).toBe(before.layers);expect(latest.undoStack).toBe(before.undoStack)})
 it('never applies an old merge to a different document with identical contents',async()=>{defer();mount();const before=latest,originalId=workspace.activeId;fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'合并所选'}));fireEvent.click(screen.getByText('同内容切换测试'));const otherId=workspace.activeId;expect(otherId).not.toBe(originalId);expect(latest.layers).toEqual(before.layers);await act(async()=>{release();await new Promise(resolve=>setTimeout(resolve,10))});expect(workspace.documents.find(d=>d.id===originalId)!.state.layers).toBe(before.layers);expect(workspace.documents.find(d=>d.id===otherId)!.state.layers).toEqual(before.layers);expect(latest.undoStack).toEqual(before.undoStack)})
 it('reports actual segments and keeps all result layers selected',async()=>{vi.spyOn(mergeTools,'prepareLayerMerge').mockImplementation((state,mode,_raster,options)=>originalPrepare(state,mode,raster,options));mount();const before=latest;fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'合并所选'}));await waitFor(()=>expect(latest.layers).not.toBe(before.layers));expect(latest.selectedLayerIds.length).toBeGreaterThan(0);expect(latest.selectedLayerIds.every(id=>latest.layers.find(l=>l.id===id)?.mergeBatchId)).toBe(true);expect(latest.notice).toMatch(/已合并为.*段/);expect(screen.queryByText(/跨图层或分组生成多段/)).toBeNull();expect(latest.undoStack).toHaveLength(before.undoStack.length+1)})
})
