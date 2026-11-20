import { CanvasScene } from '../canvas/CanvasScene'
import type { EditorState } from '../state/editor'
import { DocumentTabs } from './DocumentTabs'
import { ProjectFileControl } from './ProjectFileControl'
/** Deliberately excludes the editor/tool/AI providers and export commands. A
 * display preview must never become an editable or exported original. */
export function RasterProjectPreview({ state }: { state: EditorState }) {
  return (
    <main
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--bg-primary)',
        color: 'var(--text-primary)',
      }}
    >
      <header style={{ padding: 12 }}>
        <ProjectFileControl />
      </header>
      <DocumentTabs />
      <p role="status" style={{ padding: '8px 16px', margin: 0 }}>
        持久原件项目 ·
        只读预览。原件和编辑参数已保留；区域编辑与原始精度导出尚未就绪。可保存项目或另存副本。
      </p>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          padding: 24,
          display: 'grid',
          placeItems: 'center',
        }}
      >
        <svg
          role="img"
          aria-label="项目只读预览"
          viewBox={`0 0 ${state.documentWidth} ${state.documentHeight}`}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: state.documentWidth,
            height: state.documentHeight,
            pointerEvents: 'none',
          }}
        >
          <CanvasScene state={state} thumbnail />
        </svg>
      </div>
    </main>
  )
}
