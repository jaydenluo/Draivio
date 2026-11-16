import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorProvider, initialEditorState, useEditor, type EditorState } from '../../state/editor'
import { useDocumentWorkspace } from '../../document/DocumentWorkspaceProvider'
import { DoubleExposureWorkspace } from './DoubleExposureWorkspace'
let latest:EditorState
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg=='
function Harness(){const {state,dispatch}=useEditor();const {newDocument}=useDocumentWorkspace();latest=state;return <><button onClick={()=>dispatch({type:'restore-project',document:{...structuredClone(initialEditorState),layers:[{id:'a',name:'主体',source:png,kind:'image',className:'layer-art',visible:true,opacity:100,blendMode:'正常'},{id:'b',name:'背景',source:png,kind:'image',className:'layer-art',visible:false,opacity:100,blendMode:'正常'}],selectedLayerId:'a',selectedLayerIds:['a']}})}>准备</button><button onClick={()=>dispatch({type:'undo'})}>撤销测试</button><button onClick={()=>dispatch({type:'rename-layer',id:'a',name:'更改'})}>外部编辑</button><button onClick={()=>newDocument()}>切换测试</button></>}
it('requires explicit second input, previews actual scene privately, cancels, adopts once and undoes without requests',async()=>{
 const fetcher=vi.spyOn(globalThis,'fetch').mockRejectedValue(new Error('no network'))
 render(<EditorProvider><Harness/><DoubleExposureWorkspace/></EditorProvider>);fireEvent.click(screen.getByText('准备'));fireEvent.click(screen.getByRole('button',{name:'双重曝光'}));const before=latest
 fireEvent.click(screen.getByText('预览双重曝光'));expect(screen.getByRole('alert')).toHaveTextContent('第二图');expect(latest).toBe(before)
 fireEvent.change(screen.getByLabelText('双重曝光第二图'),{target:{value:'layer:b'}});fireEvent.click(screen.getByText('预览双重曝光'));const panel=screen.getByLabelText('双重曝光前后预览');expect(panel.querySelector('svg')).toBeTruthy();expect(latest).toBe(before)
 fireEvent.click(screen.getByText('取消双重曝光'));expect(screen.queryByLabelText('双重曝光前后预览')).toBeNull();expect(latest).toBe(before)
 fireEvent.click(screen.getByText('预览双重曝光'));fireEvent.click(screen.getByText('采用双重曝光'));expect(latest.layers).toHaveLength(5);expect(latest.undoStack).toHaveLength(1)
 fireEvent.click(screen.getByText('撤销测试'));expect(latest.layers).toEqual(before.layers);expect(fetcher).not.toHaveBeenCalled();fetcher.mockRestore()
})
it('invalidates tuning and refuses stale or cross-document adoption',async()=>{
 render(<EditorProvider><Harness/><DoubleExposureWorkspace/></EditorProvider>);fireEvent.click(screen.getByText('准备'));fireEvent.click(screen.getByText('双重曝光'));fireEvent.change(screen.getByLabelText('双重曝光第二图'),{target:{value:'layer:b'}});fireEvent.click(screen.getByText('预览双重曝光'))
 fireEvent.change(screen.getByLabelText('双重曝光混合比例'),{target:{value:'30'}});expect(screen.queryByLabelText('双重曝光前后预览')).toBeNull()
 fireEvent.click(screen.getByText('预览双重曝光'));fireEvent.click(screen.getByText('外部编辑'));expect(screen.getByText('采用双重曝光')).toBeDisabled()
 fireEvent.click(screen.getByText('切换测试'));await waitFor(()=>expect(screen.queryByLabelText('双重曝光前后预览')).toBeNull())
})
