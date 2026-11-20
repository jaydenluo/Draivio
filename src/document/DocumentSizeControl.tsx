import { useCommandHandler } from '../commands/useCommandHandler'
import { createPortal } from 'react-dom'
import { DialogTitlebar } from '../ui/DialogTitlebar'
import { defaultProfile, makeProfile, type IccProfile, type ColorProfileId, type RenderingIntent } from '../color/iccPipeline'
import { useRef, useState } from 'react'
import { useEditor } from '../state/editor'
import { useDocumentWorkspace } from './DocumentWorkspaceProvider'
import { dimensionError, type DocumentAnchor } from './documentGeometry'
import './documentSize.css'
import { useDraggableDialog } from '../ui/useDraggableDialog'

const anchors: Array<[DocumentAnchor, string]> = [['top-left', '左上'], ['top', '上'], ['top-right', '右上'], ['left', '左'], ['center', '居中'], ['right', '右'], ['bottom-left', '左下'], ['bottom', '下'], ['bottom-right', '右下']]
export function DocumentSizeControl() {
  const { state, dispatch } = useEditor()
  const { newDocument } = useDocumentWorkspace()
  const [open, setOpen] = useState(false)
  const [width, setWidth] = useState(String(state.documentWidth)), [height, setHeight] = useState(String(state.documentHeight))
  const [mode, setMode] = useState<'canvas' | 'image' | 'new'>('canvas')
  const [anchor, setAnchor] = useState<DocumentAnchor>('center')
  const [background, setBackground] = useState(state.documentBackground)
  const [profileId, setProfileId] = useState<ColorProfileId>(state.colorManagement.profile.id)
  const [pixelFormat, setPixelFormat] = useState<'rgba8' | 'rgba16' | 'rgba32f'>(state.pixelFormat)
  const [customProfile, setCustomProfile] = useState<IccProfile | null>(null)
  const [intent, setIntent] = useState<RenderingIntent>(state.colorManagement.renderingIntent)
  const [error, setError] = useState<string | null>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const draggable = useDraggableDialog(dialogRef, open)
  const locked = true
  const ratio = state.documentWidth / state.documentHeight
 const openDialog=() => { setMode('image'); setWidth(String(state.documentWidth)); setHeight(String(state.documentHeight)); setBackground(state.documentBackground); setProfileId(state.colorManagement.profile.id); setCustomProfile(state.colorManagement.profile.id === 'custom' ? state.colorManagement.profile : null); setIntent(state.colorManagement.renderingIntent); setPixelFormat(state.pixelFormat); setError(null); setOpen(true) }
 useCommandHandler('size',openDialog)
 useCommandHandler('canvasSize',()=>{openDialog();setMode('canvas')})
  return <>
    <button className="document-size-trigger" aria-label="文档尺寸" onClick={()=>{openDialog();setMode('canvas')}}>{state.documentWidth} × {state.documentHeight} px</button>
    {open ? createPortal(<div className="document-size-backdrop" onClick={() => setOpen(false)}><section ref={dialogRef} style={draggable.style} onPointerDown={draggable.onPointerDown} className="document-size-dialog" role="dialog" aria-modal="true" aria-label="文档尺寸设置" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false) }}>
      <DialogTitlebar title="文档尺寸" closeLabel="关闭文档尺寸设置" onClose={() => setOpen(false)} /><p>文档像素尺寸与 AI 模型输出尺寸分别设置。</p>
      <label>操作<select aria-label="尺寸操作" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="canvas">画布大小</option><option value="image">图像大小</option><option value="new">新建文档</option></select></label>
      {mode === 'new' ? <label>常用尺寸<select aria-label="常用文档尺寸" defaultValue="custom" onChange={(event) => { if (event.target.value !== 'custom') { const [w, h] = event.target.value.split('x'); setWidth(w); setHeight(h) } }}><option value="custom">自定义</option><option value="1024x1024">正方形 · 1024 × 1024</option><option value="1080x1350">4:5 · 1080 × 1350</option><option value="1920x1080">16:9 · 1920 × 1080</option><option value="1080x1920">9:16 · 1080 × 1920</option><option value="1200x800">3:2 · 1200 × 800</option></select></label> : null}
      <div className="document-size-fields"><label>宽度 px<input autoFocus aria-label="文档宽度" type="number" min="1" max="16384" step="1" value={width} onChange={(event) => { setWidth(event.target.value); if (mode === 'image' && locked) setHeight(String(Math.round(Number(event.target.value) / ratio))) }} /></label><label>高度 px<input aria-label="文档高度" type="number" min="1" max="16384" step="1" value={height} onChange={(event) => { setHeight(event.target.value); if (mode === 'image' && locked) setWidth(String(Math.round(Number(event.target.value) * ratio))) }} /></label></div>
      {mode === 'image' ? <p>保持原比例，缩放全部图层、文字、笔画与蒙版。</p> : null}
      {mode === 'canvas' ? <><fieldset><legend>内容锚点</legend><div className="document-anchor-grid">{anchors.map(([value, name]) => <button key={value} aria-label={`锚点${name}`} aria-pressed={anchor === value} onClick={() => setAnchor(value)}>{name}</button>)}</div></fieldset><p>{Number(width) < state.documentWidth || Number(height) < state.documentHeight ? '缩小画布将裁切超出边缘的内容；可撤销恢复。' : '扩展画布保留内容的像素大小。'}</p></> : null}
      <label>背景<select aria-label="文档背景" value={background} onChange={(event) => setBackground(event.target.value)}><option value="transparent">透明</option><option value="#ffffff">白色</option><option value="#000000">黑色</option></select></label>
      <label>文档色彩空间<select aria-label="文档色彩空间" value={profileId} onChange={e => setProfileId(e.target.value as ColorProfileId)}><option value="srgb">sRGB</option><option value="display-p3">Display P3</option>{profileId === 'custom' ? <option value="custom">自定义 ICC（保留配置文件）</option> : null}</select></label>
      <label>加载 RGB ICC<input aria-label="加载 RGB ICC" type="file" accept=".icc,.icm" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{if(file.size>4*1024*1024)throw new Error('ICC 配置文件过大（最大 4MB）');const p=makeProfile('custom',new Uint8Array(await file.arrayBuffer()),'user');setCustomProfile({...p,name:file.name});setProfileId('custom');setError(null)}catch(error){setError(error instanceof Error?error.message:'ICC 读取失败')}}}/></label>
      <label>渲染意图<select aria-label="渲染意图" value={intent} onChange={e => setIntent(e.target.value as RenderingIntent)}><option value="relative-colorimetric">相对比色</option><option value="perceptual">感知</option><option value="saturation">饱和度</option><option value="absolute-colorimetric">绝对比色</option></select></label>
      <label>文档位深<select aria-label="文档位深" value={pixelFormat} onChange={e => setPixelFormat(e.target.value as typeof pixelFormat)}><option value="rgba8">8 位 RGBA（浏览器可导出）</option><option value="rgba16">16 位 RGBA（需桌面编解码器）</option><option value="rgba32f">32 位浮点（需 OpenEXR 编解码器）</option></select></label>
      <p>当前位深：{pixelFormat === 'rgba8' ? '8 位' : pixelFormat === 'rgba16' ? '16 位（当前浏览器导出不可用，源数据保留）' : '32 位浮点（当前浏览器导出不可用，源数据保留）'}</p>
      <p>当前：{state.colorManagement.profile.name}。工作画面由浏览器按嵌入 ICC 显示到 sRGB；文档色彩空间决定默认输出空间，导出执行一次转换。自定义 RGB ICC 和绝对比色转换需要桌面原生色彩引擎。</p>
      <p>单边 1–16384 px，总面积不超过 32 百万像素。导入图片可选择 Auto 跟随原图尺寸。</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="document-size-actions"><button onClick={() => setOpen(false)}>取消</button><button onClick={() => { const problem = dimensionError(Number(width), Number(height)); if (problem) return setError(problem); if (mode === 'image' && Math.abs(Number(width) / state.documentWidth - Number(height) / state.documentHeight) > Math.max(1 / state.documentWidth, 1 / state.documentHeight)) return setError('图像大小须保持原比例'); if (mode === 'new') newDocument({ width: Number(width), height: Number(height), background, colorManagement: { profile: profileId === 'custom' ? customProfile ?? state.colorManagement.profile : defaultProfile(profileId), renderingIntent: intent } }); else dispatch({ type: 'resize-document', width: Number(width), height: Number(height), mode, anchor, background }); if (mode !== 'new') dispatch({ type: 'set-color-management', settings: { profile: profileId === 'custom' ? customProfile ?? state.colorManagement.profile : defaultProfile(profileId), renderingIntent: intent } }); dispatch({ type: 'set-pixel-format', format: pixelFormat }); setOpen(false) }}>应用尺寸</button></div>
    </section></div>, document.body) : null}
  </>
}
