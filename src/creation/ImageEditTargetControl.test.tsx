import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, type EditorAction } from '../state/editor'
import { prepareMaskedEdit } from '../ai/maskedEdit/workflow'
import { ImageEditTargetControl } from './ImageEditTargetControl'

vi.mock('../ai/maskedEdit/workflow',()=>({
  prepareMaskedEdit:vi.fn(async()=>({mask:new Uint8Array([255]),pixels:{width:1,height:1},provenance:{source:{source:'data:image/png;base64,cG5n'}}})),
  encodePixels:()=> 'data:image/png;base64,bWFzaw==',
}))

test('shows the actual range preview without recalculating for viewport zoom',async()=>{
 let dispatch:(action:EditorAction)=>void=()=>{}
 function Setup(){dispatch=useEditor().dispatch;return <><div className="canvas-document" /><ImageEditTargetControl value="auto" onChange={()=>{}}/></>}
 render(<EditorProvider><Setup/></EditorProvider>)
 const target=screen.getByRole('combobox',{name:/修改春日海报/}).closest('label')!
 fireEvent.pointerEnter(target)
 await screen.findByAltText('AI 修改范围')
 expect(prepareMaskedEdit).toHaveBeenCalledTimes(1)
 act(()=>dispatch({type:'set-zoom',zoom:60}))
 expect(prepareMaskedEdit).toHaveBeenCalledTimes(1)
 expect(screen.getByAltText('AI 修改范围').parentElement).toHaveClass('canvas-document')
 fireEvent.pointerLeave(target)
 expect(screen.queryByAltText('AI 修改范围')).toBeNull()
})
