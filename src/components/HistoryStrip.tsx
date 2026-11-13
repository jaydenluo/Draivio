import { ResultThumbnail } from '../history/ResultThumbnail'
import { useEditor } from '../state/editor'
import { useRef } from 'react'
import { readImageFile } from '../canvas/documentIO'

export function HistoryStrip() {
  const { state, dispatch } = useEditor()
  const fileInput = useRef<HTMLInputElement>(null)
  const visibleHistory = state.historyTab === 'results' ? state.history.filter((item) => item.id !== 'original') : state.historyTab === 'compare' ? state.history.slice(-4) : state.history
  const importImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const id = `import-${Date.now()}`
    try {
      const source = await readImageFile(file)
      dispatch({ type: 'import-image', id, name: file.name, source })
    } catch (error) {
      dispatch({ type: 'set-notice', message: error instanceof Error ? error.message : '图片导入失败' })
    }
    event.target.value = ''
  }
  return <footer className="history-strip" aria-label="操作历史" role="region"><div className="history-tabs"><button className="history-collapse" aria-label={state.historyCollapsed ? '展开历史' : '折叠历史'} onClick={() => dispatch({ type: 'set-history-collapsed', collapsed: !state.historyCollapsed })}>{state.historyCollapsed ? '⌃' : '⌄'}</button>{!state.historyCollapsed ? <><button className={state.historyTab === 'operations' ? 'active' : ''} aria-pressed={state.historyTab === 'operations'} onClick={() => dispatch({ type: 'set-history-tab', tab: 'operations' })}>操作历史</button><button className={state.historyTab === 'results' ? 'active' : ''} aria-pressed={state.historyTab === 'results'} onClick={() => dispatch({ type: 'set-history-tab', tab: 'results' })}>生成结果</button><button className={state.historyTab === 'compare' ? 'active' : ''} aria-pressed={state.historyTab === 'compare'} onClick={() => dispatch({ type: 'set-history-tab', tab: 'compare' })}>多结果对比</button><button className="clear-history" onClick={() => dispatch({ type: 'clear-history' })}>清空</button></> : <span className="history-collapsed-label">历史结果已折叠</span>}</div>{!state.historyCollapsed ? <div className="history-list">{visibleHistory.length ? visibleHistory.map((item) => <ResultThumbnail key={item.id} item={item} active={state.selectedHistoryId === item.id} onClick={() => dispatch({ type: 'select-history', id: item.id })} />) : <span className="history-empty">暂无生成结果</span>}<button className="history-add" aria-label="导入图片" onClick={() => fileInput.current?.click()}>＋</button><input ref={fileInput} className="sr-only" type="file" accept="image/*" aria-label="选择要导入的图片" onChange={importImage} /></div> : null}</footer>
}
