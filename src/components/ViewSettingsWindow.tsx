import type { RefObject } from 'react'
import { useEditor } from '../state/editor'
import { AnchoredWindow } from '../ui/AnchoredWindow'
import { NumericScrubber } from './NumericScrubber'
import { LayerDeleteIcon, LayerLockIcon } from './LayerIcons'
import type { GuideAction } from '../document/guides'

export function ViewSettingsWindow({ anchor, onClose }: { anchor: RefObject<HTMLElement | null>; onClose: () => void }) {
  const { state, dispatch } = useEditor()
  const settings = state.guideSettings
  const update = (action: GuideAction) => dispatch({ type: 'update-guide-settings', action })
  const add = (axis: 'x' | 'y') => {
    if (!settings.guidesVisible) update({ type: 'settings', patch: { guidesVisible: true } })
    update({ type: 'add', guide: { id: crypto.randomUUID(), axis, position: (axis === 'x' ? state.documentWidth : state.documentHeight) / 2, locked: false } })
  }
  return <AnchoredWindow anchor={anchor} title="参考线与网格" onClose={onClose} width={340} placement="above" className="canvas-view-settings">
    <div className="canvas-view-settings-body">
      <section aria-label="网格设置" className="canvas-view-settings-section">
        <h3>网格<span>px</span></h3>
        <div className="canvas-view-grid-fields">{(['spacingX', 'spacingY'] as const).map(key => <NumericScrubber key={key} label={key === 'spacingX' ? '横向间距' : '纵向间距'} min={1} max={1e9} value={settings.grid[key]} onChange={value => update({ type: 'settings', patch: { grid: { ...settings.grid, [key]: value } } })} />)}</div>
      </section>
      <section aria-label="参考线设置" className="canvas-view-settings-section">
        <h3>参考线<span>{settings.guides.length} 条 · px</span></h3>
        <div className="canvas-view-guide-actions"><button type="button" aria-label="新增垂直参考线" onClick={() => add('x')}>＋ 垂直</button><button type="button" aria-label="新增水平参考线" onClick={() => add('y')}>＋ 水平</button></div>
        {!settings.guides.length ? <p className="canvas-view-empty">从标尺拖出参考线，或点击上方添加。</p> : <div className="canvas-view-guide-list">{settings.guides.map(guide => <div key={guide.id} className="canvas-view-guide-row">
          <NumericScrubber label={guide.axis === 'x' ? '垂直' : '水平'} ariaLabel={`参考线位置 ${guide.id}`} min={-1e9} max={1e9} step={.5} value={guide.position} disabled={guide.locked} onChange={position => update({ type: 'move', id: guide.id, position })} />
          <button type="button" className="canvas-view-guide-icon" aria-label={`${guide.locked ? '解锁' : '锁定'}参考线 ${guide.id}`} title={guide.locked ? '解锁参考线' : '锁定参考线'} aria-pressed={guide.locked} onClick={() => update({ type: 'lock', id: guide.id, locked: !guide.locked })}><LayerLockIcon locked={guide.locked} /></button>
          <button type="button" className="canvas-view-guide-icon" aria-label={`删除参考线 ${guide.id}`} title="删除参考线" disabled={guide.locked} onClick={() => update({ type: 'delete', id: guide.id })}><LayerDeleteIcon /></button>
        </div>)}</div>}
      </section>
    </div>
  </AnchoredWindow>
}
