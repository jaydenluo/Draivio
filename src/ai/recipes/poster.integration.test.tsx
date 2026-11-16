import {it,expect} from 'vitest'
import {render,screen,fireEvent} from '@testing-library/react'
import {EditorProvider} from '../../state/editor'
import {AIComposer} from '../../creation/AIComposer'
it('exposes the poster recipe from the production composer',()=>{render(<EditorProvider><AIComposer/></EditorProvider>);fireEvent.click(screen.getByRole('button',{name:'海报排版'}));expect(screen.getByRole('region',{name:'AI 操作'})).toContainElement(screen.getByRole('region',{name:'海报排版工作区'}));expect(screen.getByLabelText('海报标题')).toBeInTheDocument()})
