import { getTool } from '../tools/toolRegistry'
import { useEditor } from '../state/editor'
import type { ToolOptions } from '../tools/toolTypes'

type NumberOption = { key: string; label: string; min: number; max: number; defaultValue: number; unit?: string }

const size: NumberOption = { key: 'size', label: '大小', min: 1, max: 500, defaultValue: 20, unit: 'px' }
const hardness: NumberOption = { key: 'hardness', label: '硬度', min: 0, max: 100, defaultValue: 80, unit: '%' }
const opacity: NumberOption = { key: 'opacity', label: '不透明度', min: 0, max: 100, defaultValue: 100, unit: '%' }
const flow: NumberOption = { key: 'flow', label: '流量', min: 0, max: 100, defaultValue: 100, unit: '%' }
const smoothing: NumberOption = { key: 'smoothing', label: '平滑', min: 0, max: 100, defaultValue: 0, unit: '%' }
const feather: NumberOption = { key: 'feather', label: '羽化', min: 0, max: 100, defaultValue: 0, unit: 'px' }
const fontSize: NumberOption = { key: 'fontSize', label: '字号', min: 1, max: 500, defaultValue: 24, unit: 'px' }

const selectionModes = [
  { value: 'new', label: '新建', symbol: '□' },
  { value: 'add', label: '添加', symbol: '+' },
  { value: 'subtract', label: '减去', symbol: '−' },
  { value: 'intersect', label: '相交', symbol: '∩' },
] as const

function optionValue(options: ToolOptions, key: string, fallback: string): string {
  return typeof options[key] === 'string' ? options[key] as string : fallback
}

export function ToolOptionsBar({ onOpenModelManager }: { onOpenModelManager?: (kind: 'cutout' | 'upscale') => void }) {
  const { state, dispatch } = useEditor()
  const tool = getTool(state.activeToolId)
  const options = state.toolOptions
  const setOption = (key: string, value: unknown) => dispatch({ type: 'set-tool-options', options: { [key]: value } })
  const numberField = ({ key, label, min, max, defaultValue, unit }: NumberOption) => {
    const stored = options[key]
    const value = typeof stored === 'number' && Number.isFinite(stored) ? stored : defaultValue
    return <label className="tool-option-field" key={key}>
      <span>{label}</span>
      <span className="tool-option-number"><input type="number" aria-label={label} min={min} max={max} value={value} onChange={(event) => {
        const next = event.currentTarget.valueAsNumber
        if (Number.isFinite(next)) setOption(key, Math.min(max, Math.max(min, next)))
      }} />{unit ? <small>{unit}</small> : null}</span>
    </label>
  }
  const selectField = (key: string, label: string, choices: readonly { value: string; label: string }[], fallback: string) =>
    <label className="tool-option-field" key={key}><span>{label}</span><select aria-label={label} value={optionValue(options, key, fallback)} onChange={(event) => setOption(key, event.currentTarget.value)}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
  const foregroundField = <label className="tool-option-field tool-option-color"><span>颜色</span><input type="color" aria-label="前景色" value={state.brushColor} onChange={(event) => dispatch({ type: 'set-brush-color', color: event.currentTarget.value })} /></label>
  const gradientEndField = <label className="tool-option-field tool-option-color"><span>末色</span><input type="color" aria-label="渐变末色" value={optionValue(options, 'gradientEndColor', '#ffffff')} onChange={(event) => setOption('gradientEndColor', event.currentTarget.value)} /></label>

  let controls: React.ReactNode = <span className="tool-options-status">当前工具：{tool?.label ?? '选择'}</span>
  if (tool?.groupId === 'selection') {
    const mode = optionValue(options, 'selectionMode', 'new')
    controls = <>
      <div className="tool-option-modes" role="group" aria-label="选区模式">{selectionModes.map((entry) => <button key={entry.value} type="button" aria-label={`选区模式：${entry.label}`} title={entry.label} aria-pressed={mode === entry.value} onClick={() => setOption('selectionMode', entry.value)}>{entry.symbol}</button>)}</div>
      {numberField(feather)}
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'invert-selection' })} aria-label="反选选区">反选</button>
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'selection-to-mask' })} aria-label="选区创建蒙版">创建蒙版</button>
      {numberField({ key: 'selectionAdjustment', label: '选区调整量', min: .25, max: 20, defaultValue: 1, unit: '%' })}
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'morph-selection', amount: typeof options.selectionAdjustment === 'number' ? options.selectionAdjustment : 1 })} aria-label="扩展选区">扩展</button>
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'morph-selection', amount: -(typeof options.selectionAdjustment === 'number' ? options.selectionAdjustment : 1) })} aria-label="收缩选区">收缩</button>
      <label className="tool-option-check"><input type="checkbox" aria-label="固定比例" checked={options.fixedRatio === true} onChange={(event) => setOption('fixedRatio', event.currentTarget.checked)} /><span>固定比例</span></label>
      {options.fixedRatio === true ? selectField('selectionRatio', '选区比例', [{ value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }], '1:1') : null}
      {tool.id === 'magic-wand' ? numberField({ key: 'tolerance', label: '容差', min: 0, max: 255, defaultValue: 32 }) : null}
      {tool.id === 'subject-select' ? <span className="tool-options-status">主体选择需要配置云端分割服务</span> : null}
      {tool.id === 'polygon-select' || tool.id === 'bezier-select' ? <span className="tool-options-status">逐点绘制 · Enter 闭合 · Esc 取消</span> : null}
    </>
  } else if (tool?.groupId === 'brush') {
    controls = <>{[size, hardness, opacity, flow, smoothing].map(numberField)}{foregroundField}{tool.id === 'gradient-brush' ? gradientEndField : null}{tool.id === 'brush-line' ? <span className="tool-options-status">拖动绘制直线</span> : null}</>
  } else if (tool?.groupId === 'erase-heal') {
    controls = <>{[size, hardness, opacity].map(numberField)}<span className="tool-options-status">{tool.id === 'clone-stamp' ? 'Alt 点击取样，再拖动仿制' : tool.id === 'healing' ? '修复画笔需要配置云端修复服务' : '只影响当前图层'}</span></>
  } else if (tool?.groupId === 'mask') {
    controls = <>{[size, hardness, opacity].map(numberField)}{foregroundField}
      <button type="button" aria-label="反转蒙版" onClick={() => dispatch({ type: 'invert-mask' })}>反转</button>
      <button type="button" aria-label="清空蒙版" onClick={() => dispatch({ type: 'clear-mask' })}>清空</button>
      <button type="button" aria-label="应用蒙版" onClick={() => dispatch({ type: 'apply-mask' })}>应用</button>
      <span className="tool-options-status">{tool.id === 'mask-subject' ? '主体蒙版需要配置云端分割服务' : tool.id === 'mask-gradient' ? '拖动创建渐变蒙版 · 红色为遮挡区域' : '红色为遮挡区域 · 应用后可撤销'}</span>
    </>
  } else if (tool?.id === 'text') {
    controls = <>
      {selectField('fontFamily', '字体', [{ value: 'sans-serif', label: '无衬线' }, { value: 'serif', label: '衬线' }, { value: 'monospace', label: '等宽' }], 'sans-serif')}
      {numberField(fontSize)}
      {selectField('fontWeight', '字重', [{ value: '400', label: '常规' }, { value: '500', label: '中等' }, { value: '700', label: '粗体' }], '400')}
      <label className="tool-option-field tool-option-color"><span>颜色</span><input type="color" aria-label="文字颜色" value={optionValue(options, 'textColor', '#ffffff')} onChange={(event) => setOption('textColor', event.currentTarget.value)} /></label>
      {selectField('textAlign', '对齐', [{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }], 'left')}
    </>
  } else if (tool?.id === 'crop' || tool?.id === 'perspective-crop') {
    controls = selectField('cropRatio', '裁剪比例', [{ value: 'free', label: '自由' }, { value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }], 'free')
  } else if (tool?.id.startsWith('shape')) {
    controls = <>{foregroundField}{numberField(opacity)}{numberField({ key: 'shapeStrokeWidth', label: '线宽', min: 1, max: 100, defaultValue: 4, unit: 'px' })}<span className="tool-options-status">拖动绘制 · Shift 等比</span></>
  } else if (tool?.id === 'fill' || tool?.id === 'gradient-fill') {
    controls = <>{foregroundField}{tool.id === 'gradient-fill' ? gradientEndField : null}{numberField(opacity)}<span className="tool-options-status">{tool.id === 'gradient-fill' ? '拖动设定渐变方向' : '填充当前选区或图层'}</span></>
  } else if (tool?.id === 'pen') {
    controls = <span className="tool-options-status">点击添加锚点 · 拖动调整曲线 · Enter 闭合</span>
  } else if (tool?.id === 'transform') {
    controls = <span className="tool-options-status">拖动控制点变换 · Enter 确认 · Esc 取消</span>
  } else if (tool?.id === 'cutout' || tool?.id === 'upscale') {
    const kind = tool.id === 'cutout' ? 'cutout' : 'upscale'
    controls = <><span className="tool-options-status">{tool.id === 'cutout' ? '选择模型后生成透明背景图' : '选择模型后放大当前图层'}</span><button type="button" onClick={() => onOpenModelManager?.(kind)}>管理模型</button></>
  }

  return <div className="tool-options-bar" role="toolbar" aria-label="工具选项"><strong className="tool-options-name">{tool?.label ?? '选择'}</strong><div className="tool-options-controls">{controls}</div></div>
}
