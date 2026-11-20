import { fireEvent, render, screen, within, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { EditorProvider, useEditor } from '../state/editor'
import { ResultsPanel } from './ResultsPanel'
import { ResultStage } from '../creation/ResultStage'
import {resultArchive} from '../creation/resultArchive'
import {useComposerDraft} from '../creation/ComposerDraft'
vi.mock('../creation/resultArchive',()=>({resultArchive:{save:vi.fn().mockResolvedValue(undefined),list:vi.fn().mockResolvedValue([]),load:vi.fn(),export:vi.fn().mockResolvedValue(true)}}))

function Fixture() {
 const { dispatch } = useEditor()
 return <button onClick={() => { for (let i=1; i<=5; i++) dispatch({type:'add-ai-result', result:{id:`result-${i}`,source:`data:image/png;base64,${i}`,thumbnail:`data:image/png;base64,${i}`,prompt:`提示 ${i}`,model:'测试模型',provider:'local',size:'500x625',createdAt:new Date().toISOString(),status:'success',favorite:false,adopted:false}}) }}>准备结果</button>
}
function DraftProbe(){const draft=useComposerDraft();return draft.reference?<img alt={`修改参考 ${draft.editTarget}`} src={draft.reference.source}/>:null}

test('shows one prompt line and compact working icon actions without metadata clutter',async()=>{
 render(<EditorProvider><ResultsPanel/><Fixture/><DraftProbe/></EditorProvider>)
 fireEvent.click(screen.getByText('准备结果'))
 const card=screen.getByRole('button',{name:'预览结果 result-1'}).closest('article')!
 expect(within(card).getByText('提示 1')).toHaveAttribute('title','提示 1')
 expect(within(card).queryByText(/测试模型/)).not.toBeInTheDocument()
 const actions=within(card).getByRole('group',{name:'图片操作 result-1'})
 for(const name of ['继续修改结果 result-1','另存结果 result-1','收藏结果 result-1','移除结果记录 result-1']){
  const button=within(actions).getByRole('button',{name})
  expect(button.querySelector('svg')).not.toBeNull()
  expect(button.textContent).toBe('')
 }
 fireEvent.click(within(actions).getByRole('button',{name:'收藏结果 result-1'}))
 expect(within(actions).getByRole('button',{name:'取消收藏结果 result-1'})).toHaveAttribute('aria-pressed','true')
 fireEvent.click(within(actions).getByRole('button',{name:'另存结果 result-1'}))
 await waitFor(()=>expect(resultArchive.export).toHaveBeenCalledWith(expect.objectContaining({id:'result-1',source:'data:image/png;base64,1'})))
 await waitFor(()=>expect(within(actions).getByRole('button',{name:'继续修改结果 result-1'})).toBeEnabled())
 fireEvent.click(within(actions).getByRole('button',{name:'继续修改结果 result-1'}))
 expect(screen.getByAltText('修改参考 upload')).toHaveAttribute('src','data:image/png;base64,1')
 const remove=within(actions).getByRole('button',{name:'移除结果记录 result-1'})
 await waitFor(()=>expect(remove).toBeEnabled())
 fireEvent.click(remove)
 expect(screen.queryByRole('button',{name:'预览结果 result-1'})).not.toBeInTheDocument()
})

test('compares selected results in a portal, while individual preview remains individual', () => {
 const view = render(<EditorProvider><ResultsPanel/><ResultStage/><Fixture/></EditorProvider>)
 fireEvent.click(screen.getByText('准备结果'))
 const checks = screen.getAllByRole('checkbox')
 fireEvent.click(checks[0]); fireEvent.click(checks[1])
 fireEvent.click(screen.getByRole('button',{name:'比较 2/4'}))
 const compare = screen.getByRole('dialog',{name:'AI 结果对比'})
 expect(view.container).not.toContainElement(compare)
 expect(within(compare).getAllByAltText('AI 结果合成预览')).toHaveLength(2)
 fireEvent.click(screen.getByRole('button',{name:'关闭预览'}))
 fireEvent.click(screen.getByRole('button',{name:'预览结果 result-3'}))
 expect(within(screen.getByRole('region',{name:'生成结果预览'})).getAllByAltText('生成结果大图')).toHaveLength(1)
})

test('comparison requires two images and limits selection to four', () => {
 render(<EditorProvider><ResultsPanel/><ResultStage/><Fixture/></EditorProvider>)
 expect(screen.getByRole('button',{name:'比较 0/4'})).toBeDisabled()
 fireEvent.click(screen.getByText('准备结果'))
 const checks = screen.getAllByRole('checkbox')
 fireEvent.click(checks[0]); expect(screen.getByRole('button',{name:'比较 1/4'})).toBeDisabled()
 checks.slice(1,4).forEach(check => fireEvent.click(check))
 expect(checks[4]).toBeDisabled()
 fireEvent.click(checks[0]); expect(checks[4]).toBeEnabled()
})


test('reopens a locally archived image without a project or model request',async()=>{
 const source='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
 vi.mocked(resultArchive.list).mockResolvedValueOnce([{id:'archived',documentId:'old-doc',prompt:'已保存作品',model:'历史模型',provider:'test',size:'1x1',createdAt:'2026-11-19',status:'success',favorite:false,adopted:false,thumbnail:source}])
 vi.mocked(resultArchive.load).mockResolvedValueOnce(source)
 render(<EditorProvider><ResultsPanel/><ResultStage/></EditorProvider>)
 fireEvent.click(screen.getByRole('tab',{name:'本地作品库'}))
 fireEvent.click(await screen.findByRole('button',{name:'预览本地图片 archived'}))
 const stage=await screen.findByRole('region',{name:'生成结果预览'})
 expect(within(stage).getByAltText('生成结果大图')).toHaveAttribute('src',source)
 expect(within(stage).getByRole('button',{name:'打开为新文档'})).toBeEnabled()
 expect(within(stage).queryByRole('button',{name:'应用修改'})).not.toBeInTheDocument()
})

test('loads the original for library icon actions and carries it into editing',async()=>{
 const source='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg=='
 vi.mocked(resultArchive.list).mockResolvedValueOnce([{id:'library-action',documentId:'old-doc',prompt:'本地图片描述',model:'历史模型',provider:'test',size:'1x1',createdAt:'2026-11-19',status:'success',favorite:false,adopted:false,thumbnail:source}])
 vi.mocked(resultArchive.load).mockResolvedValue(source)
 render(<EditorProvider><ResultsPanel/><DraftProbe/></EditorProvider>)
 fireEvent.click(screen.getByRole('tab',{name:'本地作品库'}))
 fireEvent.click(await screen.findByRole('button',{name:'另存结果 library-action'}))
 await waitFor(()=>expect(resultArchive.export).toHaveBeenCalledWith(expect.objectContaining({id:'library-action',source})))
 const editButton=screen.getByRole('button',{name:'继续修改结果 library-action'})
 await waitFor(()=>expect(editButton).toBeEnabled())
 fireEvent.click(editButton)
 expect(await screen.findByAltText('修改参考 upload')).toHaveAttribute('src',source)
})
