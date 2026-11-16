import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { EditorProvider } from '../state/editor'
import { AIComposer } from './AIComposer'
it('exposes the actual double exposure workspace from the production composer',()=>{
 render(<EditorProvider><AIComposer/></EditorProvider>)
 fireEvent.click(screen.getByRole('button',{name:'双重曝光'}))
 expect(screen.getByLabelText('双重曝光第二图')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'预览双重曝光'}))
 expect(screen.getByRole('alert')).toBeInTheDocument()
})
