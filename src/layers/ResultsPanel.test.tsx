import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { EditorProvider, useEditor, initialEditorState, type AIResult, type EditorState } from '../state/editor'
import { ResultsPanel } from './ResultsPanel'
let latest: EditorState
const request = { mode: 'edit' as const, prompt: '候选提示', sourceLayerId: 'art', sourceImage: 'data:image/png;base64,original', sourceId: 'saved-source', selection: null, parameters: { ...initialEditorState.composerParameters, model: 'saved-model', count: '4 张', strength: '31' } }
const result = (id: string, batchId: string, date = new Date().toISOString()): AIResult => ({ id, batchId, source: `data:image/png;base64,full-${id}`, thumbnail: `data:image/png;base64,thumb-${id}`, prompt: request.prompt, model: 'saved-model', provider: 'saved-source', size: '1024', createdAt: date, status: 'success', favorite: false, adopted: false, request })
function Setup() {
 const { state, dispatch } = useEditor(); latest = state
 return <button onClick={() => {
  dispatch({ type: 'add-ai-result', result: result('old', 'old-batch') })
  dispatch({ type: 'add-ai-result', result: result('one', 'new-batch', '2000-01-01T00:00:00Z') })
  dispatch({ type: 'add-ai-result', result: result('two', 'new-batch') })
  dispatch({ type: 'start-ai-batch', batchId: 'new-batch' })
 }}>准备候选</button>
}
function mount() { render(<EditorProvider><Setup/><ResultsPanel/></EditorProvider>); fireEvent.click(screen.getByText('准备候选')) }
test('current batch means exact batch identity irrespective of timestamps', () => {
 mount()
 fireEvent.change(screen.getByRole('combobox', { name: '筛选 AI 结果' }), { target: { value: 'recent' } })
 expect(screen.getByRole('button', { name: '预览结果 one' })).toBeInTheDocument()
 expect(screen.getByRole('button', { name: '预览结果 two' })).toBeInTheDocument()
 expect(screen.queryByRole('button', { name: '预览结果 old' })).not.toBeInTheDocument()
})
test('preview uses full source and closes on Escape', () => {
 mount(); fireEvent.click(screen.getByRole('button', { name: '预览结果 one' }))
 expect(within(screen.getByRole('dialog')).getByRole('img', { name: 'AI 结果大图' })).toHaveAttribute('src', 'data:image/png;base64,full-one')
 fireEvent.keyDown(window, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
test('compare includes captured source and adopts the chosen full resolution winner only', () => {
 mount()
 const cards = ['one', 'two'].map(id => screen.getByRole('button', { name: `预览结果 ${id}` }).closest('article')!)
 cards.forEach(card => fireEvent.click(within(card).getByRole('checkbox')))
 fireEvent.click(screen.getByRole('button', { name: '比较 2/4' }))
 const dialog = screen.getByRole('dialog')
 expect(within(dialog).getByRole('img', { name: '生成来源原图' })).toHaveAttribute('src', request.sourceImage)
 expect(within(dialog).getAllByRole('img', { name: 'AI 结果大图' }).map(image => image.getAttribute('src'))).toEqual(['data:image/png;base64,full-one', 'data:image/png;base64,full-two'])
 fireEvent.click(within(dialog).getByRole('button', { name: '采用结果 one' }))
 expect(latest.layers).toHaveLength(4)
 expect(latest.layers[0].source).toBe('data:image/png;base64,full-one')
 expect(latest.aiResults.find(item => item.id === 'two')?.adopted).toBe(false)
})
test('continue editing restores provider and every saved parameter through panel action', () => {
 mount()
 const card = screen.getByRole('button', { name: '预览结果 one' }).closest('article')!
 fireEvent.click(within(card).getByRole('button', { name: '继续编辑' }))
 expect(latest.composerSourceId).toBe(request.sourceId)
 expect(latest.composerParameters).toEqual(request.parameters)
 expect(latest.prompt).toBe(request.prompt)
 expect(latest.composerMode).toBe(request.mode)
})
test('thumbnail failure falls back to full source and broken source becomes non-adoptable', () => {
 mount()
 const card = screen.getByRole('button', { name: '预览结果 one' }).closest('article')!
 const image = card.querySelector('img')!
 fireEvent.error(image)
 expect(image).toHaveAttribute('src', 'data:image/png;base64,full-one')
 fireEvent.error(image)
 expect(latest.aiResults.find(item => item.id === 'one')).toMatchObject({ status: 'error', error: '图片加载失败，请重新生成或检查图片地址' })
 expect(within(card).getByRole('button', { name: '新增图层' })).toBeDisabled()
 expect(latest.layers).toHaveLength(3)
})

test('adopted filters track adoption and deleting a candidate preserves its formal layer', () => {
 mount()
 let card = screen.getByRole('button', { name: '预览结果 one' }).closest('article')!
 fireEvent.click(within(card).getByRole('button', { name: '收藏' }))
 expect(latest.aiResults.find(item => item.id === 'one')?.favorite).toBe(true)
 fireEvent.click(within(card).getByRole('button', { name: '新增图层' }))
 fireEvent.change(screen.getByRole('combobox', { name: '筛选 AI 结果' }), { target: { value: 'adopted' } })
 expect(screen.queryByRole('button', { name: '预览结果 two' })).not.toBeInTheDocument()
 card = screen.getByRole('button', { name: '预览结果 one' }).closest('article')!
 fireEvent.click(within(card).getByRole('button', { name: '删除' }))
 expect(latest.layers).toHaveLength(4)
 expect(latest.layers[0].source).toBe('data:image/png;base64,full-one')
 expect(screen.queryByRole('button', { name: '预览结果 one' })).not.toBeInTheDocument()
 fireEvent.change(screen.getByRole('combobox', { name: '筛选 AI 结果' }), { target: { value: 'unused' } })
 expect(screen.getByRole('button', { name: '预览结果 two' })).toBeInTheDocument()
})
