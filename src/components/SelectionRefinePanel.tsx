import { useDraggableDialog } from '../ui/useDraggableDialog'
import { useRef, useState } from 'react'
import { morphSelection, type Selection } from '../canvas/selectionGeometry'

export type SelectionRefinePreviewMode = 'overlay' | 'black' | 'white' | 'transparent'
export type SelectionRefineBrushMode = 'add' | 'subtract'
export type SelectionRefineOutput = 'selection' | 'mask'
export type SelectionRefineParameters = { smooth: number; shift: number; feather: number; density: number; decontaminate: number; colorCorrection: boolean }

type Props = {
  selection: Selection
  previewMode: SelectionRefinePreviewMode
  brushMode: SelectionRefineBrushMode
  brushSize: number
  documentWidth: number
  documentHeight: number
  onSelectionChange: (selection: Selection) => void
  onPreviewModeChange: (mode: SelectionRefinePreviewMode) => void
  onBrushModeChange: (mode: SelectionRefineBrushMode) => void
  onBrushSizeChange: (size: number) => void
  onApply: (selection: Selection, output: SelectionRefineOutput, parameters?: SelectionRefineParameters) => void
  onCancel: () => void
  processing?: boolean
}

const previews: { value: SelectionRefinePreviewMode; label: string; swatch: string }[] = [
  { value: 'overlay', label: '叠加预览', swatch: 'rgba(255,118,95,.45)' },
  { value: 'black', label: '黑底预览', swatch: '#090b0f' },
  { value: 'white', label: '白底预览', swatch: '#f5f3ef' },
  { value: 'transparent', label: '透明预览', swatch: 'repeating-conic-gradient(#aeb5bd 0 25%, #5c646e 0 50%) 50% / 10px 10px' },
]

/** Compact Photoshop-like selection refinement workspace. The canvas owns the actual brush gesture. */
export function SelectionRefinePanel({ selection, previewMode, brushMode, brushSize, documentWidth, documentHeight, onSelectionChange, onPreviewModeChange, onBrushModeChange, onBrushSizeChange, onApply, onCancel, processing = false }: Props) {
  const root = useRef<HTMLElement>(null)
  const draggable = useDraggableDialog(root)
  const [output, setOutput] = useState<SelectionRefineOutput>('selection')
  const [parameters, setParameters] = useState<SelectionRefineParameters>({ smooth: 0, shift: 0, feather: 0, density: 100, decontaminate: 0, colorCorrection: true })
  const valid = selection.rect.width > 0 && selection.rect.height > 0
  const changeFeather = (value: number) => onSelectionChange({ ...selection, feather: Math.min(100, Math.max(0, value)) })
  const morph = (amount: number) => onSelectionChange(morphSelection(selection, amount, documentWidth, documentHeight))

  return <aside ref={root} style={draggable.style} onPointerDown={draggable.onPointerDown} className="selection-refine-panel" aria-label="选择并遮住工作区">
    <header className="selection-refine-header dialog-titlebar">
      <div>
        <span className="selection-refine-eyebrow">选区精修</span>
        <h2>选择并遮住</h2>
      </div>
      <button type="button" className="selection-refine-close" aria-label="关闭选择并遮住" onClick={onCancel}>×</button>
    </header>

    <main className="selection-refine-main">
      <section className="selection-refine-section" aria-labelledby="selection-refine-preview-title">
        <div className="selection-refine-section-heading"><h3 id="selection-refine-preview-title">预览</h3><span>选区外区域</span></div>
        <div className="selection-refine-preview-grid" role="group" aria-label="预览模式">
          {previews.map((item) => <button key={item.value} type="button" aria-label={item.label} aria-pressed={previewMode === item.value} onClick={() => onPreviewModeChange(item.value)}>
            <span className="selection-refine-preview-swatch" style={{ background: item.swatch }} />
            <span>{item.label.replace('预览', '')}</span>
          </button>)}
        </div>
      </section>

      <section className="selection-refine-section" aria-labelledby="selection-refine-edge-title">
        <div className="selection-refine-section-heading"><h3 id="selection-refine-edge-title">边缘精修</h3><span>在画布上涂抹</span></div>
        <div className="selection-refine-segmented" role="group" aria-label="边缘精修模式">
          <button type="button" aria-label="增加选区" aria-pressed={brushMode === 'add'} onClick={() => onBrushModeChange('add')}>＋ 增加</button>
          <button type="button" aria-label="减去选区" aria-pressed={brushMode === 'subtract'} onClick={() => onBrushModeChange('subtract')}>− 减去</button>
        </div>
        <label className="selection-refine-range"><span>画笔大小 <output>{Math.round(brushSize)} px</output></span><input type="range" aria-label="画笔大小" min="4" max="500" step="1" value={brushSize} onChange={(event) => onBrushSizeChange(Number(event.currentTarget.value))} /></label>
        <p className="selection-refine-help">拖动画布即可增加或减去选区，按住 Shift 可临时切换为相反模式。</p>
      </section>

      <section className="selection-refine-section" aria-labelledby="selection-refine-softness-title">
        <div className="selection-refine-section-heading"><h3 id="selection-refine-softness-title">边缘属性</h3><span>非破坏调整</span></div>
        <label className="selection-refine-range"><span>羽化 <output>{Math.round(selection.feather)} px</output></span><input type="range" aria-label="羽化" min="0" max="100" step="1" value={selection.feather} onChange={(event) => changeFeather(Number(event.currentTarget.value))} /></label>
        <div className="selection-refine-morph"><span>边缘</span><button type="button" aria-label="收缩选区" onClick={() => morph(-1)}>收缩</button><button type="button" aria-label="扩展选区" onClick={() => morph(1)}>扩展</button></div>
        <label className="selection-refine-range"><span>平滑 <output>{parameters.smooth} px</output></span><input type="range" aria-label="平滑" min="0" max="20" value={parameters.smooth} onChange={e => setParameters({ ...parameters, smooth: Number(e.currentTarget.value) })} /></label>
        <label className="selection-refine-range"><span>密度 <output>{parameters.density}%</output></span><input type="range" aria-label="密度" min="0" max="200" value={parameters.density} onChange={e => setParameters({ ...parameters, density: Number(e.currentTarget.value) })} /></label>
        <label className="selection-refine-range"><span>去杂边 <output>{parameters.decontaminate}%</output></span><input type="range" aria-label="去杂边" min="0" max="100" value={parameters.decontaminate} onChange={e => setParameters({ ...parameters, decontaminate: Number(e.currentTarget.value) })} /></label>
        <label className="selection-refine-radio"><input type="checkbox" checked={parameters.colorCorrection} onChange={e => setParameters({ ...parameters, colorCorrection: e.currentTarget.checked })} /><span>启用颜色修正</span></label>
      </section>

      <section className="selection-refine-section" aria-labelledby="selection-refine-output-title">
        <div className="selection-refine-section-heading"><h3 id="selection-refine-output-title">输出</h3><span>应用结果</span></div>
        <label className="selection-refine-radio"><input aria-label="更新选区" type="radio" name="selection-refine-output" value="selection" checked={output === 'selection'} onChange={() => setOutput('selection')} /><span>更新选区</span><small>保留为可编辑选区</small></label>
        <label className="selection-refine-radio"><input aria-label="输出为图层蒙版" type="radio" name="selection-refine-output" value="mask" checked={output === 'mask'} onChange={() => setOutput('mask')} /><span>输出为图层蒙版</span><small>创建蒙版，之后仍可调整</small></label>
      </section>
    </main>

    <footer className="selection-refine-footer">
      <span className="selection-refine-status">{valid ? '选区已保留，可继续精修' : '请先创建有效选区'}</span>
      {processing ? <p role="status">正在生成低清预览并计算高清结果，可取消…</p> : null}<div><button type="button" className="selection-refine-cancel" onClick={onCancel}>取消</button><button type="button" className="selection-refine-apply" disabled={!valid || processing} onClick={() => onApply(selection, output, parameters)}>应用</button></div>
    </footer>
  </aside>
}
