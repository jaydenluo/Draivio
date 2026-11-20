import { render, screen, fireEvent } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider, initialEditorState } from '../state/editor'
import { PropertiesPanel } from './PropertiesPanel'
it('shows actual pixel dimensions by default and supports percentage display', () => {
 render(<EditorProvider><PropertiesPanel /></EditorProvider>)
 expect(screen.getByLabelText('宽度')).toHaveValue(500)
 expect(screen.getByLabelText('高度')).toHaveValue(625)
 fireEvent.change(screen.getByLabelText('属性单位'), { target: { value: '%' } })
 expect(screen.getByLabelText('宽度')).toHaveValue(100)
})
it('disables curve and levels controls inherited from a locked group',()=>{
 const original=initialEditorState.layers
 initialEditorState.layers=[{id:'locked-group',name:'locked group',className:'layer-group',kind:'group',locked:true,children:['art'],visible:true,opacity:100,blendMode:'正常'},{...original[0],groupId:'locked-group'}]
 try{render(<EditorProvider><PropertiesPanel/></EditorProvider>);expect(screen.getByLabelText('曲线通道')).toBeDisabled();expect(screen.getByLabelText('色阶中间调')).toBeDisabled();expect(screen.getByRole('button',{name:'添加锚点'})).toBeDisabled();expect(screen.getByText('提亮预设')).toBeDisabled()}finally{initialEditorState.layers=original}
})
