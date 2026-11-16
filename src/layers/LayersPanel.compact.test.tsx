import {render,screen} from '@testing-library/react'
import {expect,it} from 'vitest'
import {EditorProvider} from '../state/editor'
import {LayersPanel} from './LayersPanel'
it('gives merge actions an independently named toolbar and a full-width explanation',()=>{
 render(<EditorProvider><LayersPanel/></EditorProvider>)
 const toolbar=screen.getByRole('group',{name:'图层合并操作'})
 expect(toolbar).toHaveClass('layer-merge-actions')
 expect(toolbar.querySelector('small')).toHaveClass('layer-merge-note')
})
