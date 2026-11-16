import { dimensionError } from './documentGeometry'

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
  string(layer.id, `${path}.id`, true)
  for (const key of ['name', 'className', 'blendMode']) string(layer[key], `layer.${key}`)
  bool(layer.visible, 'layer.visible'); number(layer.opacity, 'layer.opacity', 0, 100)
  for (const key of ['locked', 'collapsed']) if (layer[key] !== undefined) bool(layer[key], `layer.${key}`)
  for (const key of ['source', 'thumbnail']) if (layer[key] !== undefined) string(layer[key], `layer.${key}`, true)
  for (const key of ['contentWidth', 'contentHeight']) if (layer[key] !== undefined) number(layer[key], `layer.${key}`, Number.MIN_VALUE, 16384)
  if (layer.transform !== undefined) { const t = object(layer.transform, 'transform'); choice(t.kind, ['crop', 'transform'], 'transform.kind'); rect(t.rect, 'transform.rect'); number(t.rotation, 'transform.rotation'); bool(t.flipX, 'flipX'); bool(t.flipY, 'flipY') }
  if (layer.adjustmentsEnabled !== undefined) bool(layer.adjustmentsEnabled, 'layer.adjustmentsEnabled')
  if (layer.adjustments !== undefined) { const a = object(layer.adjustments, 'adjustments'); for (const key of ['brightness', 'contrast', 'saturation', 'temperature', 'sharpness', 'blur', 'shadows', 'highlights']) number(a[key], `adjustments.${key}`) }
  if (layer.aiOperation !== undefined) operation(layer.aiOperation, 'aiOperation')
  if (layer.groupId !== undefined) string(layer.groupId, `${path}.groupId`, true)
  if (layer.children !== undefined) {
    strings(layer.children, `${path}.children`)
    if (new Set(layer.children as string[]).size !== (layer.children as string[]).length || (layer.children as string[]).includes(layer.id as string)) fail(`${path}.children`)
  }
  if (layer.groupId === layer.id) fail(`${path}.groupId`)
}
export function validateMetadata(value: unknown) { const v = object(value, 'metadata'); string(v.id, 'metadata.id', true); string(v.name, 'metadata.name', true); if (v.updatedAt !== undefined && (typeof v.updatedAt !== 'string' || !Number.isFinite(Date.parse(v.updatedAt)))) fail('metadata.updatedAt') }
export function validateDocument(value: unknown) {
  const v = object(value, 'document'); const problem = dimensionError(v.documentWidth as number, v.documentHeight as number); if (problem) fail(problem)
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
  if (!ids.has(v.selectedLayerId as string)) fail('selectedLayerId')
  strings(v.selectedLayerIds, 'selectedLayerIds'); (v.selectedLayerIds as string[]).forEach(id => { if (!ids.has(id)) fail('selectedLayerIds') })
  const objectIds = new Set<string>()
  for (const key of ['canvasTexts', 'canvasShapes', 'brushStrokes']) array(v[key], key).forEach(item => {
    const o = object(item, key); string(o.id, `${key}.id`, true); if (objectIds.has(o.id as string)) fail(`${key}.id 重复`); objectIds.add(o.id as string)
    if (!ids.has(o.layerId as string)) fail(`${key}.layerId`)
    if (key === 'brushStrokes') stroke(o, key, ids)
    if (key === 'canvasTexts') { point(o, key); for (const field of ['text', 'fontFamily', 'fontWeight', 'color']) string(o[field], `${key}.${field}`); number(o.fontSize, 'fontSize', Number.MIN_VALUE); choice(o.align, ['left', 'center', 'right'], 'align') }
    if (key === 'canvasShapes') { choice(o.kind, ['rectangle', 'ellipse', 'line', 'arrow', 'fill', 'gradient'], 'shape.kind'); rect(o.rect, 'shape.rect'); string(o.color, 'shape.color'); number(o.strokeWidth, 'strokeWidth', 0); if (o.endColor !== undefined) string(o.endColor, 'endColor'); if (o.opacity !== undefined) number(o.opacity, 'opacity', 0, 100); for (const field of ['from', 'to']) if (o[field] !== undefined) point(o[field], field); if (o.selection !== undefined) selection(o.selection, 'shape.selection') }
  })
  for (const [id, mask] of Object.entries(object(v.layerMasks, 'layerMasks'))) { if (!ids.has(id)) fail('layerMasks.layerId'); const m = object(mask, 'mask'); bool(m.inverted, 'mask.inverted'); bool(m.applied, 'mask.applied'); array(m.strokes, 'mask.strokes').forEach(s => stroke(s, 'mask.stroke', ids)); if (m.selection !== undefined) selection(m.selection, 'mask.selection'); if (m.gradient !== undefined) { const g = object(m.gradient, 'mask.gradient'); point(g.from, 'from'); point(g.to, 'to') } }
  array(v.aiResults, 'aiResults').forEach(result => { const r = object(result, 'aiResult'); for (const key of ['id', 'prompt', 'model', 'provider', 'size', 'createdAt']) string(r[key], `aiResult.${key}`); choice(r.status, ['loading', 'success', 'partial-failure', 'error'], 'aiResult.status'); bool(r.favorite, 'favorite'); bool(r.adopted, 'adopted'); for (const key of ['source', 'thumbnail', 'error']) if (r[key] !== undefined) string(r[key], key); if (r.request !== undefined) operation(r.request, 'request')
    if (r.batchId !== undefined) string(r.batchId, 'aiResult.batchId', true)
    if (r.adoptions !== undefined) array(r.adoptions, 'aiResult.adoptions').forEach(value => {
      const adoption = object(value, 'aiResult.adoptions[]')
      choice(adoption.kind, ['add', 'replace'], 'adoption.kind'); string(adoption.layerId, 'adoption.layerId', true)
      if (adoption.kind === 'replace' || adoption.originalLayer !== undefined) validateLayer(adoption.originalLayer, 'adoption.originalLayer')
    })
  })
  selection(v.selection, 'selection'); rect(v.selectionRect, 'selectionRect'); bool(v.selectionVisible, 'selectionVisible'); if (v.cropRect !== null) rect(v.cropRect, 'cropRect')
  strings(v.sceneOrder, 'sceneOrder'); (v.sceneOrder as string[]).forEach(id => { if (!objectIds.has(id)) fail('sceneOrder') })
  string(v.prompt, 'prompt'); choice(v.composerMode, ['generate', 'edit'], 'composerMode'); string(v.composerSourceId, 'composerSourceId'); parameters(v.composerParameters, 'composerParameters')
  array(v.history, 'history').forEach(h => { const item = object(h, 'history'); string(item.id, 'history.id'); string(item.label, 'history.label'); choice(item.tone, ['original', 'warm', 'violet', 'upscale', 'mint'], 'history.tone') })
}
