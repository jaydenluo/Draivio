import { manualToolNames, toolCapabilities, assertManualTool } from './toolCapabilities'
import type { EditorState } from '../../state/editor'
import { applyDrawingTool, type DrawingToolArgs } from './drawingTools'
import { applyText, applyShape } from './textShapeTools'
import type { CanvasShape } from '../../canvas/documentTypes'
import type { CanvasTextObject } from '../../canvas/TextObject'
import { applyRetouchResult, type RetouchRequest } from './retouchTools'
import type { PixelImage } from '../../canvas/rasterTools'
import { applyRelight, type RelightSettings } from '../workflows/relight'
import { executeGenerativeOperation, type GenerativeRequest } from './generativeTools'
import { generateRestoration } from './restorationTools'
import { effectiveLayerState } from '../../state/layerHierarchy'
import type { ServiceConnection } from '../../creation/serviceConnections'

function registered<Args extends unknown[],Result>(name:typeof manualToolNames[number],execute:(...args:Args)=>Result){
 return (...args:Args):Result=>{assertManualTool(name);return execute(...args)}
}
function lightingTarget(state:EditorState,id:string){
 const targets=state.layers.filter(layer=>layer.id===id)
 if(typeof id!=='string'||!id.trim()||targets.length!==1)throw new Error('目标图层不存在或身份不唯一')
 const target=targets[0]
 if(effectiveLayerState(state.layers,id).locked)throw new Error('目标图层或所属组已锁定')
 if(target.className==='layer-group'||target.children!==undefined||['text','shape','group','mask','adjustment'].includes(target.kind??''))throw new Error('仅支持图片内容图层')
}
function restore(...args:Parameters<typeof generateRestoration>){
 const [state,documentId,settings,infer]=args
 if(typeof documentId!=='string'||!documentId.trim())throw new Error('文档身份无效')
 if(settings.scale!==2&&settings.scale!==4)throw new Error('仅支持 2 倍或 4 倍增强')
 if(typeof infer!=='function')throw new Error('未配置真实修复模型推理')
 lightingTarget(state,state.selectedLayerId)
 return generateRestoration(...args)
}
function generateFor(allowed:readonly GenerativeRequest['operation'][],connection:ServiceConnection,request:GenerativeRequest){
 if(!allowed.includes(request.operation))throw new Error('请求操作与注册入口不匹配')
 return executeGenerativeOperation(connection,request)
}

/** Explicit typed manual adapters. These are not model-plan executors; capability catalog defines the boundary. */
export const aiManualToolCoverage = {
  brush: { kind: 'drawing', execute: registered('brush', (state: EditorState, args: DrawingToolArgs) => applyDrawingTool(state, 'brush', args)) },
  fill: { kind: 'drawing', execute: registered('fill', (state: EditorState, args: DrawingToolArgs) => applyDrawingTool(state, 'fill', args)) },
  gradientFill: { kind: 'drawing', execute: registered('gradientFill', (state: EditorState, args: DrawingToolArgs) => applyDrawingTool(state, 'gradient-fill', args)) },
  pathBoolean: { kind: 'vector', execute: registered('pathBoolean', (state: EditorState, args: DrawingToolArgs) => applyDrawingTool(state, 'path-boolean', args)) },
  text: { kind: 'text', execute: registered('text', (state: EditorState, object: Omit<CanvasTextObject, 'id'> & { id?: string }) => applyText(state, object)) },
  shape: { kind: 'vector', execute: registered('shape', (state: EditorState, shape: Omit<CanvasShape, 'id'> & { id?: string }) => applyShape(state, shape)) },
  retouch: { kind: 'retouch', execute: registered('retouch', (state: EditorState, request: RetouchRequest, before: PixelImage, after: PixelImage) => applyRetouchResult(state, request, before, after)) },
  relight: { kind: 'lighting', execute: registered('relight', (state: EditorState, args: RelightSettings & { layerId: string }) => { lightingTarget(state,args.layerId);return applyRelight(state,args.layerId,args) }) },
  generate: { kind: 'generation', execute: registered('generate', (connection: ServiceConnection, request: GenerativeRequest & {operation:'generate'}) => generateFor(['generate'],connection,request)) },
  reference: { kind: 'generation', execute: registered('reference', (connection: ServiceConnection, request: GenerativeRequest & {operation:'reference'|'fill'|'remove'}) => generateFor(['reference','fill','remove'],connection,request)) },
  outpaint: { kind: 'generation', execute: registered('outpaint', (connection: ServiceConnection, request: GenerativeRequest & {operation:'outpaint'}) => generateFor(['outpaint'],connection,request)) },
  restoration: { kind: 'restoration', execute: registered('restoration', restore) },
  semanticPathSelection: { kind: 'unsupported', reason: '需要真实视觉模型候选；AI 不能猜测路径或绕过用户确认。' },
} as const
export type AiManualToolName = keyof typeof aiManualToolCoverage
export function getAiManualTool<Name extends AiManualToolName>(name: Name) { return aiManualToolCoverage[name] }

export function getManualToolCapability(name: AiManualToolName) { return toolCapabilities[name] }
export const registeredManualToolNames = manualToolNames
