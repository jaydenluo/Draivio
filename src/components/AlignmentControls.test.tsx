import { fireEvent, render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import { ToolOptionsBar } from './ToolOptionsBar'

function Controls() {
  const { dispatch, state } = useEditor()
  return <><button onClick={() => dispatch({ type: 'restore-project', document: { ...initialEditorState, layers: [
    { ...initialEditorState.layers[0], id: 'a', name: 'A', transform: { kind: 'transform', rect: {x:10,y:20,width:20,height:10},rotation:0,flipX:false,flipY:false } },
    { ...initialEditorState.layers[0], id: 'b', name: 'B', transform: { kind: 'transform', rect: {x:40,y:50,width:10,height:20},rotation:0,flipX:false,flipY:false } },
  ], selectedLayerId:'b', selectedLayerIds:['a','b'] } })}>多选对象</button><ToolOptionsBar /><output data-testid="positions">{state.layers.map((layer) => `${layer.id}:${layer.transform?.rect.x}`).join(',')}</output></>
}

test('shows six alignment actions in the top toolbar, switches reference and disables distribution for two objects', () => {
  render(<EditorProvider><Controls /></EditorProvider>)
  expect(screen.queryByLabelText('对齐依据')).toBeNull()
  fireEvent.click(screen.getByText('多选对象'))
  expect(screen.getByRole('button', {name:'右对齐'})).toBeInTheDocument()
  expect(screen.getByRole('button', {name:'底对齐'})).toBeInTheDocument()
  expect(screen.getByRole('button', {name:'水平等距'})).toBeDisabled()
  fireEvent.change(screen.getByLabelText('对齐依据'), { target: { value:'key-object' } })
  fireEvent.click(screen.getByRole('button', {name:'左对齐'}))
  expect(screen.getByTestId('positions')).toHaveTextContent('a:40,b:40')
})
