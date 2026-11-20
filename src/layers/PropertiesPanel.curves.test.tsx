import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorState } from '../state/editor'
import { PropertiesPanel } from './PropertiesPanel'
import { serializeExport } from '../render/serializeExport'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { encodeProject, decodeProject } from '../document/projectFormat'
let latestState: EditorState
function Probe() {
 const {state,dispatch,curveDraft}=useEditor(); latestState=state
 return <><output data-testid="curve-state">{JSON.stringify({draft:!!curveDraft,curves:state.layers[0].adjustments?.curves,undo:state.undoStack.length})}</output><button onClick={()=>dispatch({type:'undo'})}>撤销曲线测试</button></>
}
it('previews curve drag in the canvas, keeps saved data untouched and commits a single undo step',async()=>{
 const {container}=render(<EditorProvider><PropertiesPanel/><CanvasViewport/><Probe/></EditorProvider>)
 const graph=screen.getByRole('group',{name:'曲线编辑区域'})
 vi.spyOn(graph,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:256,height:256,right:256,bottom:256,x:0,y:0,toJSON(){}})
 const state=()=>JSON.parse(screen.getByTestId('curve-state').textContent!)
 const initial=state()
 fireEvent.pointerDown(graph,{pointerId:1,button:0,clientX:128,clientY:128})
 fireEvent.pointerMove(graph,{pointerId:1,clientX:128,clientY:80})
 expect({...state(),draft:false}).toEqual(initial)
 expect(state().draft).toBe(true)
 expect(decodeProject(await encodeProject(latestState,{id:'curve-test',name:'curve-test'})).document.layers[0].adjustments?.curves).toEqual(initial.curves)
 const filter=container.querySelector('.canvas-art [data-layer-id="art"] [data-adjustment-filter]')!
 expect(filter).toBeInTheDocument()
 const svg=container.querySelector('.canvas-art') as SVGSVGElement
 Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:500,height:625}}})
 const exported = new DOMParser().parseFromString(serializeExport(svg,{range:'canvas'}),'image/svg+xml')
 expect(JSON.parse(exported.querySelector('[data-adjustments]')!.getAttribute('data-adjustments')!).curves).toEqual(initial.curves)
 expect(JSON.parse(filter.getAttribute('data-adjustments')!).curves.rgb[1].y).toBeGreaterThan(.5)
 fireEvent.pointerMove(graph,{pointerId:1,clientX:140,clientY:70})
 fireEvent.pointerUp(graph,{pointerId:1})
 expect(state().undo).toBe(initial.undo+1)
 expect(state().curves.rgb).toHaveLength(3)
 expect(state().draft).toBe(false)
 fireEvent.click(screen.getByRole('button',{name:'撤销曲线测试'}))
 expect(state().curves).toEqual(initial.curves)
})
it('previews levels without changing saved/exported values and commits one undo step',async()=>{
 const {container}=render(<EditorProvider><PropertiesPanel/><CanvasViewport/><Probe/></EditorProvider>)
 fireEvent.click(screen.getByRole('tab',{name:'色阶'}))
 const rail=screen.getByTestId('input-levels-rail')
 vi.spyOn(rail,'getBoundingClientRect').mockReturnValue({left:0,top:0,width:255,height:20,right:255,bottom:20,x:0,y:0,toJSON(){}})
 const initialLevels=structuredClone(latestState.layers[0].adjustments?.levels),initialUndo=latestState.undoStack.length
 fireEvent.pointerDown(screen.getByRole('slider',{name:'输入黑场滑块'}),{pointerId:8,button:0,clientX:0})
 fireEvent.pointerMove(rail,{pointerId:8,clientX:40})
 expect(screen.getByLabelText('色阶黑场')).toHaveValue(40)
 expect(latestState.layers[0].adjustments?.levels).toEqual(initialLevels);expect(latestState.undoStack).toHaveLength(initialUndo)
 expect(decodeProject(await encodeProject(latestState,{id:'levels-test',name:'levels-test'})).document.layers[0].adjustments?.levels).toEqual(initialLevels)
 const filter=container.querySelector('.canvas-art [data-layer-id="art"] [data-adjustment-filter]')!
 expect(JSON.parse(filter.getAttribute('data-adjustments')!).levels.inputBlack).toBeCloseTo(40/255)
 const svg=container.querySelector('.canvas-art') as SVGSVGElement
 Object.defineProperty(svg,'viewBox',{value:{baseVal:{x:0,y:0,width:500,height:625}}})
 const exported=new DOMParser().parseFromString(serializeExport(svg,{range:'canvas'}),'image/svg+xml')
 expect(JSON.parse(exported.querySelector('[data-adjustments]')!.getAttribute('data-adjustments')!).levels).toEqual(initialLevels)
 fireEvent.pointerMove(rail,{pointerId:8,clientX:45});fireEvent.pointerUp(rail,{pointerId:8})
 expect(latestState.layers[0].adjustments?.levels?.inputBlack).toBeCloseTo(45/255);expect(latestState.undoStack).toHaveLength(initialUndo+1)
 fireEvent.click(screen.getByRole('button',{name:'撤销曲线测试'}));expect(latestState.layers[0].adjustments?.levels).toEqual(initialLevels)
})
