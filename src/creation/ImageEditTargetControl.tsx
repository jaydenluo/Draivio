import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEditor, type EditorState } from '../state/editor'
import { prepareMaskedEdit, encodePixels } from '../ai/maskedEdit/workflow'
import { editTargetIds, editTargetLabels, resolveImageEditTarget, type ImageEditTarget } from './imageEditTarget'
import { contentRevision } from '../ai/context/editorContext'

export function editTargetLabel(state: EditorState, value: ImageEditTarget) {
  const target = resolveImageEditTarget(state, value)
  if (target === 'upload') return '修改上传原图'
  if (target !== 'object') return `修改${editTargetLabels[target]}`
  const ids = editTargetIds(state)
  const layer = state.layers.find(item => item.id === ids[0])
  return ids.length > 1 ? `修改所选 ${ids.length} 个图层` : layer ? `修改${layer.name}` : '请选择修改图层'
}

export function EditRangeHighlight({ target, enabled, state, documentId }: {
  target: Exclude<ImageEditTarget, 'auto'>
  enabled: boolean
  state: EditorState
  documentId: string
}) {
  const latest = useRef(state)
  latest.current = state
  const revision = enabled ? JSON.stringify([documentId, contentRevision(state), target, editTargetIds(state), state.selectedLayerId,
    target === 'selection' ? [state.selectionVisible, state.selection] : null]) : ''
  const [preview, setPreview] = useState<{ revision: string; overlay?: string; error?: string } | null>(null)
  useEffect(() => {
    if (!revision || target === 'upload') return
    let live = true
    // Delay pointer hover slightly so passing across the composer doesn't rasterize the document.
    const timer = setTimeout(() => void prepareMaskedEdit(latest.current, documentId, 'transparent-edit', undefined, target).then(prepared => {
      if (!live) return
      const data = new Uint8ClampedArray(prepared.mask.length * 4)
      prepared.mask.forEach((alpha, index) => data.set([80, 190, 255, Math.round(alpha * .5)], index * 4))
      const overlay = encodePixels({ width: prepared.pixels.width, height: prepared.pixels.height, data })
      setPreview({ revision, overlay })
    }).catch(error => {
      if (live) setPreview({ revision, error: error instanceof Error ? error.message : '无法预览修改范围' })
    }), 100)
    return () => { live = false; clearTimeout(timer) }
  }, [revision, documentId, target])
  if (!enabled || target === 'upload') return null
  const canvas = document.querySelector('.canvas-document')
  const current = preview?.revision === revision ? preview : null
  if (current?.error) return <small className="composer-target-feedback" role="status">{current.error}</small>
  if (!canvas || !current?.overlay) return null
  return createPortal(<img className="composer-range-highlight" src={current.overlay} alt="AI 修改范围" data-export-hidden="true" data-editor-overlay="true" />, canvas)
}

export function ImageEditTargetControl({ value, onChange, uploadedImage }: {
  value: ImageEditTarget
  onChange: (target: ImageEditTarget) => void
  uploadedImage?: string
}) {
  const { state, documentId } = useEditor()
  const target = resolveImageEditTarget(state, value)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const label = editTargetLabel(state, value)
  const ids = editTargetIds(state)
  const options = [
    { value: 'auto', label: `自动 · ${editTargetLabel(state, 'auto')}` },
    { value: 'selection', label: '当前选区', disabled: !state.selectionVisible },
    { value: 'object', label: '选中图层', disabled: !ids.length },
    { value: 'document', label: '整个画布' },
    { value: 'upload', label: '上传原图', disabled: !uploadedImage },
  ] as const
  return <div className="composer-edit-target">
    <label className="composer-target-chip" title={label} onPointerEnter={() => setHovered(true)} onPointerLeave={() => setHovered(false)}>
      <span aria-hidden="true">{label}</span>
      <span aria-hidden="true">⌄</span>
      <select aria-label={label} value={value} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={event => onChange(event.target.value as ImageEditTarget)}>
        {options.map(option => <option key={option.value} value={option.value} disabled={'disabled' in option && option.disabled}>{option.label}</option>)}
      </select>
    </label>
    <EditRangeHighlight state={state} documentId={documentId} target={target} enabled={hovered || focused} />
  </div>
}
