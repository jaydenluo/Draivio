import {validateCanvasText,validateCanvasShape} from '../../document/projectValidation'
import type { EditablePath } from '../../vector/pathGeometry'
import { effectiveLayerState } from '../../state/layerHierarchy'
import type { EditorState, EditorAction } from '../../state/editor'
import type { CanvasTextObject } from '../../canvas/TextObject'
import type { CanvasShape } from '../../canvas/documentTypes'
import { editorReducer } from '../../state/editor'
export type TextShapeToolName='text'|'shape'
function finite(n:unknown,label:string){if(typeof n!=='number'||!Number.isFinite(n))throw new Error(`${label}必须是有限数字`);return n}
export function validateFiniteToolGeometry(value:unknown,depth=0):void{if(depth>12)throw new Error('几何参数过深');if(typeof value==='number')finite(value,'几何参数');else if(Array.isArray(value)){if(value.length>16384)throw new Error('几何参数过多');value.forEach(x=>validateFiniteToolGeometry(x,depth+1))}else if(value&&typeof value==='object')Object.values(value).forEach(x=>validateFiniteToolGeometry(x,depth+1))}
function point(value:unknown){if(!value||typeof value!=='object')throw new Error('几何控制点无效');const p=value as {x:unknown;y:unknown};finite(p.x,'x');finite(p.y,'y')}
export function validateEditableToolPath(path:EditablePath):void{
 if(!path||!Array.isArray(path.anchors)||path.anchors.length<2||path.anchors.length>4096||typeof path.closed!=='boolean'||!['nonzero','evenodd'].includes(path.fillRule))throw new Error('可编辑路径无效')
 for(const anchor of path.anchors){point(anchor);if(anchor.in!==undefined)point(anchor.in);if(anchor.out!==undefined)point(anchor.out)}
}
function shapeGeometry(shape:Omit<CanvasShape,'id'>){
 const validKinds = ['rectangle','ellipse','line','arrow','fill','gradient','path','boolean'] as const
 if(!validKinds.includes(shape.kind as typeof validKinds[number])) throw new Error('形状类型无效')
 if(!shape.rect)throw new Error('形状尺寸无效');for(const key of ['x','y','width','height'] as const)finite(shape.rect[key],'形状尺寸');finite(shape.strokeWidth,'描边宽度')
 if(shape.strokeWidth<0)throw new Error('描边宽度无效');if(shape.opacity!==undefined&&(finite(shape.opacity,'不透明度')<0||shape.opacity>100))throw new Error('不透明度无效')
 if(shape.from!==undefined)point(shape.from);if(shape.to!==undefined)point(shape.to)
 if(shape.path)validateEditableToolPath(shape.path);if(shape.kind==='path'&&!shape.path)throw new Error('路径缺少控制点')
 if(shape.boolean){validateEditableToolPath(shape.boolean.left);validateEditableToolPath(shape.boolean.right);if(!['union','difference','intersect','exclude'].includes(shape.boolean.mode))throw new Error('布尔运算模式无效')}
 if(shape.kind==='boolean'&&!shape.boolean)throw new Error('布尔形状缺少运算结构')
 validateCanvasShape(shape)
}
function nonemptyString(value:unknown,label:string){if(typeof value!=='string'||!value.trim())throw new Error(`${label}无效`)}
function textGeometry(object:Omit<CanvasTextObject,'id'>){
 validateCanvasText(object)
 point(object)
 if(typeof object.text!=='string'||!object.text.trim()||object.text.length>10000)throw new Error('文字内容为空或过长')
 nonemptyString(object.fontFamily,'字体');nonemptyString(object.fontWeight,'字重');nonemptyString(object.color,'文字颜色')
 if(!['left','center','right'].includes(object.align))throw new Error('文字对齐无效')
 if(object.layout!==undefined&&!['point','paragraph'].includes(object.layout))throw new Error('文字布局无效')
 if(finite(object.fontSize,'字号')<=0||object.fontSize>4096)throw new Error('字号无效')
 for(const key of ['width','height','lineHeight'] as const)if(object[key]!==undefined&&finite(object[key],'文字尺寸')<=0)throw new Error('文字尺寸无效')
 for(const key of ['letterSpacing','rotation'] as const)if(object[key]!==undefined)finite(object[key],'文字几何参数')
 if(object.runs!==undefined){
  if(!Array.isArray(object.runs)||object.runs.length>10000)throw new Error('文字样式范围无效')
  let end=0
  for(const run of object.runs){
   if(!run||!Number.isInteger(run.start)||!Number.isInteger(run.end)||run.start<end||run.end<=run.start||run.end>object.text.length)throw new Error('文字样式范围无效')
   end=run.end
   if(run.fontSize!==undefined&&(finite(run.fontSize,'样式字号')<=0||run.fontSize>4096))throw new Error('样式字号无效')
   for(const key of ['fontFamily','fontWeight','color','stroke','shadow'] as const)if(run[key]!==undefined)nonemptyString(run[key],'文字样式')
  }
 }
}
function layer(state:EditorState,id:string){
 if(typeof id!=='string'||!id.trim())throw new Error('目标图层 ID 无效')
 const matches=state.layers.filter(l=>l.id===id);if(!matches.length)throw new Error('目标图层不存在');if(matches.length!==1)throw new Error('目标图层 ID 不唯一')
 const x=matches[0];if(effectiveLayerState(state.layers,id).locked)throw new Error('目标图层已锁定')
 if(x.className==='layer-group'||x.children!==undefined||x.kind==='group'||x.kind==='mask'||x.kind==='adjustment'||x.smartObject)throw new Error('目标图层不支持直接添加文字或形状')
 return x
}
function objectId(state:EditorState,value:unknown){
 const id=value===undefined?crypto.randomUUID():value
 if(typeof id!=='string'||!id.trim())throw new Error('对象 ID 无效')
 if(state.layers.some(item=>item.id===id)||state.canvasShapes.some(item=>item.id===id)||state.canvasTexts.some(item=>item.id===id)||state.brushStrokes.some(item=>item.id===id)||state.sceneOrder.includes(id))throw new Error('对象 ID 已存在')
 return id
}
export function textAction(state:EditorState,object:Omit<CanvasTextObject,'id'> & {id?:string}):EditorAction { layer(state,object.layerId);validateFiniteToolGeometry(object);textGeometry(object);const id=objectId(state,object.id);return {type:'create-text-layer',object:{...object,id,layout:object.layout??'point'}} }
export function applyText(state:EditorState,object:Omit<CanvasTextObject,'id'> & {id?:string}){return editorReducer(state,textAction(state,object))}
export function shapeAction(state:EditorState,shape:Omit<CanvasShape,'id'> & {id?:string}):EditorAction {
 layer(state,shape.layerId); validateFiniteToolGeometry(shape); shapeGeometry(shape)
 if(!shape.rect||shape.rect.width<=0||shape.rect.height<=0)throw new Error('形状尺寸无效')
 const id=objectId(state,shape.id)
 return {type:'add-shape',shape:{...shape,id}}
}
export function applyShape(state:EditorState,shape:Omit<CanvasShape,'id'> & {id?:string}){return editorReducer(state,shapeAction(state,shape))}
