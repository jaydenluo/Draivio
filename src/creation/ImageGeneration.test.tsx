import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { EditorProvider, useEditor, initialEditorState, type EditorState } from '../state/editor'
import { AIComposer } from './AIComposer'
import { GenerationPanel } from './GenerationPanel'
import { MessageHost } from '../components/MessageHost'
let latest: EditorState
function Setup() {
 const { state, dispatch } = useEditor(); latest = state
 return <><button onClick={() => {
  dispatch({ type:'set-composer-source', sourceId:'proxy' }); dispatch({type:'set-composer-parameter',parameter:'model',value:'image'})
  dispatch({type:'set-composer-parameter',parameter:'count',value:'4 张'}); dispatch({type:'set-composer-mode',mode:'generate'})
 }}>准备</button><button onClick={() => dispatch({ type: 'restore-project', document: { ...initialEditorState, documentId: state.documentId } })}>重开同ID</button><button onClick={() => dispatch({ type: 'set-prompt', prompt: '普通编辑' })}>普通编辑</button><button onClick={() => { dispatch({ type: 'begin-transaction', label: 'new session adjustment' }); dispatch({ type: 'set-layer-opacity', id: state.selectedLayerId, opacity: 57 }); dispatch({ type: 'set-notice', message: '新会话正在编辑' }) }}>活动事务</button><button onClick={() => dispatch({ type: 'new-document', width: 500, height: 625 })}>新文档</button><button onClick={() => { dispatch({ type: 'set-composer-source', sourceId: 'draivio-cloud' }); dispatch({ type: 'set-composer-parameter', parameter: 'model', value: 'Image Pro' }); dispatch({ type: 'set-composer-parameter', parameter: 'count', value: '2 张' }) }}>模拟两张</button></>
}
function mount() {
 localStorage.setItem('draivio-service-connections-v1',JSON.stringify([{id:'proxy',provider:'OpenAI',name:'中转',baseUrl:'https://proxy.example/v1',apiKey:'never-in-history',protocol:'openai_compatible',models:['image'],enabled:true,generation:{multiImage:'split',concurrency:2,sendSize:false}}]))
 return render(<><MessageHost/><EditorProvider><Setup/><AIComposer/><GenerationPanel/></EditorProvider></>)
}
afterEach(() => { vi.restoreAllMocks(); localStorage.clear() })
test('both entry points share a real batch, progressively add actual images and only retry failures', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValueOnce(new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]}))).mockResolvedValueOnce(new Response('',{status:400})).mockImplementation(async () => new Response(JSON.stringify({data:[{b64_json:'aGVsbG8='}]})))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 await waitFor(()=>expect(latest.isGenerating).toBe(false))
 expect(fetcher).toHaveBeenCalledTimes(4)
 expect(latest.layers).toHaveLength(3)
 expect(latest.aiResults).toHaveLength(3)
 expect(latest.aiResults.every(result => !result.adopted)).toBe(true)
 expect(latest.aiResults[0].source).toBe('data:image/png;base64,aGVsbG8=')
 expect(JSON.stringify(latest)).not.toContain('never-in-history')
 expect(screen.getByText(/已生成 3\/4 张/)).toBeInTheDocument()
 expect(screen.getAllByText(/生图请求失败/)).toHaveLength(1)
 fireEvent.click(screen.getAllByRole('button',{name:'重试失败 / 补齐'})[0])
 await waitFor(()=>expect(latest.aiResults).toHaveLength(4))
 expect(latest.layers).toHaveLength(3)
 expect(new Set(latest.aiResults.map(result => result.batchId)).size).toBe(1)
 expect(fetcher).toHaveBeenCalledTimes(5)
})
test('real edit operations are explicitly blocked instead of sending incomplete generation requests', async () => {
 const fetcher=vi.spyOn(globalThis,'fetch')
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button',{name:'切换到修改当前图'}))
 fireEvent.click(screen.getByRole('button',{name:'执行 AI 操作'}))
 expect(screen.getByText(/仅支持文生图/)).toBeInTheDocument()
 expect(fetcher).not.toHaveBeenCalled()
})

test('cancelling queued requests keeps only completed candidates and creates no placeholder layers', async () => {
 const pending: ((response: Response) => void)[] = []
 const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => pending.push(resolve)))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2))
 fireEvent.click(screen.getAllByRole('button', { name: '取消排队' })[0])
 pending.forEach(resolve => resolve(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }))))
 await waitFor(() => expect(latest.isGenerating).toBe(false))
 expect(fetcher).toHaveBeenCalledTimes(2)
 expect(latest.aiResults).toHaveLength(2)
 expect(latest.layers).toHaveLength(3)
 expect(latest.aiResults.every(item => item.status === 'success' && !item.adopted)).toBe(true)
})
test('empty real responses create no candidates or formal layers and a new batch identity is recorded', async () => {
 vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [] })))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 await waitFor(() => expect(latest.isGenerating).toBe(false))
 expect(latest.aiResults).toHaveLength(0)
 expect(latest.layers).toHaveLength(3)
 expect(latest.currentAiBatchId).toMatch(/^batch-/)
})
test('real callbacks from a previous document cannot insert candidates into a new document', async () => {
 const pending: ((response: Response) => void)[] = []
 vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => pending.push(resolve)))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 await waitFor(() => expect(pending).toHaveLength(2))
 fireEvent.click(screen.getAllByRole('button', { name: '取消排队' })[0])
 fireEvent.click(screen.getByText('新文档'))
 pending.forEach(resolve => resolve(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }))))
 await waitFor(() => expect(screen.queryAllByRole('button', { name: '取消排队' })).toHaveLength(0))
 expect(latest.aiResults).toHaveLength(0)
 expect(latest.layers).toHaveLength(1)
})
test('simulation provider completes visible candidates without creating formal layers', async () => {
 mount(); fireEvent.click(screen.getByText('模拟两张')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 expect(latest.isGenerating).toBe(true)
 await waitFor(() => expect(latest.isGenerating).toBe(false), { timeout: 1500 })
 expect(latest.layers).toHaveLength(3)
 expect(latest.aiResults).toHaveLength(2)
 expect(latest.aiResults.every(item => item.status === 'success' && item.source?.startsWith('data:image/png;base64,') && item.batchId === latest.currentAiBatchId)).toBe(true)
})
test('a new document can start simulation immediately while the old demo timer is discarded', async () => {
 mount(); fireEvent.click(screen.getByText('模拟两张')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 fireEvent.click(screen.getByText('新文档'))
 fireEvent.click(screen.getByText('模拟两张')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 expect(latest.isGenerating).toBe(true)
 await waitFor(() => expect(latest.isGenerating).toBe(false), { timeout: 1500 })
 expect(latest.layers).toHaveLength(1)
 expect(latest.aiResults).toHaveLength(2)
})

test('same-ID restore discards old real callbacks and retry while allowing the new session to generate', async () => {
 const pending: ((response: Response) => void)[] = []
 const fetcher = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => pending.push(resolve)))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 await waitFor(() => expect(pending).toHaveLength(2))
 const beforeId = latest.documentId
 fireEvent.click(screen.getByText('重开同ID'))
 expect(latest.documentId).toBe(beforeId)
 expect(screen.queryAllByRole('button', { name: '取消排队' })).toHaveLength(0)
 fireEvent.click(screen.getByText('模拟两张')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 expect(latest.isGenerating).toBe(true)
 fireEvent.click(screen.getByText('活动事务'))
 const beforeOldCompletion = { notice: latest.notice, transaction: structuredClone(latest.historyTransaction), revision: latest.documentRevision }
 pending.slice(0, 2).forEach(resolve => resolve(new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] }))))
 await new Promise(resolve => setTimeout(resolve, 30))
 expect(fetcher).toHaveBeenCalledTimes(2)
 expect(latest.aiResults).toHaveLength(0)
 expect(latest.isGenerating).toBe(true) // Old finally must not clear the new session's busy state.
 expect(latest.notice).toBe(beforeOldCompletion.notice)
 expect(latest.historyTransaction).toEqual(beforeOldCompletion.transaction)
 expect(latest.documentRevision).toBe(beforeOldCompletion.revision)
 await waitFor(() => expect(latest.aiResults).toHaveLength(2), { timeout: 1500 })
})
test('same-ID restore cancels pending demo and permits immediate replacement batch', async () => {
 mount(); fireEvent.click(screen.getByText('模拟两张')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 fireEvent.click(screen.getByText('重开同ID'))
 fireEvent.click(screen.getByText('模拟两张')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 expect(latest.isGenerating).toBe(true)
 await waitFor(() => expect(latest.isGenerating).toBe(false), { timeout: 1500 })
 expect(latest.aiResults).toHaveLength(2)
 expect(latest.layers).toHaveLength(3)
})
test('ordinary edits preserve a running batch and all sibling callbacks as revisions change', async () => {
 const pending: ((response: Response) => void)[] = []
 vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(resolve => pending.push(resolve)))
 mount(); fireEvent.click(screen.getByText('准备')); fireEvent.click(screen.getByRole('button', { name: '执行 AI 操作' }))
 await waitFor(() => expect(pending).toHaveLength(2))
 fireEvent.click(screen.getByText('普通编辑'))
 for (let i = 0; i < 4; i++) {
  pending[i](new Response(JSON.stringify({ data: [{ b64_json: 'aGVsbG8=' }] })))
  await waitFor(() => expect(latest.aiResults).toHaveLength(i + 1))
 }
 await waitFor(() => expect(latest.isGenerating).toBe(false))
 expect(latest.prompt).toBe('普通编辑')
 expect(latest.aiResults.every(item => item.prompt !== '普通编辑')).toBe(true)
})
