import type { ComposerParameters } from '../state/editor'
import type { ImageOverrides } from './chatImageParameters'
export type GenerationMetadata = {
 defaults: ComposerParameters
 resolved: ComposerParameters
 overrides: ImageOverrides
 sent: { size?: string; quality?: string; strength?: number; n?: number }
 operation: string
}
// Copy only documented scalar parameters; never archive provider credentials or image inputs.
export function copyGenerationMetadata(value: GenerationMetadata): GenerationMetadata {
 const parameters=(p:ComposerParameters)=>({model:p.model,size:p.size,ratio:p.ratio,count:p.count,strength:p.strength})
 const overrides:ImageOverrides={}
 for(const key of ['count','ratio','size','model','quality','strength'] as const){
  if(value.overrides[key]!==undefined)Object.assign(overrides,{[key]:value.overrides[key]})
 }
 const sent:GenerationMetadata['sent']={}
 for(const key of ['size','quality','strength','n'] as const){
  if(value.sent[key]!==undefined)Object.assign(sent,{[key]:value.sent[key]})
 }
 return {defaults:parameters(value.defaults),resolved:parameters(value.resolved),overrides,sent,operation:value.operation}
}
