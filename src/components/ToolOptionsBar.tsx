import { ShapeDefaults } from './ShapeDefaults'
import { ObjectProperties } from './ObjectProperties'
import { selectedObjects } from '../canvas/objectProperties'
import { ToolHelp } from './ToolHelp'
import { TransformToolbarSlot } from '../canvas/TransformToolbar'
import { Checkbox } from '../ui/Checkbox'
import { executeEditorCommand } from '../commands/editorCommands'
import { OutpaintButton } from '../ai/outpaint/OutpaintDialog'
import { SEMANTIC_SELECTION_EVENT } from '../ai/vision/SemanticSelectionWorkspace'
import { TonalBrushOptions } from '../retouch/TonalBrushOptions'
import { getTool } from '../tools/toolRegistry'
import { useEditor } from '../state/editor'
import type { ToolOptions } from '../tools/toolTypes'
import { supportsLocalModels } from '../models/modelApi'
import { useEffect, useRef, useState } from 'react'
import { detectSystemFonts, fontChoices as systemFontChoices } from '../text/systemFonts'
import { NumericScrubber } from './NumericScrubber'
import { SelectionModeIcon } from './SelectionModeIcon'
import { ColorPicker } from './ColorPicker'
import { AlignmentControls } from './AlignmentControls'
import { VectorEditor } from '../vector/VectorEditor'

type NumberOption = { key: string; label: string; min: number; max: number; defaultValue: number; unit?: string }

const size: NumberOption = { key: 'size', label: '大小', min: 1, max: 500, defaultValue: 20, unit: 'px' }
const hardness: NumberOption = { key: 'hardness', label: '硬度', min: 0, max: 100, defaultValue: 80, unit: '%' }
const opacity: NumberOption = { key: 'opacity', label: '不透明度', min: 0, max: 100, defaultValue: 100, unit: '%' }
const flow: NumberOption = { key: 'flow', label: '流量', min: 0, max: 100, defaultValue: 100, unit: '%' }
const smoothing: NumberOption = { key: 'smoothing', label: '平滑', min: 0, max: 100, defaultValue: 0, unit: '%' }
const feather: NumberOption = { key: 'feather', label: '羽化', min: 0, max: 100, defaultValue: 0, unit: 'px' }
const fontSize: NumberOption = { key: 'fontSize', label: '字号', min: 1, max: 500, defaultValue: 24, unit: 'px' }

const selectionModes = [
  { value: 'new', label: '新建' },
  { value: 'add', label: '添加' },
  { value: 'subtract', label: '减去' },
  { value: 'intersect', label: '相交' },
] as const

function optionValue(options: ToolOptions, key: string, fallback: string): string {
  return typeof options[key] === 'string' ? options[key] as string : fallback
}

export function ToolOptionsBar({ onOpenModelManager, onRunEnhancement, onOpenSelectionRefine }: { onOpenModelManager?: (kind: 'cutout' | 'upscale') => void; onRunEnhancement?: (kind: 'cutout' | 'upscale') => void; onOpenSelectionRefine?: () => void }) {
  const { state, dispatch } = useEditor()
  const controlsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const scrollParameters = (event: WheelEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || controls.scrollWidth <= controls.clientWidth || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? controls.clientWidth : 1
      controls.scrollLeft += event.deltaY * unit
      event.preventDefault()
      event.stopPropagation()
    }
    controls.addEventListener('wheel', scrollParameters, { passive: false })
    return () => controls.removeEventListener('wheel', scrollParameters)
  }, [])
  const [fontAvailability, setFontAvailability] = useState<Record<string, boolean>>(() => detectSystemFonts())
  useEffect(() => {
    if (!document.fonts) return
    void document.fonts.ready.then(() => setFontAvailability(detectSystemFonts()))
  }, [])
  const tool = getTool(state.activeToolId)
  const options = state.toolOptions
  const setOption = (key: string, value: unknown) => dispatch({ type: 'set-tool-options', options: { [key]: value } })
  const textColor = optionValue(options, 'textColor', '#ffffff')
  const setTextColor = (color: string) => {
    setOption('textColor', color)

  }
  const numberField = ({ key, label, min, max, defaultValue, unit }: NumberOption) => {
    const stored = options[key]
    const value = typeof stored === 'number' && Number.isFinite(stored) ? stored : defaultValue
    return <NumericScrubber key={key} className="tool-option-field" label={label} value={value} min={min} max={max} unit={unit} onChange={(next) => setOption(key, next)} />
  }
  const selectField = (key: string, label: string, choices: readonly { value: string; label: string }[], fallback: string) =>
    <label className="tool-option-field" key={key}><span>{label}</span><select aria-label={label} value={optionValue(options, key, fallback)} onChange={(event) => setOption(key, event.currentTarget.value)}>{choices.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</select></label>
  const foregroundField = <ColorPicker label="前景色" value={state.brushColor} recentColors={state.recentColors} onChange={(color) => dispatch({ type: 'set-brush-color', color })} onRecentSelect={(color) => dispatch({ type: 'set-brush-color', color })} />
  const gradientEndField = <ColorPicker label="末色" ariaLabel="渐变末色" value={optionValue(options, 'gradientEndColor', state.backgroundColor ?? '#ffffff')} recentColors={state.recentColors} onChange={(color) => setOption('gradientEndColor', color)} />
  const fontChoices = [
    { value: 'sans-serif', label: '系统无衬线 · 默认' },
    { value: 'serif', label: '系统衬线 · 默认' },
    { value: 'monospace', label: '系统等宽 · 默认' },
    ...systemFontChoices(fontAvailability).map((font) => ({ value: font.value, label: `${font.label} · ${font.category}${font.available ? '' : '（本机未检测到，使用回退字体）'}` })),
  ]

  let controls: React.ReactNode = <span className="tool-options-status">当前工具：{tool?.label ?? '选择'}</span>
  if (tool?.groupId === 'selection') {
    const mode = optionValue(options, 'selectionMode', 'new')
    controls = <>
      <div className="tool-option-modes" role="group" aria-label="选区模式">{selectionModes.map((entry) => <button key={entry.value} type="button" aria-label={`选区模式：${entry.label}`} title={entry.label} aria-pressed={mode === entry.value} onClick={() => setOption('selectionMode', entry.value)}><SelectionModeIcon mode={entry.value} /></button>)}</div>
      <button type="button" aria-label="取消选择" title="取消选择（Ctrl / ⌘ + D）" disabled={!state.selectionVisible} onClick={() => executeEditorCommand('deselect', state, dispatch)}>取消选择</button>
      <button type="button" disabled={!state.selectionVisible} onClick={() => window.dispatchEvent(new Event('draivio:content-fill'))}>内容识别填充</button>
      <button type="button" onClick={() => window.dispatchEvent(new Event(SEMANTIC_SELECTION_EVENT))}>语义目标与蒙版</button>
      {numberField(feather)}
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'invert-selection' })} aria-label="反选选区">反选</button>
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'selection-to-mask' })} aria-label="选区创建蒙版">创建蒙版</button>
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => onOpenSelectionRefine?.()} aria-label="选择并遮住">选择并遮住</button>
      {numberField({ key: 'selectionAdjustment', label: '选区调整量', min: .25, max: 20, defaultValue: 1, unit: '%' })}
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'morph-selection', amount: typeof options.selectionAdjustment === 'number' ? options.selectionAdjustment : 1 })} aria-label="扩展选区">扩展</button>
      <button type="button" disabled={!state.selectionVisible || state.selection.rect.width <= 0 || state.selection.rect.height <= 0} onClick={() => dispatch({ type: 'morph-selection', amount: -(typeof options.selectionAdjustment === 'number' ? options.selectionAdjustment : 1) })} aria-label="收缩选区">收缩</button>
      <label className="tool-option-check"><Checkbox aria-label="固定比例" checked={options.fixedRatio === true} onChange={(event) => setOption('fixedRatio', event.currentTarget.checked)} /><span>固定比例</span></label>
      {options.fixedRatio === true ? selectField('selectionRatio', '选区比例', [{ value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }], '1:1') : null}
      {tool.id === 'magic-wand' ? numberField({ key: 'tolerance', label: '容差', min: 0, max: 255, defaultValue: 32 }) : null}
      {tool.id === 'subject-select' ? <span className="tool-options-status">主体选择需要配置云端分割服务</span> : null}
      {tool.id === 'polygon-select' || tool.id === 'bezier-select' ? <span className="tool-options-status">逐点绘制 · Enter 闭合 · Esc 取消</span> : null}
    </>
  } else if (tool?.groupId === 'brush') {
    const brushSizes = [4, 12, 24, 48]
    controls = <>{numberField(size)}<div className="tool-option-presets" role="group" aria-label="常用画笔大小"><span className="tool-option-presets-label" aria-hidden="true">快选</span><div className="tool-option-presets-buttons">{brushSizes.map((preset, index) => <button key={preset} type="button" title={`画笔大小 ${preset} px`} aria-pressed={options.size === preset} onClick={() => setOption('size', preset)}><svg aria-hidden="true" viewBox="0 0 16 16"><circle cx="8" cy="8" r={2 + index * 1.3} fill="currentColor" /></svg><span>{preset}</span></button>)}</div></div>{[hardness, opacity, flow, smoothing].map(numberField)}{foregroundField}{tool.id === 'gradient-brush' ? gradientEndField : null}{tool.id === 'brush-line' ? <span className="tool-options-status">拖动绘制直线</span> : null}</>
  } else if (tool?.id === 'dodge' || tool?.id === 'burn') {
    controls = <TonalBrushOptions />
  } else if (tool?.groupId === 'erase-heal') {
    controls = <>{[size, hardness, opacity].map(numberField)}{['clone-stamp', 'healing', 'patch', 'smudge'].includes(tool.id) ? selectField('sampleScope', '采样范围', [{ value: 'current', label: '当前图层' }, { value: 'below', label: '当前及下方' }, { value: 'visible', label: '所有可见' }], 'current') : null}{tool.id === 'clone-stamp' ? <label><Checkbox aria-label="对齐仿制源" checked={options.cloneAligned !== false} onChange={event => setOption('cloneAligned', event.target.checked)} />对齐</label> : null}<span className="tool-options-status">{tool.id === 'clone-stamp' ? 'Alt 点击取样，再拖动仿制；支持对齐/非对齐' : tool.id === 'remove-object' ? '拖动画笔标记待填区域，松开进入本地内容识别填充工作区' : tool.id === 'healing' ? '本地纹理融合；已配置服务时使用服务结果' : '只影响当前图层'}</span></>
  } else if (tool?.groupId === 'mask') {
    controls = <>{[size, hardness, opacity].map(numberField)}{foregroundField}
      <button type="button" aria-label="反转蒙版" onClick={() => dispatch({ type: 'invert-mask' })}>反转</button>
      <button type="button" aria-label="清空蒙版" onClick={() => dispatch({ type: 'clear-mask' })}>清空</button>
      <button type="button" aria-label="应用蒙版" onClick={() => dispatch({ type: 'apply-mask' })}>应用</button>
      <span className="tool-options-status">{tool.id === 'mask-subject' ? '主体蒙版需要配置云端分割服务' : tool.id === 'mask-gradient' ? '拖动创建渐变蒙版 · 红色为遮挡区域' : '红色为遮挡区域 · 应用后可撤销'}</span>
    </>
  } else if (tool?.id === 'text') {
    controls = <>
      {selectField('fontFamily', '字体', fontChoices, 'sans-serif')}
      {numberField(fontSize)}
      {selectField('fontWeight', '字重', [{ value: '400', label: '常规' }, { value: '500', label: '中等' }, { value: '700', label: '粗体' }], '400')}
      <ColorPicker label="文字颜色" ariaLabel="新建文字颜色" value={textColor} recentColors={state.recentColors} onChange={setTextColor} />
      {selectField('textAlign', '对齐', [{ value: 'left', label: '左对齐' }, { value: 'center', label: '居中' }, { value: 'right', label: '右对齐' }], 'left')}
    </>
  } else if (tool?.id === 'crop' || tool?.id === 'perspective-crop') {
    controls = <><OutpaintButton />{selectField('cropRatio', '裁剪比例', [{ value: 'free', label: '自由' }, { value: '1:1', label: '1:1' }, { value: '4:3', label: '4:3' }, { value: '16:9', label: '16:9' }], 'free')}</>
  } else if (tool?.id.startsWith('shape')) {
    controls = <ShapeDefaults/>
  } else if (tool?.id === 'fill' || tool?.id === 'gradient-fill') {
    controls = <>{foregroundField}{tool.id === 'gradient-fill' ? gradientEndField : null}{numberField(opacity)}{tool.id === 'fill' ? <>{numberField({key:'fillTolerance',label:'容差',min:0,max:255,defaultValue:32})}<label className="tool-option-check"><Checkbox aria-label="连续" checked={options.fillContiguous!==false} onChange={event=>setOption('fillContiguous',event.currentTarget.checked)}/><span>连续</span></label>{selectField('fillSampleScope','取样',[{value:'current',label:'当前图层'},{value:'all',label:'所有可见图层'}],'current')}<button type="button" onClick={()=>executeEditorCommand('fillForeground',state,dispatch)}>填充选区 / 整层</button></>:null}<span className="tool-options-status">{tool.id === 'gradient-fill' ? '拖动设定渐变方向' : '点击填充相近颜色区域'}</span></>
  } else if (tool?.id === 'select') {
    controls = <><span className="tool-options-status tool-options-help-copy">当前工具：选择</span><span className="tool-options-status tool-options-help-copy">点击选择内容 · 拖动移动 · Shift 点击多选</span><button type="button" onClick={() => dispatch({type:'select-tool', tool:'transform'})}>自由变换</button></>
  } else if (tool?.id === 'move') {
    controls = <><span className="tool-options-status tool-options-help-copy">拖动点中的内容 · Shift 点击多选 · 拖动时 Shift 锁定方向</span><button type="button" onClick={() => dispatch({type:'select-tool', tool:'transform'})}>自由变换</button></>
  } else if (tool?.id === 'zoom') {
    controls = <><button type="button" onClick={() => dispatch({ type: 'set-zoom', zoom: state.zoom - 10 })}>缩小</button><span className="tool-options-status">滚轮或拖动画布调整缩放</span><button type="button" onClick={() => dispatch({ type: 'set-zoom', zoom: state.zoom + 10 })}>放大</button><button type="button" onClick={() => window.dispatchEvent(new Event('draivio:fit-canvas'))}>适应</button></>
  } else if (tool?.id === 'rotate') {
    controls = <><button type="button" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: state.canvasRotation - 15 })}>↺ 15°</button><span className="tool-options-status">当前旋转 {Math.round(state.canvasRotation)}° · 拖动或点击画布旋转</span><button type="button" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: state.canvasRotation + 15 })}>↻ 15°</button><button type="button" onClick={() => dispatch({ type: 'set-canvas-rotation', rotation: 0 })}>重置</button></>
  } else if (tool?.id === 'pen') {
    controls = <><span className="tool-options-status">点击添加锚点 · 拖动调整曲线 · Enter 闭合</span><VectorEditor /></>
  } else if (tool?.id === 'transform') {
    controls = <TransformToolbarSlot />
  } else if (tool?.id === 'cutout' || tool?.id === 'upscale') {
    const kind = tool.id === 'cutout' ? 'cutout' : 'upscale'
    controls = <><span className="tool-options-status">{supportsLocalModels ? (tool.id === 'cutout' ? '生成透明背景图（四边连通背景）' : '放大当前图层（2x / 4x）') : '网页版云端服务尚未配置'}</span><button type="button" disabled={!supportsLocalModels} onClick={() => onRunEnhancement?.(kind)}>执行{tool.label}</button><button type="button" disabled={!supportsLocalModels} onClick={() => onOpenModelManager?.(kind)}>{supportsLocalModels ? '管理模型' : '网页版不可用'}</button></>
  }

  if(selectedObjects(state).length&&['select','move','shape','shape-ellipse','shape-line','shape-arrow','pen','text','transform'].includes(state.activeToolId)) controls=<ObjectProperties compact/>
  return <div className="tool-options-bar" role="toolbar" aria-label="工具选项"><strong className="tool-options-name">{tool?.label ?? '选择'}</strong><ToolHelp /><div ref={controlsRef} className="tool-options-controls">{!selectedObjects(state).length && state.selectedLayerIds.length > 1 && tool?.groupId === 'select-move' ? <AlignmentControls /> : controls}</div></div>
}
