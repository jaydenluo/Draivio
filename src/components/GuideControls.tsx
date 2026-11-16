import { useEditor } from '../state/editor'

export function GuideControls() {
  const { state, dispatch } = useEditor()
  const update = (action: Parameters<typeof dispatch>[0] & { type: 'update-guide-settings' }) => dispatch(action)
  return <details className="guide-controls"><summary>视图</summary><div aria-label="参考线设置">
    <button aria-pressed={state.guideSettings.rulersVisible} onClick={() => update({ type: 'update-guide-settings', action: { type: 'settings', patch: { rulersVisible: !state.guideSettings.rulersVisible } } })}>标尺</button>
    <button onClick={() => update({ type: 'update-guide-settings', action: { type: 'add', guide: { id: crypto.randomUUID(), axis: 'x', position: state.documentWidth / 2, locked: false } } })}>新增垂直参考线</button>
    <button onClick={() => update({ type: 'update-guide-settings', action: { type: 'add', guide: { id: crypto.randomUUID(), axis: 'y', position: state.documentHeight / 2, locked: false } } })}>新增水平参考线</button>
    <label>网格间距<input type="number" aria-label="网格间距" min={1} value={state.guideSettings.grid.spacingX} onChange={e => { const value = Number(e.target.value); if (value > 0) update({ type: 'update-guide-settings', action: { type: 'settings', patch: { grid: { ...state.guideSettings.grid, spacingX: value, spacingY: value } } } }) }} /></label>
    {state.guideSettings.guides.map(g => <div key={g.id}><label>{g.axis === 'x' ? '垂直' : '水平'}参考线<input type="number" aria-label={`参考线位置 ${g.id}`} disabled={g.locked} value={g.position} onChange={e => update({ type: 'update-guide-settings', action: { type: 'move', id: g.id, position: Number(e.target.value) } })} /></label><button aria-pressed={g.locked} aria-label={`锁定参考线 ${g.id}`} onClick={() => update({ type: 'update-guide-settings', action: { type: 'lock', id: g.id, locked: !g.locked } })}>{g.locked ? '解锁' : '锁定'}</button><button disabled={g.locked} aria-label={`删除参考线 ${g.id}`} onClick={() => update({ type: 'update-guide-settings', action: { type: 'delete', id: g.id } })}>删除</button></div>)}
  </div></details>
}
