import type { EditorState } from '../state/editor'
import type { ToolId } from './toolTypes'
import { getTool } from './toolRegistry'
import { effectiveLayerState } from '../state/layerHierarchy'

export const toolInstructions:Record<ToolId,string>={
 select:'点击对象选中，拖动移动；Shift 点击可多选。',move:'拖动选中对象移动；Shift 点击可多选。',
 selection:'拖动创建矩形选区；Shift 约束比例，Alt 从中心绘制。','rectangle-select':'拖动创建矩形选区；Shift 约束比例，Alt 从中心绘制。','ellipse-select':'拖动创建椭圆选区；Shift 绘制正圆，Alt 从中心绘制。','lasso-select':'按住拖动圈出区域，松开形成选区。','polygon-select':'逐点点击描绘边界，双击完成多边形选区。','bezier-select':'点击添加锚点，拖动调整曲线；闭合后转换选区。','subject-select':'点击画布识别主体；需要配置主体识别服务。','magic-wand':'点击相近颜色区域创建选区；容差控制颜色范围。',
 brush:'按住拖动绘画，使用前景色；顶部调整大小、硬度与流量。',pencil:'按住拖动绘制硬边笔触，使用前景色。','gradient-brush':'拖动绘画，笔触从前景色渐变到末色。','brush-line':'按住拖动设定起点与终点，松开绘制直线。','soft-brush':'按住拖动绘制柔边笔触，可降低流量叠加。',smudge:'按住拖动推抹当前图层的颜色。',
 eraser:'按住拖动擦除当前图层；顶部调整大小与硬度。','background-eraser':'点击背景色，擦除与点击位置相连的相近颜色。','remove-object':'涂抹需要移除的物体，松开后计算修复结果。',healing:'涂抹需要修复的区域，松开后预览结果。','clone-stamp':'先按住 Alt 点击设置源，再拖动仿制。',patch:'先按住 Alt 点击设置源，再涂抹修补区域。',dodge:'拖动提亮局部；顶部选择范围与曝光度。',burn:'拖动压暗局部；顶部选择范围与曝光度。',
 mask:'在图层蒙版上涂抹，控制内容可见范围。','mask-quick':'拖动涂抹快速蒙版，调整需要保留的区域。','mask-gradient':'拖动设定渐变蒙版的方向和范围。','mask-subject':'点击识别主体并生成蒙版；需要配置识别服务。',
 crop:'拖动框选裁剪区域，确认应用；Esc 取消。','perspective-crop':'调整四角校正透视，确认应用；Esc 取消。',transform:'拖动边框控制点调整大小或旋转，顶部确认应用；Esc 取消。',
 text:'点击输入文字；拖动创建段落文本框。',shape:'拖动绘制矩形；Shift 约束正方形，Alt 从中心绘制。','shape-ellipse':'拖动绘制椭圆；Shift 约束正圆，Alt 从中心绘制。','shape-line':'拖动绘制线段，顶部调整描边宽度。','shape-arrow':'拖动绘制箭头，顶部调整描边宽度。',pen:'点击添加锚点，拖动调整曲线；闭合后创建路径或选区。',
 picker:'点击画布采样颜色，设为前景色。',fill:'点击填充相连的相近颜色；闭合矢量形状直接修改填色。','gradient-fill':'拖动设定渐变起点与终点；有选区时仅填充选区。',pan:'按住拖动平移画布；其他工具中可按住 Space 临时平移。',zoom:'点击放大，Alt 点击缩小；也可双指缩放。',rotate:'按住拖动旋转画布视图，不改变图像像素。',cutout:'在顶部选择处理方式后运行抠图，保留原图。',upscale:'在顶部选择放大倍率后运行超分辨率处理。',
}
const layerTools=new Set(['brush','pencil','gradient-brush','brush-line','soft-brush','smudge','eraser','background-eraser','remove-object','healing','clone-stamp','patch','dodge','burn','mask','mask-quick','mask-gradient','mask-subject','pen','fill','gradient-fill'])
export function toolUnavailableReason(state:EditorState):string|undefined{
 if(['shape','shape-ellipse','shape-line','shape-arrow'].includes(state.activeToolId)) {
  return state.colorModel==='cmyk' ? '此工具需要 RGB 工作副本，请在文档模式中转换。' : undefined
 }
 if(!layerTools.has(state.activeToolId))return undefined
 const layer=state.layers.find(l=>l.id===state.selectedLayerId)
 if(!layer)return '请先选择一个图层。'
 const effective=effectiveLayerState(state.layers,layer.id)
 if(effective.locked)return '图层或编组已锁定，请解锁后编辑。'
 if(!effective.visible)return '当前图层不可见，请先显示图层。'
 if(state.colorModel==='cmyk')return '此工具需要 RGB 工作副本，请在文档模式中转换。'
 if(layer.highPrecision)return '此工具需要 8 位工作副本，请在高精度资源中创建。'
 if(layer.children||layer.kind==='adjustment'||layer.smartObject)return '请选择普通可编辑图层；智能对象请先进入源内容编辑。'
 return undefined
}
export function toolHint(state:EditorState){
 const reason=toolUnavailableReason(state)
 return reason??`${getTool(state.activeToolId)?.label??'工具'}：${toolInstructions[state.activeToolId]}${state.selectionVisible&&['fill','gradient-fill','brush','eraser'].includes(state.activeToolId)?' 当前仅作用于选区。':''}`
}
