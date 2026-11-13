import type { HistoryItem } from '../state/editor'

export function ResultThumbnail({ item, active, onClick }: { item: HistoryItem; active: boolean; onClick: () => void }) { return <button className={`history-item ${active ? 'active' : ''}`} onClick={onClick}><span className={`history-image tone-${item.tone}`} /><span className="history-label">{item.label}</span></button> }
