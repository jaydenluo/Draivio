import { useEffect, useState, type CSSProperties } from 'react'
import { CanvasViewport } from '../canvas/CanvasViewport'
import { HistoryStrip } from '../components/HistoryStrip'
import { Inspector } from '../components/Inspector'
import { ToolRail } from '../components/ToolRail'
import { TopBar } from '../components/TopBar'
import { ToolOptionsBar } from '../components/ToolOptionsBar'
import { useEditor } from '../state/editor'
import { useToolShortcuts } from '../tools/useToolShortcuts'
import { ModelManagerDialog } from '../models/ModelManagerDialog'

const MIN_INSPECTOR_WIDTH = 240
const MAX_INSPECTOR_WIDTH = 520

export function AppShell() {
  const { state } = useEditor()
  useToolShortcuts()
  const [inspectorWidth, setInspectorWidth] = useState(320)
  const [resizing, setResizing] = useState(false)
  const [enhancementRequest, setEnhancementRequest] = useState<{ kind: 'cutout' | 'upscale'; nonce: number }>()
  const [modelKind, setModelKind] = useState<'cutout' | 'upscale' | null>(null)

  useEffect(() => {
    if (!resizing) return
    const handleMove = (event: PointerEvent) => {
      const nextWidth = Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - event.clientX))
      setInspectorWidth(nextWidth)
    }
    const stopResizing = () => setResizing(false)
    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', stopResizing)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', stopResizing)
    }
  }, [resizing])

  useEffect(() => {
    const preventPageZoom = (event: WheelEvent) => { if (event.ctrlKey) event.preventDefault() }
    const preventGestureZoom = (event: Event) => event.preventDefault()
    window.addEventListener('wheel', preventPageZoom, { passive: false, capture: true })
    window.addEventListener('gesturestart', preventGestureZoom, { passive: false })
    window.addEventListener('gesturechange', preventGestureZoom, { passive: false })
    window.addEventListener('gestureend', preventGestureZoom, { passive: false })
    return () => { window.removeEventListener('wheel', preventPageZoom, true); window.removeEventListener('gesturestart', preventGestureZoom); window.removeEventListener('gesturechange', preventGestureZoom); window.removeEventListener('gestureend', preventGestureZoom) }
  }, [])

  const style = { '--inspector-width': `${inspectorWidth}px` } as CSSProperties
  return <div className={`app-shell ${resizing ? 'is-resizing' : ''} ${state.historyCollapsed ? 'history-collapsed' : ''}`} style={style}><TopBar /><div className="workspace"><ToolRail /><div className="canvas-workspace"><ToolOptionsBar onOpenModelManager={setModelKind} onRunEnhancement={(kind) => setEnhancementRequest({ kind, nonce: Date.now() })} /><CanvasViewport enhancementRequest={enhancementRequest} /></div><Inspector inspectorWidth={inspectorWidth} onResizeStart={() => setResizing(true)} onResizeBy={(delta) => setInspectorWidth((value) => Math.min(MAX_INSPECTOR_WIDTH, Math.max(MIN_INSPECTOR_WIDTH, value + delta)))} /></div><HistoryStrip /><ModelManagerDialog open={modelKind !== null} initialKind={modelKind ?? 'cutout'} onClose={() => setModelKind(null)} /></div>
}
