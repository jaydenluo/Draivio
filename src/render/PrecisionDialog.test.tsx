import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { PrecisionDialog } from './PrecisionDialog'
import { packPrecisionAsset } from './precisionAsset'
import { createPixelBuffer } from './pixelBuffer'
vi.mock('./precisionCodec',()=>({nativePrecisionAvailable:()=>false}))
vi.mock('./precisionPreview',()=>({precisionPreviewBytes:()=>({width:1,height:1,data:new Uint8ClampedArray([255,255,255,255]),clippedChannels:2}),precisionPreviewPng:()=> 'data:image/png;base64,cHJldmlldw=='}))

const asset=packPrecisionAsset(createPixelBuffer(1,1,'rgba32f',[2.5,1.25,-.25,1]))
function Harness(){const {state,dispatch}=useEditor();return <><button onClick={()=>dispatch({type:'import-precision-image',id:'hdr',name:'EXR',asset,preview:'data:image/png;base64,cA=='})}>准备高精度图层</button><output data-testid="resource">{state.layers.find(l=>l.id==='hdr')?.highPrecision?.data}</output><output data-testid="undo">{state.undoStack.length}</output><PrecisionDialog onClose={vi.fn()}/></>}
it('gates real browser codecs and keeps transient processing out of editor history until apply',async()=>{
  render(<EditorProvider><Harness/></EditorProvider>)
  expect(screen.getByLabelText('导入高精度图像')).toBeDisabled()
  fireEvent.click(screen.getByText('准备高精度图层'))
  const before=screen.getByTestId('resource').textContent,undo=screen.getByTestId('undo').textContent
  fireEvent.change(screen.getByLabelText('高精度曝光 EV'),{target:{value:'1'}})
  fireEvent.click(screen.getByText('生成临时预览'))
  await waitFor(()=>expect(screen.getByText('应用高精度处理')).toBeEnabled())
  expect(screen.getByTestId('resource')).toHaveTextContent(before!)
  expect(screen.getByTestId('undo')).toHaveTextContent(undo!)
  fireEvent.click(screen.getByText('放弃预览'))
  expect(screen.getByTestId('resource')).toHaveTextContent(before!)
  fireEvent.click(screen.getByText('生成临时预览'))
  await waitFor(()=>expect(screen.getByText('应用高精度处理')).toBeEnabled())
  fireEvent.click(screen.getByText('应用高精度处理'))
  expect(screen.getByTestId('resource').textContent).not.toBe(before)
  expect(Number(screen.getByTestId('undo').textContent)).toBe(Number(undo)+1)
})
