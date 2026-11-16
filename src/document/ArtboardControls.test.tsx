import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ArtboardControls } from './ArtboardControls'
function Harness(){const {state,dispatch}=useEditor();return <><ArtboardControls/><output data-testid="board-count">{state.artboards.length}</output><output data-testid="board-dims">{state.documentWidth}×{state.documentHeight}</output><button onClick={()=>dispatch({type:'undo'})}>撤销画板</button></>}
it('previews actual different dimensions without changing document, supports cancel, commit and undo',()=>{
 render(<EditorProvider><Harness/></EditorProvider>);fireEvent.click(screen.getByText('复制规格'));fireEvent.change(screen.getByLabelText('复制画板宽度'),{target:{value:'200'}});fireEvent.change(screen.getByLabelText('复制画板高度'),{target:{value:'300'}});fireEvent.change(screen.getByLabelText('复制画板模式'),{target:{value:'crop'}});expect(screen.getByLabelText('画板复制视觉预览').querySelector('svg')).toHaveAttribute('viewBox','0 0 200 300');expect(screen.getByTestId('board-count')).toHaveTextContent('1');fireEvent.click(screen.getByText('取消'));expect(screen.queryByLabelText('画板规格复制')).toBeNull();fireEvent.click(screen.getByText('复制规格'));fireEvent.click(screen.getByText('确认复制'));expect(screen.getByTestId('board-count')).toHaveTextContent('2');expect(screen.getByTestId('board-dims')).toHaveTextContent('200×300');fireEvent.click(screen.getByText('撤销画板'));expect(screen.getByTestId('board-count')).toHaveTextContent('1')
})
