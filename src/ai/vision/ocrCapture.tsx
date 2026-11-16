import {renderToStaticMarkup} from 'react-dom/server'
import {CanvasScene} from '../../canvas/CanvasScene'
import {retouchScopeSvg} from '../../canvas/retouchScope'
import {rasterizeSvgPixels} from '../../canvas/rasterTools'
import {effectiveLayerState} from '../../state/layerHierarchy'
import type {EditorState} from '../../state/editor'
export async function captureOcrImage(state:EditorState,signal:AbortSignal){
 const target=state.layers.find(l=>l.id===state.selectedLayerId)
 if(!target?.source||target.source==='fixture'||target.kind==='group'||target.smartObject)throw new Error('请选择真实普通图像图层；智能对象请先栅格化')
 const eff=effectiveLayerState(state.layers,target.id)
 if(eff.locked||!eff.visible)throw new Error('目标或祖先图层已锁定或隐藏')
 if(state.documentWidth*state.documentHeight>4194304)throw new Error('当前本机 OCR 最多支持 4194304 文档像素，请先裁切作品')
 const markup=renderToStaticMarkup(<CanvasScene state={{...state,documentBackground:'transparent'}} thumbnail/>)
 const svg=new DOMParser().parseFromString(markup,'image/svg+xml').documentElement as unknown as SVGSVGElement
 svg.setAttribute('width',String(state.documentWidth));svg.setAttribute('height',String(state.documentHeight))
 return rasterizeSvgPixels(retouchScopeSvg(svg,state.layers,target.id,'current'),signal)
}
