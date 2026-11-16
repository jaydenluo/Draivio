import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { ToolOptionsBar } from '../components/ToolOptionsBar'
import * as raster from '../canvas/rasterTools'
function Harness(){const {state,dispatch}=useEditor();return <><button onClick={()=>{dispatch({type:'set-selection-visible',visible:false});dispatch({type:'select-tool',tool:'dodge'});dispatch({type:'set-tool-options',options:{size:8,exposure:50,flow:100,hardness:100}})}}>色调工具</button><button onClick={()=>dispatch({type:'toggle-layer-lock',id:state.selectedLayerId})}>锁定</button><button onClick={()=>dispatch({type:'undo'})}>撤销笔触</button><output data-testid="tonal-state">{JSON.stringify(state)}</output><ToolOptionsBar/><CanvasViewport/></>}
const state=()=>JSON.parse(screen.getByTestId('tonal-state').textContent!)
afterEach(()=>vi.restoreAllMocks())
function setup(){const rasterize=vi.spyOn(raster,'rasterizeSvgPixels').mockResolvedValue({width:40,height:1,data:new Uint8ClampedArray(Array(40).fill([128,128,128,255]).flat())});const encode=vi.spyOn(raster,'imageToPng').mockReturnValue('data:image/png;base64,tonal');const {container}=render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('色调工具'));const board=container.querySelector('.artboard')!;board.getBoundingClientRect=()=>({x:0,y:0,left:0,top:0,right:100,bottom:100,width:100,height:100,toJSON(){}});return {board,rasterize,encode}}
it('creates one undoable independent processing layer after a continuous gesture',async()=>{
 const {board,encode}=setup(),before=state();expect(screen.getByLabelText('色调作用范围')).toBeInTheDocument();expect(screen.getByLabelText('保护色调')).toBeChecked()
 await act(async()=>{fireEvent.pointerDown(board,{pointerId:1,button:0,clientX:0,clientY:50});fireEvent.pointerMove(board,{pointerId:1,clientX:50,clientY:50});fireEvent.pointerUp(board,{pointerId:1,clientX:100,clientY:50})})
 expect(state().notice).toBe('局部曝光已加入独立层，可调不透明度、蒙版或撤销');expect(encode).toHaveBeenCalled();expect(state().layers).toHaveLength(before.layers.length+1);expect(state().layers[0].name).toContain('减淡');expect(state().undoStack).toHaveLength(before.undoStack.length+1);expect(state().brushStrokes).toEqual(before.brushStrokes)
 const changed=encode.mock.calls[0][0];expect(Array.from({length:40},(_,i)=>changed.data[i*4+3]).every(v=>v===255)).toBe(true)
 fireEvent.click(screen.getByText('撤销笔触'));expect(state().layers).toEqual(before.layers)
})
it.each(['pointer','escape'])('cancels %s gesture without partial pixels or history',async(kind)=>{
 const {board,rasterize}=setup(),before=state();fireEvent.pointerDown(board,{pointerId:1,button:0,clientX:0,clientY:50});fireEvent.pointerMove(board,{pointerId:1,clientX:50,clientY:50});if(kind==='pointer')fireEvent.pointerCancel(board,{pointerId:1});else fireEvent.keyDown(window,{key:'Escape'});await act(async()=>{fireEvent.pointerUp(board,{pointerId:1,clientX:100,clientY:50})});expect(rasterize).not.toHaveBeenCalled();expect(state().layers).toEqual(before.layers);expect(state().undoStack).toEqual(before.undoStack)
})
it('rejects locked layers before sampling',async()=>{const {board,rasterize}=setup();fireEvent.click(screen.getByText('锁定'));await act(async()=>{fireEvent.pointerDown(board,{pointerId:1,button:0,clientX:50,clientY:50});fireEvent.pointerUp(board,{pointerId:1,clientX:50,clientY:50})});expect(rasterize).not.toHaveBeenCalled();expect(state().notice).toContain('锁定')})
it('discards a cancelled async pixel decode',async()=>{const {board,rasterize}=setup();let resolve!:(v:raster.PixelImage)=>void;rasterize.mockImplementation(()=>new Promise(done=>{resolve=done}));const before=state();fireEvent.pointerDown(board,{pointerId:1,button:0,clientX:50,clientY:50});fireEvent.pointerUp(board,{pointerId:1,clientX:50,clientY:50});fireEvent.keyDown(window,{key:'Escape'});await act(async()=>resolve({width:1,height:1,data:new Uint8ClampedArray([128,128,128,255])}));expect(state().layers).toEqual(before.layers)})
