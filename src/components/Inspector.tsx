import { useEffect, useState } from 'react'
import { INSPECTOR_ACTIVATE_EVENT } from '../commands/editorCommands'
import { LayersPanel } from '../layers/LayersPanel'
import { PropertiesPanel } from '../layers/PropertiesPanel'
import { ResultsPanel } from '../layers/ResultsPanel'
import { useEditor } from '../state/editor'
import { AIComposer } from '../creation/AIComposer'
import { DockWorkspace, type DockPanelDefinition } from '../ui/dock/DockWorkspace'

// Add future inspector functionality here; docking behavior belongs to DockWorkspace.
const inspectorPanels: DockPanelDefinition[] = [
  { id: 'layers', title: '图层', component: LayersPanel },
  { id: 'edit', title: '属性', component: PropertiesPanel },
  { id: 'results', title: 'AI 结果', component: ResultsPanel },
]

export function Inspector({ inspectorWidth, maxWidth = 520, overlay = false, hidden = false, onClose, onResizeStart, onResizeBy }: {
  inspectorWidth: number
  maxWidth?: number
  overlay?: boolean
  hidden?: boolean
  onClose?: () => void
  onResizeStart: () => void
  onResizeBy: (delta: number) => void
}) {
  const { state, dispatch } = useEditor()
  const [activationKey, setActivationKey] = useState(0)
  useEffect(() => {
    const activate = () => setActivationKey(key => key + 1)
    window.addEventListener(INSPECTOR_ACTIVATE_EVENT, activate)
    return () => window.removeEventListener(INSPECTOR_ACTIVATE_EVENT, activate)
  }, [])
  return <aside id="workspace-inspector" className="inspector" aria-label="操作面板" hidden={hidden} onKeyDown={event => {
    if (overlay && event.key === 'Escape' && !event.defaultPrevented && event.currentTarget.contains(event.target as Node)) {
      event.stopPropagation()
      onClose?.()
    }
  }}>
    {overlay ? <div className="inspector-overlay-header"><span>操作面板</span><button type="button" aria-label="收起操作面板" title="收起操作面板" onClick={onClose}>×</button></div> :
      <div className="resize-handle" role="separator" aria-label="调整画布和操作面板宽度" aria-orientation="vertical" aria-valuemin={240} aria-valuemax={maxWidth} aria-valuenow={inspectorWidth} tabIndex={0} onPointerDown={event => { event.preventDefault(); onResizeStart() }} onKeyDown={event => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        onResizeBy(event.key === 'ArrowLeft' ? 16 : -16)
      }} />}
    {state.composerPlacement === 'right' ? <AIComposer /> : null}
    <DockWorkspace panels={inspectorPanels} storageKey="draivio-inspector-layout-v1" selectedPanel={state.inspectorTab} activationKey={activationKey} onSelect={id => { if (id === 'layers' || id === 'edit' || id === 'results') dispatch({type:'select-tab',tab:id}) }} />
  </aside>
}
