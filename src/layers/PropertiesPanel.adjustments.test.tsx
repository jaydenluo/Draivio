import { render, screen, fireEvent } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { PropertiesPanel } from './PropertiesPanel'
function Probe(){const {state,dispatch}=useEditor();return <><button onClick={()=>{dispatch({type:'set-layer-adjustment',id:'art',key:'brightness',value:40});dispatch({type:'set-layer-adjustment',id:'art',key:'contrast',value:20})}}>fixture</button><output data-testid="params">{JSON.stringify(state.layers[0])}</output></>}
test('each control has an independent reset and preview preserves saved parameters',()=>{
 render(<EditorProvider><PropertiesPanel/><Probe/></EditorProvider>);fireEvent.click(screen.getByText('fixture'));expect(screen.getByLabelText('亮度')).toHaveValue(40);fireEvent.click(screen.getByRole('button',{name:'重置亮度'}));expect(screen.getByLabelText('亮度')).toHaveValue(0);expect(screen.getByLabelText('对比度')).toHaveValue(20);expect(screen.getAllByRole('button',{name:/^重置(亮度|对比度|饱和度|色温|清晰度|模糊|阴影|高光)$/})).toHaveLength(8);fireEvent.click(screen.getByRole('checkbox',{name:'预览图像调整'}));expect(JSON.parse(screen.getByTestId('params').textContent!).adjustmentsEnabled).toBe(false);expect(screen.getByLabelText('对比度')).toHaveValue(20);expect(screen.getByText('导出跟随预览')).toBeInTheDocument(); expect(screen.getByLabelText('模糊')).toHaveAttribute('min','0')
})
function LockedFixture(){const {dispatch}=useEditor();return <button onClick={()=>dispatch({type:'toggle-layer-lock',id:'art'})}>lock fixture</button>}
test('locked layers disable independent reset and preview without changing saved adjustment parameters',()=>{
 render(<EditorProvider><PropertiesPanel/><Probe/><LockedFixture/></EditorProvider>);fireEvent.click(screen.getByText('fixture'));fireEvent.click(screen.getByText('lock fixture'));expect(screen.getByRole('button',{name:'重置亮度'})).toBeDisabled();expect(screen.getByRole('checkbox',{name:'预览图像调整'})).toBeDisabled();expect(screen.getByLabelText('亮度')).toBeDisabled()
})
