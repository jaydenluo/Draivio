import { effectiveLayerState, layerParentId } from '../../state/layerHierarchy'
import { validateFiniteToolGeometry,validateEditableToolPath } from './textShapeTools'
import type { EditorState, EditorAction } from '../../state/editor'
import type { BrushStroke, BrushPoint } from '../../canvas/BrushEngine'
import type { Selection } from '../../canvas/selectionGeometry'
import type { CanvasShape } from '../../canvas/documentTypes'
import { editorReducer } from '../../state/editor'

export type DrawingToolName = 'brush' | 'fill' | 'gradient-fill' | 'path-boolean'
export type DrawingToolArgs = {
  layerId: string; points?: BrushPoint[]; size?: number; hardness?: number; opacity?: number; flow?: number; smoothing?: number; color?: string; mode?: BrushStroke['mode'];
  selection?: Selection; shape?: CanvasShape; sourceIds?: string[]; booleanMode?: 'union'|'difference'|'intersect'|'exclude'
}
const finite = (n: unknown, label: string) => { if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error(`${label}必须是有限数字`); return n }
function target(state: EditorState, id: string) { const layer = state.layers.find(l => l.id === id); if (!layer) throw new Error('目标图层不存在'); if (effectiveLayerState(state.layers,id).locked) throw new Error('目标图层已锁定'); if(layer.transform||layerParentId(state.layers,id))throw new Error('绘画适配仅支持未变换的根图层');return layer }
function points(points: unknown): BrushPoint[] { if (!Array.isArray(points) || points.length < 1 || points.length > 4096) throw new Error('笔刷轨迹必须包含 1–4096 个控制点'); return points.map((p) => { if (!p || typeof p !== 'object') throw new Error('笔刷控制点无效'); const x=finite((p as BrushPoint).x,'笔刷 x'), y=finite((p as BrushPoint).y,'笔刷 y'); if(x<0||x>100||y<0||y>100) throw new Error('笔刷控制点必须位于画板 0–100%'); return { x, y, ...((p as BrushPoint).pressure === undefined ? {} : {pressure: Math.max(0,Math.min(1,finite((p as BrushPoint).pressure,'压力')))}) } }) }
function selectionRequired(state:EditorState):Selection {
 const selection=state.selection
 if(!state.selectionVisible||!selection||!Number.isFinite(selection.rect.width)||!Number.isFinite(selection.rect.height)||selection.rect.width<=0||selection.rect.height<=0)throw new Error('AI 绘画工具需要文档当前有效选区')
 validateFiniteToolGeometry(selection);return selection
}
export function validateDrawingTool(state: EditorState, name: DrawingToolName, args: DrawingToolArgs) {
 target(state,args.layerId)
 if (name === 'brush') {
  const ps=points(args.points),size=finite(args.size??16,'笔刷尺寸');if(size<=0||size>2048)throw new Error('笔刷尺寸必须在 0–2048')
  for(const key of ['hardness','opacity','flow','smoothing'] as const){const v=finite(args[key]??(key==='smoothing'?0:100),key);if(v<0||v>100)throw new Error(`${key}必须在 0–100`)}
  if(!['paint','erase'].includes(args.mode??'paint'))throw new Error('笔刷模式仅支持绘画或擦除')
  if(typeof(args.color??'#000000')!=='string')throw new Error('笔刷颜色无效')
  if(state.selectionVisible){
   const selection=selectionRequired(state),path=selection.path
   if(path.type!=='shape'||path.kind!=='rectangle'||selection.feather!==0)throw new Error('当前笔刷适配仅支持无羽化矩形选区；复杂轮廓请使用手工画布工具')
   const padding=size/2+(100-(args.hardness??100))/100*size/5*3
   const rx=padding/state.documentWidth*100,ry=padding/state.documentHeight*100,r=path.rect
   if(ps.some(p=>p.x-rx<r.x||p.x+rx>r.x+r.width||p.y-ry<r.y||p.y+ry>r.y+r.height))throw new Error('笔刷完整轨迹与软边必须位于当前选区内')
  }
  return
 }
 if(name==='fill'||name==='gradient-fill'){selectionRequired(state);if(typeof(args.color??'#000000')!=='string'||name==='gradient-fill'&&!args.color)throw new Error('填充需要颜色');return}
 if (name === 'path-boolean') { if(!Array.isArray(args.sourceIds)||args.sourceIds.length!==2||args.sourceIds.some(id=>typeof id!=='string')) throw new Error('路径布尔运算需要两个来源'); const shapes=args.sourceIds.map(id=>state.canvasShapes.find(s=>s.id===id)); shapes.forEach(s=>{validateFiniteToolGeometry(s);if(s?.path)validateEditableToolPath(s.path)});if(shapes.some(s=>!s||!s.path)) throw new Error('路径布尔运算来源必须是可编辑路径'); if(args.sourceIds.some(id=>state.canvasShapes.find(s=>s.id===id)?.layerId!==args.layerId)) throw new Error('路径来源必须属于目标图层'); if(!['union','difference','intersect','exclude'].includes(args.booleanMode ?? 'union')) throw new Error('路径布尔模式无效'); }
}
export function drawingToolAction(state: EditorState, name: DrawingToolName, args: DrawingToolArgs): EditorAction {
 validateDrawingTool(state,name,args)
 if(name==='brush') return {type:'commit-brush-stroke',stroke:{id:crypto.randomUUID(),layerId:args.layerId,mode:args.mode??'paint',points:points(args.points),size:args.size??16,hardness:args.hardness??100,opacity:args.opacity??100,flow:args.flow??100,smoothing:args.smoothing??0,color:args.color??'#000000'}}
 if(name==='fill'||name==='gradient-fill') return {type:'add-shape',shape:{id:crypto.randomUUID(),layerId:args.layerId,kind:name==='fill'?'fill':'gradient',rect:structuredClone(state.selection.rect),color:args.color??'#000000',endColor:name==='gradient-fill'?'#ffffff':undefined,strokeWidth:0,selection:structuredClone(state.selection)}}
 const [left,right]=args.sourceIds!; const shape:CanvasShape={id:crypto.randomUUID(),layerId:args.layerId,kind:'boolean',rect:{x:0,y:0,width:100,height:100},color:args.color??'#000000',strokeWidth:0,boolean:{left:state.canvasShapes.find(s=>s.id===left)!.path!,right:state.canvasShapes.find(s=>s.id===right)!.path!,mode:args.booleanMode??'union',sourceIds:[left,right]}}; return {type:'combine-shapes',shape,sourceIds:[left,right]}
}
export function applyDrawingTool(state: EditorState,name: DrawingToolName,args: DrawingToolArgs): EditorState { return editorReducer(state,drawingToolAction(state,name,args)) }
