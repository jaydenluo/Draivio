import { useState } from 'react'
import { CanvasScene } from '../../canvas/CanvasScene'
import { editNumericParameters, type EditPreviewCandidate } from '../execution/preview'
import './edit-preview.css'

export function EditPreview({ candidate, stale, onTune, onAdopt, onDiscard }: {
 candidate: EditPreviewCandidate; stale: boolean
 onTune: (stepId: string, key: string, value: number) => void
 onAdopt: () => void; onDiscard: () => void
}) {
 const [before, setBefore] = useState(false)
 return <section className="edit-preview" role="region" aria-label="编辑效果预览">
  <div className="edit-preview-toolbar"><strong>临时预览 · {before ? '编辑前' : '编辑后'}</strong><button type="button" aria-pressed={before} onClick={()=>setBefore(true)}>查看编辑前</button><button type="button" aria-pressed={!before} onClick={()=>setBefore(false)}>查看编辑后</button></div>
  <div className="edit-preview-scene"><CanvasScene state={before ? candidate.base : candidate.document} thumbnail/></div>
  {!before && candidate.document.layers.some(layer => layer.warpRecipe) ? <p role="status">几何形变预览：已记录透视/畸变方案；采用后可保存、导出并撤销。</p> : null}
  <div className="edit-preview-parameters">{candidate.steps.map((step,index) => (editNumericParameters[step.tool] ?? []).filter(field => typeof step.args[field.key] === 'number').map(field => <label key={`${step.id}-${field.key}`}>{field.label}<input type="number" aria-label={`步骤 ${index+1} ${field.label}`} value={step.args[field.key] as number} min={field.min} max={field.max} step={field.step} disabled={stale} onChange={event => onTune(step.id,field.key,event.target.value === '' ? NaN : Number(event.target.value))}/></label>))}</div>
  {stale ? <p role="status">文档已更改，请放弃并重新预览。</p> : <small>尚未写入作品，采用后可一次撤销。</small>}
  <div className="edit-preview-toolbar"><button type="button" onClick={onAdopt} disabled={stale}>采用预览</button><button type="button" onClick={onDiscard}>放弃预览</button></div>
 </section>
}
