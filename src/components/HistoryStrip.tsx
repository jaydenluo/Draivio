import { ResultThumbnail } from '../history/ResultThumbnail'
import { useEditor } from '../state/editor'
import { useRef, useState } from 'react'
import { prepareImageProfile, type ImportProfilePolicy } from '../color/iccInput'
import { readImageFile, readImageMetadata } from '../canvas/documentIO'

export function HistoryStrip() {
  const { state, dispatch } = useEditor()
  const [importSizing, setImportSizing] = useState('auto')
  const [profilePolicy, setProfilePolicy] = useState<ImportProfilePolicy>(() => localStorage.getItem('draivio-import-profile') === 'assign' ? 'assign' : 'preserve')
  const latestState = useRef(state)
  latestState.current = state
  const importSequence = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const visibleHistory = state.historyTab === 'results' ? state.history.filter((item) => item.id !== 'original') : state.historyTab === 'compare' ? state.history.slice(-4) : state.history
  const importImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    const sequence = ++importSequence.current
    const version = state.undoStack
    const id = `import-${Date.now()}-${sequence}`
    try {
      await readImageFile(file)
      const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result as ArrayBuffer);reader.onerror=()=>reject(new Error('图片读取失败'));reader.readAsArrayBuffer(file)}))
      const prepared = await prepareImageProfile(bytes,file.type,state.colorManagement.profile,profilePolicy)
      const source = prepared.source
      const dimensions = await readImageMetadata(source).catch(() => ({ width: latestState.current.documentWidth, height: latestState.current.documentHeight }))
      const { width, height } = dimensions
      if (sequence !== importSequence.current || version !== latestState.current.undoStack) { dispatch({ type: 'set-notice', message: '文档已更改，已放弃此次图片导入，请重新选择文件' }); return }
      dispatch({ type: 'import-image', id, name: file.name, source, width, height, autoSize: importSizing === 'auto', inputProfile: {bytes:Array.from(prepared.profile.bytes),checksum:prepared.profile.checksum,policy:profilePolicy} })
      if(prepared.warning) dispatch({type:'set-notice',message:`已导入 ${file.name} · ${prepared.warning}`})
    } catch (error) {
      dispatch({ type: 'set-notice', message: error instanceof Error ? error.message : '图片导入失败' })
    }
    event.target.value = ''
  }
  return <footer className="history-strip" aria-label="操作历史" role="region"><div className="history-tabs"><button className="history-collapse" aria-label={state.historyCollapsed ? '展开历史' : '折叠历史'} onClick={() => dispatch({ type: 'set-history-collapsed', collapsed: !state.historyCollapsed })}>{state.historyCollapsed ? '⌃' : '⌄'}</button>{!state.historyCollapsed ? <><button className={state.historyTab === 'operations' ? 'active' : ''} aria-pressed={state.historyTab === 'operations'} onClick={() => dispatch({ type: 'set-history-tab', tab: 'operations' })}>操作历史</button><button className={state.historyTab === 'results' ? 'active' : ''} aria-pressed={state.historyTab === 'results'} onClick={() => dispatch({ type: 'set-history-tab', tab: 'results' })}>生成结果</button><button className={state.historyTab === 'compare' ? 'active' : ''} aria-pressed={state.historyTab === 'compare'} onClick={() => dispatch({ type: 'set-history-tab', tab: 'compare' })}>多结果对比</button><button className="clear-history" onClick={() => dispatch({ type: 'clear-history' })}>清空</button></> : <span className="history-collapsed-label">历史结果已折叠</span>}</div>{!state.historyCollapsed ? <div className="history-list">{visibleHistory.length ? visibleHistory.map((item) => <ResultThumbnail key={item.id} item={item} active={state.selectedHistoryId === item.id} onClick={() => dispatch({ type: 'select-history', id: item.id })} />) : <span className="history-empty">暂无生成结果</span>}<label style={{ fontSize: 11 }}>导入尺寸<select aria-label="导入尺寸" value={importSizing} onChange={(event) => setImportSizing(event.target.value)}><option value="auto">Auto · 跟随原图</option><option value="canvas">保持当前画布</option></select></label><label style={{fontSize:11}}>导入色彩<select aria-label="导入色彩策略" value={profilePolicy} onChange={e=>{const value=e.target.value as ImportProfilePolicy;setProfilePolicy(value);localStorage.setItem('draivio-import-profile',value)}}><option value="preserve">保留嵌入 ICC · 缺失按 sRGB</option><option value="assign">指定文档 ICC · 保留通道数值</option></select></label><button className="history-add" aria-label="导入图片" onClick={() => fileInput.current?.click()}>＋</button><input ref={fileInput} className="sr-only" type="file" accept="image/*" aria-label="选择要导入的图片" onChange={importImage} /></div> : null}</footer>
}
