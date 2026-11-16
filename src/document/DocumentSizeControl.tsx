import { useEffect, useState } from 'react'
import { useEditor } from '../state/editor'
import { dimensionError, type DocumentAnchor } from './documentGeometry'
import './documentSize.css'

const anchors: Array<[DocumentAnchor, string]> = [['top-left', '左上'], ['top', '上'], ['top-right', '右上'], ['left', '左'], ['center', '居中'], ['right', '右'], ['bottom-left', '左下'], ['bottom', '下'], ['bottom-right', '右下']]
export function DocumentSizeControl() {
  const { state, dispatch } = useEditor()
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(String(state.documentWidth)), [height, setHeight] = useState(String(state.documentHeight))
  const [mode, setMode] = useState<'canvas' | 'image' | 'new'>('canvas')
  const [anchor, setAnchor] = useState<DocumentAnchor>('center')
  const [background, setBackground] = useState(state.documentBackground)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const showNew = () => { setMode('new'); setWidth(String(state.documentWidth)); setHeight(String(state.documentHeight)); setError(null); setOpen(true) }
    window.addEventListener('draivio:new-document-dialog', showNew)
    return () => window.removeEventListener('draivio:new-document-dialog', showNew)
  }, [state.documentWidth, state.documentHeight])
  const locked = true
  const ratio = state.documentWidth / state.documentHeight
  return <>
    <button className="document-size-trigger" aria-label="文档尺寸" onClick={() => { setWidth(String(state.documentWidth)); setHeight(String(state.documentHeight)); setBackground(state.documentBackground); setError(null); setOpen(true) }}>{state.documentWidth} × {state.documentHeight} px</button>
    {open ? <div className="document-size-backdrop" onClick={() => setOpen(false)}><section className="document-size-dialog" role="dialog" aria-modal="true" aria-label="文档尺寸设置" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <h2>文档尺寸</h2><p>文档像素尺寸与 AI 模型输出尺寸分别设置。</p>
      <label>操作<select aria-label="尺寸操作" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="canvas">画布大小</option><option value="image">图像大小</option><option value="new">新建文档</option></select></label>
      {mode === 'new' ? <label>常用尺寸<select aria-label="常用文档尺寸" defaultValue="custom" onChange={(event) => { if (event.target.value !== 'custom') { const [w, h] = event.target.value.split('x'); setWidth(w); setHeight(h) } }}><option value="custom">自定义</option><option value="1024x1024">正方形 · 1024 × 1024</option><option value="1080x1350">4:5 · 1080 × 1350</option><option value="1920x1080">16:9 · 1920 × 1080</option><option value="1080x1920">9:16 · 1080 × 1920</option><option value="1200x800">3:2 · 1200 × 800</option></select></label> : null}
      <div className="document-size-fields"><label>宽度 px<input autoFocus aria-label="文档宽度" type="number" min="1" max="16384" step="1" value={width} onChange={(event) => { setWidth(event.target.value); if (mode === 'image' && locked) setHeight(String(Math.round(Number(event.target.value) / ratio))) }} /></label><label>高度 px<input aria-label="文档高度" type="number" min="1" max="16384" step="1" value={height} onChange={(event) => { setHeight(event.target.value); if (mode === 'image' && locked) setWidth(String(Math.round(Number(event.target.value) * ratio))) }} /></label></div>
      {mode === 'image' ? <p>保持原比例，缩放全部图层、文字、笔画与蒙版。</p> : null}
      {mode === 'canvas' ? <><fieldset><legend>内容锚点</legend><div className="document-anchor-grid">{anchors.map(([value, name]) => <button key={value} aria-label={`锚点${name}`} aria-pressed={anchor === value} onClick={() => setAnchor(value)}>{name}</button>)}</div></fieldset><p>{Number(width) < state.documentWidth || Number(height) < state.documentHeight ? '缩小画布将裁切超出边缘的内容；可撤销恢复。' : '扩展画布保留内容的像素大小。'}</p></> : null}
      <label>背景<select aria-label="文档背景" value={background} onChange={(event) => setBackground(event.target.value)}><option value="transparent">透明</option><option value="#ffffff">白色</option><option value="#000000">黑色</option></select></label>
      <p>单边 1–16384 px，总面积不超过 32 百万像素。导入图片可选择 Auto 跟随原图尺寸。</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="document-size-actions"><button onClick={() => setOpen(false)}>取消</button><button onClick={() => { const problem = dimensionError(Number(width), Number(height)); if (problem) return setError(problem); if (mode === 'image' && Math.abs(Number(width) / state.documentWidth - Number(height) / state.documentHeight) > Math.max(1 / state.documentWidth, 1 / state.documentHeight)) return setError('图像大小须保持原比例'); if (mode === 'new') { const request = new CustomEvent('draivio:request-new-document', { cancelable: true, detail: { width: Number(width), height: Number(height), background } }); if (window.dispatchEvent(request)) dispatch({ type: 'new-document', width: Number(width), height: Number(height), background }); } else dispatch({ type: 'resize-document', width: Number(width), height: Number(height), mode, anchor, background }); setOpen(false) }}>应用尺寸</button></div>
    </section></div> : null}
  </>
}
