import { createPortal } from 'react-dom'
import { useTransformToolbarTarget } from './TransformToolbar'
import { useRef } from 'react'
import { createSelection, moveSelection, type SelectionRect, type SelectionPoint } from './selectionGeometry'
import { resizeTransformRect } from './transformGeometry'
import { NumericScrubber } from '../components/NumericScrubber'
import type { SnapHits } from '../document/snapping'
import { AnchoredWindow } from '../ui/AnchoredWindow'

export type TransformDraft = { kind: 'crop' | 'transform'; rect: SelectionRect; rotation: number; flipX: boolean; flipY: boolean; affine?: [number, number, number, number, number, number] }
type Props = { draft: TransformDraft; interactive?: boolean; onChange: (draft: TransformDraft) => void; onCommit: () => void; onCancel: () => void; toPoint: (x: number, y: number) => SelectionPoint; artboardRatio?: number; onGestureEnd?: () => void; snapDraft?: (draft: TransformDraft, handle: string, altKey: boolean, previous?: SnapHits) => { draft: TransformDraft; hits: SnapHits } }

export function TransformOverlay({ draft, interactive = true, onChange, onCommit, onCancel, toPoint, artboardRatio = .8, snapDraft, onGestureEnd }: Props) {
  const toolbarTarget = useTransformToolbarTarget()
  const actionAnchor = useRef<HTMLSpanElement>(null)
  const drag = useRef<{ handle: string; start: SelectionPoint; draft: TransformDraft; hits?: SnapHits } | null>(null)
  const down = (handle: string) => (event: React.PointerEvent<HTMLButtonElement | HTMLDivElement>) => {
    event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { handle, start: toPoint(event.clientX, event.clientY), draft }
  }
  const move = (event: React.PointerEvent) => {
    const start = drag.current
    if (!start) return
    const point = toPoint(event.clientX, event.clientY)
    const delta = { x: point.x - start.start.x, y: point.y - start.start.y }
    const selection = createSelection('rectangle', start.draft.rect)
    let rect = start.handle === 'move' ? start.draft.kind === 'crop'
      ? moveSelection(selection, delta.x, delta.y).rect
      : { ...start.draft.rect, x: start.draft.rect.x + delta.x, y: start.draft.rect.y + delta.y }
      : resizeTransformRect(start.draft.rect, start.handle, delta, start.draft.rotation, event.shiftKey, artboardRatio)
    if (snapDraft && start.draft.kind !== 'crop') { const result = snapDraft({ ...start.draft, rect }, start.handle, event.altKey, start.hits); start.hits = result.hits; onChange(result.draft); return }
    onChange({ ...start.draft, rect })
  }
  const up = () => { drag.current = null; onGestureEnd?.() }
  const rect = draft.rect
  const controls = (
    <div className="transform-actions" role="toolbar" aria-label="变换操作">
      <div className="transform-control-row">
      <NumericScrubber className="transform-number-field" label="旋转" ariaLabel="变换旋转角度" value={draft.rotation} min={-180} max={180} unit="°" onChange={(rotation) => onChange({ ...draft, rotation })} />
      <button type="button" aria-label="水平翻转" aria-pressed={draft.flipX} title="水平翻转" onClick={() => onChange({ ...draft, flipX: !draft.flipX })}>↔</button>
      <button type="button" aria-label="垂直翻转" aria-pressed={draft.flipY} title="垂直翻转" onClick={() => onChange({ ...draft, flipY: !draft.flipY })}>↕</button>
      </div><div className="transform-decision-row">
      <button type="button" aria-label="确认变换" onClick={onCommit}>确认 ↵</button>
      <button type="button" aria-label="取消变换" onClick={onCancel}>取消 Esc</button>
      </div>
    </div>
  )
  return <>
    <div className={`transform-overlay ${draft.kind}`} aria-label={draft.kind === 'crop' ? '裁剪边框' : '自由变换边框'} style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.width}%`, height: `${rect.height}%`, transform: `${draft.affine ? `matrix(${draft.affine.join(', ')}) ` : ''}rotate(${draft.rotation}deg)` }}>
      {interactive ? <><div className="transform-move" aria-label="移动变换区域" onPointerDown={down('move')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((handle) => <button type="button" key={handle} className={`selection-handle handle-${handle}`} aria-label={`变换控制点${handle}`} onPointerDown={down(handle)} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />)}</> : null}
    </div>
    {interactive && draft.kind === 'crop' ? <><span ref={actionAnchor} aria-hidden="true" style={{position:'absolute',left:'50%',top:0,pointerEvents:'none'}} />
    <AnchoredWindow anchor={actionAnchor} title={draft.kind === 'crop' ? '裁剪' : '自由变换'} label="变换参数" onClose={onCancel} width={330} className="transform-window">
      {controls}
    </AnchoredWindow></> : null}
    {interactive && draft.kind === 'transform' ? toolbarTarget ? createPortal(controls, toolbarTarget) : controls : null}
  </>
}
