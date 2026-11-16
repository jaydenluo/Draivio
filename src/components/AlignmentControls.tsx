import { useState } from 'react'
import { selectedAlignmentLayers, type AlignmentMode, type AlignmentTarget } from '../document/alignment'
import { useEditor } from '../state/editor'

const actions: { mode: AlignmentMode; label: string }[] = [
  {mode:'left',label:'左对齐'}, {mode:'center-horizontal',label:'水平居中'}, {mode:'right',label:'右对齐'},
  {mode:'top',label:'顶对齐'}, {mode:'center-vertical',label:'垂直居中'}, {mode:'bottom',label:'底对齐'},
]

export function AlignmentControls() {
  const { state, dispatch } = useEditor()
  const [target, setTarget] = useState<AlignmentTarget>('canvas')
  const selected = selectedAlignmentLayers(state)
  if (state.selectedLayerIds.length < 2) return null
  return <div className="alignment-controls" role="group" aria-label="对齐与分布">
    <label className="tool-option-field"><span>依据</span><select aria-label="对齐依据" value={target} onChange={(event) => setTarget(event.target.value as AlignmentTarget)}>
      <option value="canvas">画布</option><option value="selection">所选边界</option><option value="key-object">关键对象 · {state.layers.find((layer) => layer.id === state.selectedLayerId)?.name ?? '当前图层'}</option>
    </select></label>
    {actions.map(({mode,label}) => <button key={mode} type="button" onClick={() => dispatch({type:'align-layers',mode,target})}>{label}</button>)}
    <button type="button" disabled={selected.length < 3} title="至少选择三个对象；按对象外边界等距分布" onClick={() => dispatch({type:'distribute-layers',axis:'horizontal'})}>水平等距</button>
    <button type="button" disabled={selected.length < 3} title="至少选择三个对象；按对象外边界等距分布" onClick={() => dispatch({type:'distribute-layers',axis:'vertical'})}>垂直等距</button>
  </div>
}
