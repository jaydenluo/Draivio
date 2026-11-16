import { bindToolCall, prepareToolCall } from '../ai/tools/registry'
import { message } from '../ui/message'
import { effectiveLayerState } from '../state/layerHierarchy'
import { useState } from 'react'
import { useEditor, useDocumentTransaction, neutralAdjustments, type LayerAdjustments } from '../state/editor'
import type { TransformDraft } from '../canvas/TransformOverlay'
import { NumericScrubber } from '../components/NumericScrubber'

const blank: TransformDraft = { kind: 'transform', rect: { x: 0, y: 0, width: 100, height: 100 }, rotation: 0, flipX: false, flipY: false }
const adjustmentLabels: Array<[keyof LayerAdjustments, string]> = [['exposureEV', '曝光 EV'], ['brightness', '亮度'], ['contrast', '对比度'], ['saturation', '饱和度'], ['temperature', '色温'], ['tint', '色调'], ['sharpness', '清晰度'], ['blur', '模糊'], ['shadows', '阴影'], ['highlights', '高光']]

export function PropertiesPanel() {
  const { state, dispatch } = useEditor()
  const transaction = useDocumentTransaction('修改图层属性')
  const [unit, setUnit] = useState('px')
  const [lockRatio, setLockRatio] = useState(false)
  const layer = state.layers.find((item) => item.id === state.selectedLayerId)
  if (!layer) return <div className="inspector-empty">请选择一个图层</div>
  const locked = effectiveLayerState(state.layers, layer.id).locked
  const runTool = (toolId: string, params: unknown) => {
    const prepared = prepareToolCall(state, bindToolCall(state, toolId, layer.id, params))
    if (prepared.ok) dispatch(prepared.action)
    else message.warning(prepared.error)
  }
  const transform = layer.transform ?? blank
  const xFactor = unit === 'px' ? state.documentWidth / 100 : 1, yFactor = unit === 'px' ? state.documentHeight / 100 : 1
  const ratio = transform.rect.width / Math.max(1, transform.rect.height)
  const update = (patch: Omit<Partial<TransformDraft>, 'rect'> & { rect?: { x?: number; y?: number; width?: number; height?: number } }) => runTool('layer.transform', { ...transform, ...patch, rotation: patch.rotation === undefined ? transform.rotation : ((patch.rotation + 180) % 360 + 360) % 360 - 180, rect: { ...transform.rect, ...patch.rect } })
  const updateSize = (key: 'width' | 'height', value: number) => { const safe = Math.max(.001, Math.min(3276800, value)); update({ rect: lockRatio ? key === 'width' ? { width: safe, height: safe / ratio } : { height: safe, width: safe * ratio } : { [key]: safe } }) }
  return <section className="inspector-panel properties-panel" aria-label="图层属性"><div className="panel-heading"><h2>属性</h2><small>{layer.name}</small></div>
    <label>单位<select aria-label="属性单位" value={unit} onChange={(event) => setUnit(event.target.value)}><option value="px">px</option><option value="%">%</option></select></label><div className="property-grid"><NumericScrubber {...transaction} key={`${layer.id}-${state.documentId}-X`} label="X" ariaLabel="X" value={transform.rect.x * xFactor} min={-16384} max={16384} unit={unit} disabled={locked} onChange={(x) => update({ rect: { x: x / xFactor } })} /><NumericScrubber {...transaction} key={`${layer.id}-${state.documentId}-Y`} label="Y" ariaLabel="Y" value={transform.rect.y * yFactor} min={-16384} max={16384} unit={unit} disabled={locked} onChange={(y) => update({ rect: { y: y / yFactor } })} /><NumericScrubber {...transaction} key={`${layer.id}-${state.documentId}-宽度`} label="宽度" ariaLabel="宽度" value={transform.rect.width * xFactor} min={1} max={16384} unit={unit} disabled={locked} onChange={(width) => updateSize('width', width / xFactor)} /><NumericScrubber {...transaction} key={`${layer.id}-${state.documentId}-高度`} label="高度" ariaLabel="高度" value={transform.rect.height * yFactor} min={1} max={16384} unit={unit} disabled={locked} onChange={(height) => updateSize('height', height / yFactor)} /></div>
    <div className="property-meta"><label className="ratio-lock"><input type="checkbox" checked={lockRatio} onChange={(event) => setLockRatio(event.target.checked)} />锁定比例</label><NumericScrubber {...transaction} key={`${layer.id}-${state.documentId}`} className="property-rotation" label="旋转" ariaLabel="旋转" value={transform.rotation} min={-180} max={180} unit="°" disabled={locked} onChange={(rotation) => update({ rotation })} /></div><div className="property-actions"><button disabled={locked} onClick={() => update({ flipX: !transform.flipX })}>水平翻转</button><button disabled={locked} onClick={() => update({ flipY: !transform.flipY })}>垂直翻转</button><button disabled={locked} onClick={() => runTool('layer.transform', blank)}>重置变换</button></div>
    <div className="adjustments-panel"><div className="panel-subheading"><h3>图像调整</h3><button disabled={locked} onClick={() => dispatch({ type: 'reset-layer-adjustments', id: layer.id })}>全部重置</button></div>
      <div className="adjustments-preview"><label><input type="checkbox" aria-label="预览图像调整" checked={layer.adjustmentsEnabled !== false} disabled={locked} onChange={() => dispatch({ type: 'toggle-layer-adjustments-preview', id: layer.id })} />预览</label><small>导出跟随预览</small></div>
      <div className="adjustments-grid">{adjustmentLabels.map(([key, label]) => <div className="adjustment-field" key={`${layer.id}-${state.documentId}-${key}`}><NumericScrubber {...transaction} label={label} ariaLabel={label} value={layer.adjustments?.[key] ?? neutralAdjustments[key] ?? 0} min={key === 'blur' ? 0 : key === 'exposureEV' ? -8 : -100} max={key === 'exposureEV' ? 8 : 100} disabled={locked} onChange={(value) => runTool('layer.adjustment', { key, value })} /><button className="adjustment-reset" aria-label={`重置${label}`} title={`重置${label}`} disabled={locked || !layer.adjustments?.[key]} onClick={() => runTool('layer.adjustment', { key, value: 0 })}>↺</button></div>)}</div>
    </div>
  </section>
}
