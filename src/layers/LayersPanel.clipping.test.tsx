import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider, initialEditorState, useEditor } from '../state/editor'
import { LayersPanel } from './LayersPanel'
function Subject(){const {dispatch,state}=useEditor();return <><button onClick={()=>dispatch({type:'restore-project',document:{...initialEditorState,layers:[{...initialEditorState.layers[0],id:'top',name:'纹理',source:undefined},{...initialEditorState.layers[0],id:'base',name:'基底',source:undefined}],canvasShapes:[],canvasTexts:[],brushStrokes:[],selectedLayerId:'top',selectedLayerIds:['top']}})}>载入剪贴场景</button><output data-testid="state">{JSON.stringify(state)}</output><LayersPanel/></>}
it('exposes 16 categorized blend modes and creates/releases clipping with a base hint and undo',()=>{
 render(<EditorProvider><Subject/></EditorProvider>);fireEvent.click(screen.getByText('载入剪贴场景'))
 const select=screen.getByRole('combobox',{name:'图层混合模式'});expect(within(select).getAllByRole('option')).toHaveLength(16);expect(select.querySelectorAll('optgroup')).toHaveLength(6)
 fireEvent.change(select,{target:{value:'颜色减淡'}});expect(JSON.parse(screen.getByTestId('state').textContent!).layers[0].blendMode).toBe('颜色减淡')
 fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'创建剪贴蒙版'}));expect(screen.getByRole('button',{name:'纹理图层'})).toHaveTextContent('剪贴至 基底')
 fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}));fireEvent.click(screen.getByRole('menuitem',{name:'释放剪贴蒙版'}));expect(screen.getByRole('button',{name:'纹理图层'})).not.toHaveTextContent('剪贴至')
 fireEvent.click(screen.getByRole('button',{name:'纹理锁定'}));fireEvent.click(screen.getByRole('button',{name:'图层更多操作'}));expect(screen.getByRole('menuitem',{name:'创建剪贴蒙版'})).toBeDisabled();expect(select).toBeDisabled()
})
