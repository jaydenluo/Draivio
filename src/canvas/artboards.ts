export type Artboard = { id: string; name: string; x: number; y: number; width: number; height: number; background: string; layerIds: string[] }
export type ArtboardState = { artboards: Artboard[]; activeId: string | null }
export type ArtboardAction =
  | { type: 'add'; board: Artboard }
  | { type: 'remove'; id: string }
  | { type: 'move'; id: string; x: number; y: number }
  | { type: 'move-layer'; layerId: string; from: string; to: string }

export function validateArtboard(board: Artboard): Artboard {
  if (!board.id || !board.name || !Number.isInteger(board.width) || !Number.isInteger(board.height) || board.width < 1 || board.height < 1) throw new Error('画板尺寸或标识无效')
  if (![board.x, board.y].every(Number.isFinite) || !Array.isArray(board.layerIds) || new Set(board.layerIds).size !== board.layerIds.length) throw new Error('画板坐标或图层列表无效')
  return { ...board, layerIds: [...board.layerIds] }
}
export function artboardReducer(state: ArtboardState, action: ArtboardAction): ArtboardState {
  if (action.type === 'add') { const board = validateArtboard(action.board); if (state.artboards.some(b => b.id === board.id)) throw new Error('画板 ID 重复'); return { artboards: [...state.artboards, board], activeId: board.id } }
  if (action.type === 'remove') { const artboards = state.artboards.filter(b => b.id !== action.id); if (artboards.length === state.artboards.length) return state; return { artboards, activeId: state.activeId === action.id ? (artboards[0]?.id ?? null) : state.activeId } }
  if (action.type === 'move') return { ...state, artboards: state.artboards.map(b => b.id === action.id ? { ...b, x: action.x, y: action.y } : b) }
  const from = state.artboards.find(b => b.id === action.from), to = state.artboards.find(b => b.id === action.to); if (!from || !to || !from.layerIds.includes(action.layerId)) return state
  return { ...state, artboards: state.artboards.map(b => b.id === action.from ? { ...b, layerIds: b.layerIds.filter(id => id !== action.layerId) } : b.id === action.to ? { ...b, layerIds: b.layerIds.includes(action.layerId) ? b.layerIds : [...b.layerIds, action.layerId] } : b) }
}
export function duplicateArtboard(board: Artboard, id: string, name: string, width: number, height: number, mode: 'scale' | 'crop'): Artboard {
  return validateArtboard({ id, name: `${name} · ${mode === 'scale' ? '等比缩放' : '裁切预览'}`, x: board.x + board.width + 32, y: board.y, width, height, background: board.background, layerIds: [...board.layerIds] })
}
export function artboardCopyPreview(source: Pick<Artboard, 'width'|'height'>, width: number, height: number, mode: 'scale'|'crop') {
  const scale = mode === 'scale' ? Math.min(width / source.width, height / source.height) : 1
  return { mode, scale, offsetX: (width - source.width * scale) / 2, offsetY: (height - source.height * scale) / 2, clipped: mode === 'crop' || scale !== 1 }
}
export function uniqueArtboardNames(boards: readonly Artboard[]): Artboard[] {
  const used = new Set<string>()
  return boards.map(board => {
    const base = board.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '') || '画板'
    let name = base, n = 2
    while (used.has(name.toLocaleLowerCase())) name = `${base}-${n++}`
    used.add(name.toLocaleLowerCase())
    return { ...board, name }
  })
}

export type ArtboardExportTarget = { id: string; name: string; width: number; height: number; x: number; y: number }
export function artboardExportTargets(boards: readonly Artboard[]): ArtboardExportTarget[] {
  return uniqueArtboardNames(boards).map(({ id, name, width, height, x, y }) => ({ id, name, width, height, x, y }))
}
export function exportArtboardSvg(source: string, board: Pick<Artboard, 'width'|'height'|'layerIds'>): string {
  const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
  const svg = doc.documentElement
  svg.setAttribute('width', String(board.width)); svg.setAttribute('height', String(board.height)); svg.setAttribute('viewBox', `0 0 ${board.width} ${board.height}`)
  const allowed = new Set(board.layerIds)
  svg.querySelectorAll('[data-layer-id]').forEach(node => { if (!allowed.has(node.getAttribute('data-layer-id') ?? '')) node.remove() })
  svg.querySelector('[data-artboard-overlay]')?.remove()
  return new XMLSerializer().serializeToString(svg)
}
