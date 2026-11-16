import { useEffect, useRef, useState } from 'react'
import { aiManualToolCoverage } from '../tools/toolCoverage'
import { useEditor } from '../../state/editor'
import { contentRevision } from '../context/editorContext'
import { effectiveLayerState } from '../../state/layerHierarchy'
import type { EditorState } from '../../state/editor'
import { defaultRelightSettings, type RelightDirection, type RelightSettings } from './relight'

export function RelightWorkspace() {
  const { state, dispatch, documentId } = useEditor()
  const latest = useRef({state,documentId}); latest.current={state,documentId}
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<RelightSettings>(defaultRelightSettings())
  const [candidate, setCandidate] = useState<{documentId:string; revision:string; undoLength:number; target:string; settings:string; layer:EditorState['layers'][number]} | null>(null)
  const target = state.selectedLayerId
  const update = <K extends keyof RelightSettings>(key: K, value: RelightSettings[K]) => { setCandidate(null); setSettings(current => ({ ...current, [key]: value })) }
  const revision=contentRevision(state)
  useEffect(()=>setCandidate(null),[documentId,revision,state.undoStack.length,target])
  const canAdopt=()=>{const current=latest.current;return !!candidate&&candidate.documentId===current.documentId&&candidate.revision===contentRevision(current.state)&&candidate.undoLength===current.state.undoStack.length&&candidate.target===current.state.selectedLayerId&&candidate.settings===JSON.stringify(settings)&&!effectiveLayerState(current.state.layers,candidate.target).locked}
  const preview = () => { setCandidate(null); try { if(effectiveLayerState(state.layers,target).locked)throw new Error('布光目标图层或祖先已锁定'); const result=aiManualToolCoverage.relight.execute(state, {...settings,layerId:target});const layer=result.layers.find(item=>item.id===target);if(!layer)throw new Error('布光目标图层不存在');setCandidate({documentId,revision,undoLength:state.undoStack.length,target,settings:JSON.stringify(settings),layer}) } catch (error) { dispatch({ type: 'set-notice', message: error instanceof Error ? error.message : '布光预览失败' }) } }
  const cancel = () => setCandidate(null)
  const adopt = () => { if (!candidate||!canAdopt()){setCandidate(null);return} const current=latest.current.state;dispatch({ type: 'apply-edit-plan', document: {layers:current.layers.map(layer=>layer.id===candidate.target?{...layer,adjustments:candidate.layer.adjustments,effects:candidate.layer.effects}:layer)} }); setCandidate(null); setOpen(false) }
  return <div className="relight-workspace"><button type="button" aria-expanded={open} onClick={() => { setOpen(value => !value); setCandidate(null) }}>AI 布光</button>{open ? <section aria-label="AI 布光工作区"><p>有限非破坏布光会保留几何、文字和现有蒙版；生成式布光需要单独配置真实模型。</p><label>光向<select aria-label="布光方向" value={settings.direction} onChange={event => update('direction', event.target.value as RelightDirection)}><option value="left">左侧</option><option value="right">右侧</option><option value="top">顶部</option></select></label><label>强度<input aria-label="布光强度" type="range" min="0" max="100" value={settings.intensity} onChange={event => update('intensity', Number(event.target.value))}/><output>{settings.intensity}</output></label><label>色温<input aria-label="布光色温" type="range" min="-100" max="100" value={settings.temperature} onChange={event => update('temperature', Number(event.target.value))}/></label><label>背景协调<input aria-label="背景协调" type="range" min="0" max="100" value={settings.backgroundMatch} onChange={event => update('backgroundMatch', Number(event.target.value))}/></label><label>接触阴影<input aria-label="接触阴影" type="range" min="0" max="100" value={settings.contactShadow} onChange={event => update('contactShadow', Number(event.target.value))}/></label><button type="button" onClick={preview}>预览布光</button>{candidate ? <div aria-label="布光前后预览"><button type="button" disabled={!canAdopt()} onClick={adopt}>采用布光（可撤销）</button><button type="button" onClick={cancel}>取消</button><p>已生成前后预览；蒙版、调整和阴影效果可分别关闭微调。</p></div> : null}</section> : null}</div>
}
