import { useEditor } from '../state/editor'
import { getTool } from '../tools/toolRegistry'

export function StatusBar() {
  const { state } = useEditor()
  const text = `${state.documentWidth} × ${state.documentHeight} px · ${state.colorModel === 'cmyk' ? 'CMYK' : 'RGB'} · 缩放 ${Math.round(state.zoom)}% · ${state.layers.length} 个图层 · 当前工具：${getTool(state.activeToolId)?.label ?? '选择'}${state.isGenerating ? ' · AI 处理中…' : ''}`
  return <footer className="editor-statusbar" aria-label="状态栏"><span title={text}>{text}</span></footer>
}
