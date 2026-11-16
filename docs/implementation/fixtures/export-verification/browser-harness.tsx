// Standalone development verification entry. Production App routing never imports this file.
import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AppShell } from '../../../../src/app/AppShell'
import { EditorProvider, useEditor } from '../../../../src/state/editor'
import { decodeProject, projectFingerprint } from '../../../../src/document/projectFormat'
import '../../../../src/styles/theme.css'
import blocks from './color-blocks.draivio?raw'
import effects from './effects.draivio?raw'
function FixtureControls() {
  const { state, dispatch } = useEditor()
  const [baseline, setBaseline] = useState('')
  function load(source: string, kind?: 'corrupt' | 'crop') {
    const loaded = decodeProject(source)
    if (kind === 'corrupt') loaded.document.layers[0].source = 'data:image/png;base64,AQID'
    if (kind === 'crop') loaded.document.cropRect = {x:12.5,y:12.5,width:25,height:25}
    setBaseline(projectFingerprint(loaded.document))
    dispatch({ type: 'restore-project', document: loaded.document })
  }
  return <aside style={{ position: 'fixed', top: 56, left: 80, zIndex: 10000, background: '#fff', color: '#222', padding: 6, border: '1px solid #bbb', display: 'flex', gap: 6 }}>
    <button onClick={() => load(blocks)}>载入透明色块测试</button>
    <button onClick={() => load(effects)}>载入效果测试</button>
    <button onClick={() => load(blocks, 'corrupt')}>载入坏资源测试</button>
    <button onClick={() => load(blocks, 'crop')}>载入裁剪测试</button>
    <output aria-label="测试文档指纹">{baseline && baseline === projectFingerprint(state) ? '文档未变化' : '未载入或已变化'}</output>
  </aside>
}
createRoot(document.getElementById('root')!).render(<EditorProvider><AppShell /><FixtureControls /></EditorProvider>)
