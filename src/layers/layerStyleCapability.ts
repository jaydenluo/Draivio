import type { EditorState } from '../state/editor'
import { effectiveLayerState } from '../state/layerHierarchy'
export function layerStyleUnavailableReason(state:EditorState,id:string):string|null {
 const layer=state.layers.find(l=>l.id===id)
 if(!layer)return '目标图层已不存在，请取消本次编辑。'
 if(state.colorModel==='cmyk')return 'CMYK 通道保持不变。此工具仅支持 RGB，请先在文档模式中显式创建 RGB 工作副本。'
 if(effectiveLayerState(state.layers,id).locked)return '图层或其祖先已锁定，请先解锁后再编辑'
 if(layer.highPrecision)return '此工具仅处理 8 位像素。请使用“高精度资源”中的曝光/曲线，或显式创建 8 位副本；原始资源未变。'
 return null
}
