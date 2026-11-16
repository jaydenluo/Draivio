import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ToolOptionsBar } from './ToolOptionsBar'
function Probe() {
  const {state,dispatch} = useEditor()
  return <><button onClick={()=>dispatch({type:'select-layer',id:'mask',additive:true})}>多选</button><button onClick={()=>dispatch({type:'select-layer',id:'original',additive:true})}>加第三层</button><output data-testid="notice">{state.notice}</output><output data-testid="layers">{JSON.stringify(state.layers)}</output></>
}
test('only shows on multi-selection with Chinese native controls and explains disabled distribution', async () => {
  const user = userEvent.setup(); render(<EditorProvider><ToolOptionsBar/><Probe/></EditorProvider>)
  expect(screen.queryByRole('group',{name:'对齐与分布'})).not.toBeInTheDocument()
  fireEvent.click(screen.getByText('多选'))
  const button = screen.getByRole('button',{name:'水平等距分布'})
  expect(button).toBeDisabled(); expect(button).toHaveAttribute('title',expect.stringContaining('至少需要三个'))
  const reference = screen.getByRole('combobox',{name:'对齐基准'}); reference.focus(); await user.selectOptions(reference,'key')
  expect(screen.getByRole('combobox',{name:'关键对象'})).toBeInTheDocument()
  const align = screen.getByRole('button',{name:'左对齐'}); align.focus(); await user.keyboard('{Enter}')
  expect(screen.getByTestId('notice')).toHaveTextContent(/已在目标位置|已对齐/)
})
test('does not treat hidden third layer as a distributable target', () => {
  render(<EditorProvider><ToolOptionsBar/><Probe/></EditorProvider>); fireEvent.click(screen.getByText('多选')); fireEvent.click(screen.getByText('加第三层'))
  expect(screen.getByRole('button',{name:'垂直等距分布'})).toBeDisabled()
})
