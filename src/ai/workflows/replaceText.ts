import { editorReducer, type EditorState, type EditorAction } from '../../state/editor'
import type { CanvasTextObject } from '../../canvas/TextObject'
import { effectiveLayerState } from '../../state/layerHierarchy'
import { contentRevision } from '../context/editorContext'
import { chooseOcrCandidate, type OcrCandidate } from '../vision/ocr'

export type ReplaceTextRequest = { query: string; replacement: string; candidateId?: string; minimumConfidence?: number; confirmLowConfidence?: boolean; fontFamily?: string; fontAvailable?: boolean; confirmFontFallback?: boolean; color?: string; repairSource?: string; repairCoverage?: string; baseContentRevision?: string; baseUndoLength?: number }
export type ReplaceTextPlan = { mode: 'text-layer'|'flat-image'; candidateId?: string; actions: EditorAction[]; warning?: string }
function editable(state:EditorState,id:string){const layer=state.layers.find(l=>l.id===id);if(!layer)throw new Error('找不到目标图层');const effective=effectiveLayerState(state.layers,id);if(effective.locked||!effective.visible)throw new Error('目标或祖先图层已锁定或隐藏')}
export function isGenericReplacementFont(family:string){return ['sans-serif','serif','monospace','system-ui'].includes(family.trim().toLowerCase())}
function confirmFont(family:string,request:ReplaceTextRequest){if(!isGenericReplacementFont(family)&&!request.confirmFontFallback)throw new Error(`字体未验证：${family}；请确认可能回退为系统字体或选择通用替代字体`)}
export function createTextReplacementPlan(state: EditorState, request: ReplaceTextRequest, candidates: readonly OcrCandidate[] = []): ReplaceTextPlan {
  if(request.baseContentRevision!==undefined&&contentRevision(state)!==request.baseContentRevision)throw new Error('文档已更改，请重新识别')
  if(request.baseUndoLength!==undefined&&state.undoStack.length!==request.baseUndoLength)throw new Error('文档已更改，请重新识别')
  if(request.fontAvailable===false)throw new Error(`字体不可用：${request.fontFamily??'未知字体'}`)
  const objects=candidates.some(c=>c.id===request.candidateId)?[]:state.canvasTexts.filter(item=>item.text===request.query)
  if(objects.length){
    const object=request.candidateId?objects.find(x=>x.id===request.candidateId):objects.length===1?objects[0]:undefined
    if(!object)throw new Error('发现多个相同文字，请明确选择位置')
    editable(state,object.layerId)
    confirmFont(request.fontFamily??object.fontFamily,request)
    const next:CanvasTextObject={...object,text:request.replacement,...(request.fontFamily?{fontFamily:request.fontFamily}:{}),...(request.color?{color:request.color}:{})}
    return {mode:'text-layer',candidateId:object.id,actions:[{type:'upsert-text',object:next}]}
  }
  const candidate=chooseOcrCandidate(candidates,request.query,request.candidateId,request.confirmLowConfidence&&request.candidateId?0:request.minimumConfidence??.8)
  confirmFont(request.fontFamily??'sans-serif',request)
  const baseLayerId=candidate.sourceLayerId??state.selectedLayerId
  editable(state,baseLayerId)
  if(!request.repairSource)throw new Error('请先预览并确认文字修补结果')
  const [a,b,,d]=candidate.quad,layerId=`ocr-text-${candidate.id}-${Date.now()}`
  const width=Math.hypot(b.x-a.x,b.y-a.y),height=Math.hypot(d.x-a.x,d.y-a.y)
  if(width<1||height<1)throw new Error('OCR 四边形面积无效')
  const text:CanvasTextObject={id:`${layerId}-object`,layerId,x:a.x/state.documentWidth*100,y:a.y/state.documentHeight*100,text:request.replacement,layout:'paragraph',width,height:Math.max(height,height*1.3),rotation:Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI,fontFamily:request.fontFamily??'sans-serif',fontSize:Math.max(8,height*.8),fontWeight:'400',color:request.color??'#000000',align:'left',lineHeight:1.2,letterSpacing:0}
  // Repair must be reduced against the original revision, before adding editable text.
  return {mode:'flat-image',candidateId:candidate.id,actions:[{type:'add-repair-layer',baseLayerId,source:request.repairSource,name:`文字修补 · ${candidate.text}`,preserveSourceAlpha:true,repairCoverage:request.repairCoverage,baseContentRevision:request.baseContentRevision,baseUndoLength:request.baseUndoLength,repairSourceIds:[baseLayerId]},{type:'create-text-layer',object:text}],warning:'OCR 无法识别原字体；请明确选择替代字体并检查排版。'}
}
export function textReplacementDocument(state:EditorState,plan:ReplaceTextPlan):EditorState{
 let next=state
 for(const action of plan.actions){const previous=next;next=editorReducer(next,action);if(next.undoStack.length!==previous.undoStack.length+1)throw new Error(next.notice||'文字替换未写入')}
 return next
}
export function applyTextReplacementPlan(state:EditorState,plan:ReplaceTextPlan,dispatch:(action:EditorAction)=>void){const document=textReplacementDocument(state,plan);dispatch({type:'apply-edit-plan',document});return document}
