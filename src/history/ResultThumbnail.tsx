import { CanvasScene } from '../canvas/CanvasScene'
import type { EditorState, HistoryItem } from '../state/editor'

export function ResultThumbnail({ item, state, active, onClick }: { item: HistoryItem; state?: EditorState; active: boolean; onClick: () => void }) {
  return <button className={`history-item ${active ? 'active' : ''}`} aria-pressed={active} onClick={onClick}>
    <span className="history-image" style={{ position: 'relative', display: 'block', overflow: 'hidden' }}>{item.snapshot && state ? <CanvasScene thumbnail state={{ ...state, ...item.snapshot }} /> : null}</span>
    <span className="history-label">{item.label}</span>
  </button>
}
