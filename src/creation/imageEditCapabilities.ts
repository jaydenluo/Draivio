import type { ServiceConnection } from './serviceConnections'

export type ImageQuality = 'auto' | 'low' | 'medium' | 'high'
export type ImageInputEncoding = 'base64-json' | 'multipart'
export type ImageModelCapabilities = {
  maskedEdit?: { semantics: 'transparent-edit' | 'white-edit'; maxDimension?:number }
  generate: boolean
  edit: boolean
  reference: boolean
  encoding: ImageInputEncoding
  sizes?: readonly string[]
  quality?: readonly ImageQuality[]
  supportsSteps?: boolean
  supportsGuidance?: boolean
  supportsStrength?: boolean
}

/** Built-in capabilities for the image models supported by the shipped adapters. */
function presetCapabilities(connection: ServiceConnection, model: string): ImageModelCapabilities | undefined {
  const normalized = model.trim().toLowerCase()
  if (connection.protocol === 'openai_compatible' && /^gpt-image(?:-[\w.]+)*$/.test(normalized)) {
    return { generate: true, edit: true, reference: true, encoding: 'multipart', sizes: ['auto', '1024x1024', '1536x1024', '1024x1536'], quality: ['auto', 'low', 'medium', 'high'], maskedEdit: { semantics: 'transparent-edit' } }
  }
  if (connection.protocol === 'volcengine' && /(?:^|[-_])seedream(?:[-_.\w]+)?$/.test(normalized)) {
    return { generate: true, edit: true, reference: true, encoding: 'base64-json' }
  }
  return undefined
}

export function imageCapabilitiesFor(connection: ServiceConnection, model: string): ImageModelCapabilities {
  const declared = connection.imageCapabilities?.[model]
  if (declared) return declared
  const preset = presetCapabilities(connection, model)
  if (preset) return preset
  return { generate: ['openai_compatible','volcengine'].includes(connection.protocol), edit:false, reference:false, encoding:'base64-json' }
}
export function imageSupports(capabilities: ImageModelCapabilities, intent: 'generate' | 'edit' | 'reference') {
  return intent === 'edit' || intent === 'reference' ? capabilities.edit && capabilities.reference : capabilities.generate
}
export function filterImageParameters(parameters: { size?: string; quality?: string; steps?: number; guidance?: number; strength?: number }, capabilities: ImageModelCapabilities) {
  return {
    ...(parameters.size && (!capabilities.sizes || capabilities.sizes.map(normalizeImageSize).includes(normalizeImageSize(parameters.size))) ? { size: parameters.size } : {}),
    ...(parameters.quality && capabilities.quality?.includes(parameters.quality as ImageQuality) ? { quality: parameters.quality } : {}),
    ...(capabilities.supportsSteps && Number.isFinite(parameters.steps) ? { steps: parameters.steps } : {}),
    ...(capabilities.supportsGuidance && Number.isFinite(parameters.guidance) ? { guidance: parameters.guidance } : {}),
    ...(capabilities.supportsStrength && Number.isFinite(parameters.strength) ? { strength: parameters.strength } : {}),
  }
}

/** Mask semantics must be known; generic edit/reference support never implies masked editing. */
export function maskedEditCapability(connection: ServiceConnection, model: string) {
  if(!['openai_compatible','volcengine'].includes(connection.protocol))return null
  const declared = imageCapabilitiesFor(connection,model)
  if (declared?.edit && declared.reference && declared.maskedEdit && ['transparent-edit','white-edit'].includes(declared.maskedEdit.semantics)) return declared.maskedEdit
  return null
}
export function imageSupportsMaskedEdit(connection: ServiceConnection, model: string) { return !!maskedEditCapability(connection, model) }

export function normalizeImageSize(size:string){return size.trim().replace(/\s/g,'').replace(/[×X]/g,'x')}
export function validImageCapabilities(value:unknown):boolean{
 if(value===undefined)return true
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 return Object.values(value).every((c:unknown)=>{
  if(!c||typeof c!=='object'||Array.isArray(c))return false
  const v=c as Record<string,unknown>
  if(!['generate','edit','reference'].every(k=>typeof v[k]==='boolean')||!['multipart','base64-json'].includes(v.encoding as string))return false
  if(v.edit&&!v.reference)return false
  if(v.sizes!==undefined&&(!Array.isArray(v.sizes)||!v.sizes.length||!v.sizes.every(s=>typeof s==='string'&&(s==='auto'||/^[1-9]\d*x[1-9]\d*$/.test(normalizeImageSize(s))))))return false
  if(v.quality!==undefined&&(!Array.isArray(v.quality)||!v.quality.every(q=>['auto','low','medium','high'].includes(q as string))))return false
  if(['supportsSteps','supportsGuidance','supportsStrength'].some(k=>v[k]!==undefined&&typeof v[k]!=='boolean'))return false
  if(v.maskedEdit!==undefined){const m=v.maskedEdit as Record<string,unknown>;if(!m||typeof m!=='object'||!v.edit||!v.reference||!['transparent-edit','white-edit'].includes(m.semantics as string)||m.maxDimension!==undefined&&(!Number.isInteger(m.maxDimension)||(m.maxDimension as number)<64||(m.maxDimension as number)>2048))return false}
  return true
 })
}
