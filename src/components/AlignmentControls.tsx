import { useState } from 'react'
import { alignmentTargets, type AlignmentRequest } from '../document/alignment'
import { useEditor } from '../state/editor'
import './alignment.css'
const operations: { operation: AlignmentRequest['operation']; label: string; symbol: string }[] = [
  { operation:'left',label:'左对齐',symbol:'⇤' }, { operation:'center-x',label:'水平居中',symbol:'↔' }, { operation:'right',label:'右对齐',symbol:'⇥' },
  { operation:'top',label:'顶对齐',symbol:'↥' }, { operation:'center-y',label:'垂直居中',symbol:'↕' }, { operation:'bottom',label:'底对齐',symbol:'↧' },
  { operation:'distribute-x',label:'水平等距分布',symbol:'⋮↔⋮' }, { operation:'distribute-y',label:'垂直等距分布',symbol:'⋮↕⋮' },
]
export function AlignmentControls() {
  const {state,dispatch} = useEditor()
  const [reference,setReference] = useState<AlignmentRequest['reference']>('selection')
  const [chosenKey,setChosenKey] = useState('')
  const targets = alignmentTargets(state)
  const keyLayerId = targets.some(l=>l.id===chosenKey) ? chosenKey : targets[0]?.id ?? ''
  const omitted = new Set(state.selectedLayerIds).size-targets.length
  const reason = (distribution: boolean) => targets.length < (distribution ? 3 : 2) ? `${distribution ? '等距分布至少需要三个' : '对齐至少需要两个'}可移动对象（排除锁定、隐藏及重复子层）` : reference === 'key' && !keyLayerId ? '请选择有效关键对象' : ''
  return <div className="alignment-controls" role="group" aria-label="对齐与分布">
    <label>基准<select aria-label="对齐基准" value={reference} onChange={e=>setReference(e.currentTarget.value as AlignmentRequest['reference'])}>
      <option value="canvas">画布</option><option value="selection">所选边界</option><option value="key">关键对象</option>
    </select></label>
    {reference === 'key' ? <label>关键<select aria-label="关键对象" value={keyLayerId} onChange={e=>setChosenKey(e.currentTarget.value)}>{!targets.length ? <option value="">无有效对象</option> : targets.map(l=><option key={l.id} value={l.id}>{l.name}</option>)}</select></label> : null}
    {operations.map(({operation,label,symbol})=>{ const disabledReason = reason(operation.startsWith('distribute')); return <button key={operation} type="button" aria-label={label} title={disabledReason || `${label} · ${reference==='canvas'?'可见画布':reference==='key'?'关键对象保持不动':'所选边界'}`} disabled={!!disabledReason} aria-describedby={disabledReason ? 'alignment-help' : undefined} onClick={()=>dispatch({type:'align-layers',request:{reference,operation,keyLayerId}})}>{symbol}</button> })}
    <span id="alignment-help" className="alignment-help">{targets.length < 3 ? '等距分布至少需要三个可移动对象' : reference === 'key' ? '关键对象固定；分布保持所选跨度' : '按旋转后的外边界计算'}{omitted ? `；排除 ${omitted} 个锁定、隐藏或重复子层` : ''}</span>
  </div>
}
