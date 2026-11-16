import { useMemo, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CanvasScene } from '../canvas/CanvasScene'
import { artboardExportTargets } from '../canvas/artboards'
import { editorReducer, useEditor, type EditorState } from '../state/editor'
import { exportSvgImage } from '../render/exportImage'
import { FloatingSurface } from '../ui/FloatingSurface'

export function ArtboardControls() {
  const { state, dispatch } = useEditor()
  const active = state.artboards.find(board => board.id === state.activeArtboardId) ?? state.artboards[0]
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(1080), [height, setHeight] = useState(1080)
  const [format, setFormat] = useState<'png'|'svg'>('png')
  const [exporting, setExporting] = useState(false)
  const [mode, setMode] = useState<'scale'|'crop'>('scale')
  const valid = Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 16384 && height <= 16384
  const preview = useMemo(() => !open || !valid || !active ? null : editorReducer(state, { type: 'duplicate-artboard', sourceId: active.id, id: 'board-preview', name: '复制预览', width, height, mode }), [open, valid, active, state, width, height, mode])
  const download = async (all: boolean) => {
    setExporting(true)
    try {
    const boards = artboardExportTargets(all ? state.artboards : active ? [active] : [])
    for (const board of boards) {
      const model = state.artboards.find(item => item.id === board.id)!
      const local: EditorState = { ...state, activeArtboardId: model.id, documentWidth: model.width, documentHeight: model.height, documentBackground: model.background }
      const source = renderToStaticMarkup(<CanvasScene state={local} thumbnail />)
      const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
      doc.documentElement.setAttribute('width', String(model.width)); doc.documentElement.setAttribute('height', String(model.height))
      const serialized = new XMLSerializer().serializeToString(doc.documentElement)
      const blob = format === 'svg' ? new Blob([serialized], { type: 'image/svg+xml' }) : await exportSvgImage(serialized, { format: 'png', width: model.width, height: model.height, profile: state.colorManagement.profile, renderingIntent: state.colorManagement.renderingIntent })
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href = url; link.download = `${board.name}.${format}`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
    }
    dispatch({ type: 'set-notice', message: `已导出 ${boards.length} 个 ${format.toUpperCase()} 画板` })
    } catch (error) { dispatch({ type: 'set-notice', message: `画板导出失败：${error instanceof Error ? error.message : '未知错误'}` }) } finally { setExporting(false) }
  }
  return <><select aria-label="当前画板" value={state.activeArtboardId ?? ''} onChange={event => dispatch({ type: 'set-active-artboard', id: event.target.value })}>{state.artboards.map(board => <option key={board.id} value={board.id}>{board.name}（{board.width}×{board.height}）</option>)}</select><button className="top-button" onClick={() => dispatch({ type: 'add-artboard', board: { id: crypto.randomUUID(), name: `画板 ${state.artboards.length+1}`, x: (active?.x ?? 0)+(active?.width ?? 500)+32, y: active?.y ?? 0, width: active?.width ?? 500, height: active?.height ?? 625, background: 'transparent', layerIds: [] } })}>新建画板</button><button className="top-button" onClick={() => setOpen(true)}>复制规格</button><details><summary>画板管理</summary>{active ? <form key={active.id + active.name + active.x + active.y} onSubmit={event => { event.preventDefault(); const fields = new FormData(event.currentTarget); dispatch({ type: 'update-artboard', id: active.id, name: String(fields.get('name')), x: Number(fields.get('x')), y: Number(fields.get('y')) }) }}><label>名称<input name="name" aria-label="画板名称" defaultValue={active.name}/></label><label>X<input name="x" type="number" aria-label="画板位置X" defaultValue={active.x}/></label><label>Y<input name="y" type="number" aria-label="画板位置Y" defaultValue={active.y}/></label><button>更新画板</button><button type="button" onClick={() => dispatch({ type: 'reorder-artboard', id: active.id, direction: 'up' })}>画板前移</button><button type="button" onClick={() => dispatch({ type: 'reorder-artboard', id: active.id, direction: 'down' })}>画板后移</button></form> : null}</details><button className="top-button" disabled={state.artboards.length <= 1} onClick={() => active && dispatch({ type: 'remove-artboard', id: active.id })}>删除画板</button><select aria-label="画板导出格式" value={format} onChange={e => setFormat(e.target.value as typeof format)}><option value="png">PNG</option><option value="svg">SVG</option></select><button className="top-button" disabled={exporting} onClick={() => void download(false)}>导出当前画板</button><button className="top-button" disabled={exporting} onClick={() => void download(true)}>导出全部画板</button>{open ? <FloatingSurface role="dialog" aria-label="画板规格复制" title="画板规格复制" onClose={() => setOpen(false)}><label>宽度<input aria-label="复制画板宽度" type="number" value={width} onChange={e => setWidth(Number(e.target.value))}/></label><label>高度<input aria-label="复制画板高度" type="number" value={height} onChange={e => setHeight(Number(e.target.value))}/></label><select aria-label="复制画板模式" value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="scale">等比缩放并居中</option><option value="crop">保持对象尺寸并裁切</option></select>{preview ? <div aria-label="画板复制视觉预览" style={{ width: 240, height: 240, overflow: 'hidden', background: '#ddd' }}><CanvasScene state={preview} thumbnail /></div> : <p role="alert">尺寸需为 1–16384 像素整数</p>}<p>复制后独立编辑；超出画板内容仍保留，可撤销。</p><button disabled={!valid || !active} onClick={() => { if (active) dispatch({ type: 'duplicate-artboard', sourceId: active.id, id: crypto.randomUUID(), name: `${active.name} ${width}×${height}`, width, height, mode }); setOpen(false) }}>确认复制</button><button onClick={() => setOpen(false)}>取消</button></FloatingSurface> : null}</>
}
