import { validateProductRecord } from '../ai/recipes/product'
import { validateConversationRuns } from '../ai/conversation/session'
import { validatePrecisionAsset } from '../render/precisionAsset'
import { validateSmartFilters } from '../render/filterPipeline'
import { validateEffects } from '../render/layerEffects'
import { resolveBlendMode } from '../render/blendModes'
import { capabilityFor, type PixelFormat } from '../render/pixelBuffer'
import { validateCurves } from '../adjustments/curves'
import { validateLevels } from '../adjustments/levels'
import { validateClipping } from '../state/clipping'
import type { EditorState, Layer } from '../state/editor'
import { normalizeColorManagement } from '../color/iccPipeline'
import { dimensionError } from './documentGeometry'
import { validateGuideSettings } from './guides'
import { smartObjectState, validateSmartObjectGraph, type SmartObjectSource } from './smartObjects'
import { validateRawSourceRecord } from '../raw/rawPipeline'
import { validateGeometryCommand } from '../ai/tools/geometryTools'
import { validateArtboard } from '../canvas/artboards'

type RecordValue = Record<string, unknown>
function fail(path: string): never { throw new Error(`项目文档结构无效：${path}`) }
function object(value: unknown, path: string): RecordValue { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path); return value as RecordValue }
function string(value: unknown, path: string, nonempty = false) { if (typeof value !== 'string' || nonempty && !value.trim()) fail(path) }
function number(value: unknown, path: string, min = -Infinity, max = Infinity) { if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(path) }
function bool(value: unknown, path: string) { if (typeof value !== 'boolean') fail(path) }
function choice(value: unknown, values: string[], path: string) { if (!values.includes(value as string)) fail(path) }
function array(value: unknown, path: string): unknown[] { if (!Array.isArray(value)) fail(path); return value as unknown[] }
function strings(value: unknown, path: string) { array(value, path).forEach(v => string(v, path, true)) }
function point(value: unknown, path: string) { const v = object(value, path); number(v.x, `${path}.x`); number(v.y, `${path}.y`) }
function vectorPath(value: unknown, path: string) { const p = object(value, path); bool(p.closed, `${path}.closed`); choice(p.fillRule, ['nonzero','evenodd'], `${path}.fillRule`); const anchors = array(p.anchors, `${path}.anchors`); if (anchors.length > 10000) fail(path); anchors.forEach((a,i) => { point(a, `${path}.${i}`); const q = object(a,path); if (q.in !== undefined) point(q.in,path); if (q.out !== undefined) point(q.out,path) }) }
function rect(value: unknown, path: string) { const v = object(value, path); point(v, path); number(v.width, `${path}.width`, 0); number(v.height, `${path}.height`, 0) }
function selectionPath(value: unknown, path: string, depth = 0) {
  if (depth > 32) fail(`${path} 嵌套过深`)
  const v = object(value, path), next = (x: unknown) => selectionPath(x, path, depth + 1)
  switch (v.type) {
    case 'shape': choice(v.kind, ['rectangle', 'ellipse', 'path'], path); rect(v.rect, path); break
    case 'boolean': choice(v.mode, ['add', 'subtract', 'intersect'], path); next(v.left); next(v.right); break
    case 'inverse': next(v.source); rect(v.sourceRect, path); break
    case 'transform': next(v.source); rect(v.from, path); rect(v.to, path); break
    case 'affine': next(v.source); if (array(v.matrix, path).length !== 6) fail(path); (v.matrix as unknown[]).forEach(n => number(n, path)); break
    case 'path': string(v.d, path); array(v.points, path).forEach(p => point(p, path)); break
    case 'raster': string(v.d, path); strings(v.rows, path); if (!(v.rows as string[]).length || !(v.rows as string[]).every(row => /^[01]+$/.test(row) && row.length === (v.rows as string[])[0].length)) fail(path); break
    default: fail(path)
  }
}
function selection(value: unknown, path: string) {
  const v = object(value, path); choice(v.kind, ['rectangle', 'ellipse', 'path'], path); choice(v.mode, ['new', 'add', 'subtract', 'intersect'], path)
  rect(v.rect, path); selectionPath(v.path, `${path}.path`); number(v.feather, path, 0, 100); if (v.fixedRatio !== null) number(v.fixedRatio, path, Number.MIN_VALUE)
}
function operation(value: unknown, path: string) {
  const v = object(value, path); choice(v.mode, ['generate', 'edit'], path); string(v.prompt, path); string(v.sourceLayerId, path); if (v.selection !== null) selection(v.selection, path)
  if(v.restoration!==undefined){const r=object(v.restoration,'restoration');for(const key of ['width','height']){number(r[key],`restoration.${key}`,1,16384);if(!Number.isInteger(r[key]))fail(`restoration.${key}`)}if(r.scale!==2&&r.scale!==4)fail('restoration.scale');choice(r.mode,['size','detail','deblur'],'restoration.mode');string(r.backend,'restoration.backend',true)}
  if(v.outpaint!==undefined){const o=object(v.outpaint,'outpaint');number(o.calls,'outpaint.calls',1,64);number(o.limit,'outpaint.limit',64,2048);number(o.overlap,'outpaint.overlap',1,1024);choice(o.semantics,['transparent-edit','white-edit'],'outpaint.semantics');const e=object(o.expansion,'outpaint.expansion');for(const k of ['width','height','originalWidth','originalHeight','x','y'])number(e[k],`outpaint.expansion.${k}`,0,16384);for(const key of ['source']){const r=object(o[key],`outpaint.${key}`);string(r.source,`outpaint.${key}.source`,true)}if((o.tiles as unknown[])?.length!==o.calls)fail('outpaint.calls');if((e.width as number)*(e.height as number)>16777216||(e.originalWidth as number)<1||(e.originalHeight as number)<1||(e.x as number)+(e.originalWidth as number)>(e.width as number)||(e.y as number)+(e.originalHeight as number)>(e.height as number))fail('outpaint.expansion');array(o.tiles,'outpaint.tiles').forEach(tile=>{const t=object(tile,'outpaint.tile');for(const key of ['source','mask','raw']){const r=object(t[key],`outpaint.tile.${key}`);string(r.source,`outpaint.tile.${key}.source`,true)}rect(t.crop,'outpaint.tile.crop')})}
  if(v.maskedEdit!==undefined){const m=object(v.maskedEdit,'maskedEdit');string(m.batchId,'maskedEdit.batchId',true);choice(m.operation,['remove','replace'],'maskedEdit.operation');if(m.protectedLayerIds!==undefined)strings(m.protectedLayerIds,'maskedEdit.protectedLayerIds');choice(m.semantics,['transparent-edit','white-edit'],'maskedEdit.semantics');number(m.width,'maskedEdit.width',1,16384);number(m.height,'maskedEdit.height',1,16384);rect(m.crop,'maskedEdit.crop');for(const key of ['source','target','mask','raw','replacement']){if(m[key]!==undefined){const resource=object(m[key],`maskedEdit.${key}`);string(resource.source,`maskedEdit.${key}.source`,true)}}}
  parameters(v.parameters, path); for (const key of ['sourceId', 'modelCode', 'batchId', 'sourceImage']) if (v[key] !== undefined) string(v[key], path)
}
function parameters(value: unknown, path: string) { const v = object(value, path); for (const key of ['model', 'size', 'ratio', 'count', 'strength']) string(v[key], `${path}.${key}`) }
function stroke(value: unknown, path: string, layerIds: Set<string>) {
  const v = object(value, path); string(v.id, path, true); if (!layerIds.has(v.layerId as string)) fail(`${path}.layerId`)
  choice(v.mode, ['paint', 'erase', 'mask'], path); string(v.color, path); number(v.size, path, 0)
  for (const key of ['hardness', 'opacity', 'flow', 'smoothing']) number(v[key], `${path}.${key}`, 0, 100)
  array(v.points, path).forEach(p => { point(p, path); const q = object(p, path); for (const key of ['pressure', 'tiltX', 'tiltY']) if (q[key] !== undefined) number(q[key], path) })
}
function validateLayer(value: unknown, path: string) {
  const layer = object(value, path)
  if (layer.posterProtection !== undefined) { const protection = object(layer.posterProtection, `${path}.posterProtection`); choice(protection.reason, ['logo-protected','source-protected'], `${path}.posterProtection.reason`); string(protection.sourceLayerId, `${path}.posterProtection.sourceLayerId`, true) }
  if (layer.highPrecision !== undefined) validatePrecisionAsset(layer.highPrecision)
  if (layer.warpRecipe !== undefined) { const recipe = object(layer.warpRecipe, `${path}.warpRecipe`); if (recipe.kind === 'perspective') validateGeometryCommand({ op: 'geometry', kind: 'perspective', quad: recipe.quad as never }); else if (recipe.kind === 'radial') validateGeometryCommand({ op: 'geometry', kind: 'radial', distortion: recipe.distortion as number, center: recipe.center as never }); else if (recipe.kind === 'mesh') validateGeometryCommand({ op: 'geometry', kind: 'mesh', controls: recipe.controls as never }); else fail(`${path}.warpRecipe.kind`) }
  if (layer.rawSource !== undefined) validateRawSourceRecord(layer.rawSource)
  string(layer.id, `${path}.id`, true)
  for (const key of ['name', 'className', 'blendMode']) string(layer[key], `layer.${key}`)
  if(layer.sourceInterpolation!==undefined)choice(layer.sourceInterpolation,['nearest'],'layer.sourceInterpolation')
  if (layer.kind !== undefined) choice(layer.kind, ['image', 'text', 'shape', 'group', 'mask', 'adjustment', 'ai-result'], `${path}.kind`)
  resolveBlendMode(layer.blendMode as string)
  if(layer.clipBaseId!==undefined)string(layer.clipBaseId,'layer.clipBaseId',true)
  bool(layer.visible, 'layer.visible'); number(layer.opacity, 'layer.opacity', 0, 100)
  for (const key of ['locked', 'collapsed', 'documentSpace']) if (layer[key] !== undefined) bool(layer[key], `layer.${key}`)
  for (const key of ['source', 'thumbnail', 'repairCoverage']) if (layer[key] !== undefined) string(layer[key], `layer.${key}`, true)
  for (const key of ['contentWidth', 'contentHeight']) if (layer[key] !== undefined) number(layer[key], `layer.${key}`, Number.MIN_VALUE, 16384)
  if (layer.transform !== undefined) { const t = object(layer.transform, 'transform'); choice(t.kind, ['crop', 'transform'], 'transform.kind'); rect(t.rect, 'transform.rect'); number(t.rotation, 'transform.rotation'); bool(t.flipX, 'flipX'); bool(t.flipY, 'flipY'); if(t.affine!==undefined){const m=array(t.affine,'transform.affine');if(m.length!==6)fail('transform.affine');m.forEach(n=>number(n,'transform.affine'));if(Math.abs((m[0] as number)*(m[3] as number)-(m[1] as number)*(m[2] as number))<1e-8)fail('transform.affine不可逆')}  }
  if (layer.adjustmentsEnabled !== undefined) bool(layer.adjustmentsEnabled, 'layer.adjustmentsEnabled')
  if (layer.adjustments !== undefined) { const a = object(layer.adjustments, 'adjustments'); for (const key of ['brightness', 'contrast', 'saturation', 'temperature', 'sharpness', 'blur', 'shadows', 'highlights']) number(a[key], `adjustments.${key}`); if (a.tint !== undefined) number(a.tint, 'adjustments.tint', -100, 100); if (a.exposureEV !== undefined) number(a.exposureEV, 'adjustments.exposureEV', -24, 24); if (a.whiteBalance !== undefined) { const wb = object(a.whiteBalance, 'adjustments.whiteBalance'); for (const key of ['r','g','b']) number(wb[key], `adjustments.whiteBalance.${key}`, 0.01, 100) } if (a.curves !== undefined) validateCurves(a.curves); if (a.levels !== undefined) validateLevels(a.levels) }
  if (layer.smartFilters !== undefined) validateSmartFilters(layer.smartFilters)
  if (layer.effects !== undefined) validateEffects(layer.effects)
  if (layer.smartObject !== undefined) { const instance = object(layer.smartObject, 'smartObject'); string(instance.sourceId, 'smartObject.sourceId', true); bool(instance.linked, 'smartObject.linked'); number(instance.instanceWidth, 'smartObject.instanceWidth', Number.MIN_VALUE, 16384); number(instance.instanceHeight, 'smartObject.instanceHeight', Number.MIN_VALUE, 16384) }
  if (layer.aiOperation !== undefined) operation(layer.aiOperation, 'aiOperation')
  if (layer.groupId !== undefined) string(layer.groupId, `${path}.groupId`, true)
  if (layer.children !== undefined) {
    strings(layer.children, `${path}.children`)
    if (new Set(layer.children as string[]).size !== (layer.children as string[]).length || (layer.children as string[]).includes(layer.id as string)) fail(`${path}.children`)
  }
  if (layer.productRecipe !== undefined) validateProductRecord(layer.productRecipe)
  if (layer.preserveSourceAlpha !== undefined && typeof layer.preserveSourceAlpha !== 'boolean') throw new Error('layer.preserveSourceAlpha 必须为布尔值')
  if(layer.maskedCompositeSourceIds!==undefined){strings(layer.maskedCompositeSourceIds,`${path}.maskedCompositeSourceIds`);const sourceIds=layer.maskedCompositeSourceIds as string[];if(!sourceIds.length||new Set(sourceIds).size!==sourceIds.length||sourceIds.includes(layer.id as string)||layer.documentSpace!==true)fail(`${path}.maskedCompositeSourceIds`)}
  if(layer.maskedCompositeBackground!==undefined)bool(layer.maskedCompositeBackground,`${path}.maskedCompositeBackground`)
  if (layer.repairSourceIds !== undefined) strings(layer.repairSourceIds, `${path}.repairSourceIds`)
  if (layer.contentFill !== undefined) { const m=object(layer.contentFill, 'contentFill'); choice(m.method, ['local-context-patch-v1'], 'contentFill.method'); choice(m.sampling, ['automatic','manual'], 'contentFill.sampling'); string(m.sourceRevision,'contentFill.sourceRevision',true); string(m.sourceLayerId,'contentFill.sourceLayerId',true); for(const k of ['targetPixels','donorPixels','protectedPixels','changedPixels','elapsedMs']) number(m[k],`contentFill.${k}`,0,1000000000); if(!(m.changedPixels as number)||!(m.donorPixels as number))fail('contentFill.empty result') }
  if (layer.groupId === layer.id) fail(`${path}.groupId`)
}

export function validateCanvasText(value:unknown){
 const o=object(value,'canvasTexts'),key='canvasTexts'

  point(o, key); for (const field of ['text', 'fontFamily', 'fontWeight', 'color']) string(o[field], `${key}.${field}`)
  number(o.fontSize, 'fontSize', Number.MIN_VALUE); choice(o.align, ['left', 'center', 'right'], 'align')
  if (o.layout !== undefined) choice(o.layout, ['point', 'paragraph'], `${key}.layout`)
  for (const field of ['width', 'height']) if (o[field] !== undefined) number(o[field], `${key}.${field}`, Number.MIN_VALUE)
  for (const field of ['lineHeight']) if (o[field] !== undefined) number(o[field], `${key}.${field}`, 0.1, 20)
  if (o.letterSpacing !== undefined) number(o.letterSpacing, `${key}.letterSpacing`, -100, 100)
  if (o.rotation !== undefined) number(o.rotation, `${key}.rotation`, -360, 360)
  if (o.runs !== undefined) array(o.runs, `${key}.runs`).forEach((run, index) => {
    const r = object(run, `${key}.runs[${index}]`); number(r.start, `${key}.runs[${index}].start`, 0); number(r.end, `${key}.runs[${index}].end`, 0)
    if ((r.start as number) > (r.end as number)) fail(`${key}.runs[${index}]`)
    for (const field of ['fontFamily', 'fontWeight', 'color', 'stroke', 'shadow']) if (r[field] !== undefined) string(r[field], `${key}.runs[${index}].${field}`)
    if (r.fontSize !== undefined) number(r.fontSize, `${key}.runs[${index}].fontSize`, Number.MIN_VALUE)
  })

}
export function validateCanvasShape(value:unknown){
 const o=object(value,'canvasShapes')
 choice(o.kind, ['rectangle', 'ellipse', 'line', 'arrow', 'fill', 'gradient', 'path', 'boolean'], 'shape.kind'); rect(o.rect, 'shape.rect'); string(o.color, 'shape.color'); number(o.strokeWidth, 'strokeWidth', 0); if (o.endColor !== undefined) string(o.endColor, 'endColor'); if (o.opacity !== undefined) number(o.opacity, 'opacity', 0, 100); for (const field of ['from', 'to']) if (o[field] !== undefined) point(o[field], field); if (o.selection !== undefined) selection(o.selection, 'shape.selection'); if (o.kind === 'path') vectorPath(o.path, 'shape.path'); if (o.kind === 'boolean') { const b = object(o.boolean, 'shape.boolean'); choice(b.mode, ['union','difference','intersect','exclude'], 'boolean.mode'); vectorPath(b.left, 'boolean.left'); vectorPath(b.right, 'boolean.right'); if(b.sourceIds!==undefined) { strings(b.sourceIds,'boolean.sourceIds'); if((b.sourceIds as string[]).length!==2 || (b.sourceIds as string[])[0]===(b.sourceIds as string[])[1]) fail('boolean.sourceIds') } }
 for(const field of ['strokeColor','dashArray'])if(o[field]!==undefined)string(o[field],`shape.${field}`)
 for(const field of ['hidden','fillEnabled','scaleStroke'])if(o[field]!==undefined)bool(o[field],`shape.${field}`)
 if(o.strokeLineCap!==undefined)choice(o.strokeLineCap,['butt','round','square'],'shape.strokeLineCap')
 if(o.strokeLineJoin!==undefined)choice(o.strokeLineJoin,['miter','round','bevel'],'shape.strokeLineJoin')
}
export function validateMetadata(value: unknown) { const v = object(value, 'metadata'); string(v.id, 'metadata.id', true); string(v.name, 'metadata.name', true); if (v.updatedAt !== undefined && (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt)))) fail('metadata.updatedAt') }
export function validateDocument(value: unknown) {
  const v = object(value, 'document'); if (v.pixelFormat !== undefined) { if (!['rgba8','rgba16','rgba32f'].includes(v.pixelFormat as string)) fail('pixelFormat'); capabilityFor(v.pixelFormat as PixelFormat) } if (v.colorManagement !== undefined) normalizeColorManagement(v.colorManagement); const problem = dimensionError(v.documentWidth as number, v.documentHeight as number); if (problem) fail(problem)
  if (v.artboards !== undefined) { const boards = array(v.artboards, 'artboards'); if (!boards.length || boards.length > 1000) fail('artboards'); const ids = new Set<string>(); const layerIds = new Set((Array.isArray(v.layers) ? v.layers : []).map((layer) => (layer as RecordValue).id)); boards.forEach((raw, i) => { const board = object(raw, `artboards[${i}]`); try { validateArtboard(board as never) } catch { fail(`artboards[${i}]`) } if (ids.has(board.id as string)) fail('artboards.id 重复'); ids.add(board.id as string); (board.layerIds as string[]).forEach(id => { if (!layerIds.has(id)) fail(`artboards[${i}].layerIds`) }) }) }
  if (v.guideSettings !== undefined) validateGuideSettings(v.guideSettings)
  string(v.documentBackground, 'documentBackground', true)
  const layers = array(v.layers, 'layers').map((layer, i) => object(layer, `layers[${i}]`)); if (!layers.length || layers.length > 10000) fail('layers 必须非空且不超过10000')
  const ids = new Set<string>()
  layers.forEach(layer => {
    string(layer.id, 'layer.id', true); if (ids.has(layer.id as string)) throw new Error(`项目图层 ID 重复：${layer.id}`); ids.add(layer.id as string)
    validateLayer(layer, 'layer')
  })
  const parents = new Map<string, string>()
  layers.forEach(layer => {
    if (layer.groupId !== undefined) { string(layer.groupId, 'groupId', true); if (!ids.has(layer.groupId as string) || parents.has(layer.id as string) && parents.get(layer.id as string) !== layer.groupId) fail('groupId'); parents.set(layer.id as string, layer.groupId as string) }
    if (layer.children !== undefined) { strings(layer.children, 'children'); const unique = new Set(layer.children as string[]); if (unique.size !== (layer.children as string[]).length) fail('children 重复'); (layer.children as string[]).forEach(id => { if (!ids.has(id) || parents.has(id) && parents.get(id) !== layer.id) fail('children'); parents.set(id, layer.id as string) }) }
  })
  ids.forEach(id => { const visited = new Set<string>(); let current: string | undefined = id; while (current) { if (visited.has(current)) fail('图层循环引用'); visited.add(current); current = parents.get(current) } })
  validateClipping(layers as Layer[])
  if (v.smartObjectSources !== undefined) {
    const sources = object(v.smartObjectSources, 'smartObjectSources') as Record<string, SmartObjectSource>
    if (Object.keys(sources).length > 1000) fail('smartObjectSources 上限')
    for (const layer of layers as Layer[]) if (layer.smartObject) validateSmartObjectGraph(sources, layer.smartObject.sourceId)
    for (const sourceId of Object.keys(sources)) {
      validateSmartObjectGraph(sources, sourceId)
      const source = sources[sourceId]
      if (!source.document) continue
      validateDocument({ ...smartObjectState(v as unknown as EditorState, source), smartObjectSources: undefined })
    }
  }
  if (!ids.has(v.selectedLayerId as string)) fail('selectedLayerId')
  strings(v.selectedLayerIds, 'selectedLayerIds'); (v.selectedLayerIds as string[]).forEach(id => { if (!ids.has(id)) fail('selectedLayerIds') })
  const objectIds = new Set<string>()
  for (const key of ['canvasTexts', 'canvasShapes', 'brushStrokes']) array(v[key], key).forEach(item => {
    const o = object(item, key); string(o.id, `${key}.id`, true); if (objectIds.has(o.id as string)) fail(`${key}.id 重复`); objectIds.add(o.id as string)
    if (!ids.has(o.layerId as string)) fail(`${key}.layerId`)
    if (key === 'brushStrokes') stroke(o, key, ids)
    if(key==='canvasTexts')validateCanvasText(o)
    if(key==='canvasShapes')validateCanvasShape(o)
  })
  for (const [id, mask] of Object.entries(object(v.layerMasks, 'layerMasks'))) { if (!ids.has(id)) fail('layerMasks.layerId'); const m = object(mask, 'mask'); bool(m.inverted, 'mask.inverted'); bool(m.applied, 'mask.applied'); array(m.strokes, 'mask.strokes').forEach(s => stroke(s, 'mask.stroke', ids)); if (m.selection !== undefined) selection(m.selection, 'mask.selection'); if (m.gradient !== undefined) { const g = object(m.gradient, 'mask.gradient'); point(g.from, 'from'); point(g.to, 'to') } if (m.refinement !== undefined) { const r = object(m.refinement, 'mask.refinement'); for (const key of ['smooth', 'shift', 'feather']) number(r[key], `mask.refinement.${key}`, -100, 100); number(r.density, 'mask.refinement.density', 0, 200); number(r.decontaminate, 'mask.refinement.decontaminate', 0, 100); bool(r.colorCorrection, 'mask.refinement.colorCorrection') } }
  array(v.aiResults, 'aiResults').forEach(result => { const r = object(result, 'aiResult'); for (const key of ['id', 'prompt', 'model', 'provider', 'size', 'createdAt']) string(r[key], `aiResult.${key}`); choice(r.status, ['loading', 'success', 'partial-failure', 'error'], 'aiResult.status'); bool(r.favorite, 'favorite'); bool(r.adopted, 'adopted'); for (const key of ['source', 'thumbnail', 'error']) if (r[key] !== undefined) string(r[key], key); if (r.request !== undefined) operation(r.request, 'request')
    if (r.batchId !== undefined) string(r.batchId, 'aiResult.batchId', true)
    if (r.adoptions !== undefined) array(r.adoptions, 'aiResult.adoptions').forEach(value => {
      const adoption = object(value, 'aiResult.adoptions[]')
      choice(adoption.kind, ['add', 'replace'], 'adoption.kind'); string(adoption.layerId, 'adoption.layerId', true)
      if (adoption.kind === 'replace' || adoption.originalLayer !== undefined) validateLayer(adoption.originalLayer, 'adoption.originalLayer')
    })
  })
  if(v.conversationRuns!==undefined)validateConversationRuns(v.conversationRuns)
  selection(v.selection, 'selection'); rect(v.selectionRect, 'selectionRect'); bool(v.selectionVisible, 'selectionVisible'); if (v.cropRect !== null) rect(v.cropRect, 'cropRect')
  strings(v.sceneOrder, 'sceneOrder'); (v.sceneOrder as string[]).forEach(id => { if (!objectIds.has(id)) fail('sceneOrder') })
  string(v.prompt, 'prompt'); choice(v.composerMode, ['generate', 'edit'], 'composerMode'); string(v.composerSourceId, 'composerSourceId'); parameters(v.composerParameters, 'composerParameters')
  array(v.history, 'history').forEach(h => { const item = object(h, 'history'); string(item.id, 'history.id'); string(item.label, 'history.label'); choice(item.tone, ['original', 'warm', 'violet', 'upscale', 'mint'], 'history.tone') })
}
