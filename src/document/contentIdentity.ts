import type { EditorState } from '../state/editor'

// Editor artwork is immutable: pixel/profile writers publish a new asset or
// typed array. Cache by that committed object, never by runtime preview handles.
const identities = new WeakMap<object, string>()
const strings = new Map<string, string>()
let stringUnits = 0
function digest(text: string): string {
  let a=2166136261,b=5381
  for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b,33)^text.charCodeAt(i)}
  return `${text.length}:${a>>>0}:${b>>>0}`
}
export function artworkIdentity(value: unknown): string {
  if(typeof value==='string') {
    if(value.length<1024)return digest(value)
    let cached=strings.get(value)
    if(!cached){cached=digest(value);if(stringUnits+value.length>32*1024*1024){strings.clear();stringUnits=0}if(value.length<=32*1024*1024){strings.set(value,cached);stringUnits+=value.length}}
    return cached
  }
  if(!value||typeof value!=='object')return `${typeof value}:${String(value)}`
  const cached=identities.get(value);if(cached)return cached
  let parts:string[]
  if(ArrayBuffer.isView(value))parts=Array.from(new Uint8Array(value.buffer,value.byteOffset,value.byteLength),String)
  else if(Array.isArray(value))parts=value.map(artworkIdentity)
  else {
    const record=value as Record<string,unknown>
    parts=Object.keys(record).sort().filter(key=>record[key]!==undefined && key!=='thumbnail' && key!=='collapsed' && !(key==='data' && typeof record.checksum==='string') && !(record.rasterRef && ['source','previewSource','dataUrl'].includes(key))).map(key=>`${key}:${artworkIdentity(record[key])}`)
  }
  const result=digest(parts.join('|'));identities.set(value,result);return result
}
// Selection, view, tool preferences and loading/cache state do not modify artwork.
const ARTWORK_FIELDS = ['documentWidth','documentHeight','documentBackground','pixelFormat','colorModel','colorManagement','proofSettings','cmykRaster','cmykProfile','layers','brushStrokes','canvasTexts','canvasShapes','layerMasks','sceneOrder','smartObjectSources','artboards'] as const
export function artworkRevision(state: EditorState, layers=state.layers): string {
  return artworkIdentity(ARTWORK_FIELDS.map(key=>key==='layers'?layers:(state as unknown as Record<string,unknown>)[key]))
}
export function savedContentIdentity(state: EditorState): string {
  // These project records are persistent, but do not invalidate a rendering/AI basis.
  return artworkIdentity([artworkRevision(state),state.guideSettings,state.savedRecipes,state.conversationRuns,state.aiResults,state.adjustmentPresets])
}
