import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { PropertiesPanel } from './PropertiesPanel'
function StateProbe() { const {state,dispatch}=useEditor(); return <><output data-testid="preset-count">{state.adjustmentPresets.length}</output><output data-testid="luminosity">{String(state.layers[0].adjustments?.colorBalance?.preserveLuminosity)}</output><button onClick={()=>dispatch({type:'undo'})}>撤销测试</button></> }
it('saves a document preset, exposes builtins and applies undoable luminosity/reset controls',()=>{
 render(<EditorProvider><PropertiesPanel/><StateProbe/></EditorProvider>)
 expect(screen.getByText('内置·中性')).toBeTruthy(); expect(screen.getByText('内置·暖调')).toBeTruthy()
 fireEvent.change(screen.getByLabelText('预设名称'),{target:{value:'可保存'}});fireEvent.click(screen.getByText('保存预设'))
 expect(screen.getByTestId('preset-count')).toHaveTextContent('1')
 fireEvent.click(screen.getByLabelText('保持明度')); expect(screen.getByTestId('luminosity')).toHaveTextContent('false')
 fireEvent.click(screen.getByText('撤销测试')); expect(screen.getByTestId('luminosity')).toHaveTextContent('true')
 fireEvent.click(screen.getByText('重置 HSL')); fireEvent.click(screen.getByText('重置色彩平衡'))
 expect(screen.getAllByText('替换').length).toBe(3);expect(screen.getAllByText('合并').length).toBe(3)
})
