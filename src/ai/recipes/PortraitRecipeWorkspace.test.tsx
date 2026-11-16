import {fireEvent,render,screen} from '@testing-library/react'
import {expect,it,vi} from 'vitest'
import {EditorProvider,useEditor,initialEditorState} from '../../state/editor'
import {PortraitRecipeWorkspace} from './PortraitRecipeWorkspace'
import {AIComposer} from '../../creation/AIComposer'
import * as pixelIO from '../maskedEdit/workflow'
import {solidImage} from '../../engine/raster/composite'
import {createSelection} from '../../canvas/selectionGeometry'
import {createCanvas} from 'batch-test-canvas'
import {waitFor} from '@testing-library/react'
function State(){const {state}=useEditor();return <output data-testid="state">{JSON.stringify(state)}</output>}
it('requires manual person and feature regions and leaves document intact on cancel',()=>{
 render(<EditorProvider><State/><PortraitRecipeWorkspace/></EditorProvider>)
 const before=screen.getByTestId('state').textContent
 fireEvent.click(screen.getByRole('button',{name:'人像自然精修'}))
 expect(screen.getByText(/不自动识人/)).toBeInTheDocument()
 expect(screen.getByRole('button',{name:'预览人像精修'})).toBeDisabled()
 fireEvent.click(screen.getByRole('button',{name:'取消人像精修'}));expect(screen.getByTestId('state').textContent).toBe(before)
})
it('mounts from production Composer and exposes all bounded stage controls',()=>{
 render(<EditorProvider><AIComposer/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'人像自然精修'}))
 for(const name of ['人物','皮肤','眼部','保护'])expect(screen.getByRole('button',{name:`捕获${name}分区`})).toBeInTheDocument()
 for(const name of ['降噪','瑕疵修复','肤色','眼部增强'])expect(screen.getByLabelText(`启用${name}`)).toBeInTheDocument()
})

function Setup(){const {state,dispatch}=useEditor();return <><output data-testid="live">{JSON.stringify({layers:state.layers.length,undo:state.undoStack.length})}</output><button onClick={()=>dispatch({type:'restore-project',document:{...initialEditorState,layers:[{id:'p',name:'portrait',kind:'image',className:'layer-art',source:'data:image/png;base64,AA==',visible:true,opacity:100,blendMode:'正常'}],canvasShapes:[],canvasTexts:[],brushStrokes:[],sceneOrder:[],layerMasks:{},selectedLayerId:'p',selectedLayerIds:['p'],documentWidth:32,documentHeight:32,artboards:[{id:'b',name:'portrait',x:0,y:0,width:32,height:32,background:'transparent',layerIds:['p']}],activeArtboardId:'b'}})}>准备测试人像</button><button onClick={()=>dispatch({type:'commit-selection',selection:createSelection('ellipse',{x:0,y:0,width:100,height:100})})}>设置人物选区</button><button onClick={()=>dispatch({type:'commit-selection',selection:createSelection('ellipse',{x:20,y:20,width:60,height:60})})}>设置皮肤选区</button><button onClick={()=>dispatch({type:'commit-selection',selection:createSelection('ellipse',{x:30,y:30,width:40,height:10})})}>设置眼部选区</button></>}
it('captures explicit regions then previews without mutation, invalidates parameters, and adopts once',async()=>{
 const decode=vi.spyOn(pixelIO,'decodePixels').mockImplementation(async()=>solidImage(32,32,[120,90,70,255]))
 const encode=vi.spyOn(pixelIO,'encodePixels').mockImplementation(image=>{const canvas=createCanvas(image.width,image.height),ctx=canvas.getContext('2d'),frame=ctx.createImageData(image.width,image.height);frame.data.set(image.data);ctx.putImageData(frame,0,0);return canvas.toDataURL('image/png')})
 try{
  render(<EditorProvider><Setup/><PortraitRecipeWorkspace/></EditorProvider>)
  fireEvent.click(screen.getByText('准备测试人像'));fireEvent.click(screen.getByRole('button',{name:'人像自然精修'}))
  for(const [select,capture] of [['设置人物选区','捕获人物分区'],['设置皮肤选区','捕获皮肤分区'],['设置眼部选区','捕获眼部分区']]){fireEvent.click(screen.getByText(select));fireEvent.click(screen.getByRole('button',{name:capture}))}
  const beforePreview=JSON.parse(screen.getByTestId('live').textContent!)
  fireEvent.click(screen.getByLabelText('确认人物及分区'));fireEvent.click(screen.getByRole('button',{name:'预览人像精修'}))
  await screen.findByLabelText('人像精修预览');expect(JSON.parse(screen.getByTestId('live').textContent!)).toEqual(beforePreview)
  fireEvent.change(screen.getByLabelText('降噪强度'),{target:{value:'10'}});expect(screen.queryByLabelText('人像精修预览')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button',{name:'预览人像精修'}));await screen.findByLabelText('人像精修预览')
  fireEvent.click(screen.getByRole('button',{name:'采用人像精修'}));await waitFor(()=>expect(JSON.parse(screen.getByTestId('live').textContent!).undo).toBe(beforePreview.undo+1))
 }finally{decode.mockRestore();encode.mockRestore()}
})
