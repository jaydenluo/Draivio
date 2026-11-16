import {act,fireEvent,render,screen} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {EditorProvider} from '../state/editor'
import {AIComposer} from './AIComposer'
import {recipeBatchStorage} from '../ai/batch/recipeBatchStorage'
afterEach(()=>vi.restoreAllMocks())
it('exposes recipe batch trial/settings/results from the actual production Composer',async()=>{vi.spyOn(recipeBatchStorage,'list').mockResolvedValue([]);await act(async()=>render(<EditorProvider><AIComposer/></EditorProvider>));fireEvent.click(screen.getByRole('button',{name:'配方批处理'}));expect(screen.getByRole('region',{name:'AI 操作'})).toContainElement(screen.getByLabelText('AI 配方批处理工作区'));expect(screen.getByLabelText('批量配方 JSON')).toBeInTheDocument();expect(screen.getByLabelText('预算上限')).toBeInTheDocument();expect(screen.getByRole('button',{name:'试跑第一张'})).toBeDisabled();expect(screen.getByRole('button',{name:'开始剩余批量'})).toBeDisabled()})
